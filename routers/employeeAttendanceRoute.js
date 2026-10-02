const express = require('express');
const employeeAttendance = express.Router();

const employeeController = require('../controller/employeeController');


employeeAttendance.post('/iclock/cdata', employeeController.saveEmployeeAttendance);
employeeAttendance.get('/employeeAttendance', employeeController.getEmployeeAttendance);

module.exports = employeeAttendance;