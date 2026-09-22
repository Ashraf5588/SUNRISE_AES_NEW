const mongoose = require('mongoose');

// Kept separate from Invoice because one payment often needs to be split
// across several unpaid months (parent pays 3 months at once), or only
// partially covers one invoice. `allocations` records exactly how a
// single payment was distributed - this IS your transaction history.
const allocationSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    amountApplied: Number,
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true }, // sequential, separate series from invoiceNumber
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    amount: { type: Number, required: true },
    paymentDateAD: { type: Date, required: true },
    paymentDateBS: String,
    mode: {
      type: String,
      enum: ['CASH', 'BANK', 'ESEWA', 'KHALTI', 'CHEQUE'],
      required: true,
    },
    allocations: [allocationSchema],
    collectedBy: String,
    remarks: String,
    // Same rule as Invoice: never delete a receipt. Reverse it with a
    // reason, and the ledger gets a correcting entry.
    isReversed: { type: Boolean, default: false },
    reversalReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
