const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    studentCode: { type: String, required: true, unique: true }, // reuse old software's roll/ID for traceability
    name: { type: String, required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: String,
    guardianName: String,
    guardianPhone: String,
    // Key field for late-admission logic: the billing engine compares this
    // against each month's bill date and skips months that precede it.
    admissionDateAD: { type: Date, required: true },
    academicSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'TRANSFERRED'],
      default: 'ACTIVE',
    },
    migratedFromOldSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Student || mongoose.model('Student', studentSchema);
