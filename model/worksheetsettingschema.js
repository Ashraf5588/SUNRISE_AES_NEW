const mongoose = require('mongoose');

const worksheetSettingSchema = new mongoose.Schema({
  studentClass: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  terminal: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true },
  totalWorksheet: { type: Number, required: true, min: 1, max: 100 }
}, { timestamps: true });

worksheetSettingSchema.index(
  { studentClass: 1, section: 1, subject: 1, terminal: 1, academicYear: 1 },
  { unique: true }
);

module.exports = { worksheetSettingSchema };
