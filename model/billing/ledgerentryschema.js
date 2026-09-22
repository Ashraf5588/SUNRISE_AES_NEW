const mongoose = require('mongoose');

// This is the backbone of the whole module. Every debit (a bill charged,
// an opening balance imported) and every credit (a payment received) gets
// one immutable entry here. Never update or delete a LedgerEntry - if a
// mistake needs correcting, insert an ADJUSTMENT entry that reverses it.
//
// Why this matters: at ANY point you can independently recompute a
// student's due as SUM(DEBIT) - SUM(CREDIT), without trusting whatever
// Invoice.balanceDue currently says. That's what lets you catch bugs,
// settle parent disputes, and answer an IRD/auditor question about a
// specific transaction months later.
const ledgerEntrySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
    amount: { type: Number, required: true },
    referenceType: {
      type: String,
      enum: ['INVOICE', 'PAYMENT', 'OPENING_BALANCE', 'ADJUSTMENT'],
      required: true,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    description: String,
    runningBalance: Number, // snapshot at insert time, handy for fast history views
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ student: 1, date: 1 });

module.exports = mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerEntrySchema);