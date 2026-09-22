const express = require('express');
const billing = express.Router();
const controller = require('../controller/controller')
const newscontroller = require('../controller/newscontroller')
const examcontroller = require('../controller/examconntroller')
const multer  = require('multer')
const examdashboardcontroller = require('../controller/examdashboardcontroller')
const practical410controller = require('../controller/practical410controller')
const themecontroller = require('../controller/themecontroller')

const studentRoutes = require('./studentRoutes');
const paymentRoutes = require('./paymentRoutes');
const setupRoutes = require('./setupRoutes');

const {verifytoken,authorized,isAdmin,isnewsAdmin}=require('../middleware/auth')
const attendancecontroller = require('../controller/attendancecontroller')

const {authenticateToken} = require('../middleware/loginmiddleware')

const {authenticateTokenStudent} = require('../middleware/loginmiddleware')
const admincontrol = require('../controller/admincontroller');
const { verify } = require('jsonwebtoken');
const billingcontroller = require('../controller/billingcontroller');

billing.get('/billingdashboard',verifytoken,authorized,isAdmin,billingcontroller.billingDashboard)
billing.get('/feehead',verifytoken,authorized,isAdmin,billingcontroller.feeHead)
billing.post('/feehead',verifytoken,authorized,isAdmin,billingcontroller.addFeeHead)
billing.get('/feehead/:id/edit',verifytoken,authorized,isAdmin,billingcontroller.editFeeHead)
billing.post('/feehead/:id/edit',verifytoken,authorized,isAdmin,billingcontroller.updateFeeHead)
billing.post('/feehead/:id/delete',verifytoken,authorized,isAdmin,billingcontroller.deleteFeeHead)
// fee structure routes
billing.get('/feestructure',verifytoken,authorized,isAdmin,billingcontroller.feeStructure)
billing.post('/feestructure',verifytoken,authorized,isAdmin,billingcontroller.addFeeStructure)
billing.get('/feestructure/:id/edit',verifytoken,authorized,isAdmin,billingcontroller.editFeeStructure)
billing.post('/feestructure/:id/edit',verifytoken,authorized,isAdmin,billingcontroller.updateFeeStructure)
billing.post('/feestructure/:id/delete',verifytoken,authorized,isAdmin,billingcontroller.deleteFeeStructure)

// Operational billing routes
billing.get('/fee-invoices',verifytoken,authorized,isAdmin,billingcontroller.feeInvoices)
billing.post('/fee-invoices',verifytoken,authorized,isAdmin,billingcontroller.addFeeInvoice)
billing.get('/fee-invoices/:id',verifytoken,authorized,isAdmin,billingcontroller.viewFeeInvoice)
billing.post('/fee-invoices/:id/delete',verifytoken,authorized,isAdmin,billingcontroller.deleteFeeInvoice)
billing.get('/fee-payments',verifytoken,authorized,isAdmin,billingcontroller.feePayments)
billing.post('/fee-payments',verifytoken,authorized,isAdmin,billingcontroller.addFeePayment)
billing.get('/fee-receipts/:id',verifytoken,authorized,isAdmin,billingcontroller.viewFeeReceipt)

// Legacy billing routes kept for compatibility with old callers
billing.get('/bill', verifytoken, authorized, isAdmin, billingcontroller.listInvoices)
billing.get('/generate', verifytoken, authorized, isAdmin, billingcontroller.showGenerateForm)
billing.post('/billing/generate', verifytoken, authorized, isAdmin, billingcontroller.generateBills)
billing.get('/invoice/:id', verifytoken, authorized, isAdmin, billingcontroller.viewInvoice)










billing.use('/students', studentRoutes);
billing.use('/payments', paymentRoutes);
billing.use('/setup', setupRoutes);

module.exports = billing;