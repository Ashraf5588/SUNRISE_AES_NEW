
const employeeAttendance = require('../../model/employeeSchema/employeeattendanceSchema');
const mongoose = require('mongoose');
const bs = require('../../utils/bikramSambat');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { BlobServiceClient } = require('@azure/storage-blob');
const {
    compressEmployeeDocument,
    MAX_EMPLOYEE_DOCUMENT_UPLOAD_SIZE_BYTES
} = require('../../utils/employeeDocumentCompression');
const { staffSchema } = require('../../model/staffschema');
const { leaveApplicationSchema } = require('../../model/leaveschema/leavetypeschma');
const Event = require('../../model/eventmodel');
const { getRecentNotices } = require('../noticecontroller/noticecontroller');
const ManualPunchRequest = require('../../model/employeeSchema/manualPunchRequestSchema');
const { Branch, Department, DepartmentSection, Designation, Shift } = require('../../model/employeeSchema/employeeSetupSchema');
const EmployeeWeekend = require('../../model/employeeSchema/employeeWeekendSchema');
const { classifyPunchesByMidTime } = require('../../utils/employeePunchClassification');
const {
    getAttendanceEventKey,
    getAttendanceLogicalKey,
    getAttendanceRequestSource,
    getAttendanceSyncStatus,
    getEmployeeAttendanceCodes,
    getDeviceOnlineTimeoutMs,
    isValidDeviceSerial,
    isAttendanceDeviceOnline,
    normalizeAttendancePin,
    parseAttendanceRow
} = require('../../utils/employeeAttendanceSync');
const {
    EmployeeAttendanceDevice,
    EmployeeAttendanceSyncRun
} = require('../../model/employeeSchema/employeeAttendanceDeviceSchema');
const {
    EmployeeAttendanceDeviceCommand,
    EmployeeAttendanceDeviceCommandCounter,
    EmployeeAttendanceManualEnrollment
} = require('../../model/employeeSchema/employeeAttendanceDeviceCommandSchema');
const { getActiveEmployeeProfiles, isActiveEmployeeProfile } = require('../../utils/employeeManagementDashboard');
const {
    COMMAND_TYPES,
    buildUserInfoDeleteCommand,
    buildUserInfoUpdateCommand,
    formatAdmsCommandResponse,
    isValidAdmsPin,
    normalizeAdmsPin,
    parseDeviceCommandResult
} = require('../../utils/employeeAdmsCommands');
const {
    MANUAL_SYNC_TEST_SERIAL_NUMBER,
    getCommandAcknowledgementStatus,
    getManualTestPollFilter,
    isManualAdmsSyncTestEnabled,
    queueManualEmployeeSyncTest: queueManualEmployeeSyncTestForOrganization
} = require('../../utils/employeeAdmsManualSync');
const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');
const LeaveApplication = mongoose.models.LeaveApplication || mongoose.model('LeaveApplication', leaveApplicationSchema, 'leaveApplications');
const getOrganizationId = () => String(mongoose.connection.name || '').trim();
const isAdmsCommandQueueEnabled = () => process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED === 'true';
const getDeviceEmployeeActiveState = employee => employee?.isActive !== false && isActiveEmployeeProfile(employee);

async function allocateAdmsCommandId(organizationId, serialNumber) {
    try {
        const counter = await EmployeeAttendanceDeviceCommandCounter.findOneAndUpdate(
            { organizationId, serialNumber },
            { $inc: { sequence: 1 }, $setOnInsert: { organizationId, serialNumber } },
            { new: true, upsert: true, setDefaultsOnInsert: false }
        );
        return counter.sequence;
    } catch (error) {
        if (error.code !== 11000) throw error;
        const counter = await EmployeeAttendanceDeviceCommandCounter.findOneAndUpdate(
            { organizationId, serialNumber },
            { $inc: { sequence: 1 } },
            { new: true }
        );
        if (!counter) throw new Error('Unable to allocate an ADMS command ID.');
        return counter.sequence;
    }
}

async function queueAdmsEmployeeCommand(device, employee, command, requestedBy = '', options = {}) {
    const organizationId = getOrganizationId();
    const serialNumber = String(device.serialNumber || '').trim();
    const manualTest = options.manualTest === true;
    if (!organizationId || device.organizationId !== organizationId) {
        throw new Error('Device organization does not match the current database.');
    }
    if (manualTest && (
        serialNumber !== MANUAL_SYNC_TEST_SERIAL_NUMBER
        || command.commandType !== COMMAND_TYPES.UPDATE_USER
        || command.privilege !== 0
    )) {
        throw new Error('Manual test sync is restricted to normal-user updates on the configured test device.');
    }
    if (!manualTest && command.commandType === COMMAND_TYPES.UPDATE_USER && !device.supportsUserSyncCommands) return null;
    if (command.commandType === COMMAND_TYPES.DELETE_USER && !device.supportsUserDeletion) return null;

    const manualTestFilter = manualTest
        ? { manualTest: true }
        : { $or: [{ manualTest: false }, { manualTest: { $exists: false } }] };
    const existing = await EmployeeAttendanceDeviceCommand.findOne({
        organizationId,
        serialNumber,
        employeeReference: employee._id,
        commandType: command.commandType,
        commandPayload: command.commandPayload,
        ...manualTestFilter,
        status: { $in: ['PENDING', 'SENT'] }
    }).sort({ createdAt: -1 }).lean();
    if (existing) return existing;

    await EmployeeAttendanceDeviceCommand.updateMany({
        organizationId,
        serialNumber,
        employeeReference: employee._id,
        commandType: command.commandType,
        ...manualTestFilter,
        status: 'PENDING'
    }, {
        $set: { status: 'FAILED', lastError: 'Superseded by newer employee data.' }
    });

    const commandId = await allocateAdmsCommandId(organizationId, serialNumber);
    const created = await EmployeeAttendanceDeviceCommand.create({
        organizationId,
        serialNumber,
        commandId,
        commandType: command.commandType,
        commandPayload: command.commandPayload,
        manualTest,
        employeeReference: employee._id,
        employeeCode: String(employee.employeeCode || ''),
        deviceCode: command.deviceCode || String(employee.deviceCode || ''),
        requestedBy: String(requestedBy || '').slice(0, 120),
        privilege: command.privilege,
        status: 'PENDING'
    });
    console.info('ADMS employee command queued:', {
        organizationId,
        serialNumber,
        commandId,
        commandType: command.commandType,
        employeeReference: String(employee._id)
    });
    return created.toObject();
}

async function queueManualEmployeeSyncTest(employeeId, requestedBy = '') {
    const organizationId = getOrganizationId();
    return queueManualEmployeeSyncTestForOrganization({
        employeeId,
        requestedBy,
        isEnabled: isManualAdmsSyncTestEnabled(),
        isValidEmployeeId: mongoose.isValidObjectId,
        organizationId,
        loadEmployee: id => Staff.findById(id).lean(),
        loadDevice: (currentOrganizationId, serialNumber) => EmployeeAttendanceDevice.findOne({
            organizationId: currentOrganizationId,
            serialNumber
        }).lean(),
        queueCommand: queueAdmsEmployeeCommand
    });
}

async function queueEmployeeForConfiguredDevices(employee, requestedBy = '') {
    if (!isAdmsCommandQueueEnabled()) {
        return { queued: 0, reason: 'ADMS command queue is disabled by configuration.' };
    }
    const organizationId = getOrganizationId();
    const deviceCode = String(employee.deviceCode || '').trim();
    if (!organizationId || !deviceCode || !isValidAdmsPin(deviceCode)) {
        return { queued: 0, reason: 'A valid device PIN and organization database are required.' };
    }

    const devices = await EmployeeAttendanceDevice.find({
        organizationId,
        $or: [{ supportsUserSyncCommands: true }, { supportsUserDeletion: true }]
    }).lean();
    if (!devices.length) return { queued: 0, reason: 'No device is configured for verified user commands.' };

    const commands = [];
    if (getDeviceEmployeeActiveState(employee)) {
        const updateCommand = buildUserInfoUpdateCommand(employee);
        for (const device of devices) {
            if (!device.supportsUserSyncCommands) continue;
            if (employee.isManager && !device.supportsManagerPrivilege) {
                console.warn('Skipping manager sync because administrator privilege is not verified for device:', {
                    organizationId,
                    serialNumber: device.serialNumber,
                    employeeReference: String(employee._id)
                });
                continue;
            }
            const queued = await queueAdmsEmployeeCommand(device, employee, {
                ...updateCommand,
                deviceCode
            }, requestedBy);
            if (queued) commands.push(queued);
        }
    } else {
        const deletableDevices = devices.filter(device => device.supportsUserDeletion);
        for (const device of deletableDevices) {
            const queued = await queueAdmsEmployeeCommand(device, employee, {
                ...buildUserInfoDeleteCommand(deviceCode),
                deviceCode
            }, requestedBy);
            if (queued) commands.push(queued);
        }
    }
    return {
        queued: commands.filter(command => command.status === 'PENDING').length,
        commands,
        reason: commands.length ? '' : 'No configured device capability can perform this operation.'
    };
}

async function safelyQueueEmployeeSync(employee, requestedBy, reason) {
    if (!employee?.deviceCode) return;
    try {
        const outcome = await queueEmployeeForConfiguredDevices(employee, requestedBy);
        console.info('Employee device synchronization evaluated:', {
            employeeReference: String(employee._id),
            reason,
            queuedCount: outcome.queued,
            outcome: outcome.reason || 'queued'
        });
    } catch (error) {
        console.error('Unable to queue employee device synchronization; employee record remains saved:', {
            employeeReference: String(employee._id),
            reason,
            message: error.message
        });
    }
}
const employeeSetupConfigs = {
    branches: {
        title: 'Branch setup', singular: 'Branch', path: '/branchsetup', view: 'employee/branchsetup', Model: Branch,
        fields: [
            { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
            { name: 'parentBranchName', label: 'Parent branch name', type: 'branch' }, { name: 'branchHead', label: 'Branch head' },
            { name: 'branchAssistantHead', label: 'Branch assistant head' }, { name: 'address', label: 'Address' },
            { name: 'contactNumber', label: 'Contact number', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' }
        ],
        isInUse: async record => Boolean(await Staff.exists({ branchName: record.name }) || await Branch.exists({ parentBranchName: record.name }))
    },
    departments: {
        title: 'Department setup', singular: 'Department', path: '/departmentsetup', view: 'employee/departmentsetup', Model: Department,
        fields: [
            { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
            { name: 'nameNp', label: 'Name (Nepali)' }
        ],
        isInUse: async record => Boolean(await Staff.exists({ department: record.name }) || await DepartmentSection.exists({ department: record._id }))
    },
    sections: {
        title: 'Department section setup', singular: 'Section', path: '/sectionsetup', view: 'employee/sectionsetup', Model: DepartmentSection,
        fields: [
            { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Section name', required: true },
            { name: 'nameNp', label: 'Section name (Nepali)' }, { name: 'departmentId', label: 'Department', type: 'department', required: true }
        ],
        isInUse: record => Staff.exists({ section: record.name })
    },
    designations: {
        title: 'Designation setup', singular: 'Designation', path: '/designationsetup', view: 'employee/desgination', Model: Designation,
        fields: [
            { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
            { name: 'nameNp', label: 'Name (Nepali)' }, { name: 'designationLevel', label: 'Designation level' },
            { name: 'maxSalary', label: 'Max salary', type: 'number', min: 0 }, { name: 'minSalary', label: 'Min salary', type: 'number', min: 0 },
            { name: 'salaryBasis', label: 'Salary basis', type: 'select', options: ['Monthly', 'Daily', 'Hourly', 'Yearly'], required: true }
        ],
        isInUse: record => Staff.exists({ designation: record.name })
    },
    shifts: {
        title: 'Shift setup', singular: 'Shift', path: '/shiftsetup', view: 'employee/shiftsetup', Model: Shift,
        fields: [
            { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
            { name: 'nameNp', label: 'Name (Nepali)' }, { name: 'shiftStart', label: 'Shift start', type: 'time', required: true },
            { name: 'shiftEnd', label: 'Shift end', type: 'time', required: true }, { name: 'lunchStart', label: 'Lunch start', type: 'time' },
            { name: 'lunchEnd', label: 'Lunch end time', type: 'time' },
            { name: 'shiftType', label: 'Shift type', type: 'select', options: ['Fixed', 'Rotational', 'Flexible'], required: true }
        ],
        isInUse: record => Staff.exists({ shiftName: record.name })
    }
};
const DEFAULT_EMPLOYEE_DOCUMENTS = [
    'Citizenship',
    'PAN card',
    'National ID card',
    'Appointment letter',
    'Contract letter',
    'PF document',
    'CIT document',
    'Qualification certificate'
];
const EMPLOYEE_OFFICE_PROOF_SECTIONS = [
    { prefix: 'contract', collection: 'contracts' },
    { prefix: 'transfer', collection: 'transferHistory' },
    { prefix: 'promotion', collection: 'promotionHistory' },
    { prefix: 'resignation', collection: 'resignations' },
    { prefix: 'termination', collection: 'terminations' },
    { prefix: 'disciplinary', collection: 'disciplinaryCases' },
    { prefix: 'exitInterview', collection: 'exitInterviews' },
    { prefix: 'letter', collection: 'lettersIssued' }
];
const employeeProfileCsvHeaders = Object.keys(staffSchema.paths)
    .filter(field => !['_id', '__v', 'createdAt', 'updatedAt'].includes(field))
    .map(field => field === 'dateOfJoining' ? 'dateOfJoiningBs' : field === 'dateOfBirth' ? 'dateOfBirthBs' : field);
const employeeProfileCsvAliases = { nepaliName: 'nameNepali' };
const employeeProfileCsvRequiredHeaders = [
    'employeeCode', 'staffName', 'designation', 'department', 'dateOfJoiningBs',
    'mobileNumber', 'email', 'address', 'emergencyContactName', 'emergencyContactNumber'
];

const employeeDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_EMPLOYEE_DOCUMENT_UPLOAD_SIZE_BYTES, files: 30, fields: 1200 },
    fileFilter: (req, file, callback) => {
        const type = String(file.mimetype || '').toLowerCase();
        if (type === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
            return callback(null, true);
        }
        return callback(new Error('Upload PDF, JPG, PNG, WebP, or GIF documents only.'));
    }
});

const employeeAttendanceCsvHeaders = [
    'SN', 'Employee name', 'Code', 'Branch name', 'Department', 'Date (BS)',
    'Planned in', 'Planned out', 'Actual in', 'Actual out', 'Late in status',
    'Early out status', 'Leave type', 'Remarks'
];
const employeeAttendanceCsvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
        if (path.extname(file.originalname || '').toLowerCase() === '.csv') return callback(null, true);
        return callback(new Error('Choose a .csv attendance file.'));
    }
});
const employeeProfileCsvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
        if (path.extname(file.originalname || '').toLowerCase() === '.csv') return callback(null, true);
        return callback(new Error('Choose a .csv employee profile file.'));
    }
});
const employeeWeekendCsvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
        if (path.extname(file.originalname || '').toLowerCase() === '.csv') return callback(null, true);
        return callback(new Error('Choose a .csv weekend file.'));
}
});

exports.uploadEmployeeAttendanceCsv = (req, res, next) => employeeAttendanceCsvUpload.single('attendanceCsv')(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError
        ? 'Choose a CSV file no larger than 2 MB.'
        : error.message || 'Unable to read the attendance CSV.';
    return res.redirect(`/employeeattendance?importError=${encodeURIComponent(message)}`);
});

exports.uploadEmployeeProfileCsv = (req, res, next) => employeeProfileCsvUpload.single('employeeCsv')(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError
        ? 'Choose a CSV file no larger than 5 MB.'
        : error.message || 'Unable to read the employee CSV.';
    return res.redirect(`/employeedetail?importError=${encodeURIComponent(message)}`);
});

exports.uploadEmployeeWeekendCsv = (req, res, next) => employeeWeekendCsvUpload.single('weekendCsv')(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError
        ? 'Choose a CSV file no larger than 2 MB.'
        : error.message || 'Unable to read the weekend CSV.';
    return res.redirect(`/addweekend?importError=${encodeURIComponent(message)}`);
});

exports.uploadEmployeeDocuments = (req, res, next) => employeeDocumentUpload.any()(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError
        ? 'Upload no more than 30 employee files, each no larger than 20 MB before compression. Saved documents must be 8 MB or smaller.'
        : error.message || 'Unable to read employee documents.';
    if (req.accepts('json')) return res.status(400).json({ message });
    return res.status(400).send(message);
});

function normalizeNepaliDigits(value) {
    const nepaliDigits = '०१२३४५६७८९';
    return String(value || '').replace(/[०-९]/g, digit => String(nepaliDigits.indexOf(digit)));
}

function convertNepaliDateToAD(value) {
    const nepaliDate = normalizeNepaliDigits(value).trim();
    const match = nepaliDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    const normalizedDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

    try {
        const converted = bs.BSToAD(normalizedDate);
        const englishDate = converted instanceof Date
            ? converted
            : new Date(`${String(converted || '').trim().slice(0, 10)}T00:00:00`);
        if (Number.isNaN(englishDate.getTime())) return null;
        if (String(bs.ADToBS(englishDate) || '').trim().slice(0, 10) !== normalizedDate) return null;
        return englishDate;
    } catch (error) {
        return null;
    }
}

const getEmployeeProfiles = () => Staff.find({
    employeeCode: { $exists: true, $ne: '' }
}).sort({ staffName: 1 }).lean();

const getEmployeeSetupOptions = async () => {
    const [branches, departments, sections, designations, shifts] = await Promise.all([
        Branch.find({}).sort({ name: 1 }).lean(),
        Department.find({}).sort({ name: 1 }).lean(),
        DepartmentSection.find({}).sort({ name: 1 }).lean(),
        Designation.find({}).sort({ name: 1 }).lean(),
        Shift.find({}).sort({ name: 1 }).lean()
    ]);
    return { branches, departments, departmentSections: sections, designations, shifts };
};

const employeeIdentifierIsUsed = async (field, value, excludeEmployeeId) => {
    const storedValue = {
        $toLower: {
            $trim: {
                input: {
                    $convert: {
                        input: { $ifNull: [`$${field}`, ''] },
                        to: 'string',
                        onError: '',
                        onNull: ''
                    }
                }
            }
        }
    };
    const filter = {
        $expr: { $eq: [storedValue, String(value || '').trim().toLowerCase()] }
    };
    if (mongoose.isValidObjectId(excludeEmployeeId)) {
        filter._id = { $ne: new mongoose.Types.ObjectId(excludeEmployeeId) };
    }
    return Boolean(await Staff.collection.findOne(filter, { projection: { _id: 1 } }));
};

const findDuplicateEmployeeIdentifier = async (formData, excludeEmployeeId) => {
    for (const field of ['employeeCode', 'deviceCode']) {
        const value = String(formData[field] || '').trim();
        if (value && await employeeIdentifierIsUsed(field, value, excludeEmployeeId)) return field;
    }
    return '';
};

exports.checkEmployeeIdentifier = async (req, res) => {
    const field = String(req.query.field || '');
    const value = String(req.query.value || '').trim();
    if (!['employeeCode', 'deviceCode'].includes(field)) {
        return res.status(400).json({ error: 'Choose an employee code field.' });
    }
    if (!value) return res.json({ available: true });

    try {
        const available = !(await employeeIdentifierIsUsed(field, value, req.query.employeeId));
        return res.json({ available });
    } catch (error) {
        console.error('Unable to check employee code availability:', error);
        return res.status(500).json({ error: 'Unable to check this code right now.' });
    }
};

const findEmployeeByNormalizedValue = (field, value) => {
    const normalizedValue = String(value || '').trim().toLowerCase();
    if (!normalizedValue) return null;
    const storedValue = {
        $toLower: {
            $trim: {
                input: {
                    $convert: {
                        input: { $ifNull: [`$${field}`, ''] },
                        to: 'string',
                        onError: '',
                        onNull: ''
                    }
                }
            }
        }
    };
    return Staff.collection.findOne({
        employeeCode: { $exists: true, $nin: ['', null] },
        $expr: { $eq: [storedValue, normalizedValue] }
    });
};

const findEmployeeForUser = async user => {
    const linkedEmployee = await findEmployeeByNormalizedValue('employeeCode', user?.employeeCode);
    if (linkedEmployee) return linkedEmployee;

    const names = [...new Set([user?.teacherName, user?.username]
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean))];
    for (const name of names) {
        const employee = await findEmployeeByNormalizedValue('staffName', name);
        if (employee) return employee;
    }
    return findEmployeeByNormalizedValue('employeeCode', user?.username);
};

const getEmployeeDocumentContainer = async () => {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error('Azure document storage is not configured.');
    const containerName = process.env.AZURE_DOCUMENT_CONTAINER_NAME
        || process.env.AZURE_EMPLOYEE_DOCUMENT_CONTAINER_NAME
        || process.env.AZURE_CONTAINER_NAME
        || 'sunriseimages';
    const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    await containerClient.createIfNotExists();
    const accessPolicy = await containerClient.getAccessPolicy();
    if (accessPolicy.blobPublicAccess) {
        await containerClient.setAccessPolicy(undefined, accessPolicy.signedIdentifiers || []);
    }
    return { containerClient, containerName };
};

