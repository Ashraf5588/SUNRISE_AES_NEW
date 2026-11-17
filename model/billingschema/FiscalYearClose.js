const mongoose = require('mongoose');

const openingBalanceSchema = new mongoose.Schema({
  ledger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const fiscalYearCloseSchema = new mongoose.Schema({
  fiscalYearBS: { type: String, required: true, unique: true },
  closingDateBS: { type: String, required: true },
  closingDateAD: { type: Date, required: true },
  closingVoucher: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', default: null },
  retainedEarningsLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
  profitOrLoss: { type: Number, required: true, default: 0 },
  openingBalances: { type: [openingBalanceSchema], default: [] },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
}, { timestamps: true });

module.exports = mongoose.models.FiscalYearClose
  || mongoose.model('FiscalYearClose', fiscalYearCloseSchema, 'fiscalYearCloses');
