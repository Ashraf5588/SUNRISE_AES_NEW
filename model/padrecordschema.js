const mongoose = require('mongoose');

const padRecordSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'studentRecord', required: true },
  reg: { type: String, required: false, trim: true },
  name: { type: String, required: true, trim: true },
  studentClass: { type: String, required: false, trim: true },
  section: { type: String, required: false, trim: true },
  roll: { type: String, required: false, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

padRecordSchema.pre('save', function setUpdatedAt(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.PadDistributionRecord ||
  mongoose.model('PadDistributionRecord', padRecordSchema);