const getLegacyEmployeeContainerName = () => process.env.AZURE_EMPLOYEE_DOCUMENT_CONTAINER_NAME
    || process.env.AZURE_CONTAINER_NAME
    || 'sunriseimages';

const getPrivateEmployeeDocument = async (req, res) => {
    const employeeId = String(req.params.employeeId || '');
    const blobName = String(req.query.blobName || '');
    if (!mongoose.isValidObjectId(employeeId) || !blobName || blobName.length > 1024) {
        return res.status(404).send('Document not found.');
    }

    const employee = await Staff.findById(employeeId).lean();
    if (!employee) return res.status(404).send('Document not found.');

    const isAdmin = String(req.user?.role || '').toUpperCase() === 'ADMIN';
    if (!isAdmin) {
        if (String(req.user?.role || '').toUpperCase() !== 'TEACHER') {
            return res.status(403).send('You are not authorized to view this document.');
        }
        const linkedEmployee = await findEmployeeForUser(req.user);
        if (!linkedEmployee || String(linkedEmployee._id) !== String(employee._id)) {
            return res.status(403).send('You are not authorized to view this document.');
        }
    }

    const document = (employee.documents || []).find(item => item.blobName === blobName)
        || (employee.previousCompanyTds?.blobName === blobName ? employee.previousCompanyTds : null);
    if (!document) return res.status(404).send('Document not found.');

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        console.error('Azure document storage is not configured.');
        return res.status(500).send('Document storage is unavailable.');
    }

    try {
        const containerName = document.containerName || getLegacyEmployeeContainerName();
        const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
        const blobClient = serviceClient.getContainerClient(containerName).getBlobClient(document.blobName);
        const download = await blobClient.download();
        if (!download.readableStreamBody) throw new Error('Azure did not return a document stream.');

        const safeFilename = String(document.originalName || document.documentName || 'staff-document')
            .replace(/[\r\n"\\/]/g, '_')
            .replace(/[^\w.-]/g, '_');
        const contentType = getEmployeeDocumentMimeType(document);
        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${safeFilename}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        await pipeline(download.readableStreamBody, res);
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).send('Document not found.');
        console.error('Unable to download employee document:', error);
        if (res.headersSent) return res.destroy(error);
        return res.status(502).send('Unable to retrieve this document.');
    }
};

exports.showPrivateEmployeeOfficeProof = async (req, res) => {
    if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') {
        return res.status(403).send('You are not authorized to view this proof document.');
    }

    const employeeId = String(req.params.employeeId || '');
    const collection = String(req.params.collection || '');
    const blobName = String(req.query.blobName || '');
    if (!mongoose.isValidObjectId(employeeId) || !blobName || blobName.length > 1024) {
        return res.status(404).send('Proof document not found.');
    }
    const section = EMPLOYEE_OFFICE_PROOF_SECTIONS.find(item => item.collection === collection);
    if (!section) return res.status(404).send('Proof document not found.');

    try {
        const employee = await Staff.findById(employeeId).lean();
        if (!employee) return res.status(404).send('Proof document not found.');
        const proofDocument = (employee[section.collection] || [])
            .map(row => row.proofDocument)
            .find(proof => proof?.blobName === blobName);
        if (!proofDocument) return res.status(404).send('Proof document not found.');

        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            console.error('Azure document storage is not configured.');
            return res.status(500).send('Proof document storage is unavailable.');
        }
        const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
        const blobClient = serviceClient
            .getContainerClient(proofDocument.containerName || getLegacyEmployeeContainerName())
            .getBlobClient(proofDocument.blobName);
        const download = await blobClient.download();
        if (!download.readableStreamBody) throw new Error('Azure did not return a proof document stream.');

        const safeFilename = String(proofDocument.originalName || 'employee-proof')
            .replace(/[\r\n"\\/]/g, '_')
            .replace(/[^\w.-]/g, '_');
        const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
        const contentType = allowedMimeTypes.has(proofDocument.mimeType) ? proofDocument.mimeType : 'application/octet-stream';
        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${safeFilename}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        await pipeline(download.readableStreamBody, res);
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).send('Proof document not found.');
        console.error('Unable to retrieve employee office proof:', error);
        if (res.headersSent) return res.destroy(error);
        return res.status(502).send('Unable to retrieve this proof document.');
    }
};

const authorizeEmployeeDocumentMutation = async (req, res) => {
    const employeeId = String(req.params.employeeId || '');
    if (!mongoose.isValidObjectId(employeeId)) {
        res.status(404).json({ message: 'Employee profile not found.' });
        return null;
    }
    const employee = await Staff.findById(employeeId).lean();
    if (!employee) {
        res.status(404).json({ message: 'Employee profile not found.' });
        return null;
    }
    if (String(req.user?.role || '').toUpperCase() === 'ADMIN') return employee;
    if (String(req.user?.role || '').toUpperCase() !== 'TEACHER') {
        res.status(403).json({ message: 'You are not authorized to change this profile.' });
        return null;
    }
    const linkedEmployee = await findEmployeeForUser(req.user);
    if (!linkedEmployee || String(linkedEmployee._id) !== String(employee._id)) {
        res.status(403).json({ message: 'You are not authorized to change this profile.' });
        return null;
    }
    return employee;
};

