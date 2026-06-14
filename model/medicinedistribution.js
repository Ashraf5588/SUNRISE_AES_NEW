const mongoose = require('mongoose');

const medicineDistributionSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String, required: true, trim: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'studentRecord', required: true },
  reg: { type: String, required: false },
  roll: { type: String, required: false },
  name: { type: String, required: true, trim: true },
  gender: { type: String, required: false },
  studentClass: { type: String, required: false },
  section: { type: String, required: false },
  taken: { type: Boolean, default: false },
  takenAt: { type: Date, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

medicineDistributionSchema.pre('save', function setUpdatedAt(next) {
  this.updatedAt = new Date();
  next();
});

medicineDistributionSchema.index({ medicineId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.models.MedicineDistributionRecord ||
  mongoose.model('MedicineDistributionRecord', medicineDistributionSchema);