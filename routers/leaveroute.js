const express = require('express');
const leave = express.Router();
const leaveController = require('../controller/leavecontroller/leavecontroller');
const { verifytoken } = require('../middleware/auth');

leave.get('/', verifytoken, leaveController.leavePage);
leave.get('/usage', verifytoken, leaveController.leaveUsage);
leave.post('/', verifytoken, leaveController.submitLeaveApplication);
leave.get('/setup', verifytoken, leaveController.isAdmin, leaveController.setupPage);
leave.post('/setup', verifytoken, leaveController.isAdmin, leaveController.createLeaveType);
leave.post('/setup/:id', verifytoken, leaveController.isAdmin, leaveController.updateLeaveType);
leave.post('/:id/review', verifytoken, leaveController.isAdmin, leaveController.reviewLeaveApplication);
leave.get('/:id/edit', verifytoken, leaveController.isAdmin, leaveController.editLeaveApplication);
leave.post('/:id/edit', verifytoken, leaveController.isAdmin, leaveController.updateLeaveApplication);
leave.post('/:id/transfer', verifytoken, leaveController.isAdmin, leaveController.transferLeaveApplication);
leave.post('/:id/delete', verifytoken, leaveController.isAdmin, leaveController.deleteLeaveApplication);
leave.get('/:id/document', verifytoken, leaveController.downloadSupportingDocument);

module.exports = leave;
