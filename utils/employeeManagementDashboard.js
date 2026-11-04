function isActiveEmployeeProfile(employee) {
  if (!String(employee.staffName || '').trim()) return false;
  const statuses = [employee.employmentStatus, employee.jobStatus]
    .map(status => String(status || '').trim().toLowerCase())
    .filter(Boolean);
  if (statuses.some(status => ['resigned', 'terminated'].includes(status))) return false;
  if (statuses.some(status => ['inactive', 'disabled'].includes(status))) return false;
  if (statuses.some(status => ['active', 'on leave', 'probation'].includes(status))) return true;
  return statuses.length === 0;
}

function getActiveEmployeeProfiles(employees) {
  return employees.filter(isActiveEmployeeProfile);
}

module.exports = { getActiveEmployeeProfiles, isActiveEmployeeProfile };
