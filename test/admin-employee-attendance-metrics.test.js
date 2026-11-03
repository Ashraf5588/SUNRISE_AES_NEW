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

test('does not report an evening punch missing before the planned checkout time', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('MORNING')],
    teachingSections: [],
    punches: [punch('MORNING', '09:00')],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T15:00:00')
  });

  assert.equal(result.missedAttendance, 0);
  assert.deepEqual(result.missedTeacherList, []);
});

test('does not count an employee absent before their planned check-in time', () => {
  const result = calculateAdminEmployeeAttendanceMetrics({
    employees: [employee('NO-PUNCH')],
    teachingSections: [{ name: '4-7' }],
    punches: [],
    leaves: [],
    isEmployeeHoliday: false,
    now: new Date('2026-11-03T08:30:00')
  });

  assert.equal(result.absentToday, 0);
  assert.equal(result.teachingSectionBreakdown[0].absent, 0);
  assert.equal(result.missedAttendance, 0);
});
