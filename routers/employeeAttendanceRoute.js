const express = require('express');
const employee = express.Router();

const employeeController = require('../controller/employeeController/employeeController');
const { verifytoken, verifytokenApi, isAdmin } = require('../middleware/auth');

employee.use('/iclock', (req, res, next) => {
	const requestTimestamp = new Date().toISOString();
	const queryParameterNames = Object.keys(req.query || {});
	const userAgent = String(req.get('user-agent') || '').slice(0, 200);
	const contentType = String(req.get('content-type') || '').slice(0, 100);
	const contentLength = String(req.get('content-length') || '');
	res.once('finish', () => {
		console.info('ADMS HTTP request:', {
			method: req.method,
			url: `${req.baseUrl}${req.path}`,
			queryParameterNames,
			userAgent,
			contentType,
			contentLength,
			requestTimestamp,
			responseStatus: res.statusCode
		});
	});
	next();
});

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
employee.post('/employeedata/:id/deactivate', verifytoken, isAdmin, employeeController.deactivateEmployee);
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
	employeeController.saveEmployeeAttendance
);
employee.get('/iclock/cdata', employeeController.getEmployeeAttendanceDeviceOptions);
employee.all('/iclock/cdata', (req, res) => {
	res.set('Allow', 'POST').sendStatus(405);
});
employee.get('/iclock/getrequest', employeeController.getAdmsDeviceCommand);
employee.all('/iclock/getrequest', (req, res) => {
	res.set('Allow', 'GET').sendStatus(405);
});
employee.post('/iclock/devicecmd', employeeController.receiveAdmsDeviceCommandResult);
employee.all('/iclock/devicecmd', (req, res) => {
	res.set('Allow', 'POST').sendStatus(405);
});
employee.get('/employeeattendance/device-status/:serialNumber', verifytoken, isAdmin, employeeController.checkEmployeeAttendanceDeviceConnection);
employee.post('/employeeattendance/device-sync', verifytoken, isAdmin, employeeController.startEmployeeAttendanceDeviceSync);
employee.get('/employeeattendance/device-sync/:runId', verifytoken, isAdmin, employeeController.getEmployeeAttendanceDeviceSync);
employee.post('/employeeattendance/staff/:employeeId/sync', verifytoken, isAdmin, employeeController.syncEmployeeToAttendanceDevices);
employee.get('/employeeattendance/staff/:employeeId/commands', verifytoken, isAdmin, employeeController.getEmployeeAttendanceDeviceCommandHistory);
employee.post('/employeeattendance/device-command/:commandId/retry', verifytoken, isAdmin, employeeController.retryEmployeeAttendanceDeviceCommand);
employee.post('/employeeattendance/device/:serialNumber/command/:commandId/cancel', verifytoken, isAdmin, employeeController.cancelEmployeeAttendanceDeviceCommand);
employee.post('/employeeattendance/staff/:employeeId/manual-fingerprint-enrollment', verifytoken, isAdmin, employeeController.confirmManualEmployeeFingerprintEnrollment);
employee.post('/employeeattendance/device/:serialNumber/capabilities', verifytoken, isAdmin, employeeController.configureEmployeeAttendanceDeviceCapabilities);
employee.get('/employeeattendance/report', verifytoken, isAdmin, employeeController.showEmployeeAttendanceRangeReport);
employee.get('/employeeattendance/statistics', verifytoken, isAdmin, employeeController.showEmployeeAttendanceStatistics);
employee.get('/employeeattendance/monthly-report', verifytoken, isAdmin, employeeController.showMonthWiseAttendanceReport);
employee.get('/employeeattendance/export', employeeController.exportEmployeeAttendance);
employee.get('/employeeattendance/template', verifytoken, isAdmin, employeeController.downloadEmployeeAttendanceCsvTemplate);
employee.post('/employeeattendance/import', verifytoken, isAdmin, employeeController.uploadEmployeeAttendanceCsv, employeeController.importEmployeeAttendanceCsv);
employee.get('/employeeattendance', verifytoken, isAdmin, employeeController.getEmployeeAttendance);

module.exports = employee;