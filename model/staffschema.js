const mongoose = require('mongoose');

const qualificationSchema = new mongoose.Schema({
  degree: { type: String, default: '', trim: true },
  level: { type: String, default: '', trim: true },
  faculty: { type: String, default: '', trim: true },
  institution: { type: String, default: '', trim: true },
  affiliation: { type: String, default: '', trim: true },
  country: { type: String, default: '', trim: true },
  passedYearBs: { type: String, default: '', trim: true },
  passedYearAd: { type: String, default: '', trim: true },
  result: { type: String, default: '', trim: true },
  majorSubjects: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true }
}, { _id: false });

const experienceSchema = new mongoose.Schema({
  title: { type: String, default: '', trim: true },
  organization: { type: String, default: '', trim: true },
  beganOn: { type: String, default: '', trim: true },
  endedOn: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true }
}, { _id: false });

const skillSchema = new mongoose.Schema({
  code: { type: String, default: '', trim: true },
  name: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true }
}, { _id: false });

const trainingSchema = new mongoose.Schema({
  trainingName: { type: String, default: '', trim: true },
  fromDate: { type: String, default: '', trim: true },
  toDate: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true }
}, { _id: false });

const familyMemberSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  relation: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true }
}, { _id: false });

const employeeDocumentSchema = new mongoose.Schema({
  documentName: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  blobName: { type: String, required: true, trim: true },
  originalName: { type: String, default: '', trim: true },
  mimeType: { type: String, default: '', trim: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const salarySchema = new mongoose.Schema({
  from: { type: String, default: '', trim: true },
  to: { type: String, default: '', trim: true },
  paidPer: { type: String, default: '', trim: true },
  paymentBy: { type: String, default: '', trim: true },
  basicSalary: { type: Number, default: 0, min: 0 },
  allowance: { type: Number, default: 0, min: 0 },
  dearness: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 }
}, { _id: false });

const allowanceSchema = new mongoose.Schema({
  allowance: { type: String, default: '', trim: true },
  value: { type: Number, default: 0, min: 0 },
  fromDate: { type: String, default: '', trim: true },
  minWorkHour: { type: Number, default: 0, min: 0 },
  minDays: { type: Number, default: 0, min: 0 },
  maxDays: { type: Number, default: 0, min: 0 },
  approved: { type: Boolean, default: false }
}, { _id: false });

const deductionSchema = new mongoose.Schema({
  deduction: { type: String, default: '', trim: true },
  value: { type: Number, default: 0, min: 0 },
  calculatedBy: { type: String, default: '', trim: true },
  isApproved: { type: Boolean, default: false }
}, { _id: false });

const advanceSchema = new mongoose.Schema({
  advanceName: { type: String, default: '', trim: true },
  amount: { type: Number, default: 0, min: 0 },
  issueDate: { type: String, default: '', trim: true },
  status: { type: String, default: 'Pending', trim: true },
  approved: { type: Boolean, default: false },
  matureDate: { type: String, default: '', trim: true }
}, { _id: false });

const contractSchema = new mongoose.Schema({
  status: { type: String, default: '', trim: true },
  beganOn: { type: String, default: '', trim: true },
  endedOn: { type: String, default: '', trim: true }
}, { _id: false });

const transferSchema = new mongoose.Schema({
  transferDate: { type: String, default: '', trim: true },
  transferType: { type: String, default: '', trim: true },
  from: { type: String, default: '', trim: true },
  to: { type: String, default: '', trim: true },
  transferredBy: { type: String, default: '', trim: true }
}, { _id: false });

const promotionSchema = new mongoose.Schema({
  status: { type: String, default: '', trim: true },
  promotionDate: { type: String, default: '', trim: true },
  fromDesignation: { type: String, default: '', trim: true },
  toDesignation: { type: String, default: '', trim: true },
  promotedBy: { type: String, default: '', trim: true }
}, { _id: false });

const exitSchema = new mongoose.Schema({
  eventDate: { type: String, default: '', trim: true },
  lastWorkingDate: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true },
  details: { type: String, default: '', trim: true },
  approved: { type: Boolean, default: false },
  approvedBy: { type: String, default: '', trim: true }
}, { _id: false });

const disciplinarySchema = new mongoose.Schema({
  caseName: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  createdOn: { type: String, default: '', trim: true },
  status: { type: String, default: '', trim: true },
  forwardTo: { type: String, default: '', trim: true },
  actions: { type: String, default: '', trim: true }
}, { _id: false });

const letterSchema = new mongoose.Schema({
  type: { type: String, default: '', trim: true },
  issueDate: { type: String, default: '', trim: true },
  issuedBy: { type: String, default: '', trim: true },
  letterUrl: { type: String, default: '', trim: true }
}, { _id: false });

const loanSchema = new mongoose.Schema({
  loanName: { type: String, default: '', trim: true },
  principalAmount: { type: Number, default: 0, min: 0 },
  interestRate: { type: Number, default: 0, min: 0 },
  status: { type: String, default: 'Pending', trim: true },
  approved: { type: Boolean, default: false },
  matureDate: { type: String, default: '', trim: true }
}, { _id: false });

const assetSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  assetNumber: { type: String, default: '', trim: true },
  assetType: { type: String, default: '', trim: true },
  issueDate: { type: String, default: '', trim: true },
  condition: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true }
}, { _id: false });