const uploadReplacementEmployeeDocument = async (file, employee, documentName) => {
    const { containerClient, containerName } = await getEmployeeDocumentContainer();
    const compressed = await compressEmployeeDocument(file);
    const safeExtension = /^\.(pdf|jpe?g|png|webp|gif)$/.test(compressed.extension) ? compressed.extension : '';
    const blobName = `employee-documents/${employee.employeeCode}/${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.uploadData(compressed.buffer, { blobHTTPHeaders: { blobContentType: compressed.mimeType } });
    return {
        documentName,
        url: blobClient.url,
        blobName,
        containerName,
        originalName: getText(file.originalname, 180),
        mimeType: compressed.mimeType,
        fileSizeBytes: compressed.fileSizeBytes,
        originalSizeBytes: compressed.originalSizeBytes,
        uploadedAt: new Date()
    };
};

exports.updateEmployeeDocument = async (req, res) => {
    let uploadedDocument = null;
    try {
        const employee = await authorizeEmployeeDocumentMutation(req, res);
        if (!employee) return;
        const currentBlobName = String(req.body.blobName || '');
        const documentName = getText(req.body.documentName, 120);
        if (!currentBlobName || !documentName) return res.status(400).json({ message: 'A document name is required.' });
        const existingDocument = (employee.documents || []).find(document => document.blobName === currentBlobName);
        if (!existingDocument) return res.status(404).json({ message: 'Document not found.' });

        const replacementFile = (req.files || []).find(file => file.fieldname === 'replacementFile');
        if (replacementFile) {
            uploadedDocument = await uploadReplacementEmployeeDocument(replacementFile, employee, documentName);
            const result = await Staff.updateOne(
                { _id: employee._id, 'documents.blobName': currentBlobName },
                { $set: { 'documents.$': uploadedDocument } },
                { runValidators: true }
            );
            if (!result.matchedCount) {
                await deleteUploadedDocuments([uploadedDocument]);
                return res.status(409).json({ message: 'This document changed. Refresh the page and try again.' });
            }
            await deleteUploadedDocuments([existingDocument]);
        } else {
            const result = await Staff.updateOne(
                { _id: employee._id, 'documents.blobName': currentBlobName },
                { $set: { 'documents.$.documentName': documentName } },
                { runValidators: true }
            );
            if (!result.matchedCount) return res.status(409).json({ message: 'This document changed. Refresh the page and try again.' });
        }
        return res.json({ message: 'Document saved.' });
    } catch (error) {
        if (uploadedDocument) await deleteUploadedDocuments([uploadedDocument]);
        console.error('Unable to update employee document:', error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode === 400 ? error.message : 'Unable to update this document.'
        });
    }
};

exports.deleteEmployeeDocument = async (req, res) => {
    try {
        const employee = await authorizeEmployeeDocumentMutation(req, res);
        if (!employee) return;
        const blobName = String(req.body.blobName || '');
        const document = (employee.documents || []).find(item => item.blobName === blobName);
        if (!document) return res.status(404).json({ message: 'Document not found.' });
        const result = await Staff.updateOne(
            { _id: employee._id, 'documents.blobName': blobName },
            { $pull: { documents: { blobName } } }
        );
        if (!result.matchedCount) return res.status(409).json({ message: 'This document changed. Refresh the page and try again.' });
        await deleteUploadedDocuments([document]);
        return res.json({ message: 'Document deleted.' });
    } catch (error) {
        console.error('Unable to delete employee document:', error);
        return res.status(500).json({ message: 'Unable to delete this document.' });
    }
};

exports.deleteEmployeePhoto = async (req, res) => {
    try {
        const employee = await authorizeEmployeeDocumentMutation(req, res);
        if (!employee) return;
        const photo = employee.employeePhoto;
        if (!photo?.blobName) return res.status(404).json({ message: 'Profile photo not found.' });
        const result = await Staff.updateOne(
            { _id: employee._id, 'employeePhoto.blobName': photo.blobName },
            { $unset: { employeePhoto: 1 } }
        );
        if (!result.matchedCount) return res.status(409).json({ message: 'The profile photo changed. Refresh the page and try again.' });
        await deleteUploadedDocuments([photo]);
        return res.json({ message: 'Profile photo deleted.' });
    } catch (error) {
        console.error('Unable to delete employee photo:', error);
        return res.status(500).json({ message: 'Unable to delete the profile photo.' });
    }
};

const getEmployeeMidTime = employee => {
    if (getMinutes(employee?.midTime) !== null) return employee.midTime;
    const plannedIn = getMinutes(employee?.plannedIn || '09:00');
    const plannedOut = getMinutes(employee?.plannedOut || '17:00');
    const midpoint = plannedIn !== null && plannedOut !== null
        ? Math.floor((plannedIn + plannedOut) / 2)
        : 13 * 60;
    return `${String(Math.floor(midpoint / 60)).padStart(2, '0')}:${String(midpoint % 60).padStart(2, '0')}`;
};

const renderManualPunchPage = async (req, res, options = {}) => {
    const isAdminUser = req.user?.role === 'ADMIN';
    const employee = await findEmployeeForUser(req.user);
    const employees = isAdminUser ? await getEmployeeProfiles() : [];
    const requestFilter = isAdminUser ? {} : { requesterUserId: req.user._id };
    const requests = await ManualPunchRequest.find(requestFilter).sort({ createdAt: -1 }).lean();
    const todayBs = getNepaliDate(new Date()).slice(0, 10);
    return res.status(options.status || 200).render('employee/manualpunch', {
        employee,
        employees,
        requests,
        isAdmin: isAdminUser,
        currentPage: 'manual-punch',
        selectedEmployee: null,
        todayBs,
        formValues: options.formValues || {},
        error: options.error || '',
        message: req.query.requested ? 'Your manual punch request was submitted.'
            : req.query.reviewed ? `Request ${req.query.reviewed}.`
                : req.query.error ? 'Unable to complete that action.' : ''
    });
};

const toEmployeeFormData = employee => {
    if (!employee) return {};
    return {
        ...employee,
        dateOfJoiningBs: employee.dateOfJoining ? String(bs.ADToBS(new Date(employee.dateOfJoining)) || '').slice(0, 10) : '',
        dateOfBirthBs: employee.dateOfBirth ? String(bs.ADToBS(new Date(employee.dateOfBirth)) || '').slice(0, 10) : ''
    };
};

const getEmployeeDocumentUrl = (employeeId, blobName) =>
    `/employee-document/${employeeId}?blobName=${encodeURIComponent(blobName)}`;

const getEmployeeDocumentMimeType = document => {
    const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    const mimeType = String(document?.mimeType || '').toLowerCase().trim();
    if (allowedMimeTypes.has(mimeType)) return mimeType;

    const extension = path.extname(String(document?.originalName || document?.blobName || '')).toLowerCase();
    return ({
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    })[extension] || 'application/octet-stream';
};

const getEmployeeOfficeProofUrl = (employeeId, collection, blobName) =>
    `/employee-office-proof/${employeeId}/${collection}?blobName=${encodeURIComponent(blobName)}`;

const attachEmployeeOfficeProofUrls = (formData, employee) => {
    EMPLOYEE_OFFICE_PROOF_SECTIONS.forEach(({ collection }) => {
        const rows = formData[collection] || [];
        const storedRows = employee?.[collection] || [];
        formData[collection] = rows.map(row => {
            const requestedBlobName = getText(row.proofBlobName || row.proofDocument?.blobName, 1024);
            const storedRow = storedRows.find(item => item.proofDocument?.blobName === requestedBlobName);
            const proofDocument = storedRow?.proofDocument || null;
            const { proofBlobName, proofFileSelected, formIndex, ...safeRow } = row;
            return {
                ...safeRow,
                proofDocument: proofDocument ? {
                    ...proofDocument,
                    url: getEmployeeOfficeProofUrl(employee._id, collection, proofDocument.blobName)
                } : null,
                proofBlobName: proofDocument?.blobName || ''
            };
        });
    });
};

const renderEmployeeDetails = async (res, options = {}) => {
    const [employees, setupOptions] = await Promise.all([getEmployeeProfiles(), getEmployeeSetupOptions()]);
    const selectedEmployeeRecord = options.employee
        || employees.find(employee => String(employee._id) === String(options.employeeId || ''))
        || (options.newEmployee ? null : employees[0])
        || null;
    const selectedEmployee = selectedEmployeeRecord && {
        ...selectedEmployeeRecord,
        documents: (selectedEmployeeRecord.documents || []).map(document => ({
            ...document,
            previewMimeType: getEmployeeDocumentMimeType(document),
            url: getEmployeeDocumentUrl(selectedEmployeeRecord._id, document.blobName)
        }))
    };
    const formData = options.formData || toEmployeeFormData(selectedEmployeeRecord);
    attachEmployeeOfficeProofUrls(formData, selectedEmployeeRecord);
    if (selectedEmployeeRecord && formData.previousCompanyTds?.blobName) {
        formData.previousCompanyTds.url = getEmployeeDocumentUrl(selectedEmployeeRecord._id, formData.previousCompanyTds.blobName);
    }
    return res.status(options.status || 200).render('employee/employeeworkspace', {
        employees,
        ...setupOptions,
        selectedEmployee,
        activeModule: options.activeModule || 'profile',
        defaultDocuments: DEFAULT_EMPLOYEE_DOCUMENTS,
        error: options.error || '',
        saved: options.saved || false,
        importResult: options.importResult || null,
        formData
    });
};

exports.showPrivateEmployeeDocument = async (req, res) => {
    try {
        return await getPrivateEmployeeDocument(req, res);
    } catch (error) {
        console.error('Unable to authorize or load employee document:', error);
        if (res.headersSent) return res.destroy(error);
        return res.status(500).send('Unable to retrieve this document.');
    }
};

exports.showEmployeeDetails = async (req, res) => {
    try {
        return await renderEmployeeDetails(res, {
            employeeId: req.query.employeeId,
            newEmployee: req.query.new === '1',
            activeModule: req.query.module || 'profile',
            saved: req.query.saved === '1',
            error: String(req.query.importError || '')
        });
    } catch (error) {
        console.error('Unable to load employee details:', error);
        return res.status(500).send('Unable to load employee details.');
    }
};

exports.showEmployeeManagementDashboard = async (req, res) => {
    try {
        const employees = await Staff.find({ staffName: { $exists: true, $ne: '' } }).lean();
        const activeEmployees = getActiveEmployeeProfiles(employees);
        const today = new Date();
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayNepali = getNepaliDate(todayStart).slice(0, 10);
        const selectedDate = parseNepaliDateKey(req.query.dateBs || todayNepali) || new Date(todayStart);
        selectedDate.setHours(0, 0, 0, 0);
        const selectedDateBs = getNepaliDate(selectedDate).slice(0, 10);
        const nextDate = new Date(selectedDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const selectedDateNepali = getNepaliDate(selectedDate).slice(0, 10);
        const weekStart = new Date(selectedDate);
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const [punches, approvedLeaves, notices, events, manualPunchRequestCount] = await Promise.all([
            employeeAttendance.find({ punchTime: { $gte: selectedDate, $lt: nextDate } }).select('pin name punchTime').sort({ punchTime: 1 }).lean(),
            LeaveApplication.find({
                status: 'approved',
                startDateNepali: { $lte: selectedDateNepali },
                endDateNepali: { $gte: selectedDateNepali }
            }).select('employeeName leaveTypeName startDateNepali endDateNepali').lean(),
            getRecentNotices(req.user, 5),
            Event.find({ date: { $gte: selectedDate, $lt: weekEnd }, status: { $nin: ['cancelled', 'completed'] } })
                .sort({ date: 1 }).limit(6).lean(),
            ManualPunchRequest.countDocuments({ status: 'pending' })
        ]);

        const punchesByCode = new Map();
        const punchesByName = new Map();
        punches.forEach(punch => {
            const code = String(punch.pin || '').trim().toUpperCase();
            if (!punchesByCode.has(code)) punchesByCode.set(code, []);
            punchesByCode.get(code).push(punch);
            const name = normalizeEmployeeName(punch.name);
            if (name) {
                if (!punchesByName.has(name)) punchesByName.set(name, []);
                punchesByName.get(name).push(punch);
            }
        });
        const leavesByName = new Map(approvedLeaves.map(leave => [normalizeEmployeeName(leave.employeeName), leave]));
        const attendanceLists = { present: [], onLeave: [], absent: [], late: [] };

        activeEmployees.forEach(employee => {
            const attendanceCodes = getEmployeeAttendanceCodes(employee);
            const employeeName = normalizeEmployeeName(employee.staffName);
            const employeePunches = [...new Map(attendanceCodes
                .flatMap(code => punchesByCode.get(code) || [])
                .map(punch => [String(punch._id || `${punch.pin}|${punch.punchTime}`), punch])).values()];
            if (!employeePunches.length && employeeName) employeePunches.push(...(punchesByName.get(employeeName) || []));
            const leave = leavesByName.get(employeeName);
            const contact = employee.mobileNumber || employee.officeContact || '-';
            const employeeSummary = {
                name: employee.staffName,
                code: employee.employeeCode || '-',
                department: employee.department || employee.designation || 'Employee',
                contact
            };

            if (!employeePunches.length) {
                if (leave) attendanceLists.onLeave.push({ ...employeeSummary, leaveType: leave.leaveTypeName, through: leave.endDateNepali });
                else attendanceLists.absent.push(employeeSummary);
                return;
            }

            attendanceLists.present.push(employeeSummary);
            const { checkIn } = classifyPunchesByMidTime(employeePunches, getEmployeeMidTime(employee));
            if (!checkIn) return;

            const actualIn = checkIn.punchTime;
            const actualMinutes = getMinutes(formatPunchTime(new Date(actualIn)));
            const plannedMinutes = getMinutes(employee.plannedIn || '09:00');
            if (actualMinutes !== null && plannedMinutes !== null && actualMinutes > plannedMinutes) {
                attendanceLists.late.push({
                    ...employeeSummary,
                    actualIn: formatPunchTime(new Date(actualIn)),
                    plannedIn: employee.plannedIn || '09:00',
                    lateMinutes: actualMinutes - plannedMinutes
                });
            }
        });

        const birthdays = activeEmployees.filter(employee => {
            if (!employee.dateOfBirth) return false;
            const dateOfBirth = new Date(employee.dateOfBirth);
            return dateOfBirth.getMonth() === selectedDate.getMonth() && dateOfBirth.getDate() === selectedDate.getDate();
        }).map(employee => ({
            name: employee.staffName,
            dateOfBirth: new Date(employee.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            contact: employee.mobileNumber || employee.officeContact || '-'
        }));

        return res.render('employee/employeemanagementdashboard', {
            totalEmployees: activeEmployees.length,
            attendanceLists,
            manualPunchRequestCount,
            birthdays,
            notices,
            events,
            selectedDateBs,
            dashboardDate: selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
            currentPage: 'dashboard',
            selectedEmployee: null
        });
    } catch (error) {
        console.error('Unable to load employee dashboard:', error);
        return res.status(500).send('Unable to load employee dashboard.');
    }
};

exports.showManualPunchPage = async (req, res) => {
    try {
        return await renderManualPunchPage(req, res);
    } catch (error) {
        console.error('Unable to load manual punch requests:', error);
        return res.status(500).send('Unable to load manual punch requests.');
    }
};

exports.createManualPunchRequest = async (req, res) => {
    const formValues = {
        punchType: String(req.body.punchType || ''),
        punchDateBs: String(req.body.punchDateBs || '').trim(),
        punchTime: String(req.body.punchTime || '').trim(),
        latitude: String(req.body.latitude || '').trim(),
        longitude: String(req.body.longitude || '').trim(),
        employeeId: String(req.body.employeeId || '').trim()
    };

    try {
        const employee = req.user?.role === 'ADMIN'
            ? mongoose.isValidObjectId(formValues.employeeId)
                ? await Staff.findOne({ _id: formValues.employeeId, employeeCode: { $exists: true, $ne: '' } }).lean()
                : null
            : await findEmployeeForUser(req.user);
        if (!employee) {
            return await renderManualPunchPage(req, res, {
                status: req.user?.role === 'ADMIN' ? 400 : 403,
                error: req.user?.role === 'ADMIN'
                    ? 'Select an employee profile for this request.'
                    : 'Your login is not linked to an employee profile. Contact an administrator.',
                formValues
            });
        }

        const punchDateBs = normalizeNepaliDigits(formValues.punchDateBs);
        const punchDateAd = parseNepaliDateKey(punchDateBs);
        const timeMatch = formValues.punchTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        const latitude = Number(formValues.latitude);
        const longitude = Number(formValues.longitude);
        const accuracyMeters = Number(req.body.accuracyMeters);
        const allowedPunchTypes = ['Check-in', 'Check-out', 'Field visit'];

        if (!allowedPunchTypes.includes(formValues.punchType)) {
            return await renderManualPunchPage(req, res, { status: 400, error: 'Select a valid punch type.', formValues });
        }
        if (!punchDateAd) {
            return await renderManualPunchPage(req, res, { status: 400, error: 'Select a valid Bikram Sambat date.', formValues });
        }
        if (!timeMatch) {
            return await renderManualPunchPage(req, res, { status: 400, error: 'Enter a valid punch time.', formValues });
        }
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
            || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return await renderManualPunchPage(req, res, { status: 400, error: 'Pin your current location before submitting.', formValues });
        }

        const punchDateTime = new Date(punchDateAd);
        punchDateTime.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
        const request = await ManualPunchRequest.create({
            requesterUserId: req.user._id,
            requesterUsername: String(req.user.username || req.user.teacherName || '').trim(),
            employeeId: employee._id,
            employeeCode: employee.employeeCode,
            employeeName: employee.staffName,
            branchName: employee.branchName || '',
            designation: employee.designation || '',
            department: employee.department || '',
            punchType: formValues.punchType,
            punchDateBs: punchDateBs.slice(0, 10),
            punchDateAd,
            punchTime: formValues.punchTime,
            punchDateTime,
            location: {
                latitude,
                longitude,
                accuracyMeters: Number.isFinite(accuracyMeters) && accuracyMeters > 0 ? accuracyMeters : null
            }
        });

        return res.redirect('/manualpunch?requested=1');
    } catch (error) {
        console.error('Unable to submit manual punch request:', error);
        return res.status(500).send('Unable to submit manual punch request.');
    }
};

exports.reviewManualPunchRequest = async (req, res) => {
    const decision = String(req.body.decision || '').toLowerCase();
    if (!['approved', 'rejected'].includes(decision) || !mongoose.isValidObjectId(req.params.id)) {
        return res.redirect('/manualpunch?error=review');
    }

    try {
        const reviewedBy = String(req.user.username || req.user.teacherName || 'Administrator').trim();
        const request = await ManualPunchRequest.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            { $set: { status: decision, reviewedBy, reviewedAt: new Date() } },
            { new: true }
        );
        if (!request) return res.redirect('/manualpunch?error=review');

        if (decision === 'approved') {
            try {
                const holidayDateBs = getNepaliDate(new Date(request.punchDateTime)).slice(0, 10);
                const employeeHoliday = await EmployeeWeekend.findOne({ dateBs: holidayDateBs }).select('name').lean();
                await employeeAttendance.create({
                    sn: 'MANUAL',
                    pin: request.employeeCode,
                    name: request.employeeName,
                    punchTime: request.punchDateTime,
                    source: 'Manual',
                    isHoliday: Boolean(employeeHoliday),
                    holidayName: employeeHoliday?.name || '',
                    manualPunchType: request.punchType,
                    manualPunchRequestId: request._id,
                    status: request.punchType === 'Check-in' ? 0 : request.punchType === 'Check-out' ? 1 : undefined,
                    verifyMode: 0
                });
            } catch (error) {
                await ManualPunchRequest.updateOne(
                    { _id: request._id, status: 'approved' },
                    { $set: { status: 'pending', reviewedBy: '', reviewedAt: null } }
                );
                throw error;
            }
        }

        return res.redirect(`/manualpunch?reviewed=${decision}`);
    } catch (error) {
        console.error('Unable to review manual punch request:', error);
        return res.redirect('/manualpunch?error=review');
    }
};

exports.showEmployeeData = async (req, res) => {
    try {
        const organizationId = getOrganizationId();
        const [employees, devices, commands, enrollments] = await Promise.all([
            getEmployeeProfiles(),
            EmployeeAttendanceDevice.find({})
                .select('organizationId serialNumber name model firmwareVersion supportsUserSyncCommands supportsUserDeletion supportsManagerPrivilege lastActivity')
                .sort({ lastActivity: -1, name: 1 })
                .lean(),
            EmployeeAttendanceDeviceCommand.find({ organizationId })
                .sort({ createdAt: -1 })
                .limit(500)
                .select('employeeReference status createdAt manualTest _id')
                .lean(),
            EmployeeAttendanceManualEnrollment.find({ organizationId })
                .sort({ confirmedAt: -1 })
                .select('employeeReference serialNumber confirmedAt')
                .lean()
        ]);
        const syncStatusByEmployee = new Map();
        for (const command of commands) {
            const employeeId = String(command.employeeReference);
            if (syncStatusByEmployee.has(employeeId)) continue;
            syncStatusByEmployee.set(employeeId, {
                _id: String(command._id),
                status: command.status,
                createdAt: command.createdAt,
                manualTest: command.manualTest === true
            });
        }
        const manualEnrollmentByEmployee = new Map();
        for (const enrollment of enrollments) {
            const employeeId = String(enrollment.employeeReference);
            if (!manualEnrollmentByEmployee.has(employeeId)) {
                manualEnrollmentByEmployee.set(employeeId, enrollment);
            }
        }
        const now = new Date();
        const onlineTimeout = getDeviceOnlineTimeoutMs();
        const deviceStatuses = devices.map(device => ({
            ...device,
            isOnline: isAttendanceDeviceOnline(device.lastActivity, now, onlineTimeout)
        }));
        return res.render('employee/employeedata', {
            employees,
            devices: deviceStatuses,
            syncStatusByEmployee: Object.fromEntries(syncStatusByEmployee),
            manualEnrollmentByEmployee: Object.fromEntries(manualEnrollmentByEmployee),
            commandQueueEnabled: isAdmsCommandQueueEnabled(),
            manualSyncTestEnabled: isManualAdmsSyncTestEnabled(),
            manualSyncTestDeviceAvailable: deviceStatuses.some(device =>
                device.organizationId === organizationId && device.serialNumber === MANUAL_SYNC_TEST_SERIAL_NUMBER
            ),
            manualSyncTestEligibleEmployeeIds: employees
                .filter(employee => getDeviceEmployeeActiveState(employee) && isValidAdmsPin(employee.deviceCode))
                .map(employee => String(employee._id)),
            currentPage: 'employee-list',
            selectedEmployee: null
        });
    } catch (error) {
        console.error('Unable to load employee list:', error);
        return res.status(500).send('Unable to load employee list.');
    }
};

exports.showStaffContacts = async (req, res) => {
    try {
        const employees = (await getEmployeeProfiles()).map(employee => ({
            name: employee.staffName || '',
            designation: employee.designation || '',
            email: employee.officeEmail || employee.email || '',
            phone: employee.officeContact || employee.mobileNumber || '',
            photoUrl: employee.employeePhoto?.url || ''
        }));
        return res.render('employee/staffcontacts', { employees });
    } catch (error) {
        console.error('Unable to load staff contacts:', error);
        return res.status(500).send('Unable to load staff contacts.');
    }
};

exports.showEmployeeAttendanceSetup = async (req, res) => {
    try {
        const employees = (await getEmployeeProfiles()).map(employee => ({
            ...employee,
            midTime: getEmployeeMidTime(employee)
        }));
        return res.render('employee/employeeattendancesetup', {
            employees,
            currentPage: 'attendance-setup',
            selectedEmployee: null,
            error: '',
            saved: req.query.saved === '1'
        });
    } catch (error) {
        console.error('Unable to load employee attendance setup:', error);
        return res.status(500).send('Unable to load employee attendance setup.');
    }
};

exports.saveEmployeeAttendanceSetup = async (req, res) => {
    try {
        const profiles = await getEmployeeProfiles();
        const employees = profiles.map(employee => ({
            ...employee,
            plannedIn: String(req.body[`plannedIn_${employee._id}`] || '').trim(),
            plannedOut: String(req.body[`plannedOut_${employee._id}`] || '').trim(),
            midTime: String(req.body[`midTime_${employee._id}`] || '').trim()
        }));
        const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

        if (employees.some(employee => !validTime(employee.plannedIn) || !validTime(employee.plannedOut) || !validTime(employee.midTime))) {
            return res.status(400).render('employee/employeeattendancesetup', {
                employees,
                currentPage: 'attendance-setup',
                selectedEmployee: null,
                error: 'Enter valid planned in, planned out, and mid-time values for every employee.',
                saved: false
            });
        }

        await Promise.all(employees.map(employee => Staff.updateOne(
            { _id: employee._id },
            { $set: { plannedIn: employee.plannedIn, plannedOut: employee.plannedOut, midTime: employee.midTime } }
        )));
        return res.redirect('/employeeattendancesetup?saved=1');
    } catch (error) {
        console.error('Unable to save employee attendance setup:', error);
        return res.status(500).send('Unable to save employee attendance setup.');
    }
};

const renderEmployeeSetupPage = async (type, req, res, options = {}) => {
    const config = employeeSetupConfigs[type];
    const [records, departments, branches] = await Promise.all([
        config.Model.find({}).sort({ name: 1 }).lean(),
        type === 'sections' ? Department.find({}).sort({ name: 1 }).lean() : Promise.resolve([]),
        Branch.find({}).sort({ name: 1 }).lean()
    ]);
    let record = options.record || null;
    if (!record && req.query.edit && mongoose.isValidObjectId(req.query.edit)) {
        record = await config.Model.findById(req.query.edit).lean();
        if (record && type === 'sections') record.departmentId = String(record.department || '');
    }
    return res.status(options.status || 200).render(config.view, {
        config,
        records,
        departments,
        branches,
        record,
        currentPage: `setup-${type}`,
        selectedEmployee: null,
        error: options.error || '',
        message: req.query.saved ? `${config.singular} saved.` : req.query.deleted ? `${config.singular} deleted.` : '',
        isEditing: Boolean(record)
    });
};

const saveEmployeeSetupRecord = async (type, req, res) => {
    const config = employeeSetupConfigs[type];
    const recordId = String(req.body.recordId || '').trim();
    const isEditing = Boolean(recordId);
    try {
        if (req.body.action === 'delete') {
            if (!mongoose.isValidObjectId(recordId)) return res.redirect(`${config.path}?error=invalid`);
            const record = await config.Model.findById(recordId).lean();
            if (!record) return res.redirect(`${config.path}?error=missing`);
            if (await config.isInUse(record)) {
                return renderEmployeeSetupPage(type, req, res, {
                    status: 409,
                    error: `Cannot delete ${config.singular.toLowerCase()} while employee profiles or setup records use it.`
                });
            }
            await config.Model.deleteOne({ _id: recordId });
            return res.redirect(`${config.path}?deleted=1`);
        }

        if (isEditing && !mongoose.isValidObjectId(recordId)) {
            return res.status(400).send('Invalid setup record.');
        }
        const record = {};
        for (const field of config.fields) {
            if (field.type === 'department') continue;
            const value = String(req.body[field.name] || '').trim();
            record[field.name] = field.type === 'number'
                ? (value ? Number(value) : null)
                : field.name === 'code' ? value.toUpperCase() : value;
        }
        const missingField = config.fields.find(field => field.required && !(field.name === 'departmentId' ? req.body.departmentId : record[field.name] !== null && record[field.name] !== undefined && record[field.name] !== ''));
        if (missingField) {
            return renderEmployeeSetupPage(type, req, res, {
                status: 400,
                record: { ...record, departmentId: String(req.body.departmentId || '') },
                error: `Enter ${missingField.label.toLowerCase()}.`
            });
        }
        const invalidNumberField = config.fields.find(field => field.type === 'number'
            && (Number.isNaN(record[field.name]) || (record[field.name] !== null && record[field.name] < (field.min ?? 0))));
        if (invalidNumberField) {
            return renderEmployeeSetupPage(type, req, res, {
                status: 400,
                record: { ...record, departmentId: String(req.body.departmentId || '') },
                error: `Enter a valid number for ${invalidNumberField.label.toLowerCase()}.`
            });
        }
        if (type === 'sections') {
            const department = await Department.findById(req.body.departmentId).lean();
            if (!department) {
                return renderEmployeeSetupPage(type, req, res, {
                    status: 400,
                    record: { ...record, departmentId: String(req.body.departmentId || '') },
                    error: 'Select a valid department.'
                });
            }
            record.department = department._id;
            record.departmentName = department.name;
        }
        if (type === 'shifts') {
            const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
            if (!validTime(record.shiftStart) || !validTime(record.shiftEnd)
                || (record.lunchStart && !validTime(record.lunchStart))
                || (record.lunchEnd && !validTime(record.lunchEnd))) {
                return renderEmployeeSetupPage(type, req, res, { status: 400, record, error: 'Enter valid shift and lunch times.' });
            }
        }
        if (type === 'designations' && record.minSalary !== null && record.maxSalary !== null && record.minSalary > record.maxSalary) {
            return renderEmployeeSetupPage(type, req, res, { status: 400, record, error: 'Minimum salary cannot exceed maximum salary.' });
        }

        const escapedCode = record.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const duplicateFilter = { code: { $regex: `^${escapedCode}$`, $options: 'i' } };
        if (isEditing) duplicateFilter._id = { $ne: new mongoose.Types.ObjectId(recordId) };
        if (await config.Model.exists(duplicateFilter)) {
            return renderEmployeeSetupPage(type, req, res, {
                status: 409,
                record: { ...record, departmentId: String(req.body.departmentId || '') },
                error: `Code ${record.code} is already in use.`
            });
        }

        if (isEditing) {
            const previous = await config.Model.findById(recordId).lean();
            if (!previous) return res.status(404).send(`${config.singular} not found.`);
            await config.Model.updateOne({ _id: recordId }, { $set: record }, { runValidators: true });
            if (previous.name !== record.name) {
                if (type === 'branches') {
                    await Promise.all([
                        Staff.updateMany({ branchName: previous.name }, { $set: { branchName: record.name } }),
                        Branch.updateMany({ parentBranchName: previous.name }, { $set: { parentBranchName: record.name } })
                    ]);
                } else if (type === 'departments') {
                    await Promise.all([
                        Staff.updateMany({ department: previous.name }, { $set: { department: record.name } }),
                        DepartmentSection.updateMany({ department: previous._id }, { $set: { departmentName: record.name } })
                    ]);
                } else if (type === 'sections') {
                    await Staff.updateMany({ section: previous.name }, { $set: { section: record.name } });
                } else if (type === 'designations') {
                    await Staff.updateMany({ designation: previous.name }, { $set: { designation: record.name } });
                } else if (type === 'shifts') {
                    await Staff.updateMany({ shiftName: previous.name }, { $set: { shiftName: record.name } });
                }
            }
        } else await config.Model.create(record);
        return res.redirect(`${config.path}?saved=1`);
    } catch (error) {
        console.error(`Unable to save ${config.singular.toLowerCase()} setup:`, error);
        return res.status(500).send(`Unable to save ${config.singular.toLowerCase()} setup.`);
    }
};

const registerEmployeeSetupHandlers = (type, prefix) => {
    exports[`show${prefix}Setup`] = (req, res) => renderEmployeeSetupPage(type, req, res).catch(error => {
        console.error(`Unable to load ${employeeSetupConfigs[type].singular.toLowerCase()} setup:`, error);
        return res.status(500).send(`Unable to load ${employeeSetupConfigs[type].singular.toLowerCase()} setup.`);
    });
    exports[`save${prefix}Setup`] = (req, res) => saveEmployeeSetupRecord(type, req, res);
};

registerEmployeeSetupHandlers('branches', 'Branch');
registerEmployeeSetupHandlers('departments', 'Department');
registerEmployeeSetupHandlers('sections', 'Section');
registerEmployeeSetupHandlers('designations', 'Designation');
registerEmployeeSetupHandlers('shifts', 'Shift');

const getKathmanduCalendarDate = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kathmandu',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const getDefaultEmployeeWeekendDate = () => {
    const [year, month, day] = getKathmanduCalendarDate().split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7));
    const saturdayAd = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return String(bs.ADToBS(saturdayAd) || '').slice(0, 10);
};

const renderEmployeeWeekendPage = async (req, res, options = {}) => {
    const [records, editedRecord] = await Promise.all([
        EmployeeWeekend.find({}).sort({ dateBs: -1 }).lean(),
        req.query.edit && mongoose.isValidObjectId(req.query.edit)
            ? EmployeeWeekend.findById(req.query.edit).lean()
            : Promise.resolve(null)
    ]);
    const record = options.record || editedRecord || {
        dateBs: getDefaultEmployeeWeekendDate(),
        name: 'Saturday'
    };
    return res.status(options.status || 200).render('employee/addweekend', {
        records,
        record,
        todayBs: String(bs.ADToBS(getKathmanduCalendarDate()) || '').slice(0, 10),
        isEditing: Boolean(record._id),
        currentPage: 'weekend-setup',
        selectedEmployee: null,
        message: req.query.saved ? 'Weekend or holiday saved.' : req.query.deleted ? 'Weekend or holiday deleted.' : req.query.imported ? `${req.query.imported} CSV date(s) imported.` : '',
        error: options.error || String(req.query.error || ''),
        importError: String(req.query.importError || '')
    });
};

exports.showEmployeeWeekends = async (req, res) => {
    try {
        return await renderEmployeeWeekendPage(req, res);
    } catch (error) {
        console.error('Unable to load employee weekends:', error);
        return res.status(500).send('Unable to load employee weekends.');
    }
};

exports.saveEmployeeWeekend = async (req, res) => {
    const recordId = String(req.body.recordId || '').trim();
    try {
        if (req.body.action === 'delete') {
            if (!mongoose.isValidObjectId(recordId)) return res.redirect('/addweekend?error=Invalid+record.');
            await EmployeeWeekend.deleteOne({ _id: recordId });
            return res.redirect('/addweekend?deleted=1');
        }

        const date = parseNepaliDateKey(req.body.dateBs);
        const record = {
            dateBs: date ? getNepaliDate(date).slice(0, 10) : String(req.body.dateBs || '').trim(),
            name: String(req.body.name || '').trim().slice(0, 100)
        };
        if (!date || !record.name) {
            return renderEmployeeWeekendPage(req, res, {
                status: 400,
                record: { ...record, _id: recordId || undefined },
                error: !date ? 'Choose a valid Bikram Sambat date.' : 'Enter a weekend or holiday name.'
            });
        }
        if (recordId && !mongoose.isValidObjectId(recordId)) return res.status(400).send('Invalid weekend record.');
        const duplicate = await EmployeeWeekend.findOne({ dateBs: record.dateBs, ...(recordId ? { _id: { $ne: recordId } } : {}) }).lean();
        if (duplicate) {
            return renderEmployeeWeekendPage(req, res, {
                status: 409,
                record: { ...record, _id: recordId || undefined },
                error: `A weekend or holiday is already recorded for ${record.dateBs}. Edit that entry instead.`
            });
        }
        if (recordId) await EmployeeWeekend.updateOne({ _id: recordId }, { $set: record }, { runValidators: true });
        else await EmployeeWeekend.create(record);
        return res.redirect('/addweekend?saved=1');
    } catch (error) {
        console.error('Unable to save employee weekend:', error);
        return res.status(500).send('Unable to save employee weekend.');
    }
};

exports.downloadEmployeeWeekendCsvTemplate = (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-weekends-template.csv"');
    return res.send('\uFEFF"Date (BS)","Weekend name"\r\n');
};

exports.importEmployeeWeekendCsv = async (req, res) => {
    try {
        if (!req.file) throw new Error('Choose an employee weekend CSV file to upload.');
        const { headers, rows: parsedRows } = await parseEmployeeAttendanceCsv(req.file.buffer);
        const requiredHeaders = ['Date (BS)', 'Weekend name'];
        const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
        if (missingHeaders.length) throw new Error(`CSV is missing required columns: ${missingHeaders.join(', ')}.`);
        const rows = parsedRows.filter(row => Object.values(row).some(value => String(value || '').trim()));
        if (!rows.length) throw new Error('The CSV contains no weekend dates.');
        if (rows.length > 5000) throw new Error('Upload no more than 5,000 weekend dates at a time.');

        const recordsByDate = new Map();
        rows.forEach((row, index) => {
            const rowNumber = index + 2;
            const parsedDate = parseNepaliDateKey(row['Date (BS)']);
            const name = String(row['Weekend name'] || '').trim().slice(0, 100);
            if (!parsedDate) throw new Error(`Row ${rowNumber}: enter a valid Bikram Sambat date in Date (BS).`);
            if (!name) throw new Error(`Row ${rowNumber}: enter a weekend or holiday name.`);
            const dateBs = getNepaliDate(parsedDate).slice(0, 10);
            recordsByDate.set(dateBs, { dateBs, name });
        });
        const operations = Array.from(recordsByDate.values(), record => ({
            updateOne: { filter: { dateBs: record.dateBs }, update: { $set: record }, upsert: true }
        }));
        await EmployeeWeekend.bulkWrite(operations, { ordered: true });
        return res.redirect(`/addweekend?imported=${recordsByDate.size}`);
    } catch (error) {
        console.error('Unable to import employee weekend CSV:', error);
        return res.redirect(`/addweekend?importError=${encodeURIComponent(error.message || 'Unable to import employee weekend CSV.')}`);
    }
};

const getText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);
const getBoolean = value => ['true', '1', 'yes', 'on', 'approved'].includes(String(value || '').trim().toLowerCase());

const getIndexedRows = (body, prefix, countName, fieldNames, maxRows = 50) => {
    const count = Math.min(maxRows, Math.max(0, Number.parseInt(body[countName], 10) || 0));
    return Array.from({ length: count }, (_, index) => Object.fromEntries(
        fieldNames.map(fieldName => [fieldName, getText(body[`${prefix}_${index}_${fieldName}`])])
    )).filter(row => Object.values(row).some(Boolean));
};

const getIndexedRowsWithFlags = (body, prefix, countName, fieldNames, flagFields, maxRows = 50) => {
    const count = Math.min(maxRows, Math.max(0, Number.parseInt(body[countName], 10) || 0));
    return Array.from({ length: count }, (_, index) => {
        const row = Object.fromEntries(fieldNames.map(fieldName => [fieldName, getText(body[`${prefix}_${index}_${fieldName}`])]));
        flagFields.forEach(fieldName => { row[fieldName] = getBoolean(body[`${prefix}_${index}_${fieldName}`]); });
        return row;
    }).filter(row => Object.entries(row).some(([key, value]) => flagFields.includes(key) ? value : Boolean(value)));
};

const getIndexedRowsWithProof = (body, prefix, countName, fieldNames, flagFields = [], maxRows = 50) => {
    const count = Math.min(maxRows, Math.max(0, Number.parseInt(body[countName], 10) || 0));
    return Array.from({ length: count }, (_, formIndex) => {
        const row = Object.fromEntries(fieldNames.map(fieldName => [fieldName, getText(body[`${prefix}_${formIndex}_${fieldName}`])]));
        flagFields.forEach(fieldName => { row[fieldName] = getBoolean(body[`${prefix}_${formIndex}_${fieldName}`]); });
        row.proofBlobName = getText(body[`${prefix}_${formIndex}_proofBlobName`], 1024);
        row.proofFileSelected = getBoolean(body[`${prefix}_${formIndex}_proofFileSelected`]);
        row.formIndex = formIndex;
        const hasData = Object.entries(row).some(([key, value]) => {
            if (['proofBlobName', 'proofFileSelected', 'formIndex'].includes(key)) return false;
            return flagFields.includes(key) ? value : Boolean(value);
        });
        return hasData || row.proofBlobName || row.proofFileSelected ? row : null;
    }).filter(Boolean);
};

const buildEmployeeFormData = body => {
    const dateOfJoiningBs = String(body.dateOfJoiningBs || '').trim();
    const dateOfBirthBs = String(body.dateOfBirthBs || '').trim();
    const heightCm = Number(body.healthHeightCm) || null;
    const weightKg = Number(body.healthWeightKg) || null;
    const bmi = heightCm && weightKg ? Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1)) : null;
    const documentCount = Math.min(30, Math.max(0, Number.parseInt(body.documentCount, 10) || DEFAULT_EMPLOYEE_DOCUMENTS.length));
    const salaryRecords = getIndexedRows(body, 'salary', 'salaryCount', ['from', 'to', 'paidPer', 'paymentBy', 'basicSalary', 'allowance', 'dearness', 'total']);
    const allowances = getIndexedRowsWithFlags(body, 'allowance', 'allowanceCount', ['allowance', 'value', 'fromDate', 'minWorkHour', 'minDays', 'maxDays'], ['approved']);
    const deductions = getIndexedRowsWithFlags(body, 'deduction', 'deductionCount', ['deduction', 'value', 'calculatedBy'], ['isApproved']);
    const advances = getIndexedRowsWithFlags(body, 'advance', 'advanceCount', ['advanceName', 'amount', 'issueDate', 'status', 'matureDate'], ['approved']);
    const taxContributionCount = Math.min(20, Math.max(0, Number.parseInt(body.taxContributionCount, 10) || 0));
    const taxContributions = Array.from({ length: taxContributionCount }, (_, index) => ({
        title: getText(body[`taxContribution_${index}_title`], 80),
        number: getText(body[`taxContribution_${index}_number`], 80),
        enabled: getBoolean(body[`taxContribution_${index}_enabled`]),
        employeeRate: Number(body[`taxContribution_${index}_employeeRate`]) || 0,
        employerRate: Number(body[`taxContribution_${index}_employerRate`]) || 0
    })).filter(row => row.title || row.number || row.enabled || row.employeeRate || row.employerRate);

    return {
        employeeCode: getText(body.employeeCode, 30).toUpperCase(),
        deviceCode: getText(body.deviceCode, 40),
        officeEmail: getText(body.officeEmail, 160).toLowerCase(),
        officeContact: getText(body.officeContact, 30),
        nameNepali: getText(body.nameNepali, 120),
        companyName: getText(body.companyName, 160) || 'United English Boarding School',
        staffName: getText(body.staffName, 120),
        qualification: getText(body.qualification, 500),
        designation: getText(body.designation, 100),
        department: getText(body.department, 100),
        branchName: getText(body.branchName, 100),
        section: getText(body.section, 100),
        gradeLevel: getText(body.gradeLevel, 80),
        isManager: getBoolean(body.isManager),
        isActive: getBoolean(body.isActive),
        jobStatus: getText(body.jobStatus, 50) || 'Active',
        plannedIn: getText(body.plannedIn, 5) || '09:00',
        plannedOut: getText(body.plannedOut, 5) || '17:00',
        punchMethod: getText(body.punchMethod, 30) || 'Two Punch',
        allowMobilePunch: getBoolean(body.allowMobilePunch),
        shiftType: getText(body.shiftType, 30) || 'Fixed',
        shiftName: getText(body.shiftName, 120),
        activeWeekOff: Array.isArray(body.activeWeekOff) ? body.activeWeekOff.map(value => getText(value, 20)) : body.activeWeekOff ? [getText(body.activeWeekOff, 20)] : [],
        weekOffEffectiveFrom: getText(body.weekOffEffectiveFrom, 20),
        weekOffHistory: Array.isArray(body.weekOffHistory) ? body.weekOffHistory : [],
        bankName: getText(body.bankName, 120),
        bankBranch: getText(body.bankBranch, 120),
        bankAccountNumber: getText(body.bankAccountNumber, 80),
        panNumber: getText(body.panNumber, 50),
        ssfNumber: getText(body.ssfNumber, 50),
        dateOfJoining: convertNepaliDateToAD(dateOfJoiningBs) || undefined,
        dateOfJoiningBs,
        employmentType: getText(body.employmentType, 40) || 'Permanent',
        employmentStatus: getText(body.employmentStatus, 40) || 'Active',
        dateOfBirth: dateOfBirthBs ? convertNepaliDateToAD(dateOfBirthBs) || undefined : undefined,
        dateOfBirthBs,
        country: getText(body.country, 80) || 'Nepal',
        religion: getText(body.religion, 80),
        passportNumber: getText(body.passportNumber, 50),
        citizenNumber: getText(body.citizenNumber, 60),
        citizenshipIssueDate: getText(body.citizenshipIssueDate, 20),
        citizenshipIssueOffice: getText(body.citizenshipIssueOffice, 100),
        fatherName: getText(body.fatherName, 120),
        motherName: getText(body.motherName, 120),
        isDifferentlyAbled: getBoolean(body.isDifferentlyAbled),
        permanentAddress: getText(body.permanentAddress || body.address, 500),
        permanentDistrict: getText(body.permanentDistrict, 80),
        permanentMunicipality: getText(body.permanentMunicipality, 100),
        permanentWard: getText(body.permanentWard, 20),
        permanentAddressNepali: getText(body.permanentAddressNepali, 500),
        temporaryAddress: getText(body.temporaryAddress, 500),
        temporaryDistrict: getText(body.temporaryDistrict, 80),
        temporaryMunicipality: getText(body.temporaryMunicipality, 100),
        temporaryWard: getText(body.temporaryWard, 20),
        temporaryAddressNepali: getText(body.temporaryAddressNepali, 500),
        sameAddressAsPermanent: getBoolean(body.sameAddressAsPermanent),
        gender: getText(body.gender, 40),
        maritalStatus: getText(body.maritalStatus, 40),
        bloodGroup: getText(body.bloodGroup, 10),
        mobileNumber: getText(body.mobileNumber, 30),
        alternateMobile: getText(body.alternateMobile, 30),
        email: getText(body.email, 160).toLowerCase(),
        address: getText(body.address, 500),
        emergencyContactName: getText(body.emergencyContactName, 120),
        emergencyContactRelation: getText(body.emergencyContactRelation, 60),
        emergencyContactNumber: getText(body.emergencyContactNumber, 30),
        emergencyContactAddress: getText(body.emergencyContactAddress, 500),
        health: {
            heightCm,
            weightKg,
            bmi,
            bloodGroup: getText(body.healthBloodGroup, 10),
            bloodPressure: getText(body.healthBloodPressure, 40),
            medications: getText(body.healthMedications, 1000),
            medicalConditions: getText(body.healthMedicalConditions, 1000),
            allergies: getText(body.healthAllergies, 1000),
            notes: getText(body.healthNotes, 1500)
        },
        qualifications: getIndexedRows(body, 'qualification', 'qualificationCount', ['degree', 'level', 'faculty', 'institution', 'affiliation', 'country', 'passedYearBs', 'passedYearAd', 'result', 'majorSubjects', 'description']),
        experiences: getIndexedRows(body, 'experience', 'experienceCount', ['title', 'organization', 'beganOn', 'endedOn', 'description']),
        skills: getIndexedRows(body, 'skill', 'skillCount', ['code', 'name', 'description']),
        trainings: getIndexedRows(body, 'training', 'trainingCount', ['trainingName', 'fromDate', 'toDate', 'description']),
        familyMembers: getIndexedRows(body, 'family', 'familyCount', ['name', 'relation', 'note']),
        salaryRecords,
        allowances,
        deductions,
        advances,
        taxConfiguration: {
            panNumber: getText(body.taxPanNumber, 50),
            ssfNumber: getText(body.taxSsfNumber, 50),
            ssfEffectiveDate: getText(body.taxSsfEffectiveDate, 20),
            contributions: taxContributions
        },
        socialSecurityTax: {
            enabled: getBoolean(body.ssnEnabled),
            number: getText(body.ssnNumber, 60),
            effectiveDate: getText(body.ssfEffectiveDate, 20)
        },
        providentFund: {
            enabled: getBoolean(body.pfEnabled),
            calculationType: getText(body.pfCalculationType, 20) || 'Flat',
            number: getText(body.pfNumber, 60),
            employeeAmount: Number(body.pfEmployeeAmount) || 0,
            employeeRate: Number(body.pfEmployeeRate) || 0,
            employerRate: Number(body.pfEmployerRate) || 0
        },
        citizenInvestmentTrust: {
            enabled: getBoolean(body.citEnabled),
            calculationType: getText(body.citCalculationType, 20) || 'Flat',
            number: getText(body.citNumber, 60),
            amount: Number(body.citAmount) || 0
        },
        gratuity: { enabled: getBoolean(body.gratuityEnabled) },
        previousCompanyTds: {
            companyName: getText(body.previousCompanyName, 160),
            totalSalary: Number(body.previousTotalSalary) || 0,
            totalTds: Number(body.previousTotalTds) || 0,
            fiscalYear: getText(body.previousFiscalYear, 30),
            documentName: getText(body.previousTdsDocumentName, 180),
            url: getText(body.previousTdsDocumentUrl, 500),
            blobName: getText(body.previousTdsDocumentBlobName, 300)
        },
        contracts: getIndexedRowsWithProof(body, 'contract', 'contractCount', ['status', 'beganOn', 'endedOn']),
        transferHistory: getIndexedRowsWithProof(body, 'transfer', 'transferCount', ['transferDate', 'transferType', 'from', 'to', 'transferredBy']),
        promotionHistory: getIndexedRowsWithProof(body, 'promotion', 'promotionCount', ['status', 'promotionDate', 'fromDesignation', 'toDesignation', 'promotedBy']),
        resignations: getIndexedRowsWithProof(body, 'resignation', 'resignationCount', ['eventDate', 'lastWorkingDate', 'reason', 'details', 'approvedBy'], ['approved']),
        terminations: getIndexedRowsWithProof(body, 'termination', 'terminationCount', ['eventDate', 'lastWorkingDate', 'reason', 'details', 'approvedBy'], ['approved']),
        disciplinaryCases: getIndexedRowsWithProof(body, 'disciplinary', 'disciplinaryCount', ['caseName', 'description', 'createdOn', 'status', 'forwardTo', 'actions']),
        exitInterviews: getIndexedRowsWithProof(body, 'exitInterview', 'exitInterviewCount', ['description']),
        lettersIssued: getIndexedRowsWithProof(body, 'letter', 'letterCount', ['type', 'issueDate', 'issuedBy', 'letterUrl']),
        loans: getIndexedRowsWithFlags(body, 'loan', 'loanCount', ['loanName', 'principalAmount', 'interestRate', 'status', 'matureDate'], ['approved']),
        assets: getIndexedRows(body, 'asset', 'assetCount', ['name', 'assetNumber', 'assetType', 'issueDate', 'condition', 'note']),
        facilities: getIndexedRows(body, 'facility', 'facilityCount', ['facility', 'description', 'startDate', 'endDate', 'note']),
        personalVehicles: getIndexedRows(body, 'vehicle', 'vehicleCount', ['vehicleType', 'brand', 'model', 'number', 'status']),
        reportsTo: getText(body.reportsTo, 30) || null,
        reportingLines: getIndexedRows(body, 'reportingLine', 'reportingLineCount', ['title', 'employeeCode', 'employeeName', 'designation']),
        documentRows: Array.from({ length: documentCount }, (_, index) => ({
            index,
            name: getText(body[`documentName_${index}`], 120) || DEFAULT_EMPLOYEE_DOCUMENTS[index] || ''
        })),
        otherInformation: getText(body.otherInformation, 3000)
    };
};

const uploadDocumentsToAzure = async (files, formData) => {
    const documentFiles = (files || []).filter(file => /^documentFile_\d+$/.test(file.fieldname));
    if (!documentFiles.length) return [];
    const { containerClient, containerName } = await getEmployeeDocumentContainer();
    const uploaded = [];

    try {
        for (const file of documentFiles) {
            const match = file.fieldname.match(/^documentFile_(\d+)$/);
            const documentRow = match ? formData.documentRows[Number(match[1])] : null;
            const documentName = getText(documentRow?.name, 120);
            if (!documentName) throw new Error('Enter a document name for each selected file.');
            const compressed = await compressEmployeeDocument(file);
            const safeExtension = /^\.(pdf|jpe?g|png|webp|gif)$/.test(compressed.extension) ? compressed.extension : '';
            const blobName = `employee-documents/${formData.employeeCode}/${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
            const blobClient = containerClient.getBlockBlobClient(blobName);
            await blobClient.uploadData(compressed.buffer, { blobHTTPHeaders: { blobContentType: compressed.mimeType } });
            uploaded.push({
                documentName,
                url: blobClient.url,
                blobName,
                containerName,
                originalName: getText(file.originalname, 180),
                mimeType: compressed.mimeType,
                fileSizeBytes: compressed.fileSizeBytes,
                originalSizeBytes: compressed.originalSizeBytes
            });
        }
        return uploaded;
    } catch (error) {
        await Promise.all(uploaded.map(document => containerClient.getBlockBlobClient(document.blobName).deleteIfExists().catch(() => {})));
        throw error;
    }
};

