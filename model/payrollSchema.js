const mongoose = require('mongoose');

const payrollComponentSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  code: { type: String, default: '', trim: true },
  category: { type: String, enum: ['ALLOWANCE', 'DEDUCTION', 'CONTRIBUTION', 'TAX', 'EARNING'], default: 'ALLOWANCE' },
  type: { type: String, enum: ['FIXED', 'PERCENT', 'FORMULA', 'HOURLY', 'DAILY'], default: 'FIXED' },
  rate: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
  basis: { type: String, enum: ['BASIC', 'GROSS', 'NET', 'CUSTOM'], default: 'BASIC' },
  taxable: { type: Boolean, default: true },
  formula: { type: String, default: '', trim: true },
  applicableTo: { type: String, enum: ['EMPLOYEE', 'EMPLOYER', 'BOTH'], default: 'EMPLOYEE' },
  active: { type: Boolean, default: true },
  effectiveFrom: { type: Date, default: null },
  effectiveUntil: { type: Date, default: null },
  accountCode: { type: String, default: '', trim: true },
}, { _id: true });

const payrollAttendancePolicySchema = new mongoose.Schema({
  configured: { type: Boolean, default: false },
  salaryDayCountMethod: { type: String, enum: ['FIXED_DIVISOR', 'ACTUAL_WORKING_DAYS', 'CALENDAR_DAYS'], default: 'ACTUAL_WORKING_DAYS' },
  fixedMonthlyDivisor: { type: Number, default: 0, min: 0 },
  weeklyOffDays: { type: [String], default: [] },
  deductUnpaidLeave: { type: Boolean, default: false },
  deductUnapprovedAbsence: { type: Boolean, default: false },
  payRecordedOvertime: { type: Boolean, default: false },
  overtimeHourlyRate: { type: Number, default: 0, min: 0 },
  applyLatePenalty: { type: Boolean, default: false },
  latePenaltyPerMinute: { type: Number, default: 0, min: 0 },
  applyEarlyDeparturePenalty: { type: Boolean, default: false },
  earlyPenaltyPerMinute: { type: Number, default: 0, min: 0 },
  requireCompleteAttendance: { type: Boolean, default: true },
}, { _id: false });

const payrollSettingsSchema = new mongoose.Schema({
  fiscalYear: { type: String, default: '', trim: true },
  payrollCycle: { type: String, enum: ['MONTHLY', 'BIWEEKLY', 'WEEKLY'], default: 'MONTHLY' },
  taxRate: { type: Number, default: 0, min: 0 },
  employeeContributionRate: { type: Number, default: 0, min: 0 },
  employerContributionRate: { type: Number, default: 0, min: 0 },
  monthlyDeduction: { type: Number, default: 0, min: 0 },
  components: { type: [payrollComponentSchema], default: [] },
  attendancePolicy: { type: payrollAttendancePolicySchema, default: () => ({}) },
  defaultTaxScheme: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollTaxScheme', default: null },
  defaultSalaryTemplate: { type: String, default: '', trim: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, default: '', trim: true },
  allowAutoPosting: { type: Boolean, default: false },
}, { timestamps: true });

const payrollTaxSlabSchema = new mongoose.Schema({
  label: { type: String, default: '', trim: true },
  minIncome: { type: Number, default: 0, min: 0 },
  maxIncome: { type: Number, default: null, min: 0 },
  rate: { type: Number, default: 0, min: 0 },
  fixedAmount: { type: Number, default: 0, min: 0 },
  effectiveFrom: { type: Date, default: null },
  effectiveUntil: { type: Date, default: null },
  active: { type: Boolean, default: true },
}, { _id: true });

const payrollTaxSchemeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  fiscalYear: { type: String, required: true, trim: true },
  calculationMode: { type: String, enum: ['PROGRESSIVE', 'FLAT', 'MARGINAL'], default: 'PROGRESSIVE' },
  annualExemption: { type: Number, default: 0, min: 0 },
  monthlyExemption: { type: Number, default: 0, min: 0 },
  annualRebate: { type: Number, default: 0, min: 0 },
  monthlyRebate: { type: Number, default: 0, min: 0 },
  previousEmployerIncome: { type: Number, default: 0, min: 0 },
  tdsDeduction: { type: Number, default: 0, min: 0 },
  slabs: { type: [payrollTaxSlabSchema], default: [] },
  active: { type: Boolean, default: true },
  effectiveFrom: { type: Date, default: null },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: String, default: '', trim: true },
  updatedBy: { type: String, default: '', trim: true },
}, { timestamps: true });

const salaryStructureSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true, index: true },
  employeeCode: { type: String, default: '', trim: true },
  fiscalYear: { type: String, required: true, trim: true },
  payrollCycle: { type: String, enum: ['MONTHLY', 'BIWEEKLY', 'WEEKLY'], default: 'MONTHLY' },
  basicSalary: { type: Number, default: 0, min: 0 },
  earningComponents: { type: [payrollComponentSchema], default: [] },
  deductionComponents: { type: [payrollComponentSchema], default: [] },
  employerContributions: { type: [payrollComponentSchema], default: [] },
  taxScheme: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollTaxScheme', default: null },
  ssfEnabled: { type: Boolean, default: false },
  pfEnabled: { type: Boolean, default: false },
  citEnabled: { type: Boolean, default: false },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'HISTORICAL', 'REJECTED'], default: 'DRAFT' },
  isTemplate: { type: Boolean, default: false },
  templateName: { type: String, default: '', trim: true },
  revisionCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: String, default: '', trim: true },
  updatedBy: { type: String, default: '', trim: true },
}, { timestamps: true });

const salaryRevisionSchema = new mongoose.Schema({
  structure: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
  revisionNumber: { type: Number, required: true, min: 1 },
  effectiveFrom: { type: Date, required: true },
  reason: { type: String, default: '', trim: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  previousRevision: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRevision', default: null },
  changedBy: { type: String, default: '', trim: true },
}, { timestamps: true });

const employeeAdvanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
  employeeCode: { type: String, default: '', trim: true },
  amount: { type: Number, required: true, min: 0 },
  purpose: { type: String, default: '', trim: true },
  requestDate: { type: Date, default: Date.now },
  approvedDate: { type: Date, default: null },
  disbursedDate: { type: Date, default: null },
  recoveryStartMonth: { type: String, default: '', trim: true },
  monthlyInstallment: { type: Number, default: 0, min: 0 },
  outstandingBalance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['REQUESTED', 'APPROVED', 'DISBURSED', 'REJECTED', 'PARTIALLY_RECOVERED', 'FULLY_RECOVERED'], default: 'REQUESTED' },
  approvedBy: { type: String, default: '', trim: true },
  createdBy: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
}, { timestamps: true });

const employeeLoanSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
  employeeCode: { type: String, default: '', trim: true },
  principal: { type: Number, required: true, min: 0 },
  interestRate: { type: Number, default: 0, min: 0 },
  method: { type: String, enum: ['FIXED', 'REDUCING_BALANCE'], default: 'FIXED' },
  approvedDate: { type: Date, default: null },
  disbursedDate: { type: Date, default: null },
  recoveryStartMonth: { type: String, default: '', trim: true },
  installmentAmount: { type: Number, default: 0, min: 0 },
  outstandingPrincipal: { type: Number, default: 0, min: 0 },
  outstandingInterest: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['REQUESTED', 'APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED', 'REJECTED'], default: 'REQUESTED' },
  approvedBy: { type: String, default: '', trim: true },
  createdBy: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
}, { timestamps: true });

const payrollRunSchema = new mongoose.Schema({
  branch: { type: String, default: '', trim: true },
  fiscalYear: { type: String, required: true, trim: true },
  payrollMonth: { type: String, required: true, trim: true },
  periodYear: { type: Number, required: true, min: 1900, max: 9999 },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  periodLabel: { type: String, default: '', trim: true },
  employeeCount: { type: Number, default: 0, min: 0 },
  grossSalary: { type: Number, default: 0, min: 0 },
  totalDeductions: { type: Number, default: 0, min: 0 },
  totalEmployerContributions: { type: Number, default: 0, min: 0 },
  totalTax: { type: Number, default: 0, min: 0 },
  totalNetSalary: { type: Number, default: 0, min: 0 },
  totalEmployerCost: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['DRAFT', 'CALCULATED', 'SUBMITTED', 'ACCOUNTANT_REVIEW', 'ADMIN_APPROVAL', 'POSTED', 'REJECTED', 'REVERSED'], default: 'DRAFT' },
  createdBy: { type: String, default: '', trim: true },
  submittedBy: { type: String, default: '', trim: true },
  approvedBy: { type: String, default: '', trim: true },
  postedBy: { type: String, default: '', trim: true },
  locked: { type: Boolean, default: false },
  attendanceOverride: { type: Boolean, default: false },
  attendanceOverrideBy: { type: String, default: '', trim: true },
  attendanceOverrideReason: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
}, { timestamps: true });

payrollRunSchema.index({ fiscalYear: 1, payrollMonth: 1, branch: 1 }, { unique: true, sparse: true });

const payrollItemSchema = new mongoose.Schema({
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
  employeeCode: { type: String, default: '', trim: true },
  salaryStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure', default: null },
  basicSalary: { type: Number, default: 0, min: 0 },
  allowances: { type: Number, default: 0, min: 0 },
  overtime: { type: Number, default: 0, min: 0 },
  grossSalary: { type: Number, default: 0, min: 0 },
  taxableIncome: { type: Number, default: 0, min: 0 },
  taxAmount: { type: Number, default: 0, min: 0 },
  employeeDeductions: { type: Number, default: 0, min: 0 },
  employerContributions: { type: Number, default: 0, min: 0 },
  advanceRecovery: { type: Number, default: 0, min: 0 },
  loanInstallment: { type: Number, default: 0, min: 0 },
  otherDeductions: { type: Number, default: 0, min: 0 },
  netSalary: { type: Number, default: 0, min: 0 },
  employerCost: { type: Number, default: 0, min: 0 },
  attendanceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['DRAFT', 'VALID', 'WARNING', 'EXCEPTION', 'APPROVED'], default: 'DRAFT' },
  warnings: { type: [String], default: [] },
  calculationBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const payrollPaymentSchema = new mongoose.Schema({
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
  payrollItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollItem', default: null },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, enum: ['CASH', 'BANK', 'BANK_TRANSFER', 'CHEQUE'], default: 'BANK' },
  paymentDate: { type: Date, default: null },
  referenceNumber: { type: String, default: '', trim: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'PARTIAL', 'FAILED'], default: 'PENDING' },
  journalVoucher: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalVoucher', default: null },
  notes: { type: String, default: '', trim: true },
}, { timestamps: true });

