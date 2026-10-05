const express = require('express');
const employee = express.Router();

const employeeController = require('../controller/employeeController/employeeController');
const { verifytoken, isAdmin } = require('../middleware/auth');


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
employee.get('/iclock/cdata', (req, res) => {
	const serialNumber = String(req.query.SN || '').trim();
	if (!serialNumber) {
		return res.status(400).type('text/plain').send('Missing SN');
	}

	const options = [
		`GET OPTION FROM: ${serialNumber}`,
		'Stamp=9999',
		'OpStamp=9999',
		'PhotoStamp=9999',
		'ErrorDelay=30',
		'Delay=10',
		'TransTimes=00:00;14:05',
		'TransInterval=1',
		'TransFlag=1111000000',
		'Realtime=1',
		'Encrypt=0',
		'ATTLOGStamp=9999'
	].join('\r\n');

	return res.type('text/plain').send(`${options}\r\n`);
});
employee.all('/iclock/cdata', (req, res) => {
	res.set('Allow', 'POST').sendStatus(405);
});
employee.get('/employeeattendance/export', employeeController.exportEmployeeAttendance);
employee.get('/employeeattendance/template', verifytoken, isAdmin, employeeController.downloadEmployeeAttendanceCsvTemplate);
employee.post('/employeeattendance/import', verifytoken, isAdmin, employeeController.uploadEmployeeAttendanceCsv, employeeController.importEmployeeAttendanceCsv);
employee.get('/employeeattendance', verifytoken, isAdmin, employeeController.getEmployeeAttendance);

module.exports = employee;