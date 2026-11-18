const mongoose = require('mongoose');

const employeeAdmsUserQueryPacketSchema = new mongoose.Schema({
    packetIndex: { type: Number, min: 0 },
    packetCount: { type: Number, min: 1 },
    count: { type: Number, min: 0 },
    commandId: { type: Number },
    receivedAt: { type: Date, required: true },
    rawPayload: { type: String, required: true, maxlength: 131072 },
    parsePayload: { type: String, required: true, maxlength: 131072 }
}, { _id: false });

const employeeAdmsUserQuerySchema = new mongoose.Schema({
    _id: { type: String },
    organizationId: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, trim: true },
    commandId: { type: Number, required: true, min: 1 },
    protocol: { type: String, required: true, enum: ['legacy', 'push'] },
    status: {
        type: String,
        required: true,
        enum: ['PENDING', 'SENT', 'RECEIVING', 'COMPLETED', 'FAILED', 'TIMED_OUT'],
        default: 'PENDING'
    },
    requestedBy: { type: String, trim: true, default: '' },
    requestedAt: { type: Date, required: true, default: Date.now },
    sentAt: { type: Date },
    completedAt: { type: Date },
    lastPacketAt: { type: Date },
    failureReason: { type: String, trim: true, default: '', maxlength: 300 },
    receivedPacketCount: { type: Number, default: 0, min: 0 },
    totalPayloadBytes: { type: Number, default: 0, min: 0 },
    packets: { type: [employeeAdmsUserQueryPacketSchema], default: [] },
    expiresAt: { type: Date, required: true }
}, { timestamps: true, collection: 'employeeAdmsUserQueries' });

employeeAdmsUserQuerySchema.index(
    { organizationId: 1, serialNumber: 1 },
    { unique: true }
);
employeeAdmsUserQuerySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.EmployeeAdmsUserQuery ||
    mongoose.model('EmployeeAdmsUserQuery', employeeAdmsUserQuerySchema);