const uploadEmployeeOfficeProofs = async (formData, files, employee) => {
    const uploaded = [];
    const keptBlobNames = new Set();
    try {
        let containerClient;
        let containerName;
        for (const { prefix, collection } of EMPLOYEE_OFFICE_PROOF_SECTIONS) {
            const existingRows = employee?.[collection] || [];
            for (const row of formData[collection] || []) {
                const formIndex = row.formIndex;
                const file = (files || []).find(item => item.fieldname === `${prefix}_${formIndex}_proofFile`);
                const existingProof = existingRows.find(item =>
                    item.proofDocument?.blobName === row.proofBlobName
                )?.proofDocument;
                if (file) {
                    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(String(file.mimetype || '').toLowerCase())) {
                        throw new Error('Proof documents must be PDF, JPG, or PNG files.');
                    }
                    if (!containerClient) ({ containerClient, containerName } = await getEmployeeDocumentContainer());
                    const compressed = await compressEmployeeDocument(file);
                    const safeExtension = /^\.(pdf|jpe?g|png|webp)$/.test(compressed.extension) ? compressed.extension : '';
                    const safeEmployeeCode = String(formData.employeeCode || '').replace(/[^a-z0-9_-]/gi, '_');
                    const blobName = `employee-office-proofs/${safeEmployeeCode}/${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
                    await containerClient.getBlockBlobClient(blobName).uploadData(compressed.buffer, {
                        blobHTTPHeaders: { blobContentType: compressed.mimeType }
                    });
                    row.proofDocument = {
                        blobName,
                        containerName,
                        originalName: getText(file.originalname, 180),
                        mimeType: compressed.mimeType,
                        fileSizeBytes: compressed.fileSizeBytes,
                        originalSizeBytes: compressed.originalSizeBytes
                    };
                    uploaded.push(row.proofDocument);
                } else {
                    row.proofDocument = existingProof || null;
                }
                if (row.proofDocument?.blobName) keptBlobNames.add(row.proofDocument.blobName);
                delete row.proofBlobName;
                delete row.proofFileSelected;
                delete row.formIndex;
            }
        }
        const removed = EMPLOYEE_OFFICE_PROOF_SECTIONS.flatMap(({ collection }) =>
            (employee?.[collection] || [])
                .map(row => row.proofDocument)
                .filter(proof => proof?.blobName && !keptBlobNames.has(proof.blobName))
        );
        return { uploaded, removed };
    } catch (error) {
        await deleteUploadedDocuments(uploaded);
        throw error;
    }
};

const uploadEmployeePhotoToAzure = async (file, employeeCode) => {
    if (!file) return null;
    if (!String(file.mimetype || '').startsWith('image/')) throw new Error('Employee photo must be an image.');
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error('Azure document storage is not configured.');
    const containerName = process.env.AZURE_EMPLOYEE_DOCUMENT_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
    const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    const extension = path.extname(file.originalname).toLowerCase();
    const blobName = `employee-photos/${employeeCode}/${Date.now()}-${crypto.randomUUID()}${extension}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.uploadData(file.buffer, { blobHTTPHeaders: { blobContentType: file.mimetype } });
    return { url: blobClient.url, blobName, originalName: getText(file.originalname, 180) };
};

const uploadPreviousTdsDocumentToAzure = async (file, employeeCode) => {
    if (!file) return null;
    const { containerClient, containerName } = await getEmployeeDocumentContainer();
    const compressed = await compressEmployeeDocument(file);
    const safeExtension = /^\.(pdf|jpe?g|png|webp|gif)$/.test(compressed.extension) ? compressed.extension : '';
    const blobName = `employee-documents/${employeeCode}/previous-tds-${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.uploadData(compressed.buffer, { blobHTTPHeaders: { blobContentType: compressed.mimeType } });
    return {
        url: blobClient.url,
        blobName,
        containerName,
        originalName: getText(file.originalname, 180),
        mimeType: compressed.mimeType,
        fileSizeBytes: compressed.fileSizeBytes,
        originalSizeBytes: compressed.originalSizeBytes
    };
};

const deleteUploadedDocuments = async documents => {
    if (!documents.length) return;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) return;
    const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
    await Promise.all(documents.map(document => serviceClient
        .getContainerClient(document.containerName || getLegacyEmployeeContainerName())
        .getBlockBlobClient(document.blobName)
        .deleteIfExists()
        .catch(() => {})));
};

const validateEmployeeFormData = formData => {
    const requiredFields = [
        'employeeCode', 'staffName', 'designation', 'department', 'dateOfJoining',
        'mobileNumber', 'email', 'address', 'emergencyContactName', 'emergencyContactNumber'
    ];
    if (requiredFields.some(field => !formData[field])) {
        return 'Complete all required fields and enter a valid joining date in Bikram Sambat.';
    }
    if (formData.dateOfBirthBs && !formData.dateOfBirth) return 'Enter a valid date of birth in Bikram Sambat.';
    return '';
};

exports.createEmployeeDetails = async (req, res) => {
    const formData = buildEmployeeFormData(req.body);
    const validationError = validateEmployeeFormData(formData);
    if (validationError) {
        return renderEmployeeDetails(res, {
            status: 400,
            error: validationError,
            formData
        });
    }

    if (formData.health.heightCm && formData.health.weightKg && (!Number.isFinite(formData.health.bmi) || formData.health.bmi <= 0)) {
        formData.health.bmi = null;
    }

    let uploadedDocuments = [];
    let uploadedOfficeProofs = [];
    let uploadedPhoto = null;
    let uploadedTdsDocument = null;
    try {
        const duplicateField = await findDuplicateEmployeeIdentifier(formData);
        if (duplicateField) {
            const label = duplicateField === 'employeeCode' ? 'Employee code' : 'Device code';
            return renderEmployeeDetails(res, {
                status: 409,
                newEmployee: true,
                error: `${label} is already in use.`,
                formData
            });
        }
        uploadedDocuments = await uploadDocumentsToAzure(req.files, formData);
        uploadedPhoto = await uploadEmployeePhotoToAzure((req.files || []).find(file => file.fieldname === 'employeePhoto'), formData.employeeCode);
        uploadedTdsDocument = await uploadPreviousTdsDocumentToAzure((req.files || []).find(file => file.fieldname === 'previousTdsDocument'), formData.employeeCode);
        const officeProofs = await uploadEmployeeOfficeProofs(formData, req.files, null);
        uploadedOfficeProofs = officeProofs.uploaded;
        const { documentRows, ...employeeData } = formData;
        if (uploadedTdsDocument) {
            employeeData.previousCompanyTds.documentName = uploadedTdsDocument.originalName;
            employeeData.previousCompanyTds.url = uploadedTdsDocument.url;
            employeeData.previousCompanyTds.blobName = uploadedTdsDocument.blobName;
            employeeData.previousCompanyTds.containerName = uploadedTdsDocument.containerName;
            employeeData.previousCompanyTds.mimeType = uploadedTdsDocument.mimeType;
            employeeData.previousCompanyTds.fileSizeBytes = uploadedTdsDocument.fileSizeBytes;
            employeeData.previousCompanyTds.originalSizeBytes = uploadedTdsDocument.originalSizeBytes;
        }
        const savedEmployee = await Staff.create({ ...employeeData, documents: uploadedDocuments, employeePhoto: uploadedPhoto || {} });
        await safelyQueueEmployeeSync(savedEmployee.toObject(), req.user?.username || req.user?.teacherName, 'created');
        return res.redirect('/employeedetail?saved=1');
    } catch (error) {
        await deleteUploadedDocuments([...uploadedDocuments, ...uploadedOfficeProofs, ...(uploadedPhoto ? [uploadedPhoto] : []), ...(uploadedTdsDocument ? [uploadedTdsDocument] : [])]);
        if (error.code === 11000) {
            return renderEmployeeDetails(res, {
                status: 409,
                error: 'That employee code is already in use.',
                formData
            });
        }

        console.error('Unable to save employee details:', error);
        return renderEmployeeDetails(res, {
            status: 400,
            error: error.statusCode === 400
                ? error.message
                : 'Employee details could not be saved. Check the entered values and try again.',
            formData
        });
    }
};

exports.updateEmployeeDetails = async (req, res) => {
    const employeeId = String(req.params.id || '');
    if (!mongoose.isValidObjectId(employeeId)) return res.status(404).send('Employee profile not found.');
    const formData = buildEmployeeFormData(req.body);
    const validationError = validateEmployeeFormData(formData);
    const activeModule = getText(req.body.activeModule, 40) || 'profile';
    if (validationError || (formData.activeWeekOff.length && !formData.weekOffEffectiveFrom)) {
        return renderEmployeeDetails(res, {
            status: 400,
            employeeId,
            activeModule,
            error: validationError || 'Set an effective date for the active week-off rule.',
            formData
        });
    }

    let uploadedDocuments = [];
    let uploadedOfficeProofs = [];
    let uploadedPhoto = null;
    let uploadedTdsDocument = null;
    try {
        const existingEmployee = await Staff.findById(employeeId).lean();
        if (!existingEmployee) return res.status(404).send('Employee profile not found.');
        const duplicateField = await findDuplicateEmployeeIdentifier(formData, employeeId);
        if (duplicateField) {
            const label = duplicateField === 'employeeCode' ? 'Employee code' : 'Device code';
            return renderEmployeeDetails(res, {
                status: 409,
                employeeId,
                activeModule,
                error: `${label} is already in use.`,
                formData
            });
        }
        uploadedDocuments = await uploadDocumentsToAzure(req.files, formData);
        uploadedPhoto = await uploadEmployeePhotoToAzure((req.files || []).find(file => file.fieldname === 'employeePhoto'), formData.employeeCode);
        uploadedTdsDocument = await uploadPreviousTdsDocumentToAzure((req.files || []).find(file => file.fieldname === 'previousTdsDocument'), formData.employeeCode);
        const officeProofs = await uploadEmployeeOfficeProofs(formData, req.files, existingEmployee);
        uploadedOfficeProofs = officeProofs.uploaded;
        const { documentRows, ...employeeData } = formData;
        employeeData.documents = [...(existingEmployee.documents || []), ...uploadedDocuments];
        employeeData.employeePhoto = uploadedPhoto || existingEmployee.employeePhoto || {};
        if (uploadedTdsDocument) {
            employeeData.previousCompanyTds.documentName = uploadedTdsDocument.originalName;
            employeeData.previousCompanyTds.url = uploadedTdsDocument.url;
            employeeData.previousCompanyTds.blobName = uploadedTdsDocument.blobName;
            employeeData.previousCompanyTds.containerName = uploadedTdsDocument.containerName;
            employeeData.previousCompanyTds.mimeType = uploadedTdsDocument.mimeType;
            employeeData.previousCompanyTds.fileSizeBytes = uploadedTdsDocument.fileSizeBytes;
            employeeData.previousCompanyTds.originalSizeBytes = uploadedTdsDocument.originalSizeBytes;
        } else {
            employeeData.previousCompanyTds.url = existingEmployee.previousCompanyTds?.url || '';
            employeeData.previousCompanyTds.blobName = existingEmployee.previousCompanyTds?.blobName || '';
            employeeData.previousCompanyTds.containerName = existingEmployee.previousCompanyTds?.containerName || '';
            employeeData.previousCompanyTds.mimeType = existingEmployee.previousCompanyTds?.mimeType || '';
            employeeData.previousCompanyTds.fileSizeBytes = existingEmployee.previousCompanyTds?.fileSizeBytes || 0;
            employeeData.previousCompanyTds.originalSizeBytes = existingEmployee.previousCompanyTds?.originalSizeBytes || 0;
        }
        const previousWeekOff = [...(existingEmployee.activeWeekOff || [])].sort();
        const submittedWeekOff = [...(employeeData.activeWeekOff || [])].sort();
        employeeData.weekOffHistory = [...(existingEmployee.weekOffHistory || [])];
        if (previousWeekOff.length && previousWeekOff.join('|') !== submittedWeekOff.join('|') && employeeData.weekOffEffectiveFrom) {
            employeeData.weekOffHistory.push({
                offDays: previousWeekOff,
                fromDate: existingEmployee.weekOffEffectiveFrom || '',
                toDate: employeeData.weekOffEffectiveFrom
            });
        }
        await Staff.updateOne({ _id: employeeId }, { $set: employeeData }, { runValidators: true });
        const relevantFields = ['deviceCode', 'staffName', 'isManager', 'isActive', 'employmentStatus', 'jobStatus'];
        const syncFieldsChanged = relevantFields.some(field => {
            const previousValue = field === 'deviceCode'
                ? String(existingEmployee[field] || '').trim()
                : existingEmployee[field];
            const nextValue = field === 'deviceCode'
                ? String(employeeData[field] || '').trim()
                : employeeData[field];
            return previousValue !== nextValue;
        });
        if (syncFieldsChanged) {
            const deviceCodeChanged = String(existingEmployee.deviceCode || '').trim()
                !== String(employeeData.deviceCode || '').trim();
            if (deviceCodeChanged && existingEmployee.deviceCode && isAdmsCommandQueueEnabled()) {
                try {
                    const organizationId = getOrganizationId();
                    const devices = await EmployeeAttendanceDevice.find({
                        organizationId,
                        supportsUserDeletion: true
                    }).lean();
                    for (const device of devices) {
                        await queueAdmsEmployeeCommand(device, existingEmployee, {
                            ...buildUserInfoDeleteCommand(existingEmployee.deviceCode),
                            deviceCode: existingEmployee.deviceCode
                        }, req.user?.username || req.user?.teacherName);
                    }
                } catch (error) {
                    console.error('Unable to queue removal of the previous employee PIN; employee record remains saved:', {
                        employeeReference: employeeId,
                        message: error.message
                    });
                }
            }
            await safelyQueueEmployeeSync({ ...employeeData, _id: existingEmployee._id }, req.user?.username || req.user?.teacherName, 'updated');
        }
        await deleteUploadedDocuments(officeProofs.removed);
        if (uploadedPhoto && existingEmployee.employeePhoto?.blobName) {
            await deleteUploadedDocuments([{ blobName: existingEmployee.employeePhoto.blobName }]);
        }
        if (uploadedTdsDocument && existingEmployee.previousCompanyTds?.blobName) {
            await deleteUploadedDocuments([{
                blobName: existingEmployee.previousCompanyTds.blobName,
                containerName: existingEmployee.previousCompanyTds.containerName
            }]);
        }
        return res.redirect(`/employeedetail?employeeId=${employeeId}&module=${encodeURIComponent(activeModule)}&saved=1`);
    } catch (error) {
        await deleteUploadedDocuments([...uploadedDocuments, ...uploadedOfficeProofs, ...(uploadedPhoto ? [uploadedPhoto] : []), ...(uploadedTdsDocument ? [uploadedTdsDocument] : [])]);
        if (error.code === 11000) {
            return renderEmployeeDetails(res, { status: 409, employeeId, activeModule, error: 'That employee code is already in use.', formData });
        }
        console.error('Unable to update employee details:', error);
        return renderEmployeeDetails(res, {
            status: 400,
            employeeId,
            activeModule,
            error: error.statusCode === 400
                ? error.message
                : 'Employee details could not be saved. Check the entered values and try again.',
            formData
        });
    }
};

let attendanceEventKeyIndexPromise;

function ensureAttendanceEventKeyIndex() {
    if (!attendanceEventKeyIndexPromise) {
        attendanceEventKeyIndexPromise = employeeAttendance.collection.createIndex(
            { eventKey: 1 },
            { unique: true, sparse: true }
        ).catch(error => {
            attendanceEventKeyIndexPromise = null;
            throw error;
        });
    }
    return attendanceEventKeyIndexPromise;
}

async function updateAttendanceDeviceRequest(serialNumber, requestDetails, setFields, increments = {}) {
    try {
        const organizationId = getOrganizationId();
        if (!organizationId) throw new Error('Current MongoDB database name is unavailable.');
        const update = {
            $set: setFields,
            $setOnInsert: {
                serialNumber,
                name: `ZKTeco device ${serialNumber}`
            }
        };
        update.$set.organizationId = organizationId;
        if (Object.keys(increments).length) update.$inc = increments;

        await EmployeeAttendanceDevice.updateOne(
            { serialNumber },
            update,
            { upsert: true, setDefaultsOnInsert: false }
        );
        return true;
    } catch (error) {
        console.error('Device activity update failed:', {
            serialNumber,
            requestType: requestDetails.requestType,
            requestStatus: setFields.lastRequestStatus,
            requestSource: requestDetails.requestSource,
            remoteAddress: requestDetails.remoteAddress,
            userAgent: requestDetails.userAgent,
            message: error.message
        });
        return false;
    }
}

function getAttendanceDeviceRequestDetails(req, requestType) {
    const userAgent = String(req.get('user-agent') || '').slice(0, 200);
    return {
        requestType,
        requestSource: getAttendanceRequestSource(userAgent),
        remoteAddress: String(req.ip || req.socket?.remoteAddress || '').slice(0, 100),
        userAgent
    };
}

async function startAttendanceDeviceRequest(serialNumber, req, requestType, receivedAt, isAttendanceRequest) {
    const requestDetails = getAttendanceDeviceRequestDetails(req, requestType);
    const setFields = {
        lastActivity: receivedAt,
        lastCommunicationAt: receivedAt,
        lastRequestType: requestType,
        lastRequestStatus: 'processing',
        lastRequestSource: requestDetails.requestSource,
        lastRequestUserAgent: requestDetails.userAgent,
        lastRequestRemoteAddress: requestDetails.remoteAddress
    };
    if (isAttendanceRequest) setFields.lastAttendanceReceived = receivedAt;

    const updated = await updateAttendanceDeviceRequest(serialNumber, requestDetails, setFields);
    console.info('ADMS device request observed:', {
        serialNumber,
        requestTimestamp: receivedAt.toISOString(),
        requestType,
        requestSource: requestDetails.requestSource,
        activityUpdateSucceeded: updated,
        remoteAddress: requestDetails.remoteAddress,
        userAgent: requestDetails.userAgent
    });
    return { requestDetails, activityUpdateSucceeded: updated };
}

async function finishAttendanceDeviceRequest(serialNumber, requestDetails, status, receivedRecords = 0, insertedRecords = 0) {
    await updateAttendanceDeviceRequest(
        serialNumber,
        requestDetails,
        { lastRequestStatus: status },
        { totalReceivedRecords: receivedRecords, totalInsertedRecords: insertedRecords }
    );
}

async function updateAttendanceSyncRun(serialNumber, receivedRecords, savedRecords, duplicateRecords, failedRecords, errors) {
    const since = new Date(Date.now() - 10 * 60_000);
    const run = await EmployeeAttendanceSyncRun.findOne({
        serialNumber,
        requestedAt: { $gte: since }
    }).sort({ requestedAt: -1 });
    if (!run) return;

    run.receivedRecords += receivedRecords;
    run.savedRecords += savedRecords;
    run.duplicateRecords += duplicateRecords;
    run.failedRecords += failedRecords;
    run.lastReceivedAt = new Date();
    run.lastErrorDetails = errors.slice(0, 10);
    await run.save();
}

async function processDeviceAttendanceRows(docs) {
    let savedRecords = 0;
    let duplicateRecords = 0;
    let failedRecords = 0;
    const errors = [];
    const eventKeys = new Set();
    const uniqueDocs = [];

    await ensureAttendanceEventKeyIndex();

    docs.forEach((doc, index) => {
        const eventKey = getAttendanceEventKey(doc);
        if (eventKeys.has(eventKey)) {
            duplicateRecords += 1;
            return;
        }
        eventKeys.add(eventKey);
        uniqueDocs.push({ ...doc, eventKey, source: 'Device', sourceLine: index + 1 });
    });

    if (!uniqueDocs.length) return { savedRecords, duplicateRecords, failedRecords, errors };

    const pins = [...new Set(uniqueDocs.map(doc => doc.pin))];
    const staffByPin = new Map();
    const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let offset = 0; offset < pins.length; offset += 100) {
        const pinPatterns = pins.slice(offset, offset + 100)
            .map(pin => new RegExp(`^${escapeRegExp(pin)}$`, 'i'));
        const matchedStaff = await Staff.find({ deviceCode: { $in: pinPatterns } })
            .select('deviceCode staffName employeeCode employmentStatus jobStatus isActive')
            .lean();
        matchedStaff.forEach(staff => {
            const key = normalizeAttendancePin(staff.deviceCode);
            if (!staffByPin.has(key)) staffByPin.set(key, []);
            staffByPin.get(key).push(staff);
        });
    }

    const mappedDocs = [];
    uniqueDocs.forEach(doc => {
        const matches = staffByPin.get(normalizeAttendancePin(doc.pin)) || [];
        if (matches.length !== 1 || !isActiveEmployeeProfile(matches[0])) {
            failedRecords += 1;
            errors.push(`Line ${doc.sourceLine}: device PIN is not mapped to one active employee.`);
            console.warn('Ignoring attendance punch for an unknown, inactive, or ambiguous device PIN:', {
                serialNumber: doc.sn,
                line: doc.sourceLine
            });
            return;
        }
        mappedDocs.push({ ...doc, name: doc.name || matches[0].staffName });
    });

    if (!mappedDocs.length) return { savedRecords, duplicateRecords, failedRecords, errors };

    const punchTimes = [...new Map(uniqueDocs.map(doc => [new Date(doc.punchTime).toISOString(), doc.punchTime])).values()];
    const legacyRecords = await employeeAttendance.find({
        sn: mappedDocs[0].sn,
        pin: { $in: pins },
        punchTime: { $in: punchTimes },
        source: { $ne: 'Manual' }
    }).select('sn pin punchTime status verifyMode').lean();
    const existingLogicalKeys = new Set(legacyRecords.map(getAttendanceLogicalKey));

    const pendingDocs = mappedDocs.filter(doc => {
        const logicalKey = getAttendanceLogicalKey(doc);
        if (existingLogicalKeys.has(logicalKey)) {
            duplicateRecords += 1;
            return false;
        }
        existingLogicalKeys.add(logicalKey);
        return true;
    });

    for (let offset = 0; offset < pendingDocs.length; offset += 10) {
        const chunk = pendingDocs.slice(offset, offset + 10);
        await Promise.all(chunk.map(async doc => {
            const { sourceLine, ...attendanceRecord } = doc;
            try {
                const result = await employeeAttendance.updateOne(
                    { eventKey: attendanceRecord.eventKey },
                    { $setOnInsert: attendanceRecord },
                    { upsert: true }
                );
                if (result.upsertedCount) savedRecords += 1;
                else duplicateRecords += 1;
            } catch (error) {
                if (error.code === 11000) {
                    duplicateRecords += 1;
                    return;
                }
                failedRecords += 1;
                errors.push(`Line ${sourceLine}: attendance could not be saved.`);
                console.error('Device attendance record persistence failed:', {
                    serialNumber: attendanceRecord.sn,
                    line: sourceLine,
                    errorCode: error.code,
                    message: error.message
                });
            }
        }));
    }

    return { savedRecords, duplicateRecords, failedRecords, errors };
}

exports.saveEmployeeAttendance = async (req, res) => {
    const receivedAt = new Date();
    let serialNumber = '';
    let lines = [];
    let receivedRecords = 0;
    let savedRecords = 0;
    let duplicateRecords = 0;
    let failedRecords = 0;
    let requestDetails = null;
    let requestFinalized = false;
    const errors = [];

    try {
        const fields = req.body && typeof req.body === 'object' ? req.body : {};
        serialNumber = String(req.query.SN || '').trim();
        const table = String(req.query.table || fields.table || '').trim().toUpperCase();
        let payload = '';

        if (typeof req.body === 'string') payload = req.body;
        else if (Buffer.isBuffer(req.body)) payload = req.body.toString('utf8');
        else payload = String(fields.data || fields.attlog || fields.body || '');

        if (!isValidDeviceSerial(serialNumber)) {
            console.warn('ADMS attendance request missing a valid query-string serial number:', {
                requestTimestamp: receivedAt.toISOString(),
                requestType: table || 'UNKNOWN',
                remoteAddress: String(req.ip || req.socket?.remoteAddress || ''),
                userAgent: String(req.get('user-agent') || '').slice(0, 200)
            });
            return res.status(400).type('text/plain').send('Invalid or missing device serial number');
        }

        const requestType = table === 'ATTLOG'
            ? 'POST_ATTLOG'
            : `POST_${table.replace(/[^A-Z0-9_-]/g, '').slice(0, 40) || 'UNKNOWN'}`;
        const request = await startAttendanceDeviceRequest(
            serialNumber,
            req,
            requestType,
            receivedAt,
            table === 'ATTLOG'
        );
        requestDetails = request.requestDetails;

        if (table !== 'ATTLOG') {
            await finishAttendanceDeviceRequest(serialNumber, requestDetails, 'responded');
            requestFinalized = true;
            return res.status(200).send('OK');
        }

        if (!payload.trim()) {
            await finishAttendanceDeviceRequest(serialNumber, requestDetails, 'empty');
            requestFinalized = true;
            console.info('Empty ADMS ATTLOG request recorded:', {
                serialNumber,
                requestTimestamp: receivedAt.toISOString(),
                requestSource: requestDetails.requestSource
            });
            return res.status(200).send('OK');
        }

        lines = payload.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        receivedRecords = lines.length;
        const docs = [];
        lines.forEach((line, index) => {
            const record = parseAttendanceRow(line, serialNumber);
            if (record) docs.push(record);
            else {
                failedRecords += 1;
                if (errors.length < 10) errors.push(`Line ${index + 1}: invalid ATTLOG data.`);
            }
        });

        if (docs.length) {
            const punchDatesBs = [...new Set(docs.map(doc => getNepaliDate(new Date(doc.punchTime)).slice(0, 10)))];
            const employeeHolidays = await EmployeeWeekend.find({ dateBs: { $in: punchDatesBs } }).select('dateBs name').lean();
            const holidaysByDate = new Map(employeeHolidays.map(item => [item.dateBs, item.name]));
            docs.forEach(doc => {
                doc.holidayName = holidaysByDate.get(getNepaliDate(new Date(doc.punchTime)).slice(0, 10)) || '';
                doc.isHoliday = Boolean(doc.holidayName);
            });

            const outcome = await processDeviceAttendanceRows(docs);
            savedRecords = outcome.savedRecords;
            duplicateRecords = outcome.duplicateRecords;
            failedRecords += outcome.failedRecords;
            errors.push(...outcome.errors);
        }

        await updateAttendanceSyncRun(
            serialNumber,
            lines.length,
            savedRecords,
            duplicateRecords,
            failedRecords,
            errors
        );

        if (lines.length > 0 && failedRecords === 0) {
            await EmployeeAttendanceDevice.updateOne(
                { serialNumber },
                { $set: { lastSuccessfulBatchAt: receivedAt } }
            );
        }

        const requestStatus = failedRecords > 0 ? (savedRecords > 0 ? 'partial' : 'failed') : 'processed';
        await finishAttendanceDeviceRequest(
            serialNumber,
            requestDetails,
            requestStatus,
            receivedRecords,
            savedRecords
        );
        requestFinalized = true;

        console.info('Device attendance batch processed:', {
            serialNumber,
            requestTimestamp: receivedAt.toISOString(),
            receivedRecordCount: receivedRecords,
            savedRecordCount: savedRecords,
            duplicateRecordCount: duplicateRecords,
            failedRecordCount: failedRecords,
            requestSource: requestDetails.requestSource,
            requestStatus,
            errorDetails: errors.slice(0, 10)
        });

        if (failedRecords > 0) {
            return res.status(500).type('text/plain').send('Attendance batch was not fully processed; retry is safe');
        }
        if (!lines.length) return res.status(400).type('text/plain').send('No attendance records received');
        return res.status(200).send('OK');
    } catch (error) {
        console.error('saveEmployeeAttendance error:', {
            serialNumber,
            requestTimestamp: receivedAt.toISOString(),
            receivedRecordCount: receivedRecords,
            savedRecordCount: savedRecords,
            duplicateRecordCount: duplicateRecords,
            failedRecordCount: failedRecords,
            requestSource: requestDetails?.requestSource,
            errorDetails: errors.slice(0, 10),
            message: error.message
        });
        if (requestDetails && !requestFinalized) {
            await finishAttendanceDeviceRequest(
                serialNumber,
                requestDetails,
                savedRecords > 0 ? 'partial' : 'failed',
                receivedRecords,
                savedRecords
            );
        }
        return res.status(500).type('text/plain').send('Unable to process attendance batch');
    }
};

function getAttendanceDeviceStatus(device, run, now = new Date()) {
    const lastActivity = device.lastActivity || device.lastCommunicationAt || null;
    const online = isAttendanceDeviceOnline(lastActivity, now, getDeviceOnlineTimeoutMs());
    const onlineTimeoutMinutes = Math.ceil(getDeviceOnlineTimeoutMs() / 60_000);
    const requestSource = device.lastRequestSource || 'unverified';
    return {
        serialNumber: device.serialNumber,
        deviceName: device.name,
        online,
        connectionLabel: !lastActivity
            ? device.lastRequestType === 'LEGACY_ATTENDANCE_RECORDS'
                ? 'Not recently connected; saved historical records exist'
                : 'No successful device connection recorded'
            : !online
                ? `Offline; no server contact in the last ${onlineTimeoutMinutes} minutes`
                : requestSource === 'likely_simulated'
                    ? 'Recent server contact; request may be simulated'
                    : 'Connected to server recently; device identity unverified',
        lastActivity,
        lastCommunicationAt: lastActivity,
        lastAttendanceReceived: device.lastAttendanceReceived || null,
        totalReceivedRecords: device.totalReceivedRecords || 0,
        totalInsertedRecords: device.totalInsertedRecords || 0,
        lastRequestType: device.lastRequestType || '',
        lastRequestStatus: device.lastRequestStatus || '',
        lastRequestSource: requestSource,
        lastRequestUserAgent: device.lastRequestUserAgent || '',
        lastSuccessfulBatchAt: device.lastSuccessfulBatchAt || null,
        lastSuccessfulSynchronization: null,
        historicalSyncCompletionConfirmed: false,
        run: run ? {
            id: String(run._id),
            status: getAttendanceSyncStatus(run, now),
            requestedAt: run.requestedAt,
            receivedRecords: run.receivedRecords,
            savedRecords: run.savedRecords,
            duplicateRecords: run.duplicateRecords,
            failedRecords: run.failedRecords,
            lastReceivedAt: run.lastReceivedAt || null,
            errorDetails: run.lastErrorDetails || []
        } : null,
        message: 'ADMS attendance is device-push. This action only monitors incoming records; it does not request historical replay.'
    };
}

exports.startEmployeeAttendanceDeviceSync = async (req, res) => {
    try {
        const serialNumber = String(req.body?.serialNumber || '').trim();
        if (!isValidDeviceSerial(serialNumber)) {
            return res.status(400).json({ message: 'Select a valid registered device.' });
        }

        const device = await EmployeeAttendanceDevice.findOne({ serialNumber }).lean();
        if (!device) return res.status(404).json({ message: 'This device has not communicated with the attendance server yet.' });

        const run = await EmployeeAttendanceSyncRun.create({
            serialNumber,
            deviceName: device.name,
            requestedBy: String(req.user?.username || req.user?.teacherName || '').slice(0, 120)
        });
        await EmployeeAttendanceDevice.updateOne({ serialNumber }, { $set: { latestSyncRunId: run._id } });
        const updatedDevice = await EmployeeAttendanceDevice.findOne({ serialNumber }).lean();
        return res.status(202).json(getAttendanceDeviceStatus(updatedDevice, run));
    } catch (error) {
        console.error('Unable to start device attendance monitoring:', error);
        return res.status(500).json({ message: 'Unable to start device attendance monitoring.' });
    }
};

exports.getEmployeeAttendanceDeviceSync = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.runId)) {
            return res.status(400).json({ message: 'Invalid attendance sync reference.' });
        }
        const run = await EmployeeAttendanceSyncRun.findById(req.params.runId).lean();
        if (!run) return res.status(404).json({ message: 'Attendance monitoring session not found.' });
        const device = await EmployeeAttendanceDevice.findOne({ serialNumber: run.serialNumber }).lean();
        if (!device) return res.status(404).json({ message: 'Attendance device not found.' });
        return res.json(getAttendanceDeviceStatus(device, run));
    } catch (error) {
        console.error('Unable to read device attendance monitoring status:', error);
        return res.status(500).json({ message: 'Unable to read device attendance status.' });
    }
};

exports.syncEmployeeToAttendanceDevices = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.employeeId)) {
            return res.status(400).json({ message: 'Invalid employee reference.' });
        }
        if (!isAdmsCommandQueueEnabled()) {
            return res.status(503).json({ message: 'ADMS user commands are disabled until device protocol testing is complete.' });
        }
        const employee = await Staff.findById(req.params.employeeId).lean();
        if (!employee) return res.status(404).json({ message: 'Employee profile not found in this organization database.' });
        if (!isValidAdmsPin(employee.deviceCode)) {
            return res.status(400).json({ message: 'Set a valid unique Device Code / PIN in the employee profile first.' });
        }
        const outcome = await queueEmployeeForConfiguredDevices(employee, req.user?.username || req.user?.teacherName);
        if (!outcome.queued) {
            return res.status(409).json({
                message: outcome.reason || 'No command was queued. Verify that this device supports the requested operation.'
            });
        }
        return res.status(202).json({ message: 'Employee command queued; synchronization is pending device acknowledgement.', queued: outcome.queued });
    } catch (error) {
        console.error('Unable to queue manual employee synchronization:', error);
        return res.status(500).json({ message: 'Unable to queue employee synchronization.' });
    }
};

exports.manualSyncEmployeeTest = async (req, res) => {
    try {
        const outcome = await queueManualEmployeeSyncTest(
            req.params.employeeId,
            req.user?.username || req.user?.teacherName
        );
        if (!outcome.queued) {
            return res.status(outcome.status).json({ message: outcome.message });
        }
        return res.status(202).json({
            message: outcome.commandStatus === 'PENDING'
                ? 'Manual test command queued and awaiting device acknowledgement.'
                : 'An identical manual test command is already pending device acknowledgement.',
            commandId: outcome.commandId,
            status: outcome.commandStatus
        });
    } catch (error) {
        console.error('Unable to queue restricted manual ADMS test sync:', {
            employeeReference: String(req.params.employeeId || ''),
            serialNumber: MANUAL_SYNC_TEST_SERIAL_NUMBER,
            message: error.message
        });
        return res.status(500).json({ message: 'Unable to queue the manual test synchronization.' });
    }
};

exports.retryEmployeeAttendanceDeviceCommand = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.commandId)) {
            return res.status(400).json({ message: 'Invalid command reference.' });
        }
        if (!isAdmsCommandQueueEnabled()) {
            return res.status(503).json({ message: 'ADMS user commands are disabled until device protocol testing is complete.' });
        }
        const organizationId = getOrganizationId();
        const failedCommand = await EmployeeAttendanceDeviceCommand.findOne({
            _id: req.params.commandId,
            organizationId,
            status: 'FAILED'
        }).lean();
        if (!failedCommand) return res.status(404).json({ message: 'Failed device command not found in this organization.' });
        const [employee, device] = await Promise.all([
            Staff.findById(failedCommand.employeeReference).lean(),
            EmployeeAttendanceDevice.findOne({
                organizationId,
                serialNumber: failedCommand.serialNumber
            }).lean()
        ]);
        if (!employee || !device) return res.status(404).json({ message: 'Employee or device is no longer available.' });
        const employeeIsActive = getDeviceEmployeeActiveState(employee);
        const shouldDeletePreviousPin = failedCommand.commandType === COMMAND_TYPES.DELETE_USER
            && failedCommand.deviceCode !== String(employee.deviceCode || '').trim();
        const commandDeviceCode = !employeeIsActive || shouldDeletePreviousPin
            ? failedCommand.deviceCode
            : String(employee.deviceCode || '').trim();
        const command = !employeeIsActive || shouldDeletePreviousPin
            ? buildUserInfoDeleteCommand(commandDeviceCode)
            : buildUserInfoUpdateCommand(employee);
        if (!isValidAdmsPin(commandDeviceCode)) {
            return res.status(400).json({ message: 'The current employee Device Code / PIN is invalid.' });
        }
        const retry = await queueAdmsEmployeeCommand(device, employee, {
            ...command,
            deviceCode: commandDeviceCode
        }, req.user?.username || req.user?.teacherName);
        if (!retry) return res.status(409).json({ message: 'This device is not configured for the failed command type.' });
        return res.status(202).json({ message: 'Retry command queued and awaiting device acknowledgement.', commandId: retry.commandId });
    } catch (error) {
        console.error('Unable to retry ADMS employee command:', error);
        return res.status(500).json({ message: 'Unable to retry the employee device command.' });
    }
};

exports.getEmployeeAttendanceDeviceCommandHistory = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.employeeId)) {
            return res.status(400).json({ message: 'Invalid employee reference.' });
        }
        const commands = await EmployeeAttendanceDeviceCommand.find({
            organizationId: getOrganizationId(),
            employeeReference: req.params.employeeId
        }).sort({ createdAt: -1 }).limit(50).select(
            'serialNumber commandId commandType status createdAt sentAt acknowledgedAt attempts lastError responsePayload privilege deviceCode'
        ).lean();
        const enrollments = await EmployeeAttendanceManualEnrollment.find({
            organizationId: getOrganizationId(),
            employeeReference: req.params.employeeId
        }).sort({ confirmedAt: -1 }).limit(20).select(
            'serialNumber deviceCode confirmedBy confirmedAt employeeName'
        ).lean();
        return res.json({
            commands,
            manualEnrollments: enrollments,
            remoteFingerprintEnrollment: 'UNVERIFIED'
        });
    } catch (error) {
        console.error('Unable to load employee device command history:', error);
        return res.status(500).json({ message: 'Unable to load device command history.' });
    }
};

exports.confirmManualEmployeeFingerprintEnrollment = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.employeeId)) {
            return res.status(400).json({ message: 'Invalid employee reference.' });
        }
        const organizationId = getOrganizationId();
        const serialNumber = String(req.body?.serialNumber || '').trim();
        if (!isValidDeviceSerial(serialNumber)) return res.status(400).json({ message: 'Select a valid registered device.' });
        if (String(req.body?.confirmed || '') !== 'true') {
            return res.status(400).json({ message: 'Confirm that the fingerprint was enrolled directly on the selected terminal.' });
        }
        const [employee, device] = await Promise.all([
            Staff.findById(req.params.employeeId).lean(),
            EmployeeAttendanceDevice.findOne({ serialNumber })
        ]);
        if (!employee || !device || (device.organizationId && device.organizationId !== organizationId)) {
            return res.status(404).json({ message: 'Employee or device not found in this organization.' });
        }
        if (!isValidAdmsPin(employee.deviceCode)) return res.status(400).json({ message: 'Configure a valid Device Code / PIN before enrollment.' });
        if (!getDeviceEmployeeActiveState(employee)) return res.status(409).json({ message: 'Inactive employees cannot be enrolled.' });

        device.organizationId = organizationId;
        await device.save();
        const enrollment = await EmployeeAttendanceManualEnrollment.create({
            organizationId,
            serialNumber,
            employeeReference: employee._id,
            employeeName: employee.staffName,
            deviceCode: employee.deviceCode,
            confirmedBy: String(req.user?.username || req.user?.teacherName || 'Administrator').slice(0, 120)
        });
        console.info('Manual fingerprint enrollment recorded by administrator:', {
            organizationId,
            serialNumber,
            employeeReference: String(employee._id),
            enrollmentId: String(enrollment._id)
        });
        return res.status(201).json({ message: 'Manual fingerprint enrollment recorded. It was not remotely verified.', status: 'MANUALLY_ENROLLED' });
    } catch (error) {
        console.error('Unable to record manual fingerprint enrollment:', error);
        return res.status(500).json({ message: 'Unable to record manual enrollment confirmation.' });
    }
};

exports.configureEmployeeAttendanceDeviceCapabilities = async (req, res) => {
    try {
        const organizationId = getOrganizationId();
        const serialNumber = String(req.params.serialNumber || '').trim();
        if (!isValidDeviceSerial(serialNumber)) return res.status(400).json({ message: 'Invalid device serial number.' });
        const device = await EmployeeAttendanceDevice.findOne({ serialNumber });
        if (!device || (device.organizationId && device.organizationId !== organizationId)) {
            return res.status(404).send('Device not found in this organization database.');
        }

        device.organizationId = organizationId;
        device.model = String(req.body?.model || '').trim().slice(0, 80);
        device.firmwareVersion = String(req.body?.firmwareVersion || '').trim().slice(0, 80);
        const isEnabled = value => value === true || value === 'true';
        device.supportsUserSyncCommands = isEnabled(req.body?.supportsUserSyncCommands);
        device.supportsUserDeletion = isEnabled(req.body?.supportsUserDeletion);
        device.supportsManagerPrivilege = isEnabled(req.body?.supportsManagerPrivilege);
        await device.save();
        console.info('ADMS device capabilities updated:', {
            organizationId,
            serialNumber,
            model: device.model,
            firmwareVersion: device.firmwareVersion,
            supportsUserSyncCommands: device.supportsUserSyncCommands,
            supportsUserDeletion: device.supportsUserDeletion,
            supportsManagerPrivilege: device.supportsManagerPrivilege,
            commandQueueEnabled: isAdmsCommandQueueEnabled()
        });
        return res.redirect('/employeedata?deviceConfigured=1');
    } catch (error) {
        console.error('Unable to configure ADMS device capabilities:', error);
        return res.status(500).send('Unable to save device capability settings.');
    }
};

exports.getAdmsDeviceCommand = async (req, res) => {
    const serialNumber = String(req.query.SN || '').trim();
    const receivedAt = new Date();
    if (!isValidDeviceSerial(serialNumber)) return res.status(400).type('text/plain').send('Invalid or missing device serial number');
    try {
        const organizationId = getOrganizationId();
        const device = await EmployeeAttendanceDevice.findOne({ serialNumber }).lean();
        if (!device || (device.organizationId && device.organizationId !== organizationId)) {
            return res.status(404).type('text/plain').send('Unknown device');
        }
        const request = await startAttendanceDeviceRequest(serialNumber, req, 'GET_COMMAND_REQUEST', receivedAt, false);
        const globalQueueEnabled = isAdmsCommandQueueEnabled();
        const manualTestPollFilter = !globalQueueEnabled && isManualAdmsSyncTestEnabled()
            ? getManualTestPollFilter(serialNumber)
            : null;
        const deviceCanReceiveCommands = device.supportsUserSyncCommands || device.supportsUserDeletion;
        if (
            !request.activityUpdateSucceeded
            || (globalQueueEnabled && !deviceCanReceiveCommands)
            || (!globalQueueEnabled && !manualTestPollFilter)
        ) {
            await finishAttendanceDeviceRequest(serialNumber, request.requestDetails, 'no-command');
            return res.type('text/plain').send('OK');
        }

        const eligibleCommandFilter = globalQueueEnabled
            ? {
                commandType: {
                    $in: [
                        ...(device.supportsUserSyncCommands ? [COMMAND_TYPES.UPDATE_USER] : []),
                        ...(device.supportsUserDeletion ? [COMMAND_TYPES.DELETE_USER] : [])
                    ]
                }
            }
            : manualTestPollFilter;
        const oldestSent = await EmployeeAttendanceDeviceCommand.findOne({
            organizationId,
            serialNumber,
            status: 'SENT',
            ...eligibleCommandFilter
        }).sort({ createdAt: 1 }).lean();
        let command = oldestSent;
        if (oldestSent) {
            const retryDelayMs = 2 * 60_000;
            const maxAttempts = 3;
            const sentAt = oldestSent.sentAt ? new Date(oldestSent.sentAt).getTime() : 0;
            if (receivedAt.getTime() - sentAt >= retryDelayMs) {
                if (oldestSent.attempts >= maxAttempts) {
                    await EmployeeAttendanceDeviceCommand.updateOne(
                        { _id: oldestSent._id, status: 'SENT', attempts: { $gte: maxAttempts } },
                        { $set: { status: 'FAILED', lastError: 'No device acknowledgement after bounded delivery retries.' } }
                    );
                    command = null;
                } else {
                    command = await EmployeeAttendanceDeviceCommand.findOneAndUpdate(
                        { _id: oldestSent._id, status: 'SENT', sentAt: oldestSent.sentAt },
                        { $set: { sentAt: receivedAt }, $inc: { attempts: 1 } },
                        { new: true }
                    ).lean();
                    if (!command) {
                        command = await EmployeeAttendanceDeviceCommand.findOne({
                            _id: oldestSent._id,
                            status: 'SENT',
                            organizationId,
                            serialNumber,
                            ...eligibleCommandFilter
                        }).lean();
                    }
                }
            }
        }
        if (!command && oldestSent && receivedAt.getTime() - new Date(oldestSent.sentAt || 0).getTime() < 2 * 60_000) {
            command = await EmployeeAttendanceDeviceCommand.findOne({
                _id: oldestSent._id,
                status: 'SENT',
                organizationId,
                serialNumber,
                ...eligibleCommandFilter
            }).lean();
        }

        if (!command) {
            command = await EmployeeAttendanceDeviceCommand.findOneAndUpdate(
                {
                    organizationId,
                    serialNumber,
                    status: 'PENDING',
                    ...eligibleCommandFilter
                },
                { $set: { status: 'SENT', sentAt: receivedAt, lastError: '' }, $inc: { attempts: 1 } },
                { sort: { createdAt: 1 }, new: true }
            ).lean();
        }
        if (!command) {
            await finishAttendanceDeviceRequest(serialNumber, request.requestDetails, 'no-command');
            return res.type('text/plain').send('OK');
        }
        const response = formatAdmsCommandResponse(command);
        console.info('ADMS employee command delivered to device poll:', {
            organizationId,
            serialNumber,
            commandId: command.commandId,
            commandType: command.commandType,
            manualTest: command.manualTest === true,
            attempt: command.attempts
        });
        await finishAttendanceDeviceRequest(serialNumber, request.requestDetails, 'command-sent');
        return res.type('text/plain').send(response);
    } catch (error) {
        console.error('Unable to service ADMS command poll:', {
            serialNumber,
            message: error.message
        });
        return res.status(500).type('text/plain').send('Unable to process device command request');
    }
};

exports.receiveAdmsDeviceCommandResult = async (req, res) => {
    const serialNumber = String(req.query.SN || '').trim();
    const receivedAt = new Date();
    if (!isValidDeviceSerial(serialNumber)) return res.status(400).type('text/plain').send('Invalid or missing device serial number');
    const result = parseDeviceCommandResult(req.body);
    if (!result) return res.status(400).type('text/plain').send('Invalid device command result');
    try {
        const organizationId = getOrganizationId();
        const device = await EmployeeAttendanceDevice.findOne({ serialNumber }).lean();
        if (!device || (device.organizationId && device.organizationId !== organizationId)) {
            return res.status(404).type('text/plain').send('Unknown device');
        }
        const request = await startAttendanceDeviceRequest(serialNumber, req, 'POST_DEVICE_COMMAND_RESULT', receivedAt, false);
        if (!request.activityUpdateSucceeded) return res.status(500).type('text/plain').send('Unable to record device communication');

        const status = getCommandAcknowledgementStatus(result.returnCode);
        const success = status === 'SUCCESS';
        const updated = await EmployeeAttendanceDeviceCommand.updateOne(
            {
                organizationId,
                serialNumber,
                commandId: result.commandId,
                $or: [{ status: 'SENT' }, { status: 'FAILED', acknowledgedAt: { $exists: false } }]
            },
            {
                $set: {
                    status: success ? 'SUCCESS' : 'FAILED',
                    acknowledgedAt: receivedAt,
                    lastError: success ? '' : `Device returned code ${result.returnCode}.`,
                    responsePayload: result.responsePayload
                }
            }
        );
        if (!updated.matchedCount) {
            const alreadyAcknowledged = await EmployeeAttendanceDeviceCommand.exists({
                organizationId,
                serialNumber,
                commandId: result.commandId,
                acknowledgedAt: { $exists: true }
            });
            if (!alreadyAcknowledged) {
                console.warn('ADMS returned a result for an unknown or unclaimed command:', {
                    organizationId,
                    serialNumber,
                    commandId: result.commandId,
                    returnCode: result.returnCode
                });
            }
        } else {
            console.info('ADMS employee command result received:', {
                organizationId,
                serialNumber,
                commandId: result.commandId,
                returnCode: result.returnCode,
                status: success ? 'SUCCESS' : 'FAILED'
            });
            if (!success) {
                console.warn('ADMS device rejected employee command:', {
                    organizationId,
                    serialNumber,
                    commandId: result.commandId,
                    failureReason: `Device returned code ${result.returnCode}.`
                });
            }
        }
        await finishAttendanceDeviceRequest(serialNumber, request.requestDetails, 'command-result');
        return res.status(200).type('text/plain').send('OK');
    } catch (error) {
        console.error('Unable to process ADMS device command result:', {
            serialNumber,
            commandId: result.commandId,
            message: error.message
        });
        return res.status(500).type('text/plain').send('Unable to process device command result');
    }
};

exports.checkEmployeeAttendanceDeviceConnection = async (req, res) => {
    try {
        const serialNumber = String(req.params.serialNumber || '').trim();
        if (!isValidDeviceSerial(serialNumber)) {
            return res.status(400).json({ message: 'Invalid device serial number.' });
        }

        const device = await EmployeeAttendanceDevice.findOne({ serialNumber }).lean();
        if (!device) return res.status(404).json({ message: 'No device request has reached the attendance server for this serial number.' });

        const run = device.latestSyncRunId
            ? await EmployeeAttendanceSyncRun.findById(device.latestSyncRunId).lean()
            : null;
        return res.json({
            checkedAt: new Date(),
            ...getAttendanceDeviceStatus(device, run)
        });
    } catch (error) {
        console.error('Unable to check attendance device connection:', error);
        return res.status(500).json({ message: 'Unable to check the device connection status.' });
    }
};

exports.getEmployeeAttendanceDeviceOptions = async (req, res) => {
    const receivedAt = new Date();
    const serialNumber = String(req.query.SN || '').trim();
    if (!isValidDeviceSerial(serialNumber)) {
        console.warn('ADMS options request missing a valid query-string serial number:', {
            requestTimestamp: receivedAt.toISOString(),
            remoteAddress: String(req.ip || req.socket?.remoteAddress || ''),
            userAgent: String(req.get('user-agent') || '').slice(0, 200)
        });
        return res.status(400).type('text/plain').send('Invalid or missing device serial number');
    }

    try {
        const options = [
            `GET OPTION FROM: ${serialNumber}`,
            'Stamp=9999',
            'OpStamp=9999',
            'PhotoStamp=9999',
            'ErrorDelay=30',
            'Delay=10',
            'TransTimes=00:00;14:05',
            'TransInterval=1',
            'TransFlag=1111000000',
            'Realtime=1',
            'Encrypt=0',
            'ATTLOGStamp=9999'
        ].join('\r\n');
        const { requestDetails } = await startAttendanceDeviceRequest(
            serialNumber,
            req,
            'GET_OPTIONS',
            receivedAt,
            false
        );
        await finishAttendanceDeviceRequest(serialNumber, requestDetails, 'responded');
        console.info('ADMS device options response prepared:', {
            serialNumber,
            requestTimestamp: receivedAt.toISOString(),
            requestSource: requestDetails.requestSource
        });
        return res.type('text/plain').send(`${options}\r\n`);
    } catch (error) {
        console.error('Unable to respond to ZKTeco device options request:', {
            serialNumber,
            message: error.message
        });
        return res.status(500).type('text/plain').send('Unable to provide device options');
    }
};

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) || formatDateKey(date) !== value ? null : date;
}

function parseNepaliDateKey(value) {
    const nepaliDate = normalizeNepaliDigits(value).trim();
    const match = nepaliDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    const normalizedDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

    try {
        const converted = bs.BSToAD(normalizedDate);
        const englishDate = converted instanceof Date
            ? formatDateKey(converted)
            : String(converted || '').trim().slice(0, 10);
        const parsedDate = parseDateKey(englishDate);
        if (!parsedDate || String(bs.ADToBS(parsedDate) || '').trim().slice(0, 10) !== normalizedDate) return null;
        return parsedDate;
    } catch (error) {
        return null;
    }
}

function formatPunchTime(value) {
    return value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatDurationMinutes(minutes) {
    const totalMinutes = Math.max(0, Number(minutes) || 0);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getNepaliDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    try {
        return String(bs.ADToBS(date) || '').trim();
    } catch (error) {
        return formatDateKey(date);
    }
}

function normalizeEmployeeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function buildEmployeeAttendanceReport(queryParams) {
    const todayBs = getNepaliDate(new Date()).slice(0, 10);
    const legacyStart = queryParams.startDate ? parseDateKey(queryParams.startDate) : null;
    const legacyEnd = queryParams.endDate ? parseDateKey(queryParams.endDate) : null;
    const requestedStartBs = queryParams.startDateBs || getNepaliDate(legacyStart).slice(0, 10) || queryParams.endDateBs || getNepaliDate(legacyEnd).slice(0, 10) || todayBs;
    const requestedEndBs = queryParams.endDateBs || getNepaliDate(legacyEnd).slice(0, 10) || queryParams.startDateBs || getNepaliDate(legacyStart).slice(0, 10) || todayBs;
    const start = queryParams.startDateBs ? parseNepaliDateKey(requestedStartBs) : queryParams.startDate ? legacyStart : parseNepaliDateKey(requestedStartBs);
    const end = queryParams.endDateBs ? parseNepaliDateKey(requestedEndBs) : queryParams.endDate ? legacyEnd : parseNepaliDateKey(requestedEndBs);

    if (!start || !end || start > end) {
        const error = new Error('Enter valid Bikram Sambat dates and ensure the start date is not after the end date.');
        error.status = 400;
        throw error;
    }

    const dayCount = Math.floor((end - start) / 86400000) + 1;
    if (dayCount > 366) {
        const error = new Error('Choose a date range of 366 days or less.');
        error.status = 400;
        throw error;
    }

    const dates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        dates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    const from = new Date(start);
    from.setHours(0, 0, 0, 0);
    const through = new Date(end);
    through.setHours(23, 59, 59, 999);
console.log('=== EMPLOYEE ATTENDANCE DATE DEBUG ===');
console.log('Requested BS start:', requestedStartBs);
console.log('Requested BS end:', requestedEndBs);
console.log('Converted start:', start.toString());
console.log('Converted start ISO:', start.toISOString());
console.log('Converted end:', end.toString());
console.log('Converted end ISO:', end.toISOString());
console.log('Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Mongo query from:', from.toISOString());
console.log('Mongo query through:', through.toISOString());
    const startDateBs = getNepaliDate(start).slice(0, 10);
    const endDateBs = getNepaliDate(end).slice(0, 10);
    const reportDatesBs = dates.map(date => getNepaliDate(date).slice(0, 10));
    const [employees, punches, approvedLeaves, employeeHolidays] = await Promise.all([
        getEmployeeProfiles(),
        employeeAttendance.find({ punchTime: { $gte: from, $lte: through } }).sort({ punchTime: 1 }).lean(),
        LeaveApplication.find({
            status: 'approved',
            startDateNepali: { $lte: endDateBs },
            endDateNepali: { $gte: startDateBs }
        }).select('employeeName leaveTypeName isPaid startDateNepali endDateNepali').lean(),
        EmployeeWeekend.find({ dateBs: { $in: reportDatesBs } }).select('dateBs name').lean()
    ]);
    const employeeHolidaysByDate = new Map(employeeHolidays.map(item => [item.dateBs, item.name]));

    const employeeByCode = new Map();
    employees.forEach(employee => {
        const codes = getEmployeeAttendanceCodes(employee);
        codes.forEach(code => {
            if (!employeeByCode.has(code)) employeeByCode.set(code, employee);
            else {
                const existingEmployee = employeeByCode.get(code);
                if (existingEmployee && String(existingEmployee._id) !== String(employee._id)) {
                    employeeByCode.set(code, null);
                }
            }
        });
    });

    const punchesByDateAndCode = new Map();
    punches.forEach(punch => {
        const key = `${formatDateKey(new Date(punch.punchTime))}|${String(punch.pin || '').trim().toUpperCase()}`;
        if (!punchesByDateAndCode.has(key)) punchesByDateAndCode.set(key, []);
        punchesByDateAndCode.get(key).push(punch);
    });

    const leavesByEmployeeName = new Map();
    approvedLeaves.forEach(leave => {
        const name = normalizeEmployeeName(leave.employeeName);
        if (!leavesByEmployeeName.has(name)) leavesByEmployeeName.set(name, []);
        leavesByEmployeeName.get(name).push(leave);
    });

    const reportRows = [];
    dates.forEach(date => {
        const dateKey = formatDateKey(date);
        const codesForDate = new Set(employees
            .map(employee => getEmployeeAttendanceCodes(employee)[0])
            .filter(Boolean));
        punches.forEach(punch => {
            const code = normalizeAttendancePin(punch.pin);
            if (formatDateKey(new Date(punch.punchTime)) === dateKey && !employeeByCode.has(code)) {
                codesForDate.add(code);
            }
        });

        Array.from(codesForDate).sort().forEach(code => {
            const employee = employeeByCode.get(code) || {};
            const attendanceCodes = employee._id ? getEmployeeAttendanceCodes(employee) : [code];
            const dayPunches = attendanceCodes.flatMap(attendanceCode =>
                punchesByDateAndCode.get(`${dateKey}|${attendanceCode}`) || []
            );
            const employeeName = employee.staffName || dayPunches.find(punch => punch.name)?.name || 'Employee not mapped';
            const storedHolidayPunch = dayPunches.find(punch => punch.isHoliday && punch.holidayName);
            const holidayName = employeeHolidaysByDate.get(getNepaliDate(date).slice(0, 10)) || storedHolidayPunch?.holidayName || '';
            const isHoliday = Boolean(holidayName);
            const attendancePunches = dayPunches.filter(punch => formatPunchTime(new Date(punch.punchTime)) !== '00:00');
            const { checkIn, checkOut } = classifyPunchesByMidTime(attendancePunches, getEmployeeMidTime(employee));
            const actualIn = checkIn ? formatPunchTime(new Date(checkIn.punchTime)) : '';
            const actualOut = checkOut ? formatPunchTime(new Date(checkOut.punchTime)) : '';
            const plannedIn = employee.plannedIn || '09:00';
            const plannedOut = employee.plannedOut || '17:00';
            const plannedInMinutes = getMinutes(plannedIn);
            const plannedOutMinutes = getMinutes(plannedOut);
            const actualInMinutes = getMinutes(actualIn);
            const actualOutMinutes = getMinutes(actualOut);
            const lateMinutes = !isHoliday && actualInMinutes !== null && plannedInMinutes !== null
                ? Math.max(0, actualInMinutes - plannedInMinutes) : 0;
            const earlyMinutes = !isHoliday && actualOutMinutes !== null && plannedOutMinutes !== null
                ? Math.max(0, plannedOutMinutes - actualOutMinutes) : 0;
            const missing = [];
            const bothPunchesMissing = !actualIn && !actualOut;
            const leaveForDate = (leavesByEmployeeName.get(normalizeEmployeeName(employeeName)) || [])
                .find(leave => leave.startDateNepali <= getNepaliDate(date).slice(0, 10) && leave.endDateNepali >= getNepaliDate(date).slice(0, 10));
            const countedLeave = bothPunchesMissing && !isHoliday ? leaveForDate : null;

            if (!actualIn && !isHoliday) missing.push('Missed morning');
            if (!actualOut && !isHoliday) missing.push('Missed evening');

            reportRows.push({
                date: dateKey,
                nepaliDate: getNepaliDate(date),
                employeeCode: employee.employeeCode || code || '-',
                employeeName,
                branchName: employee.branchName || '-',
                department: employee.department || '-',
                plannedIn,
                plannedOut,
                actualIn: actualIn || (isHoliday ? holidayName : 'Missed morning'),
                actualOut: actualOut || (isHoliday ? holidayName : 'Missed evening'),
                lateInStatus: isHoliday ? holidayName : actualIn ? lateMinutes ? `Late by ${lateMinutes} min` : 'On time' : 'Missed morning',
                earlyOutStatus: isHoliday ? holidayName : actualOut ? earlyMinutes ? `Early by ${earlyMinutes} min` : 'On time' : 'Missed evening',
                leaveType: countedLeave ? `${countedLeave.leaveTypeName} / ${countedLeave.isPaid ? 'Paid' : 'Unpaid'}` : '-',
                remarks: isHoliday
                    ? bothPunchesMissing ? `Holiday: ${holidayName}` : `Worked on holiday: ${holidayName}`
                    : countedLeave
                    ? `Leave: ${countedLeave.leaveTypeName} / ${countedLeave.isPaid ? 'Paid' : 'Unpaid'}`
                    : bothPunchesMissing ? 'Absent' : missing.length ? missing.join('; ') : 'Present',
                lateMinutes,
                earlyMinutes,
                isHoliday,
                holidayName
            });
        });
    });

    return {
        reportRows,
        startDate: formatDateKey(start),
        endDate: formatDateKey(end),
        startDateBs,
        endDateBs
    };
}

/** Display the daily employee report with optional date filtering. */
async function registerDevicesFromLegacyAttendance() {
    const serialNumbers = await employeeAttendance.distinct('sn', {
        source: 'Device',
        sn: { $type: 'string', $nin: ['', 'MANUAL', 'CSV_IMPORT'] }
    });

    for (const serialNumber of serialNumbers) {
        if (!isValidDeviceSerial(serialNumber)) continue;
        const alreadyRegistered = await EmployeeAttendanceDevice.exists({ serialNumber });
        if (alreadyRegistered) continue;

        const storedPunchCount = await employeeAttendance.countDocuments({
            sn: serialNumber,
            source: 'Device'
        });
        try {
            const result = await EmployeeAttendanceDevice.updateOne(
                { serialNumber },
                {
                    $setOnInsert: {
                        serialNumber,
                        name: `ZKTeco device ${serialNumber}`,
                        totalReceivedRecords: storedPunchCount,
                        totalInsertedRecords: storedPunchCount,
                        lastRequestType: 'LEGACY_ATTENDANCE_RECORDS',
                        lastRequestStatus: 'historical records found; current activity not observed',
                        lastRequestSource: 'unverified'
                    }
                },
                { upsert: true, setDefaultsOnInsert: false }
            );
            if (result.upsertedCount) {
                console.info('Registered device from existing attendance records; current activity is unknown:', {
                    serialNumber,
                    storedPunchCount
                });
            }
        } catch (error) {
            if (error.code !== 11000) {
                console.error('Unable to register device from existing attendance records:', {
                    serialNumber,
                    message: error.message
                });
            }
        }
    }
}

exports.getEmployeeAttendance = async (req, res) => {
    try {
        await registerDevicesFromLegacyAttendance();
        const [report, devices] = await Promise.all([
            buildEmployeeAttendanceReport(req.query),
            EmployeeAttendanceDevice.find().sort({ lastActivity: -1, lastCommunicationAt: -1 }).limit(50).lean()
        ]);
        const latestRunIds = devices.map(device => device.latestSyncRunId).filter(Boolean);
        const latestRuns = latestRunIds.length
            ? await EmployeeAttendanceSyncRun.find({ _id: { $in: latestRunIds } }).lean()
            : [];
        const runsById = new Map(latestRuns.map(run => [String(run._id), run]));
        const attendanceDevices = devices.map(device => ({
            ...getAttendanceDeviceStatus(device, runsById.get(String(device.latestSyncRunId || ''))),
            serialNumber: device.serialNumber
        }));
        return res.render('employee/employeeattendance', {
            ...report,
            deviceSN: req.query.SN || '',
            attendanceDevices,
            importMessage: req.query.imported
                ? `${req.query.importRows || 0} rows processed; ${req.query.imported} new attendance punches saved.`
                : '',
            importError: String(req.query.importError || ''),
            isAdmin: true
        });
    } catch (error) {
        console.error('getEmployeeAttendance error:', error);
        return res.status(error.status || 500).send(error.message || 'Unable to load attendance.');
    }
};

exports.downloadEmployeeAttendanceCsvTemplate = (req, res) => {
    const csv = employeeAttendanceCsvHeaders.map(header => `"${header.replace(/"/g, '""')}"`).join(',');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-attendance-template.csv"');
    return res.send(`\uFEFF${csv}\r\n`);
};

exports.downloadEmployeeProfileCsvTemplate = (req, res) => {
    const csv = employeeProfileCsvHeaders.map(header => `"${header.replace(/"/g, '""')}"`).join(',');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-profile-template.csv"');
    return res.send(`\uFEFF${csv}\r\n`);
};

const parseEmployeeAttendanceCsv = buffer => new Promise((resolve, reject) => {
    const rows = [];
    let headers = [];
    const parser = csvParser({
        mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim()
    });
    parser.on('headers', parsedHeaders => { headers = parsedHeaders; });
    parser.on('data', row => rows.push(row));
    parser.on('end', () => resolve({ headers, rows }));
    parser.on('error', reject);
    Readable.from([buffer]).pipe(parser);
});

const parseEmployeeProfileCsv = buffer => new Promise((resolve, reject) => {
    const rows = [];
    let headers = [];
    const parser = csvParser({
        mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim()
    });
    parser.on('headers', parsedHeaders => { headers = parsedHeaders; });
    parser.on('data', row => rows.push(row));
    parser.on('end', () => resolve({ headers, rows }));
    parser.on('error', error => reject(new Error(`CSV parsing failed near row ${rows.length + 2}: ${error.message}`)));
    Readable.from([buffer]).pipe(parser);
});

const setEmployeeCsvPath = (target, field, value) => {
    const segments = field.split('.');
    let current = target;
    segments.slice(0, -1).forEach(segment => {
        current[segment] ||= {};
        current = current[segment];
    });
    current[segments[segments.length - 1]] = value;
};

const parseEmployeeCsvCell = (header, rawValue, rowNumber) => {
    const value = String(rawValue ?? '').trim();
    const canonicalHeader = employeeProfileCsvAliases[header] || header;
    const schemaPath = canonicalHeader === 'dateOfJoiningBs' ? 'dateOfJoining'
        : canonicalHeader === 'dateOfBirthBs' ? 'dateOfBirth'
            : canonicalHeader;
    const schemaType = staffSchema.path(schemaPath);
    if (!schemaType) throw new Error(`Unknown column "${header}".`);

    if (!value) {
        if (schemaType.enumValues?.length) return undefined;
        if (schemaType.instance === 'Array') return [];
        if (schemaType.$isSingleNested) return {};
        if (schemaType.instance === 'Number' || schemaType.instance === 'Date' || schemaType.instance === 'ObjectId' || schemaType.instance === 'ObjectID') return null;
        if (schemaType.instance === 'Boolean') return false;
        return '';
    }

    if (canonicalHeader === 'dateOfJoiningBs' || canonicalHeader === 'dateOfBirthBs') {
        const date = convertNepaliDateToAD(value);
        if (!date) throw new Error(`${header} must be a valid Bikram Sambat date (YYYY-MM-DD).`);
        return date;
    }

    if (schemaType.instance === 'Array' || schemaType.$isSingleNested) {
        let parsed;
        try {
            parsed = JSON.parse(value);
        } catch (error) {
            throw new Error(`${header} must contain valid JSON.`);
        }
        if (schemaType.instance === 'Array' && !Array.isArray(parsed)) {
            throw new Error(`${header} must contain a JSON array.`);
        }
        if (schemaType.$isSingleNested && (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')) {
            throw new Error(`${header} must contain a JSON object.`);
        }
        return parsed;
    }

    if (schemaType.instance === 'Number') {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`${header} must be a valid number.`);
        return number;
    }
    if (schemaType.instance === 'Boolean') {
        if (/^(true|1|yes)$/i.test(value)) return true;
        if (/^(false|0|no)$/i.test(value)) return false;
        throw new Error(`${header} must be true/false, yes/no, or 1/0.`);
    }
    if (schemaType.instance === 'Date') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new Error(`${header} must be a valid date.`);
        return date;
    }
    if (schemaType.instance === 'ObjectId' || schemaType.instance === 'ObjectID') {
        if (!mongoose.isValidObjectId(value)) throw new Error(`${header} must be a valid employee ID.`);
        return new mongoose.Types.ObjectId(value);
    }
    return value;
};

