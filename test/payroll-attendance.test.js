const assert = require('node:assert/strict');
const test = require('node:test');
const bs = require('../utils/bikramSambat');
const {
  calculateAttendanceForPeriod,
  calculateAttendancePay,
  dedupePunches,
  getPeriodRange,
  isEmployeeEligibleForPeriod,
} = require('../utils/payrollAttendance');
const { getComponentTotal } = require('../services/payrollService');

const period = (start = '2026-03-02', end = start) => ({
  ...getPeriodRange(2026, 3),
  startKey: start,
  endKey: end,
  daysInPeriod: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1,
});
const employee = overrides => ({
  _id: 'employee-1',
  staffName: 'Attendance Test',
  employeeCode: 'ATT-1',
  isActive: true,
  activeWeekOff: ['Sunday'],
  plannedIn: '09:00',
  midTime: '13:00',
  plannedOut: '17:00',
  ...overrides,
});
const policy = {
  configured: true,
  salaryDayCountMethod: 'ACTUAL_WORKING_DAYS',
  weeklyOffDays: ['Sunday'],
  deductUnpaidLeave: true,
  deductUnapprovedAbsence: true,
  requireCompleteAttendance: true,
};
const punch = (date, time, status, extra = {}) => ({
  pin: 'ATT-1',
  punchTime: new Date(`${date}T${time}:00Z`),
  status,
  ...extra,
});
const normalPunches = date => [
  punch(date, '03:15', 0),
  punch(date, '11:15', 1),
];

test('calculates a complete present day and attendance-based salary', () => {
  const attendance = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    punches: normalPunches('2026-03-02'),
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(attendance.presentDays, 1);
  assert.equal(attendance.absentDays, 0);
  assert.equal(attendance.missingDays, 0);
  assert.equal(attendance.incomplete, false);
  assert.equal(attendance.attendanceDays, 1);
  assert.equal(attendance.workedHours, 8);
  assert.equal(calculateAttendancePay({
    monthlySalary: 1000,
    attendance,
    policy,
  }).payableSalary, 1000);
});

test('subtracts recorded break intervals from hourly attendance', () => {
  const attendance = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    punches: [
      ...normalPunches('2026-03-02'),
      punch('2026-03-02', '06:15', 2),
      punch('2026-03-02', '06:45', 3),
    ],
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(attendance.workedHours, 7.5);
});

test('calculates hourly and daily salary components from recorded attendance', () => {
  const components = [
    { type: 'HOURLY', rate: 25 },
    { type: 'DAILY', rate: 100 },
    { type: 'FIXED', amount: 50 },
  ];
  const attendance = { workedHours: 8, payableDays: 1 };
  assert.equal(getComponentTotal(components, 0, attendance, true), 300);
  assert.equal(getComponentTotal(components, 0, attendance, false), 50);
});

test('deducts approved unpaid leave but preserves approved paid leave', () => {
  const dateBs = bs.ADToBS('2026-03-02');
  const leave = isPaid => ({
    startDateNepali: dateBs,
    endDateNepali: dateBs,
    status: 'approved',
    isPaid,
    leaveDay: 'Full day',
  });
  const unpaid = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    leaves: [leave(false)],
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(unpaid.unpaidLeaveDays, 1);
  assert.equal(unpaid.missingDays, 0);
  assert.equal(calculateAttendancePay({ monthlySalary: 1000, attendance: unpaid, policy }).payableSalary, 0);

  const paid = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    leaves: [leave(true)],
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(paid.paidLeaveDays, 1);
  assert.equal(paid.unpaidLeaveDays, 0);
  assert.equal(paid.missingDays, 0);
  assert.equal(calculateAttendancePay({ monthlySalary: 1000, attendance: paid, policy }).payableSalary, 1000);
});

