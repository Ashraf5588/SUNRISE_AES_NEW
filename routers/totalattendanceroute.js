const express = require('express');
const router = express.Router();
const totalAttendanceController = require('../controller/totalAttendanceController/totalattendancecontroller');
const { verifytoken, isAdmin } = require('../middleware/auth');

router.get('/total-attendanceentry', verifytoken, isAdmin, totalAttendanceController.TotalAttendanceEntryPage);
router.post('/total-attendanceentry/save', verifytoken, isAdmin, totalAttendanceController.saveTotalAttendance);

module.exports = router;