const employeeCsvRowToDocument = (row, headers, rowNumber) => {
    const employeeData = {};
    headers.forEach(header => {
        const value = parseEmployeeCsvCell(header, row[header], rowNumber);
        if (value === undefined) return;
        const canonicalHeader = employeeProfileCsvAliases[header] || header;
        const schemaPath = canonicalHeader === 'dateOfJoiningBs' ? 'dateOfJoining'
            : canonicalHeader === 'dateOfBirthBs' ? 'dateOfBirth'
                : canonicalHeader;
        setEmployeeCsvPath(employeeData, schemaPath, value);
    });

    if (!String(employeeData.staffName || '').trim()) throw new Error('staffName is required.');
    if (employeeData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(employeeData.email))) {
        throw new Error('email must be a valid email address.');
    }
    if (!employeeData.employeeCode) delete employeeData.employeeCode;
    return employeeData;
};

exports.importEmployeeProfileCsv = async (req, res) => {
    const importResult = { importedCount: 0, totalRows: 0, errors: [] };
    try {
        if (!req.file) throw new Error('Choose an employee profile CSV file to upload.');
        const { headers, rows: parsedRows } = await parseEmployeeProfileCsv(req.file.buffer);
        const rows = parsedRows.filter(row => Object.values(row).some(value => String(value || '').trim()));
        importResult.totalRows = rows.length;

        const repeatedHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
        if (repeatedHeaders.length) throw new Error(`CSV contains duplicate columns: ${[...new Set(repeatedHeaders)].join(', ')}.`);
        const unknownHeaders = headers.filter(header => !employeeProfileCsvHeaders.includes(header) && !employeeProfileCsvAliases[header]);
        if (unknownHeaders.length) throw new Error(`CSV contains unknown columns: ${unknownHeaders.join(', ')}.`);
        const missingHeaders = employeeProfileCsvRequiredHeaders.filter(header => !headers.includes(header));
        if (missingHeaders.length) throw new Error(`CSV is missing required columns: ${missingHeaders.join(', ')}.`);
        if (!rows.length) throw new Error('The CSV contains no employee profile rows.');
        if (rows.length > 1000) throw new Error('Upload no more than 1,000 employee profiles at a time.');

        for (const [index, row] of rows.entries()) {
            const rowNumber = index + 2;
            try {
                if (Array.isArray(row.__parsed_extra) && row.__parsed_extra.length) {
                    throw new Error('row has more values than the CSV header.');
                }
                const employeeData = employeeCsvRowToDocument(row, headers, rowNumber);
                const duplicateField = await findDuplicateEmployeeIdentifier(employeeData);
                if (duplicateField) {
                    const label = duplicateField === 'employeeCode' ? 'Employee code' : 'Device code';
                    throw new Error(`${label} is already in use.`);
                }
                const employee = new Staff(employeeData);
                await employee.validate();
                await employee.save();
                await safelyQueueEmployeeSync(employee.toObject(), req.user?.username || req.user?.teacherName, 'csv-created');
                importResult.importedCount += 1;
            } catch (error) {
                const validationMessages = error.errors
                    ? Object.values(error.errors).map(item => `${item.path}: ${item.message}`).join('; ')
                    : error.message;
                importResult.errors.push({ row: rowNumber, message: validationMessages || 'Unable to save this profile.' });
            }
        }

        return await renderEmployeeDetails(res, { newEmployee: true, importResult });
    } catch (error) {
        console.error('Unable to import employee profiles:', error);
        return renderEmployeeDetails(res, {
            newEmployee: true,
            error: error.message || 'Unable to import employee profiles.',
            importResult
        });
    }
};

