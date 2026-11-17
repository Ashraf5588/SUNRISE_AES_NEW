const mongoose = require('mongoose');

// Usually just ONE document exists in this collection.
// Why it's its own collection instead of a config file:
// PAN number, invoice prefix, and fiscal year need to be editable from
// an admin screen without redeploying code, and every printed bill/receipt
// pulls from here so IRD-required fields stay consistent everywhere.
const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: String,
    panNumber: { type: String, required: true }, // printed on every invoice for IRD
    vatRegistered: { type: Boolean, default: false },
    phone: String,
    email: String,
    logoUrl: String,
    invoicePrefix: { type: String, default: 'INV' }, // e.g. INV-2082083-000045
    receiptPrefix: { type: String, default: 'RCT' },
    currentFiscalYearBS: { type: String, required: true }, // e.g. "2082/083"
    accountsReceivableLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    defaultFeeIncomeLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    studentAdvanceLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    retainedEarningsLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    accountantApprovalThreshold: { type: Number, min: 0, default: 0 },
    closedFiscalYearsBS: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.models.School || mongoose.model('School', schoolSchema);
