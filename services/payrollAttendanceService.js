const mongoose = require('mongoose');
const EmployeeAttendance = require('../model/employeeSchema/employeeattendanceSchema');
const EmployeeWeekend = require('../model/employeeSchema/employeeWeekendSchema');
const { holiday: Holiday } = require('../model/holidayschema');
const { leaveApplicationSchema } = require('../model/leaveschema/leavetypeschma');
const { getEmployeeAttendanceCodes, normalizeAttendancePin } = require('../utils/employeeAttendanceSync');
const bs = require('../utils/bikramSambat');
const { MONTHS } = require('../utils/employeeAttendanceRangeReport');
const {
  calculateAttendanceForPeriod,
  getPeriodRange,
} = require('../utils/payrollAttendance');

const LeaveApplication = mongoose.models.LeaveApplication
  || mongoose.model('LeaveApplication', leaveApplicationSchema, 'leaveApplications');

const MONTH_ALIASES = new Map([
  ['ashar', 'asar'], ['asar', 'asar'],
  ['ashwin', 'aswin'], ['aswin', 'aswin'],
]);

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeMonth = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return MONTH_ALIASES.get(normalized) || normalized;
};
const dateAtKathmanduMidnight = dateKey => new Date(`${dateKey}T00:00:00+05:45`);
const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

function getSchoolHolidayDates(holidayDocuments, period) {
  const dates = new Set();
  const bsStart = String(bs.ADToBS(period.startKey) || '').slice(0, 10);
  const bsEnd = String(bs.ADToBS(period.endKey) || '').slice(0, 10);
  const [startYear, startMonth] = bsStart.split('-').map(Number);
  const [endYear, endMonth] = bsEnd.split('-').map(Number);

  for (const document of holidayDocuments) {
    const academicYear = String(document.academicYear || '');
    const years = [...new Set([startYear, endYear])];
    if (academicYear && !years.some(year => academicYear.includes(String(year)))) continue;
    for (const month of document.month || []) {
      const monthName = normalizeMonth(month.monthName);
      const monthIndex = MONTHS.findIndex(name => normalizeMonth(name) === monthName) + 1;
      if (!monthIndex) continue;
      for (const year of years) {
        if ((year === startYear && monthIndex < startMonth)
          || (year === endYear && monthIndex > endMonth)) continue;
        for (const day of month.holidayDays || []) {
          const dateBs = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dateAd = bs.BSToAD(dateBs);
          if (dateAd && dateAd >= period.startKey && dateAd <= period.endKey) dates.add(dateBs);
        }
      }
    }
  }
  return dates;
}

function matchEmployeeLeaves(leaves, employee) {
  const codes = new Set(getEmployeeAttendanceCodes(employee).map(normalizeAttendancePin));
  const name = normalizeName(employee.staffName);
  return leaves.filter(leave => {
    const leaveCode = normalizeAttendancePin(leave.employeeCode);
    if (leaveCode) return codes.has(leaveCode);
    return Boolean(name && normalizeName(leave.employeeName) === name);
  });
}

async function loadPeriodAttendance({ employees, periodYear, payrollMonth, policy = {}, now = new Date() }) {
  const period = getPeriodRange(periodYear, payrollMonth);
  const startBs = String(bs.ADToBS(period.startKey) || '').slice(0, 10);
  const endBs = String(bs.ADToBS(period.endKey) || '').slice(0, 10);
  const dateBsValues = [];
  for (let timestamp = Date.parse(`${period.startKey}T00:00:00.000Z`);
    timestamp <= Date.parse(`${period.endKey}T00:00:00.000Z`);
    timestamp += 24 * 60 * 60 * 1000) {
    dateBsValues.push(String(bs.ADToBS(new Date(timestamp)) || '').slice(0, 10));
  }

  const codeOwners = new Map();
  const nameOwners = new Map();
  const allCodes = new Set();
  const identityFilters = [];
  const employeeNames = [];
  for (const employee of employees) {
    const codes = getEmployeeAttendanceCodes(employee).map(normalizeAttendancePin);
    for (const code of codes) {
      allCodes.add(code);
      if (!codeOwners.has(code)) codeOwners.set(code, new Set());
      codeOwners.get(code).add(String(employee._id));
    }
    if (employee.staffName) employeeNames.push(String(employee.staffName).trim());
    const name = normalizeName(employee.staffName);
    if (name) {
      if (!nameOwners.has(name)) nameOwners.set(name, new Set());
      nameOwners.get(name).add(String(employee._id));
    }
  }
  if (allCodes.size) {
    identityFilters.push({
      employeeCode: { $in: [...allCodes].map(code => new RegExp(`^${escapeRegex(code)}$`, 'i')) },
    });
  }
  if (employeeNames.length) {
    identityFilters.push({
      employeeName: { $in: [...new Set(employeeNames)].map(name => new RegExp(`^${escapeRegex(name)}$`, 'i')) },
    });
  }

  const pinPatterns = [...allCodes].map(code => new RegExp(`^${escapeRegex(code)}$`, 'i'));
  const start = dateAtKathmanduMidnight(period.startKey);
  const endExclusive = dateAtKathmanduMidnight(new Date(Date.parse(`${period.endKey}T00:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [punches, leaves, holidayDocuments, employeeWeekends] = await Promise.all([
    pinPatterns.length
      ? EmployeeAttendance.find({
        pin: { $in: pinPatterns },
        punchTime: { $gte: start, $lt: endExclusive },
      }).select('pin punchTime eventKey status manualPunchType isLate lateMinutes isEarly earlyMinutes isOvertime otMinutes finalStatus isHoliday holidayName source').sort({ punchTime: 1 }).lean()
      : [],
    identityFilters.length
      ? LeaveApplication.find({
        status: { $in: ['approved', 'pending'] },
        startDateNepali: { $lte: endBs },
        endDateNepali: { $gte: startBs },
        $or: identityFilters,
      }).select('employeeCode employeeName leaveTypeName isPaid startDateNepali endDateNepali leaveDay status').lean()
      : [],
    Holiday.find({}).select('academicYear month').lean(),
    EmployeeWeekend.find({ dateBs: { $in: dateBsValues } }).select('dateBs name').lean(),
  ]);

  const schoolHolidays = getSchoolHolidayDates(holidayDocuments, period);
  const employeeWeekendByDate = new Map(employeeWeekends.map(day => [String(day.dateBs), String(day.name || '')]));
  const holidayDates = new Set([...schoolHolidays, ...employeeWeekendByDate.keys()]);
  const punchesByCode = new Map();
  for (const punch of punches) {
    const code = normalizeAttendancePin(punch.pin);
    if (!punchesByCode.has(code)) punchesByCode.set(code, []);
    punchesByCode.get(code).push(punch);
  }
  const results = new Map();

  for (const employee of employees) {
    const employeeId = String(employee._id);
    const codes = getEmployeeAttendanceCodes(employee).map(normalizeAttendancePin);
    const employeeLeaves = matchEmployeeLeaves(leaves, employee);
    const ambiguousCode = codes.some(code => (codeOwners.get(code)?.size || 0) > 1);
    const ambiguousNameOnlyLeave = employeeLeaves.some(leave => !normalizeAttendancePin(leave.employeeCode)
      && (nameOwners.get(normalizeName(leave.employeeName))?.size || 0) > 1);
    const employeePunches = codes.flatMap(code => punchesByCode.get(code) || []);
    const attendance = calculateAttendanceForPeriod({
      employee,
      period,
      punches: employeePunches,
      leaves: employeeLeaves,
      holidayDates: [...holidayDates],
      policy,
      now,
      attendanceIdentityAmbiguous: ambiguousCode || ambiguousNameOnlyLeave,
    });
    results.set(employeeId, attendance);
  }

  return {
    period,
    results,
    totalEmployees: employees.length,
    incompleteEmployees: [...results.values()].filter(result => result.incomplete).length,
  };
}

module.exports = {
  getSchoolHolidayDates,
  loadPeriodAttendance,
  matchEmployeeLeaves,
};
