const mongoose = require("mongoose");

const optionalSubStudentSchema = new mongoose.Schema({
  reg: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  roll: { type: Number, required: false },
  studentClass: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  optionalSubjects: { type: [String], required: true, default: [] },
  academicYear: { type: String, required: true, trim: true }
}, { timestamps: true });

optionalSubStudentSchema.index(
  { reg: 1, studentClass: 1, section: 1, academicYear: 1 },
  { unique: true }
);

module.exports = { optionalSubStudentSchema };
