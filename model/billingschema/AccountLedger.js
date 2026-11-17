const mongoose = require('mongoose');

const LEDGER_TYPES = [
  'GENERAL',
  'CASH',
  'BANK',
  'RECEIVABLE',
  'PAYABLE',
  'FIXED_ASSET',
  'CAPITAL',
  'INCOME',
  'EXPENSE',
];

const accountLedgerSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountGroup', required: true },
  nature: { type: String, enum: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'], required: true },
  ledgerType: { type: String, enum: LEDGER_TYPES, default: 'GENERAL', required: true },
  normalBalance: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

accountLedgerSchema.index({ code: 1 }, { unique: true });
accountLedgerSchema.index({ group: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.models.AccountLedger
  || mongoose.model('AccountLedger', accountLedgerSchema, 'accountLedgers');
