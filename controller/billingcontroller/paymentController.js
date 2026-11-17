const crypto = require('crypto');
const Student = require('../../model/billingschema/Student');
const Invoice = require('../../model/billingschema/Invoice');
const Payment = require('../../model/billingschema/Payment');
const AccountLedger = require('../../model/billingschema/AccountLedger');
const { submitStudentPayment } = require('../../services/billingService');
const { classifyCashBankLedger } = require('../../utils/cashBank');
const bs = require('../../utils/bikramSambat');

exports.showPaymentForm = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).send('Student not found.');
    const [outstandingInvoices, ledgers] = await Promise.all([
      Invoice.find({
        student: student._id,
        status: { $in: ['UNPAID', 'PARTIAL'] },
        isCancelled: false,
      }).sort({ billDateAD: 1 }).lean(),
      AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name').sort({ code: 1 }).lean(),
    ]);
    return res.render('payments/form', {
      student,
      outstandingInvoices,
      cashBankAccounts: ledgers.filter(ledger => classifyCashBankLedger(ledger)),
      todayBS: String(bs.ADToBS(new Date()) || '').slice(0, 10),
      idempotencyKey: crypto.randomBytes(24).toString('hex'),
      error: '',
    });
  } catch (error) {
    console.error('Unable to load payment form:', error);
    return res.status(500).send('Unable to load the payment form.');
  }
};

exports.createPayment = async (req, res) => {
  try {
    const result = await submitStudentPayment({
      studentId: req.body.studentId,
      amount: req.body.amount,
      paymentDateBS: req.body.paymentDateBS,
      mode: req.body.mode,
      depositLedgerId: req.body.depositLedgerId,
      collectedBy: req.user?.teacherName || req.user?.username || '',
      referenceNumber: req.body.referenceNumber,
      remarks: req.body.remarks,
      idempotencyKey: req.body.idempotencyKey,
      user: req.user,
    });
    if (result.payment) return res.redirect(`/payments/${result.payment._id}`);
    return res.redirect('/accounting/vouchers?status=submitted');
  } catch (error) {
    console.error('Unable to record student payment:', error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400;
    return res.status(status).send(error.message || 'Unable to record student payment.');
  }
};

exports.viewReceipt = async (req, res) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
    return res.sendStatus(404);
  }

  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student')
      .populate('allocations.invoice');

    if (!payment) return res.sendStatus(404);
    if (req.user.role === 'CASHIER' && String(payment.collectedByUser || '') !== String(req.user._id)) {
      return res.sendStatus(404);
    }
    return res.render('payments/receipt', { payment });
  } catch (error) {
    console.error('Failed to load payment receipt:', error);
    return res.sendStatus(500);
  }
};

exports.listPayments = async (req, res) => {
  try {
    const filters = req.user.role === 'CASHIER'
      ? { collectedByUser: req.user._id }
      : {};
    const payments = await Payment.find(filters).populate('student').sort({ paymentDateAD: -1 }).limit(200);
    return res.render('payments/list', { payments });
  } catch (error) {
    console.error('Unable to load payment list:', error);
    return res.status(500).send('Unable to load payments.');
  }
};
