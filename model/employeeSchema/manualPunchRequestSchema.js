const mongoose = require('mongoose');

const ManualPunchRequestSchema = new mongoose.Schema({
  requesterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'userlist', required: true, index: true },
  requesterUsername: { type: String, required: true, trim: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
  employeeCode: { type: String, required: true, trim: true },
  employeeName: { type: String, required: true, trim: true },
  branchName: { type: String, trim: true, default: '' },
  designation: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  punchType: { type: String, enum: ['Check-in', 'Check-out', 'Field visit'], required: true },
  punchDateBs: { type: String, required: true, trim: true },
  punchDateAd: { type: Date, required: true },
  punchTime: { type: String, required: true, trim: true },
  punchDateTime: { type: Date, required: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracyMeters: { type: Number, default: null }
  },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: String, trim: true, default: '' },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

ManualPunchRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.ManualPunchRequest
  || mongoose.model('ManualPunchRequest', ManualPunchRequestSchema, 'manualPunchRequests');