const payrollApprovalSchema = new mongoose.Schema({
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
  step: { type: String, enum: ['DRAFT', 'SUBMITTED', 'ACCOUNTANT_REVIEW', 'ADMIN_APPROVAL', 'POSTED'], default: 'DRAFT' },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'], default: 'PENDING' },
  actor: { type: String, default: '', trim: true },
  role: { type: String, default: '', trim: true },
  comment: { type: String, default: '', trim: true },
  actionAt: { type: Date, default: Date.now },
}, { timestamps: true });

const payrollAdjustmentSchema = new mongoose.Schema({
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'staff', default: null },
  type: { type: String, enum: ['INCREASE', 'DECREASE', 'REVERSAL', 'ADJUSTMENT'], default: 'ADJUSTMENT' },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, default: '', trim: true },
  reference: { type: String, default: '', trim: true },
  createdBy: { type: String, default: '', trim: true },
  approvedBy: { type: String, default: '', trim: true },
  status: { type: String, enum: ['DRAFT', 'APPROVED', 'POSTED'], default: 'DRAFT' },
}, { timestamps: true });

const payrollAuditLogSchema = new mongoose.Schema({
  entityType: { type: String, required: true, trim: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  action: { type: String, required: true, trim: true },
  message: { type: String, default: '', trim: true },
  actor: { type: String, default: '', trim: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const PayrollSettings = mongoose.models.PayrollSettings || mongoose.model('PayrollSettings', payrollSettingsSchema, 'payrollsettings');
const PayrollTaxSlab = mongoose.models.PayrollTaxSlab || mongoose.model('PayrollTaxSlab', payrollTaxSlabSchema, 'payrolltaxslabs');
const PayrollTaxScheme = mongoose.models.PayrollTaxScheme || mongoose.model('PayrollTaxScheme', payrollTaxSchemeSchema, 'payrolltaxschemes');
const SalaryStructure = mongoose.models.SalaryStructure || mongoose.model('SalaryStructure', salaryStructureSchema, 'salarystructures');
const SalaryRevision = mongoose.models.SalaryRevision || mongoose.model('SalaryRevision', salaryRevisionSchema, 'salaryrevisions');
const EmployeeAdvance = mongoose.models.EmployeeAdvance || mongoose.model('EmployeeAdvance', employeeAdvanceSchema, 'employeeadvances');
const EmployeeLoan = mongoose.models.EmployeeLoan || mongoose.model('EmployeeLoan', employeeLoanSchema, 'employeeloans');
const PayrollRun = mongoose.models.PayrollRun || mongoose.model('PayrollRun', payrollRunSchema, 'payrollruns');
const PayrollItem = mongoose.models.PayrollItem || mongoose.model('PayrollItem', payrollItemSchema, 'payrollitems');
const PayrollPayment = mongoose.models.PayrollPayment || mongoose.model('PayrollPayment', payrollPaymentSchema, 'payrollpayments');
const PayrollApproval = mongoose.models.PayrollApproval || mongoose.model('PayrollApproval', payrollApprovalSchema, 'payrollapprovals');
const PayrollAdjustment = mongoose.models.PayrollAdjustment || mongoose.model('PayrollAdjustment', payrollAdjustmentSchema, 'payrolladjustments');
const PayrollAuditLog = mongoose.models.PayrollAuditLog || mongoose.model('PayrollAuditLog', payrollAuditLogSchema, 'payrollauditlogs');

module.exports = {
  payrollComponentSchema,
  payrollAttendancePolicySchema,
  payrollSettingsSchema,
  payrollTaxSlabSchema,
  payrollTaxSchemeSchema,
  salaryStructureSchema,
  salaryRevisionSchema,
  employeeAdvanceSchema,
  employeeLoanSchema,
  payrollRunSchema,
  payrollItemSchema,
  payrollPaymentSchema,
  payrollApprovalSchema,
  payrollAdjustmentSchema,
  payrollAuditLogSchema,
  PayrollSettings,
  PayrollTaxSlab,
  PayrollTaxScheme,
  SalaryStructure,
  SalaryRevision,
  EmployeeAdvance,
  EmployeeLoan,
  PayrollRun,
  PayrollItem,
  PayrollPayment,
  PayrollApproval,
  PayrollAdjustment,
  PayrollAuditLog,
};
