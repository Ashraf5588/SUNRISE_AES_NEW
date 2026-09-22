const mongoose = require('mongoose');

// currentItems is a SNAPSHOT copy (label + amount), not a live reference
// to FeeStructure. That's intentional: this document is what gets printed
// and handed to the parent, and it must never change even if fees change
// later. This is literally your "pre-bill" - previousDue is the carried
// balance, currentItems is this month's charges, grandTotal is what's
// actually owed right now.
const invoiceItemSchema = new mongoose.Schema(
  {
    feeCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory' },
    label: String, // e.g. "Tuition Fee - Baishakh", "Admission Fee"
    amount: Number,
  },
  { _id: false }
);

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
    grandTotal: { type: Number, required: true }, // previousDue + currentTotal
    paidAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true },
    status: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID'],
      default: 'UNPAID',
    },
    // Never hard-delete a wrongly issued invoice - IRD audits flag missing
    // numbers in the sequence. Mark it cancelled instead and issue a fresh one.
    isCancelled: { type: Boolean, default: false },
    cancelReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
