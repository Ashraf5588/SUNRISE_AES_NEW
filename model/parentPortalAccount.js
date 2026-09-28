const mongoose = require('mongoose');

const parentPortalAccountSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, lowercase: true, unique: true },
  displayName: { type: String, trim: true, default: '' },
  passwordHash: { type: String, required: true },
  studentReg: { type: String, required: true, trim: true, unique: true },
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.ParentPortalAccount ||
  mongoose.model('ParentPortalAccount', parentPortalAccountSchema, 'parentportalaccounts');