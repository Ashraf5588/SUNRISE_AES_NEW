const mongoose = require('mongoose');

const teacherRecordSchema = new mongoose.Schema(
  {
    teacherName: {
      type: String,
      required: true,
      trim: true
    },
    issues: [
      {
        dateBs: { type: String, default: '' },
        issue: { type: String, default: '' },
        halfLeave: { type: Boolean, default: false },
        fullLeave: { type: Boolean, default: false },
        lateIn: { type: Boolean, default: false },
        lateInTime: { type: String, default: '' },
        lateInReason: { type: String, default: '' },
        earlyOut: { type: Boolean, default: false },
        earlyOutTime: { type: String, default: '' },
        earlyOutReason: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
        // Temporary out fields
        temporaryOut: { type: Boolean, default: false },
        outTime: { type: String, default: '' },
        comebackTime: { type: String, default: '' },
        outReason: { type: String, default: '' },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'userlist', default: null },
        addedByName: { type: String, default: '' }
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = { teacherRecordSchema };