const facilitySchema = new mongoose.Schema({
  facility: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  startDate: { type: String, default: '', trim: true },
  endDate: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true }
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  vehicleType: { type: String, default: '', trim: true },
  brand: { type: String, default: '', trim: true },
  model: { type: String, default: '', trim: true },
  number: { type: String, default: '', trim: true },
  status: { type: String, default: '', trim: true }
}, { _id: false });

const reportLineSchema = new mongoose.Schema({
  title: { type: String, default: '', trim: true },
  employeeCode: { type: String, default: '', trim: true },
  employeeName: { type: String, default: '', trim: true },
  designation: { type: String, default: '', trim: true }
}, { _id: false });

const employeePhotoSchema = new mongoose.Schema({
  url: { type: String, default: '', trim: true },
  blobName: { type: String, default: '', trim: true },
  originalName: { type: String, default: '', trim: true }
}, { _id: false });

const weekOffHistorySchema = new mongoose.Schema({
  offDays: { type: [String], default: [] },
  fromDate: { type: String, default: '', trim: true },
  toDate: { type: String, default: '', trim: true }
}, { _id: false });

const staffSchema = new mongoose.Schema(
  {
    staffName: {
      type: String,
      required: true,
      trim: true
    },
    employeeCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true
    },
    deviceCode: { type: String, default: '', trim: true },
    officeEmail: { type: String, default: '', trim: true, lowercase: true },
    officeContact: { type: String, default: '', trim: true },
    nameNepali: { type: String, default: '', trim: true },
    companyName: { type: String, default: 'United English Boarding School', trim: true },
    section: { type: String, default: '', trim: true },
    gradeLevel: { type: String, default: '', trim: true },
    isManager: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    jobStatus: { type: String, default: 'Active', trim: true },
    qualification: { type: String, default: '', trim: true },
    designation: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },
    branchName: { type: String, default: '', trim: true },
    plannedIn: { type: String, default: '09:00', trim: true },
    plannedOut: { type: String, default: '17:00', trim: true },
    punchMethod: { type: String, default: 'Two Punch', trim: true },
    allowMobilePunch: { type: Boolean, default: false },
    shiftType: { type: String, default: 'Fixed', trim: true },
    shiftName: { type: String, default: '', trim: true },
    activeWeekOff: { type: [String], default: [] },
    weekOffEffectiveFrom: { type: String, default: '', trim: true },
    weekOffHistory: { type: [weekOffHistorySchema], default: [] },
    bankName: { type: String, default: '', trim: true },
    bankBranch: { type: String, default: '', trim: true },
    bankAccountNumber: { type: String, default: '', trim: true },
    panNumber: { type: String, default: '', trim: true },
    ssfNumber: { type: String, default: '', trim: true },
    dateOfJoining: { type: Date },
    employmentType: {
      type: String,
      enum: ['Permanent', 'Contract', 'Temporary', 'Part-time', 'Intern'],
      default: 'Permanent'
    },
    employmentStatus: {
      type: String,
      enum: ['Active', 'On leave', 'Resigned', 'Terminated'],
      default: 'Active'
    },
    dateOfBirth: { type: Date },
    country: { type: String, default: 'Nepal', trim: true },
    religion: { type: String, default: '', trim: true },
    passportNumber: { type: String, default: '', trim: true },
    citizenNumber: { type: String, default: '', trim: true },
    citizenshipIssueDate: { type: String, default: '', trim: true },
    citizenshipIssueOffice: { type: String, default: '', trim: true },
    fatherName: { type: String, default: '', trim: true },
    motherName: { type: String, default: '', trim: true },
    isDifferentlyAbled: { type: Boolean, default: false },
    permanentAddress: { type: String, default: '', trim: true },
    permanentDistrict: { type: String, default: '', trim: true },
    permanentMunicipality: { type: String, default: '', trim: true },
    permanentWard: { type: String, default: '', trim: true },
    permanentAddressNepali: { type: String, default: '', trim: true },
    temporaryAddress: { type: String, default: '', trim: true },
    temporaryDistrict: { type: String, default: '', trim: true },
    temporaryMunicipality: { type: String, default: '', trim: true },
    temporaryWard: { type: String, default: '', trim: true },
    temporaryAddressNepali: { type: String, default: '', trim: true },
    sameAddressAsPermanent: { type: Boolean, default: false },
    gender: { type: String, default: '', trim: true },
    maritalStatus: { type: String, default: '', trim: true },
    bloodGroup: { type: String, default: '', trim: true },
    mobileNumber: { type: String, default: '', trim: true },
    alternateMobile: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    address: { type: String, default: '', trim: true },
    emergencyContactName: { type: String, default: '', trim: true },
    emergencyContactRelation: { type: String, default: '', trim: true },
    emergencyContactNumber: { type: String, default: '', trim: true },
    emergencyContactAddress: { type: String, default: '', trim: true },
    bloodPressure: {
      type: String,
      default: '',
      trim: true
    },
    health: {
      heightCm: { type: Number, default: null, min: 0 },
      weightKg: { type: Number, default: null, min: 0 },
      bmi: { type: Number, default: null, min: 0 },
      bloodGroup: { type: String, default: '', trim: true },
      bloodPressure: { type: String, default: '', trim: true },
      medications: { type: String, default: '', trim: true },
      medicalConditions: { type: String, default: '', trim: true },
      allergies: { type: String, default: '', trim: true },
      notes: { type: String, default: '', trim: true }
    },
    qualifications: { type: [qualificationSchema], default: [] },
    experiences: { type: [experienceSchema], default: [] },
    skills: { type: [skillSchema], default: [] },
    trainings: { type: [trainingSchema], default: [] },
    familyMembers: { type: [familyMemberSchema], default: [] },
    documents: { type: [employeeDocumentSchema], default: [] },
    employeePhoto: { type: employeePhotoSchema, default: () => ({}) },
    salaryRecords: { type: [salarySchema], default: [] },
    allowances: { type: [allowanceSchema], default: [] },
    deductions: { type: [deductionSchema], default: [] },
    taxConfiguration: {
      panNumber: { type: String, default: '', trim: true },
      ssfNumber: { type: String, default: '', trim: true },
      ssfEffectiveDate: { type: String, default: '', trim: true },
      contributions: [{
        title: { type: String, default: '', trim: true },
        number: { type: String, default: '', trim: true },
        enabled: { type: Boolean, default: false },
        employeeRate: { type: Number, default: 0, min: 0 },
        employerRate: { type: Number, default: 0, min: 0 }
      }]
    },
    socialSecurityTax: {
      enabled: { type: Boolean, default: false },
      number: { type: String, default: '', trim: true },
      effectiveDate: { type: String, default: '', trim: true }
    },
    providentFund: {
      enabled: { type: Boolean, default: false },
      calculationType: { type: String, default: 'Flat', trim: true },
      number: { type: String, default: '', trim: true },
      employeeAmount: { type: Number, default: 0, min: 0 },
      employeeRate: { type: Number, default: 0, min: 0 },
      employerRate: { type: Number, default: 0, min: 0 }
    },
    citizenInvestmentTrust: {
      enabled: { type: Boolean, default: false },
      calculationType: { type: String, default: 'Flat', trim: true },
      number: { type: String, default: '', trim: true },
      amount: { type: Number, default: 0, min: 0 }
    },
    gratuity: { enabled: { type: Boolean, default: false } },
    previousCompanyTds: {
      companyName: { type: String, default: '', trim: true },
      totalSalary: { type: Number, default: 0, min: 0 },
      totalTds: { type: Number, default: 0, min: 0 },
      fiscalYear: { type: String, default: '', trim: true },
      documentName: { type: String, default: '', trim: true },
      url: { type: String, default: '', trim: true },
      blobName: { type: String, default: '', trim: true }
    },
    advances: { type: [advanceSchema], default: [] },
    contracts: { type: [contractSchema], default: [] },
    transferHistory: { type: [transferSchema], default: [] },
    promotionHistory: { type: [promotionSchema], default: [] },
    resignations: { type: [exitSchema], default: [] },
    terminations: { type: [exitSchema], default: [] },
    disciplinaryCases: { type: [disciplinarySchema], default: [] },
    exitInterviews: [{ description: { type: String, default: '', trim: true } }],
    lettersIssued: { type: [letterSchema], default: [] },
    loans: { type: [loanSchema], default: [] },
    assets: { type: [assetSchema], default: [] },
    facilities: { type: [facilitySchema], default: [] },
    personalVehicles: { type: [vehicleSchema], default: [] },
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', default: null },
    reportingLines: { type: [reportLineSchema], default: [] },
    otherInformation: { type: String, default: '', trim: true },
  },
  {
    timestamps: true
  }
);

module.exports = { staffSchema };