const parseAttendanceCsvTime = (value, rowNumber, label) => {
    const text = String(value || '').trim();
    if (!text || /^missed\b/i.test(text)) return null;
    const match = text.match(/^(0?[0-9]|1[0-9]|2[0-3]):([0-5]\d)$/);
    if (!match) throw new Error(`Row ${rowNumber}: ${label} must use H:mm or HH:mm format.`);
    return `${match[1].padStart(2, '0')}:${match[2]}`;
};

exports.importEmployeeAttendanceCsv = async (req, res) => {
    try {
        if (!req.file) throw new Error('Choose an attendance CSV file to upload.');
        const { headers, rows: parsedRows } = await parseEmployeeAttendanceCsv(req.file.buffer);
        const rows = parsedRows.filter(row => Object.values(row).some(value => String(value || '').trim()));
        const requiredHeaders = ['Date (BS)', 'Actual in', 'Actual out'];
        if (!headers.includes('Code') && !headers.includes('Employee code')) requiredHeaders.push('Code');
        const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
        if (missingHeaders.length) throw new Error(`CSV is missing required columns: ${missingHeaders.join(', ')}.`);
        if (!rows.length) throw new Error('The CSV contains no attendance rows.');
        if (rows.length > 5000) throw new Error('Upload no more than 5,000 attendance rows at a time.');

        const holidayDateKeys = [...new Set(rows.map(row => {
            const date = parseNepaliDateKey(row['Date (BS)']);
            return date ? getNepaliDate(date).slice(0, 10) : '';
        }).filter(Boolean))];
        const employeeHolidays = await EmployeeWeekend.find({ dateBs: { $in: holidayDateKeys } }).select('dateBs name').lean();
        const employeeHolidaysByDate = new Map(employeeHolidays.map(item => [item.dateBs, item.name]));

        const employees = await getEmployeeProfiles();
        const employeesByCode = new Map(employees.map(employee => [String(employee.employeeCode || '').trim().toUpperCase(), employee]));
        const operations = [];
        const importedDates = [];
        rows.forEach((row, index) => {
            const rowNumber = index + 2;
            const employeeCode = String(row.Code || row['Employee code'] || '').trim();
            const employee = employeesByCode.get(employeeCode.toUpperCase());
            if (!employee) throw new Error(`Row ${rowNumber}: employee code "${employeeCode}" was not found.`);

            const punchDate = parseNepaliDateKey(row['Date (BS)']);
            if (!punchDate) throw new Error(`Row ${rowNumber}: enter a valid Bikram Sambat date in Date (BS).`);
            importedDates.push({ date: punchDate, nepaliDate: getNepaliDate(punchDate).slice(0, 10) });
            const actualIn = parseAttendanceCsvTime(row['Actual in'], rowNumber, 'Actual in');
            const actualOut = parseAttendanceCsvTime(row['Actual out'], rowNumber, 'Actual out');
            if (!actualIn && !actualOut) throw new Error(`Row ${rowNumber}: enter Actual in and/or Actual out as HH:mm.`);
            const holidayName = employeeHolidaysByDate.get(getNepaliDate(punchDate).slice(0, 10)) || '';

            [[actualIn, 'Check-in', 0], [actualOut, 'Check-out', 1]].forEach(([time, punchType, status]) => {
                if (!time) return;
                const punchTime = new Date(punchDate);
                punchTime.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0);
                const punch = {
                    sn: 'CSV_IMPORT',
                    pin: String(employee.employeeCode).trim(),
                    name: employee.staffName,
                    punchTime,
                    source: 'Manual',
                    isHoliday: Boolean(holidayName),
                    holidayName,
                    manualPunchType: punchType,
                    status,
                    verifyMode: 0
                };
                operations.push({
                    updateOne: {
                        filter: { sn: punch.sn, pin: punch.pin, punchTime, source: 'Manual', manualPunchType: punchType },
                        update: { $setOnInsert: punch },
                        upsert: true
                    }
                });
            });
        });

        const result = await employeeAttendance.bulkWrite(operations, { ordered: true });
        const punchesSaved = result.upsertedCount + result.modifiedCount;
        const dateRange = importedDates.sort((first, second) => first.date - second.date);
        const query = new URLSearchParams({
            imported: String(punchesSaved),
            importRows: String(rows.length),
            startDateBs: dateRange[0].nepaliDate,
            endDateBs: dateRange[dateRange.length - 1].nepaliDate
        });
        return res.redirect(`/employeeattendance?${query}`);
    } catch (error) {
        console.error('Unable to import employee attendance CSV:', error);
        return res.redirect(`/employeeattendance?importError=${encodeURIComponent(error.message || 'Unable to import attendance CSV.')}`);
    }
};

