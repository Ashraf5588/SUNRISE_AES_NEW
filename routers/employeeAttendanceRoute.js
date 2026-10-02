const express = require('express');
const employee = express.Router();

const employeeController = require('../controller/employeeController/employeeController');
const { verifytoken, isAdmin } = require('../middleware/auth');


employee.get('/employeedetail', verifytoken, isAdmin, employeeController.showEmployeeDetails);
employee.get('/employeemanagementdashboard', verifytoken, isAdmin, employeeController.showEmployeeManagementDashboard);
employee.get('/employeedata', verifytoken, isAdmin, employeeController.showEmployeeData);
employee.post('/employeedetail', verifytoken, isAdmin, employeeController.uploadEmployeeDocuments, employeeController.createEmployeeDetails);
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
employee.get('/employeeattendance', employeeController.getEmployeeAttendance);

module.exports = employee;