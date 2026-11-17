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

const {
  verifytoken,
  authorized,
  isAdmin,
  isFinanceStaff,
  isAccountantOrAdmin,
  isnewsAdmin,
}=require('../middleware/auth')
const attendancecontroller = require('../controller/attendancecontroller')

const {authenticateToken} = require('../middleware/loginmiddleware')

const {authenticateTokenStudent} = require('../middleware/loginmiddleware')
const admincontrol = require('../controller/admincontroller');
const { verify } = require('jsonwebtoken');
const billingcontroller = require('../controller/billingcontroller/billingController');
const accountingController = require('../controller/billingcontroller/accountingController');
const accountingReportsController = require('../controller/billingcontroller/accountingReportsController');
const payrollController = require('../controller/payrollController');
const payrollReportsController = require('../controller/payrollReportsController');

billing.get('/billingdashboard',verifytoken,authorized,isAdmin,billingcontroller.billingDashboard)
billing.get('/payroll', verifytoken, authorized, isAccountantOrAdmin, payrollController.dashboard)
billing.get('/payroll/reports', verifytoken, authorized, isAccountantOrAdmin, payrollReportsController.report)
billing.get('/payroll/reports/:reportKey/export/:format', verifytoken, authorized, isAccountantOrAdmin, payrollReportsController.exportReport)
billing.get('/payroll/reports/:reportKey/print', verifytoken, authorized, isAccountantOrAdmin, payrollReportsController.report)
billing.get('/payroll/reports/:reportKey', verifytoken, authorized, isAccountantOrAdmin, payrollReportsController.report)
billing.get('/payroll/structures', verifytoken, authorized, isAccountantOrAdmin, payrollController.listSalaryStructures)
billing.post('/payroll/structures', verifytoken, authorized, isAccountantOrAdmin, payrollController.saveStructure)
billing.get('/payroll/components', verifytoken, authorized, isAccountantOrAdmin, payrollController.listPayrollComponents)
billing.post('/payroll/components', verifytoken, authorized, isAccountantOrAdmin, payrollController.savePayrollComponent)
billing.post('/payroll/components/:id/status', verifytoken, authorized, isAccountantOrAdmin, payrollController.setPayrollComponentStatus)
billing.get('/payroll/tax-schemes', verifytoken, authorized, isAccountantOrAdmin, payrollController.listTaxSchemes)
billing.post('/payroll/tax-schemes', verifytoken, authorized, isAccountantOrAdmin, payrollController.saveTaxScheme)
billing.post('/payroll/settings', verifytoken, authorized, isAdmin, payrollController.saveSettings)
billing.post('/payroll/run', verifytoken, authorized, isAccountantOrAdmin, payrollController.createRun)
billing.get('/cashbank',verifytoken,authorized,isFinanceStaff,accountingController.cashBank)
billing.get('/cashbank/ledger/:id',verifytoken,authorized,isFinanceStaff,accountingController.ledgerStatement)
billing.get('/cashbank/book/:kind',verifytoken,authorized,isFinanceStaff,accountingController.cashBankBook)
billing.get('/cashbank/book/:kind/export',verifytoken,authorized,isFinanceStaff,accountingController.exportCashBankBook)
billing.post('/cashbank/operations',verifytoken,authorized,isFinanceStaff,accountingController.createCashBankOperation)
billing.get('/accounting/settings',verifytoken,authorized,isAdmin,accountingController.accountingSettings)
billing.get('/accounting/reports',verifytoken,authorized,isAccountantOrAdmin,accountingReportsController.reportHome)
billing.get('/accounting/reports/voucher/:id',verifytoken,authorized,isAccountantOrAdmin,accountingReportsController.showVoucher)
billing.get('/accounting/reports/:reportType/export/:format',verifytoken,authorized,isAccountantOrAdmin,accountingReportsController.exportReport)
billing.get('/accounting/reports/:reportType',verifytoken,authorized,isAccountantOrAdmin,accountingReportsController.showReport)
billing.post('/accounting/settings',verifytoken,authorized,isAdmin,accountingController.saveAccountingSettings)
billing.post('/accounting/close-year',verifytoken,authorized,isAdmin,accountingController.closeFiscalYear)
billing.get('/accounting/historical-reconciliation',verifytoken,authorized,isAdmin,accountingController.historicalReconciliation)
billing.get('/accounting/vouchers',verifytoken,authorized,isFinanceStaff,accountingController.voucherQueue)
billing.post('/accounting/vouchers/:id/review',verifytoken,authorized,isAccountantOrAdmin,accountingController.reviewVoucher)
billing.post('/accounting/vouchers/:id/approve',verifytoken,authorized,isAdmin,accountingController.approveVoucher)
billing.post('/accounting/vouchers/:id/reject',verifytoken,authorized,isAccountantOrAdmin,accountingController.rejectVoucher)
billing.post('/accounting/vouchers/:id/reverse',verifytoken,authorized,isAdmin,accountingController.reverseVoucher)
billing.get('/accounting/reconciliation',verifytoken,authorized,isAccountantOrAdmin,accountingController.reconciliationPage)
billing.post('/accounting/reconciliation',verifytoken,authorized,isAccountantOrAdmin,accountingController.createReconciliation)
billing.get('/accounting/reconciliation/:id',verifytoken,authorized,isAccountantOrAdmin,accountingController.viewReconciliation)
billing.get('/journal-voucher/date-conversion',verifytoken,authorized,isAccountantOrAdmin,billingcontroller.convertJournalVoucherDate)
billing.get('/journal-voucher',verifytoken,authorized,isAccountantOrAdmin,billingcontroller.journalVoucher)
billing.post('/journal-voucher',verifytoken,authorized,isAccountantOrAdmin,billingcontroller.createJournalVoucher)
billing.get('/journal-voucher/:id/edit',verifytoken,authorized,isAccountantOrAdmin,billingcontroller.editJournalVoucher)
billing.post('/journal-voucher/:id/edit',verifytoken,authorized,isAccountantOrAdmin,billingcontroller.updateJournalVoucher)
billing.get('/chartsofAccount',verifytoken,authorized,isAdmin,billingcontroller.chartOfAccounts)
billing.post('/chartsofAccount/groups',verifytoken,authorized,isAdmin,billingcontroller.addAccountGroup)
billing.post('/chartsofAccount/ledgers',verifytoken,authorized,isAdmin,billingcontroller.addLedgerAccount)
billing.post('/chartsofAccount/ledgers/:id/status',verifytoken,authorized,isAdmin,billingcontroller.setLedgerStatus)
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
// billing.get('/fee-invoices',verifytoken,authorized,isAdmin,billingcontroller.feeInvoices)
// billing.post('/fee-invoices',verifytoken,authorized,isAdmin,billingcontroller.addFeeInvoice)
// billing.get('/fee-invoices/:id',verifytoken,authorized,isAdmin,billingcontroller.viewFeeInvoice)
// billing.post('/fee-invoices/:id/delete',verifytoken,authorized,isAdmin,billingcontroller.deleteFeeInvoice)
billing.get('/fee-payments',verifytoken,authorized,isFinanceStaff,billingcontroller.feePayments)
billing.post('/fee-payments',verifytoken,authorized,isFinanceStaff,billingcontroller.addFeePayment)
billing.get('/fee-receipts/:id',verifytoken,authorized,isFinanceStaff,billingcontroller.viewFeeReceipt)

// Legacy billing routes kept for compatibility with old callers
billing.get('/bill', verifytoken, authorized, isAdmin, billingcontroller.listInvoices)
billing.get('/generate', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.showGenerateForm)
billing.get('/billing', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.listInvoices)
billing.get('/billing/fee-head-preview', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.previewMonthlyBillFeeHeads)
billing.get('/billing/class-fee-preview', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.previewClassMonthlyBillFeeHeads)
billing.post('/billing/generate', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.generateBills)
billing.get('/billing/print-invoices', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.showInvoicePrintPage)
billing.post('/billing/print-invoices/batch', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.printInvoiceBatch)
billing.get('/invoice/:id', verifytoken, authorized, isAccountantOrAdmin, billingcontroller.viewInvoice)
billing.get('/invoicelist', verifytoken, authorized, isAdmin, billingcontroller.listInvoices)













billing.use('/students', verifytoken, authorized, isFinanceStaff, studentRoutes);
billing.use('/payments', verifytoken, authorized, isFinanceStaff, paymentRoutes);
billing.use('/setup', verifytoken, authorized, isAdmin, setupRoutes);

module.exports = billing;