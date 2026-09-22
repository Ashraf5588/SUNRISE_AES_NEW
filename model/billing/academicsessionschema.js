const mongoose = require('mongoose');

// Why this exists separately from School:
// 1. Fee amounts (see FeeStructure) are scoped to a session, so raising
//    tuition next year never rewrites what was billed this year.
// 2. Late-admission logic needs a session start date to compare against
//    a student's admissionDateAD ("joined 3 months after the session began").
const academicSessionSchema = new mongoose.Schema(
  {
    titleBS: { type: String, required: true }, // "2082"
    startDateAD: { type: Date, required: true },
    endDateAD: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.AcademicSession || mongoose.model('AcademicSession', academicSessionSchema);