const mongoose = require('mongoose');

// Dedicated collection for migrating dues from the old software, rather
// than just typing a number into a field. Each document is a small audit
// record: WHO, WHAT amount, AS OF what date, and a note on where it came
// from - so months later you (or an auditor) can answer "how did we
// arrive at this student's starting due" without guessing.
// Importing one of these should ALSO create a matching LedgerEntry
// (type: DEBIT, referenceType: OPENING_BALANCE) - see billingService.js.
const openingBalanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    amount: { type: Number, required: true }, // positive = due, negative = advance/credit
    asOfDateAD: { type: Date, required: true },
    sourceNote: { type: String, default: 'Migrated from previous billing software' },
    enteredBy: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.OpeningBalance || mongoose.model('OpeningBalance', openingBalanceSchema);