test('excludes approved holidays and weekly offs from attendance requirements', () => {
  const holidayBs = bs.ADToBS('2026-03-02');
  const holiday = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    holidayDates: [holidayBs],
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(holiday.holidays, 1);
  assert.equal(holiday.missingDays, 0);
  assert.equal(holiday.incomplete, false);

  const sunday = calculateAttendanceForPeriod({
    employee: employee(),
    period: period('2026-03-01'),
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(sunday.weeklyOffs, 1);
  assert.equal(sunday.missingDays, 0);
});

test('counts paired overtime punches once even when both punches contain duration', () => {
  const attendance = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    punches: [
      ...normalPunches('2026-03-02'),
      punch('2026-03-02', '13:15', 4, { otMinutes: 60 }),
      punch('2026-03-02', '14:15', 5, { otMinutes: 60 }),
    ],
    policy: { ...policy, payRecordedOvertime: true, overtimeHourlyRate: 10 },
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(attendance.overtimeMinutes, 60);
  assert.equal(attendance.overtimeHours, 1);
  assert.equal(calculateAttendancePay({
    monthlySalary: 1000,
    attendance,
    policy: { ...policy, payRecordedOvertime: true, overtimeHourlyRate: 10 },
  }).overtimePay, 10);
});

test('prorates new employees from their joining date', () => {
  const joined = employee({ dateOfJoining: new Date('2026-03-03T00:00:00Z') });
  const periodRange = period('2026-03-01', '2026-03-03');
  const attendance = calculateAttendanceForPeriod({
    employee: joined,
    period: periodRange,
    punches: normalPunches('2026-03-03'),
    policy,
    now: new Date('2026-03-04T00:00:00Z'),
  });
  assert.equal(attendance.employmentCalendarDays, 1);
  assert.equal(attendance.scheduledWorkingDays, 1);
  assert.equal(attendance.fullPeriodWorkingDays, 2);
  assert.equal(calculateAttendancePay({ monthlySalary: 1000, attendance, policy }).proratedSalary, 500);
});

test('uses only configured divisors while preserving full-month salary in short months', () => {
  const attendance = {
    period: { start: '2026-02-01', end: '2026-02-28', daysInPeriod: 28 },
    scheduledWorkingDays: 20,
    fullPeriodWorkingDays: 20,
    employmentCalendarDays: 28,
    unpaidLeaveDays: 0,
    absentDays: 0,
    payableDays: 20,
    overtimeHours: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
  };
  const fixedDivisor = calculateAttendancePay({
    monthlySalary: 1000,
    attendance,
    policy: { ...policy, salaryDayCountMethod: 'FIXED_DIVISOR', fixedMonthlyDivisor: 30 },
  });
  assert.equal(fixedDivisor.proratedSalary, 1000);
  assert.equal(fixedDivisor.error, '');

  const calendarDays = calculateAttendancePay({
    monthlySalary: 1000,
    attendance,
    policy: { ...policy, salaryDayCountMethod: 'CALENDAR_DAYS' },
  });
  assert.equal(calendarDays.proratedSalary, 1000);
});

test('flags missing attendance and duplicate punches without duplicate day counts', () => {
  const missing = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(missing.missingDays, 1);
  assert.equal(missing.incomplete, true);
  assert.match(missing.warnings.join(' '), /no attendance record/);

  const duplicateIn = punch('2026-03-02', '03:15', 0, { eventKey: 'same-in' });
  const duplicateOut = punch('2026-03-02', '11:15', 1, { eventKey: 'same-out' });
  const punches = [duplicateIn, { ...duplicateIn }, duplicateOut, { ...duplicateOut }];
  assert.equal(dedupePunches(punches).length, 2);
  const deduplicated = calculateAttendanceForPeriod({
    employee: employee(),
    period: period(),
    punches,
    policy,
    now: new Date('2026-03-03T00:00:00Z'),
  });
  assert.equal(deduplicated.presentDays, 1);
  assert.equal(deduplicated.attendanceDays, 1);
  assert.equal(deduplicated.missingDays, 0);
});

test('includes employees whose approved last working date overlaps the period', () => {
  const range = period('2026-03-01', '2026-03-31');
  const resigned = employee({
    isActive: false,
    employmentStatus: 'Resigned',
    lastWorkingDate: bs.ADToBS('2026-03-15'),
  });
  assert.equal(isEmployeeEligibleForPeriod(resigned, range), true);
  assert.equal(isEmployeeEligibleForPeriod({
    ...resigned,
    lastWorkingDate: bs.ADToBS('2026-02-28'),
  }, range), false);
});