exports.exportEmployeeAttendance = async (req, res) => {
    try {
        const { reportRows, startDate, endDate } = await buildEmployeeAttendanceReport(req.query);
        const columns = [
            ['SN', (_, index) => index + 1],
            ['Employee name', row => row.employeeName],
            ['Code', row => row.employeeCode],
            ['Branch name', row => row.branchName],
            ['Department', row => row.department],
            ['Date (BS)', row => row.nepaliDate],
            ['Planned in', row => row.plannedIn],
            ['Planned out', row => row.plannedOut],
            ['Actual in', row => row.actualIn],
            ['Actual out', row => row.actualOut],
            ['Late in status', row => row.lateInStatus],
            ['Early out status', row => row.earlyOutStatus],
            ['Leave type', row => row.leaveType],
            ['Remarks', row => row.remarks]
        ];
        const escapeCsv = value => {
            const text = String(value ?? '');
            const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
            return `"${safeText.replace(/"/g, '""')}"`;
        };
        const csv = [
            columns.map(([heading]) => escapeCsv(heading)).join(','),
            ...reportRows.map((row, index) => columns.map(([, getValue]) => escapeCsv(getValue(row, index))).join(','))
        ].join('\r\n');
        const filename = `employee-attendance-${startDate}-to-${endDate}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(`\uFEFF${csv}`);
    } catch (error) {
        console.error('exportEmployeeAttendance error:', error);
        return res.status(error.status || 500).send(error.message || 'Unable to export attendance.');
    }
};

exports.showMyAttendance = async (req, res) => {
    try {
        const employee = await findEmployeeForUser(req.user);
        if (!employee) {
            return res.status(403).send('Your login is not linked to an employee profile.');
        }

        const currentBs = getNepaliDate(new Date()).slice(0, 10);
        const nepaliMonths = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
        const requestedMonth = /^\d{4}-\d{2}$/.test(String(req.query.monthBs || ''))
            ? String(req.query.monthBs)
            : currentBs.slice(0, 7);
        const [year, month] = requestedMonth.split('-').map(Number);
        const start = parseNepaliDateKey(`${year}-${String(month).padStart(2, '0')}-01`);
        const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
        const endExclusive = parseNepaliDateKey(`${nextMonth}-01`);
        if (!start || !endExclusive) return res.status(400).send('Invalid Nepali month.');

        const through = new Date(endExclusive);
        through.setMilliseconds(through.getMilliseconds() - 1);
        const employeeCodes = getEmployeeAttendanceCodes(employee);
        const endDateBs = getNepaliDate(through).slice(0, 10);
        const [punches, approvedLeaves, employeeHolidays] = await Promise.all([
            employeeAttendance.find({
                pin: { $in: employeeCodes },
                punchTime: { $gte: start, $lt: endExclusive }
            }).sort({ punchTime: 1 }).lean(),
            LeaveApplication.find({
                status: 'approved',
                employeeName: employee.staffName,
                startDateNepali: { $lte: getNepaliDate(through).slice(0, 10) },
                endDateNepali: { $gte: requestedMonth + '-01' }
            }).select('leaveTypeName isPaid startDateNepali endDateNepali requestedDays').lean(),
            EmployeeWeekend.find({ dateBs: { $gte: requestedMonth + '-01', $lte: endDateBs } }).select('dateBs name').lean()
        ]);
        const employeeHolidaysByDate = new Map(employeeHolidays.map(item => [item.dateBs, item.name]));

        const leavesByDate = new Map();
        approvedLeaves.forEach(leave => {
            const leaveStart = parseNepaliDateKey(leave.startDateNepali);
            const leaveEnd = parseNepaliDateKey(leave.endDateNepali);
            if (!leaveStart || !leaveEnd) return;
            for (let cursor = new Date(Math.max(start, leaveStart)); cursor <= Math.min(through, leaveEnd); cursor.setDate(cursor.getDate() + 1)) {
                leavesByDate.set(formatDateKey(cursor), leave);
            }
        });

        const punchesByDate = new Map();
        punches.forEach(punch => {
            const key = formatDateKey(new Date(punch.punchTime));
            if (!punchesByDate.has(key)) punchesByDate.set(key, []);
            punchesByDate.get(key).push(punch);
        });

        const rows = [];
        let lateCount = 0;
        let earlyOutCount = 0;
        let leaveDays = 0;
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const plannedIn = employee.plannedIn || '09:00';
        const plannedOut = employee.plannedOut || '17:00';
        const plannedInMinutes = getMinutes(plannedIn);
        const plannedOutMinutes = getMinutes(plannedOut);

        for (let date = new Date(start); date < endExclusive; date.setDate(date.getDate() + 1)) {
            const dateKey = formatDateKey(date);
            const allDayPunches = punchesByDate.get(dateKey) || [];
            const holidayName = employeeHolidaysByDate.get(getNepaliDate(date).slice(0, 10))
                || allDayPunches.find(punch => punch.isHoliday && punch.holidayName)?.holidayName
                || '';
            const isHoliday = Boolean(holidayName);
            const dayPunches = allDayPunches.filter(punch => formatPunchTime(new Date(punch.punchTime)) !== '00:00');
            const { checkIn, checkOut } = classifyPunchesByMidTime(dayPunches, getEmployeeMidTime(employee));
            const actualIn = checkIn ? new Date(checkIn.punchTime) : null;
            const actualOut = checkOut ? new Date(checkOut.punchTime) : null;
            const leave = leavesByDate.get(dateKey);
            const isFuture = date > today;
            let status = isHoliday ? holidayName : isFuture ? 'Upcoming' : 'Absent';
            if (!isHoliday && leave && !actualIn && !actualOut) {
                status = `On leave - ${leave.leaveTypeName}`;
                leaveDays += 1;
            } else if (!isHoliday && (actualIn || actualOut)) {
                status = actualIn && actualOut ? 'Present' : actualIn ? 'Check-in only' : 'Check-out only';
            }
            const actualInMinutes = actualIn ? getMinutes(formatPunchTime(actualIn)) : null;
            const actualOutMinutes = actualOut ? getMinutes(formatPunchTime(actualOut)) : null;
            const lateMinutes = !isHoliday && actualInMinutes !== null && plannedInMinutes !== null ? Math.max(0, actualInMinutes - plannedInMinutes) : 0;
            const earlyMinutes = !isHoliday && actualOutMinutes !== null && plannedOutMinutes !== null ? Math.max(0, plannedOutMinutes - actualOutMinutes) : 0;
            if (lateMinutes) lateCount += 1;
            if (earlyMinutes) earlyOutCount += 1;
            rows.push({
                date: getNepaliDate(date).slice(0, 10),
                checkIn: actualIn ? formatPunchTime(actualIn) : isHoliday ? holidayName : '-',
                checkOut: actualOut ? formatPunchTime(actualOut) : isHoliday ? holidayName : '-',
                status,
                isHoliday,
                holidayName,
                lateMinutes,
                earlyMinutes,
                lateDuration: lateMinutes ? formatDurationMinutes(lateMinutes) : '-',
                earlyDuration: earlyMinutes ? formatDurationMinutes(earlyMinutes) : '-'
            });
        }

        return res.render('employee/myAttendance', {
            employee,
            rows,
            monthBs: requestedMonth,
            monthLabel: `${nepaliMonths[month - 1]} ${year} BS`,
            lateCount,
            leaveDays,
            earlyOutCount,
            currentPage: 'my-attendance',
            selectedEmployee: null
        });
    } catch (error) {
        console.error('Unable to load personal attendance:', error);
        return res.status(500).send('Unable to load your attendance.');
    }
};

const teacherProfileFields = [
    'dateOfBirth', 'dateOfBirthBs', 'maritalStatus', 'gender', 'bloodGroup', 'mobileNumber', 'alternateMobile',
    'email', 'country', 'religion', 'passportNumber', 'citizenNumber', 'citizenshipIssueDate', 'citizenshipIssueOffice',
    'panNumber', 'fatherName', 'motherName', 'isDifferentlyAbled', 'permanentAddress', 'permanentDistrict',
    'permanentMunicipality', 'permanentWard', 'permanentAddressNepali', 'temporaryAddress', 'temporaryDistrict',
    'temporaryMunicipality', 'temporaryWard', 'temporaryAddressNepali', 'sameAddressAsPermanent', 'address',
    'emergencyContactName', 'emergencyContactRelation', 'emergencyContactNumber', 'emergencyContactAddress',
    'health', 'qualifications', 'experiences', 'skills', 'trainings', 'familyMembers'
];

const renderTeacherProfileFillup = async (req, res, options = {}) => {
    const employee = options.employee || await findEmployeeForUser(req.user);
    if (!employee) return res.status(403).send('Your login is not linked to an employee profile.');
    const employeeForView = {
        ...employee,
        documents: (employee.documents || []).map(document => ({
            ...document,
            previewMimeType: getEmployeeDocumentMimeType(document),
            url: getEmployeeDocumentUrl(employee._id, document.blobName)
        }))
    };
    const formData = options.formData || toEmployeeFormData(employee);
    EMPLOYEE_OFFICE_PROOF_SECTIONS.forEach(({ collection }) => {
        delete employeeForView[collection];
        delete formData[collection];
    });
    return res.status(options.status || 200).render('employee/employeprofilefillupform', {
        employee: employeeForView,
        formData,
        error: options.error || '',
        saved: options.saved || false
    });
};

const mergeTeacherProfileFormData = (employee, submitted) => {
    const existing = toEmployeeFormData(employee);
    const merged = { ...existing, ...submitted };
    Object.keys(existing).forEach(key => {
        const submittedValue = submitted[key];
        if (submittedValue === undefined || submittedValue === '') merged[key] = existing[key];
    });
    merged.health = { ...(existing.health || {}), ...(submitted.health || {}) };
    return merged;
};

exports.showEmployeeProfileFillup = async (req, res) => {
    try {
        return await renderTeacherProfileFillup(req, res, { saved: req.query.saved === '1' });
    } catch (error) {
        console.error('Unable to load teacher profile form:', error);
        return res.status(500).send('Unable to load your profile form.');
    }
};

exports.saveEmployeeProfileFillup = async (req, res) => {
    const formData = buildEmployeeFormData(req.body);
    const employee = await findEmployeeForUser(req.user);
    if (!employee) return res.status(403).send('Your login is not linked to an employee profile.');
    const errorFormData = mergeTeacherProfileFormData(employee, formData);
    const requiredFields = [
        ['staffName', 'Name'],
        ['gender', 'Gender'],
        ['mobileNumber', 'Mobile number'],
        ['email', 'Personal email'],
        ['permanentAddress', 'Permanent address'],
        ['emergencyContactName', 'Emergency contact name'],
        ['emergencyContactNumber', 'Emergency contact phone number']
    ];
    const missingFields = requiredFields
        .filter(([field]) => !String(formData[field] || '').trim())
        .map(([, label]) => label);
    if (missingFields.length) {
        return renderTeacherProfileFillup(req, res, {
            status: 400,
            error: `Please complete: ${missingFields.join(', ')}.`,
            employee,
            formData: errorFormData
        });
    }
    let uploadedDocuments = [];
    let uploadedPhoto = null;
    try {
        uploadedDocuments = await uploadDocumentsToAzure(req.files, formData);
        uploadedPhoto = await uploadEmployeePhotoToAzure((req.files || []).find(file => file.fieldname === 'employeePhoto'), employee.employeeCode);
        const updates = {};
        teacherProfileFields.forEach(field => {
            if (formData[field] !== undefined) updates[field] = formData[field];
        });
        updates.documents = [...(employee.documents || []), ...uploadedDocuments];
        if (uploadedPhoto) updates.employeePhoto = uploadedPhoto;
        updates.staffName = employee.staffName;
        await Staff.updateOne({ _id: employee._id }, { $set: updates }, { runValidators: true });
        return res.redirect('/employeeprofile?saved=1');
    } catch (error) {
        await deleteUploadedDocuments([...uploadedDocuments, ...(uploadedPhoto ? [uploadedPhoto] : [])]);
        console.error('Unable to save teacher profile:', error);
        return renderTeacherProfileFillup(req, res, {
            status: 400,
            employee,
            error: error.statusCode === 400
                ? error.message
                : 'Unable to save your profile. Check the entered values and try again.',
            formData: errorFormData
        });
    }
};