const assert = require('node:assert/strict');
const test = require('node:test');
const { getActiveEmployeeProfiles } = require('../utils/employeeManagementDashboard');

test('keeps employees with an active status when the legacy active flag is false', () => {
  const employees = [
    { staffName: 'Teacher', isActive: false, employmentStatus: 'Active' },
    { staffName: 'Staff on leave', isActive: false, jobStatus: 'On Leave' },
    { staffName: 'Former staff', isActive: true, employmentStatus: 'Resigned' },
    { staffName: 'Inactive staff', isActive: false, employmentStatus: 'Inactive' },
    { staffName: 'Legacy profile', isActive: false },
    { staffName: 'Legacy active staff', isActive: true }
  ];

  assert.deepEqual(
    getActiveEmployeeProfiles(employees).map(employee => employee.staffName),
    ['Teacher', 'Staff on leave', 'Legacy profile', 'Legacy active staff']
  );
});
