
const employeeAttendance = require('../../model/employeeSchema/employeeattendanceSchema');
const mongoose = require('mongoose');
const bs = require('bikram-sambat-js');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { staffSchema } = require('../../model/staffschema');
const { leaveApplicationSchema } = require('../../model/leaveschema/leavetypeschma');
const Event = require('../../model/eventmodel');
const { getRecentNotices } = require('../noticecontroller/noticecontroller');
const ManualPunchRequest = require('../../model/employeeSchema/manualPunchRequestSchema');
const { Branch, Department, DepartmentSection, Designation, Shift } = require('../../model/employeeSchema/employeeSetupSchema');
const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');
const LeaveApplication = mongoose.models.LeaveApplication || mongoose.model('LeaveApplication', leaveApplicationSchema, 'leaveApplications');
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

const employeeDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 30, fields: 1200 },
    fileFilter: (req, file, callback) => {
        const type = String(file.mimetype || '').toLowerCase();
        if (type === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
            return callback(null, true);
        }
        return callback(new Error('Upload PDF, JPG, PNG, WebP, or GIF documents only.'));
    }
});

exports.uploadEmployeeDocuments = (req, res, next) => employeeDocumentUpload.any()(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError
        ? 'Upload up to 30 documents, each no larger than 10 MB.'
        : error.message || 'Unable to read employee documents.';
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

const renderEmployeeDetails = async (res, options = {}) => {
    const [employees, setupOptions] = await Promise.all([getEmployeeProfiles(), getEmployeeSetupOptions()]);
    const selectedEmployee = options.employee
        || employees.find(employee => String(employee._id) === String(options.employeeId || ''))
        || (options.newEmployee ? null : employees[0])
        || null;
    return res.status(options.status || 200).render('employee/employeeworkspace', {
        employees,
        ...setupOptions,
        selectedEmployee,
        activeModule: options.activeModule || 'profile',
        defaultDocuments: DEFAULT_EMPLOYEE_DOCUMENTS,
        error: options.error || '',
        saved: options.saved || false,
        formData: options.formData || toEmployeeFormData(selectedEmployee)
    });
};

exports.showEmployeeDetails = async (req, res) => {
    try {
        return await renderEmployeeDetails(res, {
            employeeId: req.query.employeeId,
            newEmployee: req.query.new === '1',
            activeModule: req.query.module || 'profile',
            saved: req.query.saved === '1'
        });
    } catch (error) {
        console.error('Unable to load employee details:', error);
        return res.status(500).send('Unable to load employee details.');
    }
};

exports.showEmployeeManagementDashboard = async (req, res) => {
    try {
        const employees = await getEmployeeProfiles();
        const activeEmployees = employees.filter(employee => employee.isActive !== false && !['Resigned', 'Terminated'].includes(employee.employmentStatus));
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
            employeeAttendance.find({ punchTime: { $gte: selectedDate, $lt: nextDate } }).select('pin punchTime').sort({ punchTime: 1 }).lean(),
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

        const employeesByCode = new Map(activeEmployees.map(employee => [String(employee.employeeCode || '').trim().toUpperCase(), employee]));
        const punchesByCode = new Map();
        punches.forEach(punch => {
            const code = String(punch.pin || '').trim().toUpperCase();
            if (!punchesByCode.has(code)) punchesByCode.set(code, []);
            punchesByCode.get(code).push(punch);
        });
        const leavesByName = new Map(approvedLeaves.map(leave => [normalizeEmployeeName(leave.employeeName), leave]));
        const attendanceLists = { present: [], onLeave: [], absent: [], late: [] };

        activeEmployees.forEach(employee => {
            const employeeCode = String(employee.employeeCode || '').trim().toUpperCase();
            const employeePunches = punchesByCode.get(employeeCode) || [];
            const leave = leavesByName.get(normalizeEmployeeName(employee.staffName));
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
            const midTimeMinutes = getMinutes(getEmployeeMidTime(employee));
            const getPunchMinutes = punch => getMinutes(formatPunchTime(new Date(punch.punchTime)));
            const isAfterMidTime = punch => {
                const punchMinutes = getPunchMinutes(punch);
                return punchMinutes !== null && midTimeMinutes !== null && punchMinutes >= midTimeMinutes;
            };
            const isExplicitCheckIn = punch => punch.manualPunchType === 'Check-in' || Number(punch.status) === 0;
            const isExplicitCheckOut = punch => punch.manualPunchType === 'Check-out' || Number(punch.status) === 1;
            const morningPunches = employeePunches.filter(punch => !isAfterMidTime(punch)
                && (isExplicitCheckIn(punch) || !isExplicitCheckOut(punch)));
            if (!morningPunches.length) return;

            const actualIn = morningPunches[morningPunches.length - 1].punchTime;
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
                await employeeAttendance.create({
                    sn: 'MANUAL',
                    pin: request.employeeCode,
                    name: request.employeeName,
                    punchTime: request.punchDateTime,
                    source: 'Manual',
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
        const employees = await getEmployeeProfiles();
        return res.render('employee/employeedata', {
            employees,
            currentPage: 'employee-list',
            selectedEmployee: null
        });
    } catch (error) {
        console.error('Unable to load employee list:', error);
        return res.status(500).send('Unable to load employee list.');
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
        contracts: getIndexedRows(body, 'contract', 'contractCount', ['status', 'beganOn', 'endedOn']),
        transferHistory: getIndexedRows(body, 'transfer', 'transferCount', ['transferDate', 'transferType', 'from', 'to', 'transferredBy']),
        promotionHistory: getIndexedRows(body, 'promotion', 'promotionCount', ['status', 'promotionDate', 'fromDesignation', 'toDesignation', 'promotedBy']),
        resignations: getIndexedRowsWithFlags(body, 'resignation', 'resignationCount', ['eventDate', 'lastWorkingDate', 'reason', 'details', 'approvedBy'], ['approved']),
        terminations: getIndexedRowsWithFlags(body, 'termination', 'terminationCount', ['eventDate', 'lastWorkingDate', 'reason', 'details', 'approvedBy'], ['approved']),
        disciplinaryCases: getIndexedRows(body, 'disciplinary', 'disciplinaryCount', ['caseName', 'description', 'createdOn', 'status', 'forwardTo', 'actions']),
        exitInterviews: getIndexedRows(body, 'exitInterview', 'exitInterviewCount', ['description']),
        lettersIssued: getIndexedRows(body, 'letter', 'letterCount', ['type', 'issueDate', 'issuedBy', 'letterUrl']),
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
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error('Azure document storage is not configured.');
    const containerName = process.env.AZURE_EMPLOYEE_DOCUMENT_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
    const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    const uploaded = [];

    try {
        for (const file of documentFiles) {
            const match = file.fieldname.match(/^documentFile_(\d+)$/);
            const documentRow = match ? formData.documentRows[Number(match[1])] : null;
            const documentName = getText(documentRow?.name, 120);
            if (!documentName) throw new Error('Enter a document name for each selected file.');
            const extension = path.extname(file.originalname).toLowerCase();
            const safeExtension = /^\.(pdf|jpe?g|png|webp|gif)$/.test(extension) ? extension : '';
            const blobName = `employee-documents/${formData.employeeCode}/${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
            const blobClient = containerClient.getBlockBlobClient(blobName);
            await blobClient.uploadData(file.buffer, { blobHTTPHeaders: { blobContentType: file.mimetype } });
            uploaded.push({
                documentName,
                url: blobClient.url,
                blobName,
                originalName: getText(file.originalname, 180),
                mimeType: file.mimetype
            });
        }
        return uploaded;
    } catch (error) {
        await Promise.all(uploaded.map(document => containerClient.getBlockBlobClient(document.blobName).deleteIfExists().catch(() => {})));
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
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error('Azure document storage is not configured.');
    const containerName = process.env.AZURE_EMPLOYEE_DOCUMENT_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
    const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    const extension = path.extname(file.originalname).toLowerCase();
    const blobName = `employee-documents/${employeeCode}/previous-tds-${Date.now()}-${crypto.randomUUID()}${extension}`;
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.uploadData(file.buffer, { blobHTTPHeaders: { blobContentType: file.mimetype } });
    return { url: blobClient.url, blobName, originalName: getText(file.originalname, 180) };
};

const deleteUploadedDocuments = async documents => {
    if (!documents.length) return;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) return;
    const containerName = process.env.AZURE_EMPLOYEE_DOCUMENT_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
    const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    await Promise.all(documents.map(document => containerClient.getBlockBlobClient(document.blobName).deleteIfExists().catch(() => {})));
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
        const { documentRows, ...employeeData } = formData;
        if (uploadedTdsDocument) {
            employeeData.previousCompanyTds.documentName = uploadedTdsDocument.originalName;
            employeeData.previousCompanyTds.url = uploadedTdsDocument.url;
            employeeData.previousCompanyTds.blobName = uploadedTdsDocument.blobName;
        }
        await Staff.create({ ...employeeData, documents: uploadedDocuments, employeePhoto: uploadedPhoto || {} });
        return res.redirect('/employeedetail?saved=1');
    } catch (error) {
        await deleteUploadedDocuments([...uploadedDocuments, ...(uploadedPhoto ? [uploadedPhoto] : []), ...(uploadedTdsDocument ? [uploadedTdsDocument] : [])]);
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
            error: 'Employee details could not be saved. Check the entered values and try again.',
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
        const { documentRows, ...employeeData } = formData;
        employeeData.documents = [...(existingEmployee.documents || []), ...uploadedDocuments];
        employeeData.employeePhoto = uploadedPhoto || existingEmployee.employeePhoto || {};
        if (uploadedTdsDocument) {
            employeeData.previousCompanyTds.documentName = uploadedTdsDocument.originalName;
            employeeData.previousCompanyTds.url = uploadedTdsDocument.url;
            employeeData.previousCompanyTds.blobName = uploadedTdsDocument.blobName;
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
        if (uploadedPhoto && existingEmployee.employeePhoto?.blobName) {
            await deleteUploadedDocuments([{ blobName: existingEmployee.employeePhoto.blobName }]);
        }
        if (uploadedTdsDocument && existingEmployee.previousCompanyTds?.blobName) {
            await deleteUploadedDocuments([{ blobName: existingEmployee.previousCompanyTds.blobName }]);
        }
        return res.redirect(`/employeedetail?employeeId=${employeeId}&module=${encodeURIComponent(activeModule)}&saved=1`);
    } catch (error) {
        await deleteUploadedDocuments([...uploadedDocuments, ...(uploadedPhoto ? [uploadedPhoto] : []), ...(uploadedTdsDocument ? [uploadedTdsDocument] : [])]);
        if (error.code === 11000) {
            return renderEmployeeDetails(res, { status: 409, employeeId, activeModule, error: 'That employee code is already in use.', formData });
        }
        console.error('Unable to update employee details:', error);
        return renderEmployeeDetails(res, { status: 400, employeeId, activeModule, error: 'Employee details could not be saved. Check the entered values and try again.', formData });
    }
};

/**
 * Parse one attendance timestamp safely.
 */
function parsePunchTime(value) {
    if (!value) return null;

    const date = new Date(String(value).trim());

    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse an attendance row.
 *
 * Standard tab format:
 * PIN    YYYY-MM-DD HH:mm:ss    STATUS    VERIFY_MODE
 *
 * Legacy CSV format:
 * PIN,NAME,YYYY-MM-DD HH:mm:ss,VERIFY_MODE,STATUS
 */
function parseAttendanceRow(line, serialNumber) {
    const trimmedLine = String(line || '').trim();

    if (!trimmedLine) return null;

    // Support tab-separated or comma-separated records.
    const delimiter = trimmedLine.includes('\t') ? '\t' : ',';
    const values = trimmedLine.split(delimiter).map(value => value.trim());

    if (values.length < 2 || !values[0]) {
        return null;
    }

    let pin;
    let name;
    let timestamp;
    let status;
    let verifyMode;

    // Standard ZKTeco tab-separated format.
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(values[1])) {
        pin = values[0];
        timestamp = values[1];
        status = values[2];
        verifyMode = values[3];
    }

    // Legacy CSV: PIN,NAME,TIMESTAMP,VERIFY_MODE,STATUS.
    else if (values.length >= 3 &&
             /^\d{4}-\d{2}-\d{2}[ T]/.test(values[2])) {
        pin = values[0];
        name = values[1];
        timestamp = values[2];
        verifyMode = values[3];
        status = values[4];
    }

    else {
        return null;
    }

    const punchTime = parsePunchTime(timestamp);

    if (!pin || !punchTime) {
        return null;
    }

    const document = {
        sn: serialNumber,
        pin,
        punchTime
    };

    if (name) document.name = name;

    if (status !== undefined && status !== '') {
        const parsedStatus = Number.parseInt(status, 10);

        if (Number.isInteger(parsedStatus)) {
            document.status = parsedStatus;
        }
    }

    if (verifyMode !== undefined && verifyMode !== '') {
        const parsedVerifyMode = Number.parseInt(verifyMode, 10);

        if (Number.isInteger(parsedVerifyMode)) {
            document.verifyMode = parsedVerifyMode;
        }
    }

    return document;
}

/**
 * Receive attendance data from a ZKTeco device or test client.
 *
 * Route example:
 * router.post('/iclock/cdata', controller.saveEmployeeAttendance);
 */
exports.saveEmployeeAttendance = async (req, res) => {
    try {
        const fields =
            req.body && typeof req.body === 'object'
                ? req.body
                : {};

        const serialNumber = String(
            req.query.SN ||
            fields.SN ||
            fields.sn ||
            ''
        ).trim();

        const table = String(
            req.query.table ||
            fields.table ||
            ''
        ).trim().toUpperCase();

        // Express text middleware normally makes req.body a string.
        let payload = '';

        if (typeof req.body === 'string') {
            payload = req.body;
        } else if (Buffer.isBuffer(req.body)) {
            payload = req.body.toString('utf8');
        } else {
            payload = String(
                fields.data ||
                fields.attlog ||
                fields.body ||
                ''
            );
        }

        // Device configuration and other protocol requests
        // should be handled by the appropriate route/controller.
        if (table !== 'ATTLOG') {
            return res.status(200).send('OK');
        }

        if (!serialNumber) {
            return res.status(400).send(
                'Missing device serial number'
            );
        }

        if (!payload.trim()) {
            return res.status(400).send(
                'Empty attendance payload'
            );
        }

        const lines = payload
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        const parsedRows = lines.map(line =>
            parseAttendanceRow(line, serialNumber)
        );

        const docs = parsedRows.filter(Boolean);

        if (!docs.length) {
            console.warn('No valid ATTLOG rows received', {
                serialNumber,
                table,
                contentType: req.headers['content-type'],
                bodyType: typeof req.body,
                bodyPreview: payload.slice(0, 300)
            });

            return res.status(400).send(
                'No valid ATTLOG rows received'
            );
        }

        // Insert records. ordered:false allows valid rows to be
        // inserted even if an individual row causes a DB error.
        let insertedCount = 0;

        try {
            const inserted = await employeeAttendance.insertMany(
                docs,
                { ordered: false }
            );

            insertedCount = inserted.length;
        } catch (dbError) {
            // MongoDB may partially insert records with ordered:false.
            if (Array.isArray(dbError.insertedDocs)) {
                insertedCount = dbError.insertedDocs.length;
            }

            console.error('Attendance database insertion error:', {
                message: dbError.message,
                insertedCount
            });

            // Do not report a successful full import if insertion failed.
            return res.status(500).json({
                message: 'Attendance database insertion failed',
                insertedCount,
                error: dbError.message
            });
        }

        console.log('Attendance received:', {
            serialNumber,
            receivedRows: lines.length,
            validRows: docs.length,
            insertedCount
        });

        return res.status(200).send('OK');

    } catch (error) {
        console.error('saveEmployeeAttendance error:', error);

        return res.status(500).json({
            message: error.message
        });
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

    const startDateBs = getNepaliDate(start).slice(0, 10);
    const endDateBs = getNepaliDate(end).slice(0, 10);
    const [employees, punches, approvedLeaves] = await Promise.all([
        getEmployeeProfiles(),
        employeeAttendance.find({ punchTime: { $gte: from, $lte: through } }).sort({ punchTime: 1 }).lean(),
        LeaveApplication.find({
            status: 'approved',
            startDateNepali: { $lte: endDateBs },
            endDateNepali: { $gte: startDateBs }
        }).select('employeeName leaveTypeName isPaid startDateNepali endDateNepali').lean()
    ]);

    const employeeByCode = new Map();
    employees.forEach(employee => {
        const code = String(employee.employeeCode || '').trim().toUpperCase();
        if (code) employeeByCode.set(code, employee);
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
        const codesForDate = new Set(employeeByCode.keys());
        punches.forEach(punch => {
            if (formatDateKey(new Date(punch.punchTime)) === dateKey) {
                codesForDate.add(String(punch.pin || '').trim().toUpperCase());
            }
        });

        Array.from(codesForDate).sort().forEach(code => {
            const employee = employeeByCode.get(code) || {};
            const dayPunches = punchesByDateAndCode.get(`${dateKey}|${code}`) || [];
            const employeeName = employee.staffName || dayPunches.find(punch => punch.name)?.name || 'Employee not mapped';
            const midTimeMinutes = getMinutes(getEmployeeMidTime(employee));
            const getPunchMinutes = punch => getMinutes(formatPunchTime(new Date(punch.punchTime)));
            const isAfterMidTime = punch => {
                const punchMinutes = getPunchMinutes(punch);
                return punchMinutes !== null && midTimeMinutes !== null && punchMinutes >= midTimeMinutes;
            };
            const isExplicitCheckIn = punch => punch.manualPunchType === 'Check-in' || Number(punch.status) === 0;
            const isExplicitCheckOut = punch => punch.manualPunchType === 'Check-out' || Number(punch.status) === 1;
            const morningPunches = dayPunches.filter(punch => !isAfterMidTime(punch)
                && (isExplicitCheckIn(punch) || !isExplicitCheckOut(punch)));
            const eveningPunches = dayPunches.filter(punch => isAfterMidTime(punch)
                || isExplicitCheckOut(punch));
            const actualIn = morningPunches.length ? formatPunchTime(new Date(morningPunches[morningPunches.length - 1].punchTime)) : '';
            const actualOut = eveningPunches.length ? formatPunchTime(new Date(eveningPunches[eveningPunches.length - 1].punchTime)) : '';
            const plannedIn = employee.plannedIn || '09:00';
            const plannedOut = employee.plannedOut || '17:00';
            const plannedInMinutes = getMinutes(plannedIn);
            const plannedOutMinutes = getMinutes(plannedOut);
            const actualInMinutes = getMinutes(actualIn);
            const actualOutMinutes = getMinutes(actualOut);
            const lateMinutes = actualInMinutes !== null && plannedInMinutes !== null
                ? Math.max(0, actualInMinutes - plannedInMinutes) : 0;
            const earlyMinutes = actualOutMinutes !== null && plannedOutMinutes !== null
                ? Math.max(0, plannedOutMinutes - actualOutMinutes) : 0;
            const missing = [];
            const bothPunchesMissing = !actualIn && !actualOut;
            const leaveForDate = (leavesByEmployeeName.get(normalizeEmployeeName(employeeName)) || [])
                .find(leave => leave.startDateNepali <= getNepaliDate(date).slice(0, 10) && leave.endDateNepali >= getNepaliDate(date).slice(0, 10));
            const countedLeave = bothPunchesMissing ? leaveForDate : null;

            if (!actualIn) missing.push('Missed morning');
            if (!actualOut) missing.push('Missed evening');

            reportRows.push({
                date: dateKey,
                nepaliDate: getNepaliDate(date),
                employeeCode: employee.employeeCode || code || '-',
                employeeName,
                branchName: employee.branchName || '-',
                department: employee.department || '-',
                plannedIn,
                plannedOut,
                actualIn: actualIn || 'Missed morning',
                actualOut: actualOut || 'Missed evening',
                lateInStatus: actualIn ? (lateMinutes ? `Late by ${lateMinutes} min` : 'On time') : 'Missed morning',
                earlyOutStatus: actualOut ? (earlyMinutes ? `Early by ${earlyMinutes} min` : 'On time') : 'Missed evening',
                leaveType: countedLeave ? `${countedLeave.leaveTypeName} / ${countedLeave.isPaid ? 'Paid' : 'Unpaid'}` : '-',
                remarks: countedLeave
                    ? `Leave: ${countedLeave.leaveTypeName} / ${countedLeave.isPaid ? 'Paid' : 'Unpaid'}`
                    : bothPunchesMissing ? 'Absent' : missing.length ? missing.join('; ') : 'Present',
                lateMinutes,
                earlyMinutes
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
exports.getEmployeeAttendance = async (req, res) => {
    try {
        const report = await buildEmployeeAttendanceReport(req.query);
        return res.render('employee/employeeattendance', {
            ...report,
            deviceSN: req.query.SN || '',
            isAdmin: true
        });
    } catch (error) {
        console.error('getEmployeeAttendance error:', error);
        return res.status(error.status || 500).send(error.message || 'Unable to load attendance.');
    }
};

exports.exportEmployeeAttendance = async (req, res) => {
    try {
        const { reportRows, startDate, endDate } = await buildEmployeeAttendanceReport(req.query);
        const columns = [
            ['SN', (_, index) => index + 1],
            ['Employee name', row => row.employeeName],
            ['Employee code', row => row.employeeCode],
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
        const employeeCode = String(employee.employeeCode || '').trim().toUpperCase();
        const [punches, approvedLeaves] = await Promise.all([
            employeeAttendance.find({
                pin: employeeCode,
                punchTime: { $gte: start, $lt: endExclusive }
            }).sort({ punchTime: 1 }).lean(),
            LeaveApplication.find({
                status: 'approved',
                employeeName: employee.staffName,
                startDateNepali: { $lte: getNepaliDate(through).slice(0, 10) },
                endDateNepali: { $gte: requestedMonth + '-01' }
            }).select('leaveTypeName isPaid startDateNepali endDateNepali requestedDays').lean()
        ]);

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
        const midTimeMinutes = getMinutes(getEmployeeMidTime(employee));
        const plannedIn = employee.plannedIn || '09:00';
        const plannedOut = employee.plannedOut || '17:00';
        const plannedInMinutes = getMinutes(plannedIn);
        const plannedOutMinutes = getMinutes(plannedOut);

        for (let date = new Date(start); date < endExclusive; date.setDate(date.getDate() + 1)) {
            const dateKey = formatDateKey(date);
            const dayPunches = punchesByDate.get(dateKey) || [];
            const isAfterMidTime = punch => {
                const minutes = getMinutes(formatPunchTime(new Date(punch.punchTime)));
                return minutes !== null && midTimeMinutes !== null && minutes >= midTimeMinutes;
            };
            const isCheckIn = punch => punch.manualPunchType === 'Check-in' || Number(punch.status) === 0;
            const isCheckOut = punch => punch.manualPunchType === 'Check-out' || Number(punch.status) === 1;
            const checkIns = dayPunches.filter(punch => !isAfterMidTime(punch) && (isCheckIn(punch) || !isCheckOut(punch)));
            const checkOuts = dayPunches.filter(punch => isAfterMidTime(punch) || isCheckOut(punch));
            const actualIn = checkIns.length ? new Date(checkIns[checkIns.length - 1].punchTime) : null;
            const actualOut = checkOuts.length ? new Date(checkOuts[checkOuts.length - 1].punchTime) : null;
            const leave = leavesByDate.get(dateKey);
            const isFuture = date > today;
            let status = isFuture ? 'Upcoming' : 'Absent';
            if (leave && !actualIn && !actualOut) {
                status = `On leave - ${leave.leaveTypeName}`;
                leaveDays += 1;
            } else if (actualIn || actualOut) {
                status = actualIn && actualOut ? 'Present' : actualIn ? 'Check-in only' : 'Check-out only';
            }
            const actualInMinutes = actualIn ? getMinutes(formatPunchTime(actualIn)) : null;
            const actualOutMinutes = actualOut ? getMinutes(formatPunchTime(actualOut)) : null;
            const lateMinutes = actualInMinutes !== null && plannedInMinutes !== null ? Math.max(0, actualInMinutes - plannedInMinutes) : 0;
            const earlyMinutes = actualOutMinutes !== null && plannedOutMinutes !== null ? Math.max(0, plannedOutMinutes - actualOutMinutes) : 0;
            if (lateMinutes) lateCount += 1;
            if (earlyMinutes) earlyOutCount += 1;
            rows.push({
                date: getNepaliDate(date).slice(0, 10),
                checkIn: actualIn ? formatPunchTime(actualIn) : '-',
                checkOut: actualOut ? formatPunchTime(actualOut) : '-',
                status,
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
    return res.status(options.status || 200).render('employee/employeprofilefillupform', {
        employee,
        formData: options.formData || toEmployeeFormData(employee),
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
    try {
        const uploadedDocuments = await uploadDocumentsToAzure(req.files, formData);
        const uploadedPhoto = await uploadEmployeePhotoToAzure((req.files || []).find(file => file.fieldname === 'employeePhoto'), employee.employeeCode);
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
        console.error('Unable to save teacher profile:', error);
        return renderTeacherProfileFillup(req, res, {
            status: 400,
            employee,
            error: 'Unable to save your profile. Check the entered values and try again.',
            formData: errorFormData
        });
    }
};