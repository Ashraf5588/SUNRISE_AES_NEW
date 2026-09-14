const mongoose = require('mongoose');

const feePaymentSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true, unique: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeInvoice', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'studentRecord', required: true },
  reg: { type: String, required: true },
  studentName: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['CASH', 'BANK', 'ONLINE', 'CHEQUE'], required: true },
  referenceNo: { type: String, default: '' },
  receivedBy: { type: String, default: '' },
  remarks: { type: String, default: '' },
  paidAt: { type: Date, default: Date.now }
});

module.exports = { feePaymentSchema };
