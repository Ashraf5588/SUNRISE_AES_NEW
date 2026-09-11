const express = require('express');
const billing = express.Router();
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
const billingcontroller = require('../controller/billingcontroller')

billing.get('/billingdashboard',verifytoken,authorized,billingcontroller.billingDashboard)
billing.get('/feehead',verifytoken,authorized,billingcontroller.feeHead)
billing.post('/feehead',verifytoken,authorized,billingcontroller.addFeeHead)
billing.get('/feehead/:id/edit',verifytoken,authorized,billingcontroller.editFeeHead)
billing.post('/feehead/:id/edit',verifytoken,authorized,billingcontroller.updateFeeHead)
billing.post('/feehead/:id/delete',verifytoken,authorized,billingcontroller.deleteFeeHead)
module.exports = billing;