const mongoose = require('mongoose');

const employeeAttendanceDeviceSchema = new mongoose.Schema({
    serialNumber: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    lastCommunicationAt: { type: Date },
    lastSuccessfulBatchAt: { type: Date },
    latestSyncRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeAttendanceSyncRun' }
}, { timestamps: true });

const employeeAttendanceSyncRunSchema = new mongoose.Schema({
    serialNumber: { type: String, required: true, trim: true, index: true },
    deviceName: { type: String, required: true, trim: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    requestedBy: { type: String, trim: true, default: '' },
    receivedRecords: { type: Number, default: 0, min: 0 },
    savedRecords: { type: Number, default: 0, min: 0 },
    duplicateRecords: { type: Number, default: 0, min: 0 },
    failedRecords: { type: Number, default: 0, min: 0 },
    lastReceivedAt: { type: Date },
    lastErrorDetails: { type: [String], default: [] }
}, { timestamps: true });

module.exports = {
    EmployeeAttendanceDevice: mongoose.models.EmployeeAttendanceDevice ||
        mongoose.model('EmployeeAttendanceDevice', employeeAttendanceDeviceSchema, 'employeeAttendanceDevices'),
    EmployeeAttendanceSyncRun: mongoose.models.EmployeeAttendanceSyncRun ||
        mongoose.model('EmployeeAttendanceSyncRun', employeeAttendanceSyncRunSchema, 'employeeAttendanceSyncRuns')
};
