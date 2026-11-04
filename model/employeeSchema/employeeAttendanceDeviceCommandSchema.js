const mongoose = require('mongoose');

const employeeAttendanceDeviceCommandSchema = new mongoose.Schema({
    organizationId: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, trim: true },
    commandId: { type: Number, required: true, min: 1 },
    commandType: { type: String, required: true, enum: ['USERINFO_UPDATE', 'USERINFO_DELETE'] },
    manualTest: { type: Boolean, default: false, index: true },
    commandPayload: { type: String, required: true, maxlength: 2048 },
    employeeReference: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
    employeeCode: { type: String, trim: true, default: '' },
    deviceCode: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'SUCCESS', 'FAILED', 'UNSUPPORTED'], default: 'PENDING' },
    requestedBy: { type: String, trim: true, default: '' },
    privilege: { type: Number, min: 0, max: 14 },
    createdAt: { type: Date, default: Date.now },
    sentAt: { type: Date },
    acknowledgedAt: { type: Date },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, trim: true, default: '', maxlength: 500 },
    responsePayload: { type: String, default: '', maxlength: 8000 }
}, { timestamps: true });

employeeAttendanceDeviceCommandSchema.index(
    { organizationId: 1, serialNumber: 1, commandId: 1 },
    { unique: true }
);
employeeAttendanceDeviceCommandSchema.index(
    { organizationId: 1, serialNumber: 1, status: 1, createdAt: 1 }
);
employeeAttendanceDeviceCommandSchema.index(
    { organizationId: 1, employeeReference: 1, createdAt: -1 }
);

const employeeAttendanceDeviceCommandCounterSchema = new mongoose.Schema({
    organizationId: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, trim: true },
    sequence: { type: Number, default: 0, min: 0 }
}, { timestamps: true });
employeeAttendanceDeviceCommandCounterSchema.index(
    { organizationId: 1, serialNumber: 1 },
    { unique: true }
);

const employeeAttendanceManualEnrollmentSchema = new mongoose.Schema({
    organizationId: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, trim: true },
    employeeReference: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
    employeeName: { type: String, required: true, trim: true },
    deviceCode: { type: String, required: true, trim: true },
    confirmedBy: { type: String, required: true, trim: true },
    confirmedAt: { type: Date, default: Date.now }
}, { timestamps: true });
employeeAttendanceManualEnrollmentSchema.index(
    { organizationId: 1, serialNumber: 1, employeeReference: 1, confirmedAt: -1 }
);

module.exports = {
    EmployeeAttendanceDeviceCommand: mongoose.models.EmployeeAttendanceDeviceCommand ||
        mongoose.model('EmployeeAttendanceDeviceCommand', employeeAttendanceDeviceCommandSchema, 'employeeAttendanceDeviceCommands'),
    EmployeeAttendanceDeviceCommandCounter: mongoose.models.EmployeeAttendanceDeviceCommandCounter ||
        mongoose.model('EmployeeAttendanceDeviceCommandCounter', employeeAttendanceDeviceCommandCounterSchema, 'employeeAttendanceDeviceCommandCounters'),
    EmployeeAttendanceManualEnrollment: mongoose.models.EmployeeAttendanceManualEnrollment ||
        mongoose.model('EmployeeAttendanceManualEnrollment', employeeAttendanceManualEnrollmentSchema, 'employeeAttendanceManualEnrollments')
};
