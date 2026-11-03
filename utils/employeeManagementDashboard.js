function getActiveEmployeeProfiles(employees) {
  return employees.filter(employee => {
    if (!String(employee.staffName || '').trim()) return false;
    const statuses = [employee.employmentStatus, employee.jobStatus]
      .map(status => String(status || '').trim().toLowerCase())
      .filter(Boolean);
    if (statuses.some(status => ['resigned', 'terminated'].includes(status))) return false;
    if (employee.isActive !== false) return true;
    return statuses.some(status => ['active', 'on leave', 'probation'].includes(status));
  });
}

module.exports = { getActiveEmployeeProfiles };
