const bs = require('./bikramSambat');

const DAY_MS = 24 * 60 * 60 * 1000;

const roundMoney = value => Number((Number(value) || 0).toFixed(2));
const normalize = value => String(value || '').trim().toLowerCase();

function getKathmanduDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getKathmanduMinutes(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function getPeriodRange(periodYear, payrollMonth) {
  const year = Number(periodYear);
  const month = Number(payrollMonth);
  if (!Number.isInteger(year) || year < 1900 || year > 9999
    || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Choose a valid payroll year and month.');
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  const end = new Date(endExclusive.getTime() - DAY_MS);
  return {
    start,
    end,
    endExclusive,
    startKey: start.toISOString().slice(0, 10),
    endKey: end.toISOString().slice(0, 10),
    daysInPeriod: Math.round((endExclusive - start) / DAY_MS),
  };
}

function parseTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match || Number(match[1]) > 23) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getWeekday(dateKey) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function eachDate(startKey, endKey) {
  const days = [];
  for (let time = Date.parse(`${startKey}T00:00:00.000Z`);
    time <= Date.parse(`${endKey}T00:00:00.000Z`);
    time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

function getEmployeeEndDate(employee) {
  const approvedExitDates = [...(employee?.resignations || []), ...(employee?.terminations || [])]
    .filter(exit => exit?.approved && exit?.lastWorkingDate)
    .map(exit => String(bs.BSToAD(exit.lastWorkingDate) || ''))
    .filter(Boolean)
    .sort();
  if (approvedExitDates.length) return approvedExitDates[approvedExitDates.length - 1];
  if (employee?.lastWorkingDate) {
    return String(bs.BSToAD(employee.lastWorkingDate) || '');
  }
  return '';
}

function getEmployeeStartDate(employee) {
  if (!employee?.dateOfJoining) return '';
  return getKathmanduDateKey(employee.dateOfJoining);
}

function isEmployeeEligibleForPeriod(employee, period) {
  const joined = getEmployeeStartDate(employee);
  const ended = getEmployeeEndDate(employee);
  if (joined && joined > period.endKey) return false;
  if (ended && ended < period.startKey) return false;
  if (employee?.isActive === false || ['resigned', 'terminated'].includes(normalize(employee?.employmentStatus))) {
    return Boolean(ended && ended >= period.startKey && (!joined || joined <= period.endKey));
  }
  return true;
}

function activeWeekOffFor(employee, dateKey, policy = {}) {
  const dateBs = String(bs.ADToBS(dateKey) || '').slice(0, 10);
  const history = (employee?.weekOffHistory || []).find(item => {
    const from = String(item.fromDate || '');
    const until = String(item.toDate || '');
    return dateBs && dateBs >= from && (!until || dateBs <= until);
  });
  const days = history?.offDays?.length ? history.offDays : employee?.activeWeekOff?.length
    ? employee.activeWeekOff
    : policy.weeklyOffDays || [];
  const weekday = normalize(getWeekday(dateKey));
  return (days || []).some(day => {
    const value = normalize(day);
    return value === weekday || value.slice(0, 3) === weekday.slice(0, 3);
  });
}

function dedupePunches(punches = []) {
  const seen = new Set();
  return punches.filter(punch => {
    if (!punch?.punchTime || Number.isNaN(new Date(punch.punchTime).getTime())) return false;
    const key = punch.eventKey
      ? `event:${punch.eventKey}`
      : [
        normalize(punch.pin),
        new Date(punch.punchTime).toISOString(),
        punch.status ?? '',
        normalize(punch.manualPunchType),
      ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(a.punchTime) - new Date(b.punchTime));
}

function classifyDayPunches(punches, employee) {
  const plannedIn = parseTime(employee?.plannedIn);
  const plannedOut = parseTime(employee?.plannedOut);
  const midTime = parseTime(employee?.midTime);
  let checkIn = null;
  let checkOut = null;
  let overtimeMinutes = 0;
  const overtimeIn = [];
  const overtimeOut = [];
  let recordedOvertimeMinutes = 0;
  let breakStart = null;
  let breakMinutes = 0;
  let lateMinutes = 0;
  let earlyMinutes = 0;

  for (const punch of punches) {
    const kind = normalize(punch.manualPunchType);
    const status = Number(punch.status);
    const minutes = getKathmanduMinutes(punch.punchTime);
    if (status === 2) {
      if (!breakStart) breakStart = punch;
      continue;
    }
    if (status === 3 && breakStart) {
      const duration = (new Date(punch.punchTime) - new Date(breakStart.punchTime)) / 60000;
      if (duration > 0) breakMinutes += duration;
      breakStart = null;
      continue;
    }
    const isIn = kind === 'check-in' || (kind !== 'check-out' && status === 0)
      || (kind !== 'check-out' && status !== 1 && status !== 4 && status !== 5
        && !checkIn && midTime !== null && minutes < midTime);
    const isOut = kind === 'check-out' || (kind !== 'check-in' && status === 1)
      || (kind !== 'check-in' && status !== 0 && status !== 4 && status !== 5
        && !checkOut && midTime !== null && minutes >= midTime);

    if (status === 4 || status === 5 || punch.isOvertime) {
      recordedOvertimeMinutes = Math.max(recordedOvertimeMinutes, Number(punch.otMinutes) || 0);
      if (status === 4 && minutes !== null) overtimeIn.push(minutes);
      if (status === 5 && minutes !== null) overtimeOut.push(minutes);
    } else if (isIn && !checkIn) {
      checkIn = punch;
    } else if (isOut) {
      checkOut = punch;
    }

    if (punch.isLate || Number(punch.lateMinutes) > 0) {
      lateMinutes = Math.max(lateMinutes, Number(punch.lateMinutes) || 0);
    }
    if (punch.isEarly || Number(punch.earlyMinutes) > 0) {
      earlyMinutes = Math.max(earlyMinutes, Number(punch.earlyMinutes) || 0);
    }
  }

  if (checkIn && !lateMinutes && plannedIn !== null) {
    lateMinutes = Math.max(0, getKathmanduMinutes(checkIn.punchTime) - plannedIn);
  }
  if (checkOut && !earlyMinutes && plannedOut !== null) {
    earlyMinutes = Math.max(0, plannedOut - getKathmanduMinutes(checkOut.punchTime));
  }
  const pairedOvertimeMinutes = overtimeIn.reduce((total, start, index) => {
    const end = overtimeOut[index];
    if (end === undefined || end <= start) return total;
    return total + end - start;
  }, 0);
  overtimeMinutes = Math.max(recordedOvertimeMinutes, pairedOvertimeMinutes);
  let workedMinutes = 0;
  if (checkIn && checkOut) {
    workedMinutes = (new Date(checkOut.punchTime) - new Date(checkIn.punchTime)) / 60000;
    if (workedMinutes <= 0) workedMinutes += 24 * 60;
    workedMinutes = Math.max(0, workedMinutes - breakMinutes);
  }
  return { checkIn, checkOut, overtimeMinutes, lateMinutes, earlyMinutes, workedMinutes };
}

function leaveForDay(leaves, dateBs) {
  return (leaves || []).find(leave => {
    const start = String(leave.startDateNepali || '');
    const end = String(leave.endDateNepali || '');
    return start && end && dateBs >= start && dateBs <= end;
  });
}

function calculateAttendanceForPeriod({
  employee,
  period,
  punches = [],
  leaves = [],
  holidayDates = [],
  policy = {},
  now = new Date(),
  attendanceIdentityAmbiguous = false,
}) {
  const scheduledDays = [];
  const warnings = [];
  const dayDetails = [];
  const holidaySet = new Set((holidayDates || []).map(date => String(date).slice(0, 10)));
  const joinDate = getEmployeeStartDate(employee);
  const endDate = getEmployeeEndDate(employee);
  const eligibleStart = joinDate && joinDate > period.startKey ? joinDate : period.startKey;
  const eligibleEnd = endDate && endDate < period.endKey ? endDate : period.endKey;
  const dates = eligibleEnd < eligibleStart ? [] : eachDate(eligibleStart, eligibleEnd);
  const allPunches = dedupePunches(punches);
  const punchesByDate = new Map();
  allPunches.forEach(punch => {
    const dateKey = getKathmanduDateKey(punch.punchTime);
    if (!punchesByDate.has(dateKey)) punchesByDate.set(dateKey, []);
    punchesByDate.get(dateKey).push(punch);
  });

  let presentDays = 0;
  let absentDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidays = 0;
  let weeklyOffs = 0;
  let missingDays = 0;
  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  let workedMinutes = 0;
  let attendanceDays = 0;
  const todayKey = getKathmanduDateKey(now);

  for (const dateKey of dates) {
    const dateBs = String(bs.ADToBS(dateKey) || '').slice(0, 10);
    const dayPunches = punchesByDate.get(dateKey) || [];
    const holiday = holidaySet.has(dateBs);
    const weeklyOff = !holiday && activeWeekOffFor(employee, dateKey, policy);
    const leave = leaveForDay(leaves, dateBs);
    const approvedLeave = leave?.status === 'approved';
    const pendingLeave = leave?.status === 'pending';
    const leaveFraction = approvedLeave && ['Early leave', 'Late leave'].includes(leave.leaveDay) ? 0.5 : 1;
    const isScheduledWorkDay = !holiday && !weeklyOff;

    if (holiday) holidays += 1;
    else if (weeklyOff) weeklyOffs += 1;

    if (approvedLeave) {
      if (leave.isPaid) paidLeaveDays += leaveFraction;
      else unpaidLeaveDays += leaveFraction;
    }

    const classified = classifyDayPunches(dayPunches, employee);
    const hasAttendance = Boolean(classified.checkIn || classified.checkOut);
    const fullAttendance = Boolean(classified.checkIn && classified.checkOut);
    const leaveCoversFullDay = approvedLeave && leaveFraction === 1;
    const remainingHalfDayNeedsPunch = approvedLeave && leaveFraction === 0.5;

    if (isScheduledWorkDay) {
      scheduledDays.push(dateKey);
      if (fullAttendance) presentDays += 1 - (approvedLeave ? leaveFraction : 0);

      const attendanceRequired = !leaveCoversFullDay && (!approvedLeave || remainingHalfDayNeedsPunch);
      if (attendanceRequired && !fullAttendance) {
        missingDays += approvedLeave && leaveFraction === 0.5 ? 0.5 : 1;
        if (dateKey <= todayKey) {
          warnings.push(`${dateKey}: ${hasAttendance ? 'incomplete punches' : 'no attendance record'}`);
        } else {
          warnings.push(`${dateKey}: period date has not occurred yet`);
        }
      }
      if (pendingLeave) warnings.push(`${dateKey}: leave is not approved`);
      if (attendanceIdentityAmbiguous && dayPunches.length) {
        warnings.push(`${dateKey}: attendance code matches more than one employee`);
      }
    }

    if (hasAttendance) attendanceDays += 1;
    if (isScheduledWorkDay && !leaveCoversFullDay && !fullAttendance && dateKey <= todayKey) {
      absentDays += approvedLeave && leaveFraction === 0.5 ? 0.5 : 1;
    }
    if (fullAttendance || dayPunches.length) {
      lateMinutes += classified.lateMinutes;
      earlyDepartureMinutes += classified.earlyMinutes;
      overtimeMinutes += classified.overtimeMinutes;
      workedMinutes += classified.workedMinutes;
    }
    dayDetails.push({
      date: dateKey,
      dateBs,
      status: holiday ? 'HOLIDAY'
        : weeklyOff ? 'WEEKLY_OFF'
          : pendingLeave ? 'PENDING_LEAVE'
            : approvedLeave ? (leave.isPaid ? 'PAID_LEAVE' : 'UNPAID_LEAVE')
              : fullAttendance ? 'PRESENT'
                : hasAttendance ? 'INCOMPLETE_ATTENDANCE'
                  : dateKey > todayKey ? 'FUTURE'
                    : 'MISSING_ATTENDANCE',
      isPaidLeave: Boolean(approvedLeave && leave.isPaid),
      isUnpaidLeave: Boolean(approvedLeave && !leave.isPaid),
      isHoliday: holiday,
      isWeeklyOff: weeklyOff,
      checkIn: classified.checkIn?.punchTime || null,
      checkOut: classified.checkOut?.punchTime || null,
      overtimeMinutes: classified.overtimeMinutes,
      workedMinutes: classified.workedMinutes,
      lateMinutes: classified.lateMinutes,
      earlyDepartureMinutes: classified.earlyMinutes,
      punchCount: dayPunches.length,
      leaveStatus: leave?.status || '',
    });
  }

  if (attendanceIdentityAmbiguous) warnings.push('An attendance code is assigned to multiple employee records.');
  if (!policy.configured) warnings.push('Attendance payroll policy is not configured.');
  if (!employee?.activeWeekOff?.length && !policy.weeklyOffDays?.length
    && !employee?.weekOffHistory?.length) {
    warnings.push('No weekly-off schedule is configured for this employee.');
  }
  if (!attendanceDays && scheduledDays.length) warnings.push('No confirmed attendance records were found for scheduled workdays.');

  const fullPeriodWorkingDays = eachDate(period.startKey, period.endKey).filter(dateKey =>
    !holidaySet.has(String(bs.ADToBS(dateKey) || '').slice(0, 10))
      && !activeWeekOffFor(employee, dateKey, policy)).length;
  const effectiveWorkingDays = scheduledDays.length;
  const policyMissing = !policy.configured
    || (!employee?.activeWeekOff?.length && !policy.weeklyOffDays?.length && !employee?.weekOffHistory?.length);
  const incomplete = policy.requireCompleteAttendance !== false
    && (missingDays > 0 || attendanceIdentityAmbiguous || policyMissing);

  return {
    period: {
      start: period.startKey,
      end: period.endKey,
      eligibleStart,
      eligibleEnd,
      daysInPeriod: period.daysInPeriod,
    },
    presentDays: roundMoney(presentDays),
    absentDays: roundMoney(absentDays),
    paidLeaveDays: roundMoney(paidLeaveDays),
    unpaidLeaveDays: roundMoney(unpaidLeaveDays),
    holidays,
    weeklyOffs,
    scheduledWorkingDays: effectiveWorkingDays,
    fullPeriodWorkingDays,
    payableDays: roundMoney(Math.max(0, effectiveWorkingDays
      - (policy.deductUnpaidLeave ? unpaidLeaveDays : 0)
      - (policy.deductUnapprovedAbsence ? absentDays : 0))),
    overtimeMinutes,
    overtimeHours: roundMoney(overtimeMinutes / 60),
    workedMinutes,
    workedHours: roundMoney(workedMinutes / 60),
    lateMinutes,
    lateArrivals: dayDetails.filter(day => day.lateMinutes > 0).length,
    earlyDepartureMinutes,
    earlyDepartures: dayDetails.filter(day => day.earlyDepartureMinutes > 0).length,
    missingDays,
    attendanceDays,
    employmentCalendarDays: dates.length,
    warnings: [...new Set(warnings)],
    incomplete,
    policyMissing,
    dayDetails,
  };
}

function calculateAttendancePay({
  monthlySalary,
  attendance,
  policy = {},
}) {
  if (!policy.configured) {
    return { proratedSalary: 0, attendanceDeduction: 0, overtimePay: 0, latePenalty: 0, earlyPenalty: 0, payableSalary: 0, error: 'Attendance payroll policy is not configured.' };
  }
  const base = Math.max(0, Number(monthlySalary) || 0);
  let divisor = 0;
  if (policy.salaryDayCountMethod === 'FIXED_DIVISOR') {
    divisor = Number(policy.fixedMonthlyDivisor) || 0;
  } else if (policy.salaryDayCountMethod === 'ACTUAL_WORKING_DAYS') {
    divisor = Number(attendance.fullPeriodWorkingDays) || 0;
  } else if (policy.salaryDayCountMethod === 'CALENDAR_DAYS') {
    divisor = Number(attendance.period?.daysInPeriod)
      || eachDate(attendance.period.start, attendance.period.end).length;
  }
  if (!(divisor > 0)) {
    return { proratedSalary: 0, attendanceDeduction: 0, overtimePay: 0, latePenalty: 0, earlyPenalty: 0, payableSalary: 0, error: 'A valid salary divisor is required by the configured attendance policy.' };
  }

  const scheduled = Math.max(0, Number(attendance.scheduledWorkingDays) || 0);
  const payableDays = Math.max(0, Number(attendance.payableDays) || 0);
  let proratedSalary;
  if (policy.salaryDayCountMethod === 'ACTUAL_WORKING_DAYS') {
    const fullPeriodWorkingDays = Number(attendance.fullPeriodWorkingDays) || 0;
    proratedSalary = fullPeriodWorkingDays > 0 ? base * Math.min(1, scheduled / fullPeriodWorkingDays) : 0;
  } else {
    const eligibleDays = Number(attendance.employmentCalendarDays) || 0;
    const periodDays = Number(attendance.period?.daysInPeriod)
      || eachDate(attendance.period.start, attendance.period.end).length;
    const eligiblePay = Math.min(periodDays, eligibleDays);
    proratedSalary = periodDays > 0 ? Math.min(base, base * (eligiblePay / periodDays)) : 0;
  }

  const deductibleDays = (policy.deductUnpaidLeave ? Number(attendance.unpaidLeaveDays) || 0 : 0)
    + (policy.deductUnapprovedAbsence ? Number(attendance.absentDays) || 0 : 0);
  const attendanceDeduction = base / divisor * deductibleDays;
  const overtimePay = policy.payRecordedOvertime
    ? (Number(attendance.overtimeHours) || 0) * (Number(policy.overtimeHourlyRate) || 0)
    : 0;
  const latePenalty = policy.applyLatePenalty
    ? (Number(attendance.lateMinutes) || 0) * (Number(policy.latePenaltyPerMinute) || 0)
    : 0;
  const earlyPenalty = policy.applyEarlyDeparturePenalty
    ? (Number(attendance.earlyDepartureMinutes) || 0) * (Number(policy.earlyPenaltyPerMinute) || 0)
    : 0;
  return {
    proratedSalary: roundMoney(proratedSalary),
    attendanceDeduction: roundMoney(attendanceDeduction),
    overtimePay: roundMoney(overtimePay),
    latePenalty: roundMoney(latePenalty),
    earlyPenalty: roundMoney(earlyPenalty),
    payableSalary: roundMoney(Math.max(0, proratedSalary - attendanceDeduction - latePenalty - earlyPenalty + overtimePay)),
    error: '',
    explanation: `Salary method ${policy.salaryDayCountMethod}; divisor ${divisor}; scheduled workdays ${scheduled}; payable days ${payableDays}; unpaid leave ${attendance.unpaidLeaveDays}; absence deduction ${policy.deductUnapprovedAbsence ? attendance.absentDays : 0}.`,
  };
}

module.exports = {
  calculateAttendanceForPeriod,
  calculateAttendancePay,
  dedupePunches,
  getKathmanduMinutes,
  getKathmanduDateKey,
  getEmployeeEndDate,
  getEmployeeStartDate,
  getPeriodRange,
  isEmployeeEligibleForPeriod,
  parseTime,
};
