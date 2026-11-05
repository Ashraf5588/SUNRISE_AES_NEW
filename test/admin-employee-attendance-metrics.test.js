const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateAdminEmployeeAttendanceMetrics } = require('../utils/adminEmployeeAttendanceMetrics');

const employee = (employeeCode, extra = {}) => ({
  employeeCode,
  staffName: `Employee ${employeeCode}`,
  department: 'Teaching Staff',
  section: '4-7',
  plannedIn: '09:00',
  plannedOut: '17:00',
  midTime: '13:00',
  ...extra
});

const punch = (pin, time) => ({
  pin,
  punchTime: new Date(`2026-11-03T${time}:00`)
});

test('counts and lists missing morning and evening punches independently', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('NO-PUNCH'), employee('MORNING'), employee('EVENING'), employee('COMPLETE')],
    teachingSections: [{ name: '4-7' }],
    punches: [
      punch('MORNING', '09:20'),
      punch('EVENING', '17:05'),
      punch('COMPLETE', '09:00'),
      punch('COMPLETE', '17:00')
    ],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T18:00:00')
  });

  assert.equal(result.absentToday, 1);
  assert.equal(result.missedAttendance, 3);
  assert.equal(result.teachingSectionBreakdown[0].absent, 1);
  assert.deepEqual(result.missedTeacherList.map(item => [item.name, item.missing]), [
    ['Employee NO-PUNCH', 'Missed morning check-in and Missed evening check-out'],
    ['Employee MORNING', 'Missed evening check-out'],
    ['Employee EVENING', 'Missed morning check-in']
  ]);
  assert.equal(result.lateToday, 1);
  assert.equal(result.lateInList[0].lateMinutes, 20);
});

test('does not report a missing evening punch before or at planned out time', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('MORNING', { department: 'Teaching' })],
    teachingSections: [],
    punches: [punch('MORNING', '09:00')],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T15:43:00')
  });

  assert.equal(result.missedAttendance, 0);
  assert.deepEqual(result.missedTeacherList, []);

  const resultAtPlannedOut = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('MORNING', { department: 'Teaching' })],
    teachingSections: [],
    punches: [punch('MORNING', '09:00')],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T17:00:00')
  });
  assert.equal(resultAtPlannedOut.missedAttendance, 0);
});

test('reports a missing evening punch after planned out time', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('MORNING', { department: 'Teaching' })],
    teachingSections: [],
    punches: [punch('MORNING', '09:00')],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T17:01:00')
  });

  assert.equal(result.missedAttendance, 1);
  assert.deepEqual(result.missedTeacherList, [{
    name: 'Employee MORNING',
    designation: 'Teaching',
    contact: 'Contact not listed',
    missing: 'Missed evening check-out'
  }]);
});

test('matches employee dashboard absence status before planned check-in time', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('NO-PUNCH')],
    teachingSections: [{ name: '4-7' }],
    punches: [],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T08:30:00')
  });

  assert.equal(result.absentToday, 1);
  assert.equal(result.teachingSectionBreakdown[0].absent, 1);
  assert.equal(result.missedAttendance, 0);
});

test('keeps employees with no punches in the absent list on a holiday, matching employee dashboard', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('NO-PUNCH')],
    teachingSections: [{ name: '4-7' }],
    punches: [],
    leaves: [],
    isEmployeeHoliday: true,
    now: new Date('2026-11-03T18:00:00')
  });

  assert.equal(result.absentToday, 1);
  assert.deepEqual(result.absentList.map(item => item.name), ['Employee NO-PUNCH']);
  assert.equal(result.missedAttendance, 0);
});

test('uses each staff member mid-time and planned out time for missing attendance', () => {
  const resultBeforeMidTime = calculateAdminEmployeeAttendanceMetrics({
    employees: [
      employee('MID-ONE', { midTime: '13:00', plannedOut: '17:00' }),
      employee('MID-TWO', { midTime: '12:00', plannedOut: '16:00' })
    ],
    teachingSections: [{ name: '4-7' }],
    punches: [],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T12:30:00')
  });
  assert.equal(resultBeforeMidTime.missedAttendance, 1);
  assert.deepEqual(resultBeforeMidTime.missedTeacherList.map(item => item.name), ['Employee MID-TWO']);

  const resultAfterPlannedOut = calculateAdminEmployeeAttendanceMetrics({
    employees: [
      employee('MID-ONE', { midTime: '13:00', plannedOut: '17:00' }),
      employee('MID-TWO', { midTime: '12:00', plannedOut: '16:00' })
    ],
    teachingSections: [{ name: '4-7' }],
    punches: [],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T16:30:00')
  });
  assert.equal(resultAfterPlannedOut.missedAttendance, 2);
  assert.deepEqual(resultAfterPlannedOut.missedTeacherList.map(item => item.missing), [
    'Missed morning check-in',
    'Missed morning check-in and Missed evening check-out'
  ]);
});

test('includes active staff regardless of department in attendance lists', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('OFFICE', { department: 'Administration', designation: 'Accountant' })],
    teachingSections: [{ name: '4-7' }],
    punches: [],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T18:00:00')
  });

  assert.equal(result.absentToday, 1);
  assert.equal(result.missedAttendance, 1);
  assert.deepEqual(result.absentList.map(item => item.name), ['Employee OFFICE']);
  assert.deepEqual(result.missedTeacherList.map(item => item.name), ['Employee OFFICE']);
  assert.equal(result.teachingSectionBreakdown[0].absent, 0);
});

test('matches punches using the employee device PIN as well as employee code', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('EMP-42', { deviceCode: 'PIN-42' })],
    teachingSections: [{ name: '4-7' }],
    punches: [punch('PIN-42', '09:00')],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T18:00:00')
  });

  assert.equal(result.absentToday, 0);
  assert.equal(result.missedAttendance, 1);
  assert.deepEqual(result.missedTeacherList.map(item => item.missing), ['Missed evening check-out']);
});

test('counts and lists named employees without a department, section, or employee code', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [
      employee('', { staffName: 'No metadata teacher', department: '-', section: '', designation: '-' }),
      employee('EXPECTED-CODE', { staffName: 'Teacher with name-matched punch', department: '-', section: '', designation: '-' })
    ],
    teachingSections: [],
    punches: [{
      pin: 'DEVICE-PIN',
      name: 'Teacher with name-matched punch',
      punchTime: new Date('2026-11-03T09:10:00')
    }],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T16:00:00')
  });

  assert.equal(result.absentToday, 1);
  assert.deepEqual(result.absentList.map(item => item.name), ['No metadata teacher']);
  assert.equal(result.missedAttendance, 1);
  assert.deepEqual(result.missedTeacherList.map(item => [item.name, item.missing]), [
    ['No metadata teacher', 'Missed morning check-in']
  ]);
  assert.equal(result.lateToday, 1);
});
