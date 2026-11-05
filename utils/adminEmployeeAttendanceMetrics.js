const { getActiveEmployeeProfiles } = require('./employeeManagementDashboard');
const { getEmployeeAttendanceCodes } = require('./employeeAttendanceSync');

function getMinutes(value, fallback) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function calculateAdminEmployeeAttendanceMetrics({ employees, teachingSections, punches, leaves, isEmployeeHoliday, now = new Date() }) {
  const punchesByCode = new Map();
  const punchesByName = new Map();
  punches.forEach(punch => {
    const code = String(punch.pin || '').trim().toUpperCase();
    if (!punchesByCode.has(code)) punchesByCode.set(code, []);
    punchesByCode.get(code).push(punch);
    const name = String(punch.name || '').trim().toLowerCase();
    if (name) {
      if (!punchesByName.has(name)) punchesByName.set(name, []);
      punchesByName.get(name).push(punch);
    }
  });

  const activeEmployees = getActiveEmployeeProfiles(employees);
  const isTeachingEmployee = employee => {
    const department = String(employee.department || '').trim().toLowerCase().replace(/^-+$/, '');
    const designation = String(employee.designation || '').trim().toLowerCase().replace(/^-+$/, '');
    return /\bteach(?:ing|er)\b/.test(department)
      || /\bteach(?:ing|er)\b/.test(designation)
      || (!department && !designation);
  };
  const sectionOrder = new Map([['ecd-3', 0], ['4-7', 1], ['8-10', 2]]);
  const teachingSectionBreakdown = teachingSections
    .map(section => ({ name: section.name, onLeave: 0, absent: 0 }))
    .sort((sectionA, sectionB) => {
      const orderA = sectionOrder.get(String(sectionA.name || '').trim().toLowerCase()) ?? 3;
      const orderB = sectionOrder.get(String(sectionB.name || '').trim().toLowerCase()) ?? 3;
      return orderA - orderB || sectionA.name.localeCompare(sectionB.name);
    });
  const sectionBreakdownByName = new Map(teachingSectionBreakdown.map(section => [String(section.name || '').trim().toLowerCase(), section]));
  const absentList = [];
  const lateInList = [];
  const missedTeacherList = [];
  const onLeaveList = [];
  const birthdaysToday = [];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  activeEmployees.forEach(employee => {
    if (!employee.dateOfBirth) return;
    const birthday = new Date(employee.dateOfBirth);
    if (birthday.getMonth() === now.getMonth() && birthday.getDate() === now.getDate()) {
      birthdaysToday.push({ name: employee.staffName || 'Staff member', designation: employee.designation || employee.department || '' });
    }
  });

  activeEmployees.forEach(employee => {
    const employeeName = String(employee.staffName || '').trim().toLowerCase();
    const employeeCodes = getEmployeeAttendanceCodes(employee);
    const punchesForEmployee = [...new Map(employeeCodes
      .flatMap(code => punchesByCode.get(code) || [])
      .map(punch => [String(punch._id || `${punch.pin}|${punch.punchTime}`), punch])).values()];
    if (!punchesForEmployee.length && employeeName) {
      punchesForEmployee.push(...(punchesByName.get(employeeName) || []));
    }
    const leave = leaves.find(item => String(item.employeeName || '').trim().toLowerCase() === employeeName);
    const isOnLeave = Boolean(leave);
    const sectionBreakdown = isTeachingEmployee(employee)
      ? sectionBreakdownByName.get(String(employee.section || '').trim().toLowerCase())
      : null;
    const plannedInMinutes = getMinutes(employee.plannedIn, 9 * 60);
    const midTimeMinutes = getMinutes(employee.midTime, 13 * 60);
    const plannedOutMinutes = getMinutes(employee.plannedOut, 17 * 60);
    const employeeSummary = {
      name: employee.staffName || 'Staff member',
      designation: employee.designation || employee.department || '',
      contact: employee.mobileNumber || employee.officeContact || 'Contact not listed'
    };

    if (!punchesForEmployee.length && isOnLeave) {
      if (sectionBreakdown) sectionBreakdown.onLeave += 1;
      onLeaveList.push({ ...employeeSummary, leave: leave.leaveTypeName || 'Approved leave' });
    } else if (!punchesForEmployee.length) {
      absentList.push(employeeSummary);
      if (sectionBreakdown) sectionBreakdown.absent += 1;
    }

    if (isEmployeeHoliday || isOnLeave) return;

    const morningPunches = punchesForEmployee.filter(punch => {
      const time = new Date(punch.punchTime);
      return time.getHours() * 60 + time.getMinutes() < midTimeMinutes;
    });
    const eveningPunches = punchesForEmployee.filter(punch => {
      const time = new Date(punch.punchTime);
      return time.getHours() * 60 + time.getMinutes() >= midTimeMinutes;
    });
    const missingPeriods = [];

    if (!morningPunches.length && currentMinutes >= midTimeMinutes) missingPeriods.push('Missed morning check-in');
    if (!eveningPunches.length && currentMinutes > plannedOutMinutes) missingPeriods.push('Missed evening check-out');
    if (missingPeriods.length) missedTeacherList.push({ ...employeeSummary, missing: missingPeriods.join(' and ') });

    const checkIn = morningPunches.find(punch => punch.manualPunchType === 'Check-in' || Number(punch.status) === 0)
      || morningPunches[0];
    if (checkIn) {
      const actualTime = new Date(checkIn.punchTime);
      const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
      const lateMinutes = actualMinutes - plannedInMinutes;
      if (lateMinutes > 0) {
        lateInList.push({
          ...employeeSummary,
          actualIn: actualTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          lateMinutes
        });
      }
    }
  });

  return {
    absentToday: absentList.length,
    teachingSectionBreakdown,
    lateToday: lateInList.length,
    missedAttendance: missedTeacherList.length,
    onLeaveList,
    absentList,
    lateInList,
    missedTeacherList,
    birthdaysToday
  };
}

module.exports = { calculateAdminEmployeeAttendanceMetrics };
