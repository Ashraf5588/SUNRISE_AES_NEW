const mongoose = require('mongoose');

const ACCOUNT_NATURES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

const accountGroupSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  nature: { type: String, enum: ACCOUNT_NATURES, required: true },
  parentGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountGroup', default: null },
  normalBalance: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
}, { timestamps: true });

accountGroupSchema.index({ code: 1 }, { unique: true });
accountGroupSchema.index({ normalizedName: 1, parentGroup: 1 }, { unique: true });

module.exports = mongoose.models.AccountGroup
  || mongoose.model('AccountGroup', accountGroupSchema, 'accountGroups');
