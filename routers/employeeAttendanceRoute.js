const express = require('express');
const employee = express.Router();

const employeeController = require('../controller/employeeController/employeeController');
const { verifytoken, verifytokenApi, isAdmin } = require('../middleware/auth');


employee.get('/employee-document/:employeeId', verifytokenApi, employeeController.showPrivateEmployeeDocument);
employee.get('/employee-office-proof/:employeeId/:collection', verifytoken, isAdmin, employeeController.showPrivateEmployeeOfficeProof);
employee.post('/employee-document/:employeeId/update', verifytokenApi, employeeController.uploadEmployeeDocuments, employeeController.updateEmployeeDocument);
employee.post('/employee-document/:employeeId/delete', verifytokenApi, employeeController.deleteEmployeeDocument);
employee.post('/employee-photo/:employeeId/delete', verifytokenApi, employeeController.deleteEmployeePhoto);
employee.get('/employeedetail', verifytoken, isAdmin, employeeController.showEmployeeDetails);
employee.get('/employeedetail/csv-template', verifytoken, isAdmin, employeeController.downloadEmployeeProfileCsvTemplate);
employee.get('/employeedetail/check-code', verifytoken, isAdmin, employeeController.checkEmployeeIdentifier);
employee.get('/employeemanagementdashboard', verifytoken, isAdmin, employeeController.showEmployeeManagementDashboard);
employee.get('/employeedata', verifytoken, isAdmin, employeeController.showEmployeeData);
employee.get('/staffcontacts', verifytoken, employeeController.showStaffContacts);
employee.get('/employeeattendancesetup', verifytoken, isAdmin, employeeController.showEmployeeAttendanceSetup);
employee.post('/employeeattendancesetup', verifytoken, isAdmin, employeeController.saveEmployeeAttendanceSetup);
employee.get('/addweekend/template', verifytoken, isAdmin, employeeController.downloadEmployeeWeekendCsvTemplate);
employee.post('/addweekend/import', verifytoken, isAdmin, employeeController.uploadEmployeeWeekendCsv, employeeController.importEmployeeWeekendCsv);
employee.get('/addweekend', verifytoken, isAdmin, employeeController.showEmployeeWeekends);
employee.post('/addweekend', verifytoken, isAdmin, employeeController.saveEmployeeWeekend);
employee.get('/branchsetup', verifytoken, isAdmin, employeeController.showBranchSetup);
employee.post('/branchsetup', verifytoken, isAdmin, employeeController.saveBranchSetup);
employee.get('/departmentsetup', verifytoken, isAdmin, employeeController.showDepartmentSetup);
employee.post('/departmentsetup', verifytoken, isAdmin, employeeController.saveDepartmentSetup);
employee.get('/sectionsetup', verifytoken, isAdmin, employeeController.showSectionSetup);
employee.post('/sectionsetup', verifytoken, isAdmin, employeeController.saveSectionSetup);
employee.get('/designationsetup', verifytoken, isAdmin, employeeController.showDesignationSetup);
employee.post('/designationsetup', verifytoken, isAdmin, employeeController.saveDesignationSetup);
employee.get('/shiftsetup', verifytoken, isAdmin, employeeController.showShiftSetup);
employee.post('/shiftsetup', verifytoken, isAdmin, employeeController.saveShiftSetup);
employee.get('/manualpunch', verifytoken, employeeController.showManualPunchPage);
employee.post('/manualpunch', verifytoken, employeeController.createManualPunchRequest);
employee.get('/myattendance', verifytoken, employeeController.showMyAttendance);
employee.get('/employeeprofile', verifytoken, employeeController.showEmployeeProfileFillup);
employee.get('/employeprofilefillupform', verifytoken, employeeController.showEmployeeProfileFillup);
employee.post('/employeeprofile', verifytoken, employeeController.uploadEmployeeDocuments, employeeController.saveEmployeeProfileFillup);
employee.post('/employeprofilefillupform', verifytoken, employeeController.uploadEmployeeDocuments, employeeController.saveEmployeeProfileFillup);
employee.post('/manualpunch/:id/review', verifytoken, isAdmin, employeeController.reviewManualPunchRequest);
employee.post('/employeedetail', verifytoken, isAdmin, employeeController.uploadEmployeeDocuments, employeeController.createEmployeeDetails);
employee.post('/employeedetail/import-csv', verifytoken, isAdmin, employeeController.uploadEmployeeProfileCsv, employeeController.importEmployeeProfileCsv);
employee.post('/employeedetail/:id', verifytoken, isAdmin, employeeController.uploadEmployeeDocuments, employeeController.updateEmployeeDetails);
employee.post(
	'/iclock/cdata',
	express.text({ type: ['text/plain', 'application/octet-stream'] }),
	employeeController.saveEmployeeAttendance
);
employee.get('/iclock/cdata', employeeController.getEmployeeAttendanceDeviceOptions);
employee.all('/iclock/cdata', (req, res) => {
	res.set('Allow', 'POST').sendStatus(405);
});
employee.post('/employeeattendance/device-sync', verifytoken, isAdmin, employeeController.startEmployeeAttendanceDeviceSync);
employee.get('/employeeattendance/device-sync/:runId', verifytoken, isAdmin, employeeController.getEmployeeAttendanceDeviceSync);
employee.get('/employeeattendance/export', employeeController.exportEmployeeAttendance);
employee.get('/employeeattendance/template', verifytoken, isAdmin, employeeController.downloadEmployeeAttendanceCsvTemplate);
employee.post('/employeeattendance/import', verifytoken, isAdmin, employeeController.uploadEmployeeAttendanceCsv, employeeController.importEmployeeAttendanceCsv);
employee.get('/employeeattendance', verifytoken, isAdmin, employeeController.getEmployeeAttendance);

module.exports = employee;