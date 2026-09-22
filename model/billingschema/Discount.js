const mongoose = require('mongoose');

const discountEntrySchema = new mongoose.Schema({
  feehead: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory', required: true },
  discountType: { type: String, enum: ['PERCENTAGE', 'FLAT'], required: true },
  value: { type: Number, required: true },
  validFromAD: Date,
  validToAD: Date,
  reason: String,
}, { _id: true });

const discountSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
  title: [discountEntrySchema],
}, { timestamps: true });

module.exports = mongoose.models.Discount || mongoose.model('Discount', discountSchema);
