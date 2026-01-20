const express = require('express');
const attendance = express.Router();
const controller = require('../controller/controller')
const newscontroller = require('../controller/newscontroller')
const examcontroller = require('../controller/examconntroller')
const multer  = require('multer')
const examdashboardcontroller = require('../controller/examdashboardcontroller')
const practical410controller = require('../controller/practical410controller')
const themecontroller = require('../controller/themecontroller')

const {verifytoken,authorized,isAdmin,isnewsAdmin}=require('../middleware/auth')
const attendancecontroller = require('../controller/attendancecontroller')

const {authenticateToken} = require('../middleware/loginmiddleware')

const {authenticateTokenStudent} = require('../middleware/loginmiddleware')
const admincontrol = require('../controller/admincontroller');
const { verify } = require('jsonwebtoken');

attendance.get('/onlineattendance',verifytoken,authorized,attendancecontroller.onlineAttendancePage)
attendance.post('/saveonlineattendance',verifytoken,authorized,attendancecontroller.saveOnlineAttendance)
attendance.get('/setholiday',verifytoken,authorized,isAdmin,attendancecontroller.setHoliday)
attendance.post('/setholiday',verifytoken,authorized,isAdmin,attendancecontroller.savesetHoliday)

module.exports = attendance;