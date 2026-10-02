
const employeeAttendance = require('../../model/employeeSchema/employeeattendanceSchema');
const mongoose = require('mongoose');
const bs = require('bikram-sambat-js');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { staffSchema } = require('../../model/staffschema');
const { leaveApplicationSchema } = require('../../model/leaveschema/leavetypeschma');
const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');
const LeaveApplication = mongoose.models.LeaveApplication || mongoose.model('LeaveApplication', leaveApplicationSchema, 'leaveApplications');
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

const toEmployeeFormData = employee => {
    if (!employee) return {};
    return {
        ...employee,
        dateOfJoiningBs: employee.dateOfJoining ? String(bs.ADToBS(new Date(employee.dateOfJoining)) || '').slice(0, 10) : '',
        dateOfBirthBs: employee.dateOfBirth ? String(bs.ADToBS(new Date(employee.dateOfBirth)) || '').slice(0, 10) : ''
    };
};

const renderEmployeeDetails = async (res, options = {}) => {
    const employees = await getEmployeeProfiles();
    const selectedEmployee = options.employee
        || employees.find(employee => String(employee._id) === String(options.employeeId || ''))
        || (options.newEmployee ? null : employees[0])
        || null;
    return res.status(options.status || 200).render('employee/employeeworkspace', {
        employees,
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
        return res.render('employee/employeemanagementdashboard', {
            employees,
            activeEmployees: employees.filter(employee => employee.isActive !== false && employee.employmentStatus !== 'Resigned' && employee.employmentStatus !== 'Terminated').length,
            currentPage: 'dashboard',
            selectedEmployee: null
        });
    } catch (error) {
        console.error('Unable to load employee dashboard:', error);
        return res.status(500).send('Unable to load employee dashboard.');
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
            const morningPunches = dayPunches.filter(punch => new Date(punch.punchTime).getHours() < 12);
            const eveningPunches = dayPunches.filter(punch => new Date(punch.punchTime).getHours() >= 12);
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
            deviceSN: req.query.SN || ''
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