const mongoose = require('mongoose');

const lockerSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  studentClass: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  terminal: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true },
  fromDate: { type: String, required: true, trim: true },
  toDate: { type: String, required: true, trim: true }
}, { timestamps: true, collection: 'locker' });

lockerSchema.index({ subject: 1, studentClass: 1, section: 1, terminal: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.models.Locker || mongoose.model('Locker', lockerSchema);
