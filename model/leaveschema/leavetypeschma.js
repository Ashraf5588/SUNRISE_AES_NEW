const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  leavename: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
  description: { type: String, trim: true, default: '', maxlength: 300 },
  maxDaysPerYear: { type: Number, min: 1, default: null },
  maxDaysPerMonth: { type: Number, min: 1, default: null },
  requiresDocument: { type: Boolean, default: false },
  isPaid: { type: Boolean, default: true },
  applicableTo: { type: [String], default: ['ALL'] },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const leaveApplicationSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'userlist', required: true, index: true },
  username: { type: String, required: true, trim: true },
  employeeName: { type: String, required: true, trim: true },
  employeeRole: { type: String, trim: true, default: '' },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  leaveTypeName: { type: String, required: true, trim: true },
  isPaid: { type: Boolean, required: true },
  requiresDocument: { type: Boolean, default: false },
  startDateNepali: { type: String, required: true, trim: true },
  endDateNepali: { type: String, required: true, trim: true },
  requestedDays: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  supportingDocument: { type: Buffer, default: undefined },
  supportingDocumentName: { type: String, trim: true, default: '' },
  supportingDocumentMimeType: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewReason: { type: String, trim: true, default: '', maxlength: 1000 },
  reviewedBy: { type: String, trim: true, default: '' },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

leaveApplicationSchema.index({ requester: 1, createdAt: -1 });
leaveApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = { leaveSchema, leaveApplicationSchema };