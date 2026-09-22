const Student = require('../../models/Student');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const { recordPayment } = require('../../services/billingService');

exports.showPaymentForm = async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  const outstandingInvoices = await Invoice.find({
    student: student._id,
    status: { $in: ['UNPAID', 'PARTIAL'] },
    isCancelled: false,
  }).sort({ billDateAD: 1 });
  res.render('payments/form', { student, outstandingInvoices });
};

exports.createPayment = async (req, res) => {
  const { studentId, amount, paymentDateAD, paymentDateBS, mode, collectedBy, remarks } = req.body;

  const payment = await recordPayment({
    studentId,
    amount: Number(amount),
    paymentDateAD: new Date(paymentDateAD),
    paymentDateBS,
    mode,
    collectedBy,
    remarks,
  });

  res.redirect(`/payments/${payment._id}`);
};

exports.viewReceipt = async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('student')
    .populate('allocations.invoice');
  res.render('payments/receipt', { payment });
};

exports.listPayments = async (req, res) => {
  const payments = await Payment.find().populate('student').sort({ paymentDateAD: -1 }).limit(200);
  res.render('payments/list', { payments });
};
