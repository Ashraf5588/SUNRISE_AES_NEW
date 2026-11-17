const mongoose = require('mongoose');

const journalVoucherLineSchema = new mongoose.Schema({
  ledger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
  debit: { type: Number, required: true, min: 0, default: 0 },
  credit: { type: Number, required: true, min: 0, default: 0 },
}, { _id: false });

const journalVoucherRevisionSchema = new mongoose.Schema({
  revision: { type: Number, required: true, min: 0 },
  dateBS: { type: String, required: true },
  dateAD: { type: Date, required: true },
  narration: { type: String, required: true },
  entries: { type: [journalVoucherLineSchema], required: true },
  totalDebit: { type: Number, required: true, min: 0 },
  totalCredit: { type: Number, required: true, min: 0 },
  editedAt: { type: Date, required: true },
  editedBy: { type: String, trim: true, default: '' },
}, { _id: false });

const voucherAuditEventSchema = new mongoose.Schema({
  action: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  at: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const paymentRequestSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  amount: { type: Number, min: 0 },
  mode: { type: String, enum: ['CASH', 'BANK', 'ESEWA', 'KHALTI', 'CHEQUE'] },
  depositLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
  referenceNumber: { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
}, { _id: false });

const transactionDetailsSchema = new mongoose.Schema({
  partyName: { type: String, trim: true, maxlength: 150, default: '' },
  amount: { type: Number, min: 0, default: 0 },
  paymentMethod: { type: String, enum: ['CASH', 'BANK'], default: null },
  cashBankLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
  offsetLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
  fromLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
  toLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
  referenceNumber: { type: String, trim: true, maxlength: 100, default: '' },
}, { _id: false });

const journalVoucherSchema = new mongoose.Schema({
  voucherNumber: { type: String, required: true, trim: true, unique: true },
  voucherType: {
    type: String,
    enum: ['JOURNAL', 'RECEIPT', 'PAYMENT', 'CONTRA', 'FEE_INVOICE', 'FEE_RECEIPT', 'REVERSAL', 'OPENING_BALANCE', 'CLOSING'],
    default: 'JOURNAL',
    required: true,
  },
  dateBS: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  dateAD: { type: Date, required: true },
  narration: { type: String, required: true, trim: true, maxlength: 500 },
  entries: {
    type: [journalVoucherLineSchema],
    required: true,
    validate: {
      validator: entries => Array.isArray(entries) && entries.length >= 2,
      message: 'A journal voucher requires at least two entries.',
    },
  },
  totalDebit: { type: Number, required: true, min: 0 },
  totalCredit: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_ACCOUNTANT_REVIEW', 'PENDING_ADMIN_APPROVAL', 'POSTED', 'REJECTED'],
    default: 'POSTED',
    required: true,
  },
  createdBy: { type: String, trim: true, default: '' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  auditEvents: { type: [voucherAuditEventSchema], default: [] },
  sourceType: { type: String, trim: true, default: '' },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  idempotencyKey: { type: String, trim: true, default: undefined },
  paymentRequest: { type: paymentRequestSchema, default: null },
  transactionDetails: { type: transactionDetailsSchema, default: null },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', default: null },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', default: null },
  revision: { type: Number, min: 0, default: 0 },
  revisionHistory: { type: [journalVoucherRevisionSchema], default: [] },
}, { timestamps: true });

journalVoucherSchema.index({ dateAD: -1, createdAt: -1 });
journalVoucherSchema.index(
  { sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { sourceId: { $type: 'objectId' } } }
);
journalVoucherSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const voucherCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, min: 0, default: 0 },
}, { versionKey: false });

module.exports = {
  JournalVoucher: mongoose.models.JournalVoucher
    || mongoose.model('JournalVoucher', journalVoucherSchema, 'journalVouchers'),
  VoucherCounter: mongoose.models.VoucherCounter
    || mongoose.model('VoucherCounter', voucherCounterSchema, 'voucherCounters'),
};
