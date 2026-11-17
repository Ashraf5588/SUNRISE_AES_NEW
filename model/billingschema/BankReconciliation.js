const mongoose = require('mongoose');

const statementTransactionSchema = new mongoose.Schema({
  dateAD: { type: Date, required: true },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  reference: { type: String, trim: true, maxlength: 100, default: '' },
  debit: { type: Number, min: 0, required: true, default: 0 },
  credit: { type: Number, min: 0, required: true, default: 0 },
  matchedVoucher: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', default: null },
}, { _id: false });

const unmatchedBookTransactionSchema = new mongoose.Schema({
  voucher: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', required: true },
  dateAD: { type: Date, required: true },
  dateBS: { type: String, default: '' },
  voucherNumber: { type: String, required: true },
  description: { type: String, default: '' },
  reference: { type: String, default: '' },
  debit: { type: Number, min: 0, required: true },
  credit: { type: Number, min: 0, required: true },
}, { _id: false });

const bankReconciliationSchema = new mongoose.Schema({
  bankLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
  statementFromAD: { type: Date, required: true },
  statementToAD: { type: Date, required: true },
  openingBalance: { type: Number, required: true },
  statementBalance: { type: Number, required: true },
  bookOpeningBalance: { type: Number, required: true },
  bookClosingBalance: { type: Number, required: true },
  unreconciledDifference: { type: Number, required: true },
  transactions: { type: [statementTransactionSchema], required: true },
  unmatchedBookTransactions: { type: [unmatchedBookTransactionSchema], default: [] },
  unmatchedStatementCount: { type: Number, required: true, min: 0 },
  unmatchedBookCount: { type: Number, required: true, min: 0 },
  statementHash: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
}, { timestamps: true });

bankReconciliationSchema.index({ bankLedger: 1, statementFromAD: 1, statementToAD: 1 });

module.exports = mongoose.models.BankReconciliation
  || mongoose.model('BankReconciliation', bankReconciliationSchema, 'bankReconciliations');
