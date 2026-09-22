const mongoose = require('mongoose');

// Optional, but almost every real school has scholarship/sibling/staff-child
// discounts. Kept as its own collection (not a flat % on Student) because
// a discount can target one specific fee category and has a validity window.
const discountSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  feeCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory' }, // omit to apply to all categories
  type: { type: String, enum: ['PERCENTAGE', 'FLAT'], required: true },
  value: { type: Number, required: true },
  validFromAD: Date,
  validToAD: Date,
  reason: String,
});

module.exports = mongoose.models.Discount || mongoose.model('Discount', discountSchema);