const mongoose = require('mongoose');

// currentItems is a SNAPSHOT copy (label + amount), not a live reference
// to FeeStructure. That's intentional: this document is what gets printed
// and handed to the parent, and it must never change even if fees change
// later. previousDue is the carried balance and currentItems are this
// month's charges; balanceDue is the amount still owed after advance credits.
const invoiceItemSchema = new mongoose.Schema(
  {
    feeCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'feehead' },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
    feeHeadName: String,
    frequency: String,
    label: String, // e.g. "Tuition Fee - Baishakh", "Admission Fee"
    amount: Number,
  },
  { _id: false }
);

const advanceAllocationSchema = new mongoose.Schema({
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  amountApplied: { type: Number, required: true, min: 0 },
}, { _id: false });

const invoiceSchema = new mongoose.Schema(
  {
    // sequential, unique, generated via Counter - e.g. INV-2082083-000045
    invoiceNumber: { type: String, required: true, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
    },
    billMonthBS: { type: String, required: true }, // "Baishakh"
    billDateAD: { type: Date, required: true },
    billDateBS: { type: String, required: true },
    previousDue: { type: Number, default: 0 },
    currentItems: [invoiceItemSchema],
    currentTotal: { type: Number, required: true },
    grandTotal: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true },
    status: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID'],
      default: 'UNPAID',
    },
    journalVoucher: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', default: null },
    generationKey: { type: String, trim: true, sparse: true, unique: true },
    advanceAllocations: { type: [advanceAllocationSchema], default: [] },
    // Never hard-delete a wrongly issued invoice - IRD audits flag missing
    // numbers in the sequence. Mark it cancelled instead and issue a fresh one.
    isCancelled: { type: Boolean, default: false },
    cancelReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
