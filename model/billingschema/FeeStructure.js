const mongoose = require('mongoose');

// The actual Rs amount for a given (session, class, category) combination.
// Deliberately NOT stored on Class or FeeCategory directly: if you raise
// Class 5's tuition from 2500 to 2800 next session, you add a NEW
// FeeStructure document for the new session instead of editing this one.
// Old invoices already reference their own snapshot amount (see Invoice),
// so historical bills never silently change - important if IRD asks you
// to justify what a bill said on the day it was issued.
const feeStructureSchema = new mongoose.Schema({
  academicSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true,
  },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  feeCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeCategory',
    required: true,
  },
  amount: { type: Number, required: true },
});

feeStructureSchema.index(
  { academicSession: 1, class: 1, feeCategory: 1 },
  { unique: true }
);

module.exports = mongoose.models.FeeStructure || mongoose.model('FeeStructure', feeStructureSchema);
