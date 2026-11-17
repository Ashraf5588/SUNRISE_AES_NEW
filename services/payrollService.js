const mongoose = require('mongoose');
const { staffSchema } = require('../model/staffschema');
const {
  PayrollSettings,
  PayrollTaxScheme,
  SalaryStructure,
  PayrollRun,
  PayrollItem,
  SalaryRevision,
  EmployeeAdvance,
  EmployeeLoan,
} = require('../model/payrollSchema');
const payrollAttendanceService = require('./payrollAttendanceService');
const {
  calculateAttendancePay,
  getPeriodRange,
  isEmployeeEligibleForPeriod,
} = require('../utils/payrollAttendance');

const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');

const normalizeNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = value => Number((Number(value) || 0).toFixed(2));

const dedupeEmployees = employees => {
  const map = new Map();
  for (const employee of Array.isArray(employees) ? employees : []) {
    if (!employee || !employee._id) continue;
    const employeeCode = String(employee.employeeCode || '').trim().toLowerCase();
    const employeeName = String(employee.staffName || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const key = employeeCode && employeeName
      ? `${employeeCode}:${employeeName}`
      : String(employee._id);
    if (!map.has(key)) map.set(key, employee);
  }
  return [...map.values()];
};

const getLatestSalaryRecord = employee => {
  const records = Array.isArray(employee?.salaryRecords) ? employee.salaryRecords : [];
  if (!records.length) {
    return { total: 0, basicSalary: 0, allowance: 0, dearness: 0 };
  }

  const latest = [...records].sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')))[0];
  return {
    total: normalizeNumber(latest?.total || latest?.basicSalary || 0),
    basicSalary: normalizeNumber(latest?.basicSalary || 0),
    allowance: normalizeNumber(latest?.allowance || 0),
    dearness: normalizeNumber(latest?.dearness || 0),
  };
};

const safeComponentValue = (component, baseSalary, attendance = {}) => {
  if (!component || component.active === false) return 0;
  const rate = normalizeNumber(component.rate ?? component.value ?? 0);
  const amount = normalizeNumber(component.amount ?? component.value ?? 0);

  switch (String(component.type || 'FIXED').toUpperCase()) {
    case 'FIXED':
      return amount || rate;
    case 'PERCENT': {
      const percentageBase = String(component.basis || 'BASIC').toUpperCase() === 'GROSS'
        ? normalizeNumber(attendance.grossSalary ?? baseSalary)
        : baseSalary;
      return percentageBase * (rate / 100);
    }
    case 'FORMULA': {
      if (!component.formula) return 0;
      const formula = String(component.formula || '').trim();
      const substituted = formula
        .replace(/basicSalary/gi, String(baseSalary || 0))
        .replace(/grossSalary/gi, String(baseSalary || 0))
        .replace(/netSalary/gi, String(baseSalary || 0));
      try {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${substituted});`)();
        return normalizeNumber(result);
      } catch (error) {
        return 0;
      }
    }
    case 'HOURLY':
      return rate * Math.max(0, normalizeNumber(attendance.workedHours));
    case 'DAILY':
      return rate * Math.max(0, normalizeNumber(attendance.payableDays));
    default:
      return amount || rate;
  }
};

const normalizePayrollComponents = components => {
  const categories = ['ALLOWANCE', 'DEDUCTION', 'CONTRIBUTION', 'TAX', 'EARNING'];
  const calculationTypes = ['FIXED', 'PERCENT', 'FORMULA', 'HOURLY', 'DAILY'];
  const bases = ['BASIC', 'GROSS', 'NET', 'CUSTOM'];
  const normalizedComponents = Array.isArray(components) ? components : [];

  for (const component of normalizedComponents) {
    const values = [component.category, component.type, component.basis]
      .map(value => String(value || '').trim().toUpperCase());
    const category = values.find(value => categories.includes(value)) || 'ALLOWANCE';
    const type = values.find(value => calculationTypes.includes(value)) || 'FIXED';
    const basis = values.find(value => bases.includes(value)) || 'BASIC';

    component.category = category;
    component.type = type;
    component.basis = basis;
  }

  return normalizedComponents;
};

const getActiveSalaryStructure = async (employeeId, asOfDate = new Date()) => {
  if (!employeeId) return null;
  return SalaryStructure.findOne({
    employee: employeeId,
    status: { $in: ['ACTIVE', 'HISTORICAL'] },
    effectiveFrom: { $lte: asOfDate },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: asOfDate } }],
  })
    .sort({ effectiveFrom: -1, updatedAt: -1 })
    .populate('taxScheme')
    .lean();
};

const getDefaultTaxScheme = async settings => {
  if (!settings?.defaultTaxScheme) return null;
  return PayrollTaxScheme.findById(settings.defaultTaxScheme).lean();
};

const calculateTaxFromScheme = (taxableSalary, scheme) => {
  if (!scheme || !Array.isArray(scheme.slabs) || !scheme.slabs.length) return 0;
  const annualExemption = normalizeNumber(scheme.annualExemption || 0);
  const salaryAfterExemption = Math.max(0, taxableSalary - annualExemption);
  if (salaryAfterExemption <= 0) return 0;

  const slabs = [...scheme.slabs]
    .filter(slab => slab && slab.active !== false)
    .sort((a, b) => normalizeNumber(a.minIncome) - normalizeNumber(b.minIncome));

  let tax = 0;
  for (const slab of slabs) {
    const min = normalizeNumber(slab.minIncome || 0);
    const max = slab.maxIncome === null || slab.maxIncome === undefined ? Number.POSITIVE_INFINITY : normalizeNumber(slab.maxIncome || 0);
    const rate = normalizeNumber(slab.rate || 0) / 100;
    const fixedAmount = normalizeNumber(slab.fixedAmount || 0);

    if (salaryAfterExemption <= min) continue;
    const taxableInThisSlab = Math.min(salaryAfterExemption, max) - min;
    if (taxableInThisSlab <= 0) continue;
    tax += (taxableInThisSlab * rate) + fixedAmount;
  }

  return roundMoney(tax / 12);
};

const getComponentTotal = (components, baseSalary, attendance = {}, attendanceBasedOnly = null) => (
  Array.isArray(components) ? components.reduce((sum, component) => {
    const isAttendanceBased = ['HOURLY', 'DAILY'].includes(String(component?.type || '').toUpperCase());
    if (attendanceBasedOnly !== null && isAttendanceBased !== attendanceBasedOnly) return sum;
    return sum + safeComponentValue(component, baseSalary, attendance);
  }, 0) : 0
);

const ensureSettings = async () => {
  let settings = await PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 }).lean();
  if (!settings) {
    settings = await PayrollSettings.create({
      fiscalYear: '',
      payrollCycle: 'MONTHLY',
      taxRate: 0,
      employeeContributionRate: 0,
      employerContributionRate: 0,
      monthlyDeduction: 0,
      components: [],
      active: true,
      allowAutoPosting: false,
      updatedBy: 'system',
    });
  }
  return settings;
};

const calculateEmployeePayrollPreview = async (employee, settings = {}, structureOverride = null, attendance = {}) => {
  const structure = structureOverride || await getActiveSalaryStructure(employee?._id);
  const latestSalary = getLatestSalaryRecord(employee);
  const baseSalary = normalizeNumber(structure?.basicSalary ?? latestSalary.total ?? latestSalary.basicSalary ?? 0);
  const structureEarnings = Array.isArray(structure?.earningComponents) ? structure.earningComponents : [];
  const structureDeductions = Array.isArray(structure?.deductionComponents) ? structure.deductionComponents : [];
  const allowanceValue = Array.isArray(employee?.allowances) ? employee.allowances.reduce((sum, entry) => sum + normalizeNumber(entry?.value || 0), 0) : 0;
  const regularGrossPercentEarnings = structureEarnings.filter(component => (
    String(component?.type || '').toUpperCase() === 'PERCENT'
    && String(component?.basis || '').toUpperCase() === 'GROSS'
  ));
  const regularOtherEarnings = structureEarnings.filter(component => !regularGrossPercentEarnings.includes(component));
  const regularOtherEarningsValue = getComponentTotal(regularOtherEarnings, baseSalary, attendance, false);
  const preliminaryGross = baseSalary + regularOtherEarningsValue + allowanceValue;
  const grossBasisEarnings = getComponentTotal(
    regularGrossPercentEarnings,
    baseSalary,
    { ...attendance, grossSalary: preliminaryGross },
    false,
  );
  const regularEarnings = regularOtherEarningsValue + grossBasisEarnings;
  const attendanceBasedEarnings = getComponentTotal(structureEarnings, baseSalary, attendance, true);
  const attendanceComponentConfigured = structureEarnings.some(component => component?.active !== false
    && ['HOURLY', 'DAILY'].includes(String(component?.type || '').toUpperCase())
    && normalizeNumber(component.rate ?? component.value ?? 0) > 0);
  const deductionValue = Array.isArray(employee?.deductions) ? employee.deductions.reduce((sum, entry) => sum + normalizeNumber(entry?.value || 0), 0) : 0;
  const attendanceBaseSalary = baseSalary + regularEarnings + allowanceValue;
  const grossSalary = attendanceBaseSalary + attendanceBasedEarnings;
  const nonTaxableEarnings = getComponentTotal(
    structureEarnings.filter(component => component?.taxable === false),
    baseSalary,
    { ...attendance, grossSalary },
  );
  const taxableGrossSalary = Math.max(0, grossSalary - nonTaxableEarnings);

  const scheme = structure?.taxScheme || await getDefaultTaxScheme(settings) || null;
  const tax = calculateTaxFromScheme(taxableGrossSalary, scheme);
  const employeeContributionRate = normalizeNumber(settings.employeeContributionRate || 0) / 100;
  const employerContributionRate = normalizeNumber(settings.employerContributionRate || 0) / 100;
  const monthlyDeduction = normalizeNumber(settings.monthlyDeduction || 0);
  const employeeContribution = grossSalary * employeeContributionRate;
  const employerContribution = grossSalary * employerContributionRate;
  const structureDeductionValue = getComponentTotal(
    structureDeductions,
    baseSalary,
    { ...attendance, grossSalary },
  );
  const deductions = deductionValue + structureDeductionValue + employeeContribution + tax + monthlyDeduction;
  const netSalary = Math.max(0, grossSalary - deductions);

  return {
    employeeId: String(employee?._id || ''),
    employeeName: employee?.staffName || employee?.name || 'Employee',
    employeeCode: employee?.employeeCode || '',
    basicSalary: roundMoney(baseSalary),
    grossSalary: roundMoney(grossSalary),
    taxableIncome: roundMoney(taxableGrossSalary),
    allowances: roundMoney(allowanceValue + regularEarnings + attendanceBasedEarnings),
    attendanceBaseSalary: roundMoney(attendanceBaseSalary),
    attendanceBasedEarnings: roundMoney(attendanceBasedEarnings),
    salaryConfigured: attendanceBaseSalary > 0 || attendanceBasedEarnings > 0 || attendanceComponentConfigured,
    employeeContribution: roundMoney(employeeContribution),
    employerContribution: roundMoney(employerContribution),
    tax: roundMoney(tax),
    deductions: roundMoney(deductions),
    netSalary: roundMoney(netSalary),
    structureId: structure?._id ? String(structure._id) : null,
    taxScheme: scheme,
    employeeContributionRate: employeeContributionRate * 100,
    employerContributionRate: employerContributionRate * 100,
  };
};

const getActiveEmployees = async period => {
  const employees = await Staff.find({
  }, {
    staffName: 1,
    employeeCode: 1,
    isActive: 1,
    employmentStatus: 1,
    dateOfJoining: 1,
    lastWorkingDate: 1,
    resignations: 1,
    terminations: 1,
    activeWeekOff: 1,
    weekOffHistory: 1,
    plannedIn: 1,
    plannedOut: 1,
    midTime: 1,
    branchName: 1,
    department: 1,
    salaryRecords: 1,
    allowances: 1,
    deductions: 1,
    taxConfiguration: 1,
    previousCompanyTds: 1,
    providentFund: 1,
    socialSecurityTax: 1,
    citizenInvestmentTrust: 1,
  }).lean();

  return dedupeEmployees(employees).filter(employee => !period || isEmployeeEligibleForPeriod(employee, period));
};

const getPayrollDashboard = async ({
  periodYear = new Date().getFullYear(),
  payrollMonth = new Date().getMonth() + 1,
  attendanceOverride = false,
  userRole = '',
} = {}) => {
  const settings = await ensureSettings();
  const period = getPeriodRange(periodYear, payrollMonth);
  const employees = await getActiveEmployees(period);
  const attendancePolicy = settings.attendancePolicy || {};
  const attendancePeriod = await payrollAttendanceService.loadPeriodAttendance({
    employees,
    periodYear,
    payrollMonth,
    policy: attendancePolicy,
  });
  const calculations = [];

  for (const employee of employees) {
    const structure = await getActiveSalaryStructure(employee._id, period.end);
    const attendance = attendancePeriod.results.get(String(employee._id));
    const preview = await calculateEmployeePayrollPreview(employee, settings, structure, attendance);
    const attendancePay = calculateAttendancePay({
      monthlySalary: preview.attendanceBaseSalary,
      attendance: attendance || {},
      policy: attendancePolicy,
    });
    const attendanceDeduction = attendancePay.attendanceDeduction
      + attendancePay.latePenalty
      + attendancePay.earlyPenalty;
    const grossSalary = attendancePay.error
      ? 0
      : roundMoney(attendancePay.proratedSalary + preview.attendanceBasedEarnings + attendancePay.overtimePay);
    const employeeContribution = roundMoney(grossSalary * normalizeNumber(settings.employeeContributionRate || 0) / 100);
    const employerContribution = roundMoney(grossSalary * normalizeNumber(settings.employerContributionRate || 0) / 100);
    const tax = calculateTaxFromScheme(grossSalary, preview.taxScheme);
    const deductionsBeforeAttendance = Math.max(0,
      preview.deductions - preview.employeeContribution - preview.tax);
    const deductions = roundMoney(
      deductionsBeforeAttendance
        + employeeContribution
        + tax
        + attendanceDeduction
    );
    const netSalary = Math.max(0, roundMoney(grossSalary - deductions));
    calculations.push({
      ...preview,
      grossSalary,
      employeeContribution,
      employerContribution,
      tax,
      deductions,
      netSalary,
      attendance: attendance || null,
      attendancePay,
      attendanceWarnings: attendance?.warnings || [],
      attendanceIncomplete: Boolean(attendance?.incomplete),
      salaryMissing: !preview.salaryConfigured,
      attendanceExplanation: attendancePay.explanation || attendancePay.error,
    });
  }

  const totalGross = calculations.reduce((sum, item) => sum + Number(item.grossSalary || 0), 0);
  const totalDeductions = calculations.reduce((sum, item) => sum + Number(item.deductions || 0), 0);
  const totalNet = calculations.reduce((sum, item) => sum + Number(item.netSalary || 0), 0);
  const totalEmployerContribution = calculations.reduce((sum, item) => sum + Number(item.employerContribution || 0), 0);
  const attendancePolicyConfigured = Boolean(attendancePolicy.configured);
  const attendanceCalculationErrors = calculations.some(item => item.attendancePay?.error);
  const salaryIncompleteEmployees = calculations.filter(item => item.salaryMissing).length;
  const attendancePolicyIncompleteEmployees = [...attendancePeriod.results.values()]
    .filter(result => result.policyMissing).length;
  const authorizedAttendanceOverride = attendanceOverride && String(userRole).toUpperCase() === 'ADMIN';

  return {
    settings,
    summary: {
      employeeCount: calculations.length,
      totalGross: roundMoney(totalGross),
      totalDeductions: roundMoney(totalDeductions),
      totalNet: roundMoney(totalNet),
      totalEmployerContribution: roundMoney(totalEmployerContribution),
    },
    employees: calculations,
    period: attendancePeriod.period,
    periodYear: Number(periodYear),
    payrollMonth: String(Number(payrollMonth)).padStart(2, '0'),
    attendancePolicy,
    attendanceIncompleteEmployees: attendancePeriod.incompleteEmployees,
    attendancePolicyIncompleteEmployees,
    attendancePolicyConfigured,
    salaryIncompleteEmployees,
    canCalculate: attendancePolicyConfigured
      && !attendanceCalculationErrors
      && calculations.length > 0
      && salaryIncompleteEmployees === 0
      && (attendancePeriod.incompleteEmployees === 0
        || (authorizedAttendanceOverride && attendancePolicyIncompleteEmployees === 0)),
  };
};

const saveSettings = async ({
  fiscalYear,
  taxRate,
  employeeContributionRate,
  employerContributionRate,
  monthlyDeduction,
  payrollCycle,
  attendancePolicy = {},
  updatedBy,
}) => {
  const salaryDayCountMethod = ['FIXED_DIVISOR', 'ACTUAL_WORKING_DAYS', 'CALENDAR_DAYS']
    .includes(String(attendancePolicy.salaryDayCountMethod || ''))
    ? String(attendancePolicy.salaryDayCountMethod)
    : 'ACTUAL_WORKING_DAYS';
  const fixedMonthlyDivisor = normalizeNumber(attendancePolicy.fixedMonthlyDivisor);
  const configured = attendancePolicy.configured === true
    && (salaryDayCountMethod !== 'FIXED_DIVISOR' || fixedMonthlyDivisor > 0);
  const payload = {
    fiscalYear: String(fiscalYear || '').trim(),
    taxRate: normalizeNumber(taxRate),
    employeeContributionRate: normalizeNumber(employeeContributionRate),
    employerContributionRate: normalizeNumber(employerContributionRate),
    monthlyDeduction: normalizeNumber(monthlyDeduction),
    payrollCycle: ['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(String(payrollCycle || 'MONTHLY')) ? String(payrollCycle) : 'MONTHLY',
    attendancePolicy: {
      configured,
      salaryDayCountMethod,
      fixedMonthlyDivisor,
      weeklyOffDays: Array.isArray(attendancePolicy.weeklyOffDays)
        ? attendancePolicy.weeklyOffDays
          .map(day => String(day).trim())
          .filter(day => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            .some(validDay => validDay.toLowerCase() === day.toLowerCase()))
          .map(day => day[0].toUpperCase() + day.slice(1).toLowerCase())
        : [],
      deductUnpaidLeave: attendancePolicy.deductUnpaidLeave === true,
      deductUnapprovedAbsence: attendancePolicy.deductUnapprovedAbsence === true,
      payRecordedOvertime: attendancePolicy.payRecordedOvertime === true,
      overtimeHourlyRate: normalizeNumber(attendancePolicy.overtimeHourlyRate),
      applyLatePenalty: attendancePolicy.applyLatePenalty === true,
      latePenaltyPerMinute: normalizeNumber(attendancePolicy.latePenaltyPerMinute),
      applyEarlyDeparturePenalty: attendancePolicy.applyEarlyDeparturePenalty === true,
      earlyPenaltyPerMinute: normalizeNumber(attendancePolicy.earlyPenaltyPerMinute),
      requireCompleteAttendance: true,
    },
    updatedBy: String(updatedBy || 'system').trim(),
  };

  let existing = await PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 });
  if (!existing) {
    existing = await PayrollSettings.create({ ...payload, active: true });
    return existing;
  }

  normalizePayrollComponents(existing.components);
  existing.set(payload);
  await existing.save();
  return existing;
};

const savePayrollComponent = async ({ componentId, code, name, category, type, value, basis, taxable, updatedBy }) => {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const normalizedName = String(name || '').trim();
  const normalizedCategory = String(category || '').trim().toUpperCase();
  const normalizedType = String(type || '').trim().toUpperCase();
  const normalizedBasis = String(basis || 'BASIC').trim().toUpperCase();
  const rawValue = String(value ?? '').trim();
  const numericValue = Number(value);

  if (!/^[A-Z0-9_-]{2,40}$/.test(normalizedCode)) {
    throw new Error('Use 2–40 letters, numbers, hyphens, or underscores for the component code.');
  }
  if (!normalizedName || normalizedName.length > 100) throw new Error('Enter a title of 1–100 characters.');
  if (!['ALLOWANCE', 'DEDUCTION'].includes(normalizedCategory)) throw new Error('Choose an earning or deduction type.');
  if (!['FIXED', 'PERCENT'].includes(normalizedType)) throw new Error('Choose a supported calculation method.');
  if (!rawValue || !Number.isFinite(numericValue) || numericValue < 0) throw new Error('Enter a non-negative amount or percentage.');
  if (!['BASIC', 'GROSS'].includes(normalizedBasis)) throw new Error('Choose Basic salary or Gross salary as the percentage basis.');

  let settings = await PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 });
  if (!settings) {
    await ensureSettings();
    settings = await PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 });
  }
  if (!settings) throw new Error('Unable to load payroll settings.');

  normalizePayrollComponents(settings.components);
  const duplicate = settings.components.find(component => (
    String(component._id) !== String(componentId || '')
    && String(component.code || '').trim().toUpperCase() === normalizedCode
  ));
  if (duplicate) throw new Error(`The component code ${normalizedCode} is already in use.`);

  const componentData = {
    code: normalizedCode,
    name: normalizedName,
    category: normalizedCategory,
    type: normalizedType,
    rate: normalizedType === 'PERCENT' ? numericValue : 0,
    amount: normalizedType === 'FIXED' ? numericValue : 0,
    basis: normalizedBasis,
    taxable: taxable === true,
  };
  let component;
  if (componentId) {
    component = settings.components.id(componentId);
    if (!component) throw new Error('Payroll component not found.');
    component.set(componentData);
  } else {
    settings.components.push(componentData);
    component = settings.components[settings.components.length - 1];
  }

  settings.updatedBy = String(updatedBy || 'system').trim();
  await settings.save();
  return component;
};

const setPayrollComponentStatus = async ({ componentId, active, updatedBy }) => {
  let settings = await PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 });
  if (!settings) throw new Error('Payroll settings were not found.');
  normalizePayrollComponents(settings.components);
  const component = settings.components.id(componentId);
  if (!component) throw new Error('Payroll component not found.');

  component.active = active === true;
  settings.updatedBy = String(updatedBy || 'system').trim();
  await settings.save();
  return component;
};

const createTaxScheme = async ({ name, fiscalYear, calculationMode = 'PROGRESSIVE', slabs = [], createdBy }) => {
  if (!name) throw new Error('A tax scheme name is required.');
  if (!Array.isArray(slabs) || !slabs.length) {
    throw new Error('At least one tax slab is required to configure the tax scheme.');
  }

  const scheme = await PayrollTaxScheme.create({
    name: String(name).trim(),
    fiscalYear: String(fiscalYear || '').trim(),
    calculationMode,
    slabs: slabs.map(slab => ({
      label: String(slab.label || '').trim(),
      minIncome: normalizeNumber(slab.minIncome),
      maxIncome: slab.maxIncome === '' || slab.maxIncome === null ? null : normalizeNumber(slab.maxIncome),
      rate: normalizeNumber(slab.rate),
      fixedAmount: normalizeNumber(slab.fixedAmount),
      effectiveFrom: slab.effectiveFrom ? new Date(slab.effectiveFrom) : null,
      effectiveUntil: slab.effectiveUntil ? new Date(slab.effectiveUntil) : null,
      active: slab.active !== false,
    })),
    active: true,
    createdBy: String(createdBy || 'system').trim(),
    updatedBy: String(createdBy || 'system').trim(),
  });

  return scheme;
};

const createSalaryStructure = async ({ employeeId, fiscalYear, basicSalary, earningComponents, deductionComponents, employerContributions, payrollCycle, taxScheme, effectiveFrom, createdBy }) => {
  if (!mongoose.isValidObjectId(employeeId)) throw new Error('Choose a valid employee.');
  const employee = await Staff.findById(employeeId).lean();
  if (!employee) throw new Error('Employee record not found.');

  const existing = await SalaryStructure.findOne({ employee: employeeId, fiscalYear: String(fiscalYear || ''), status: 'ACTIVE' }).sort({ effectiveFrom: -1 }).lean();
  if (existing) {
    existing.status = 'HISTORICAL';
    await SalaryStructure.updateOne({ _id: existing._id }, { $set: { status: 'HISTORICAL', effectiveUntil: new Date(effectiveFrom || Date.now()) } });
  }

  const structure = await SalaryStructure.create({
    employee: employeeId,
    employeeCode: employee.employeeCode || '',
    fiscalYear: String(fiscalYear || '').trim(),
    payrollCycle: ['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(String(payrollCycle || 'MONTHLY')) ? String(payrollCycle) : 'MONTHLY',
    basicSalary: normalizeNumber(basicSalary),
    earningComponents: Array.isArray(earningComponents) ? earningComponents : [],
    deductionComponents: Array.isArray(deductionComponents) ? deductionComponents : [],
    employerContributions: Array.isArray(employerContributions) ? employerContributions : [],
    taxScheme: taxScheme || null,
    effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
    status: 'ACTIVE',
    createdBy: String(createdBy || 'system').trim(),
    updatedBy: String(createdBy || 'system').trim(),
  });

  await SalaryRevision.create({
    structure: structure._id,
    employee: employeeId,
    revisionNumber: (existing?.revisionCount || 0) + 1,
    effectiveFrom: structure.effectiveFrom,
    reason: 'Initial salary structure creation',
    snapshot: structure.toObject(),
    changedBy: String(createdBy || 'system').trim(),
  });

  return structure;
};

const getEmployeeSalaryHistory = async employeeId => {
  if (!mongoose.isValidObjectId(employeeId)) return [];
  return SalaryStructure.find({ employee: employeeId }).sort({ effectiveFrom: -1 }).lean();
};

const createPayrollRun = async ({
  fiscalYear,
  payrollMonth,
  periodYear,
  branch,
  createdBy,
  userRole,
  attendanceOverride = false,
  attendanceOverrideReason = '',
}) => {
  if (!fiscalYear || !payrollMonth || !periodYear) {
    throw new Error('Fiscal year and payroll month are required.');
  }
  const period = getPeriodRange(periodYear, payrollMonth);
  const override = attendanceOverride === true && String(userRole).toUpperCase() === 'ADMIN';
  if (attendanceOverride && !override) {
    throw new Error('Only an administrator can override incomplete attendance.');
  }
  if (override && !String(attendanceOverrideReason || '').trim()) {
    throw new Error('An administrator must provide a reason for the attendance override.');
  }

  const normalizedBranch = String(branch || '').trim();
  const normalizedMonth = String(Number(payrollMonth)).padStart(2, '0');
  const existing = await PayrollRun.findOne({
    fiscalYear: String(fiscalYear).trim(),
    payrollMonth: normalizedMonth,
    periodYear: Number(periodYear),
    branch: normalizedBranch,
    status: { $ne: 'REVERSED' },
  });

  if (existing) {
    throw new Error('A payroll run already exists for this branch, fiscal year, and month.');
  }

  const dashboard = await getPayrollDashboard({
    periodYear,
    payrollMonth,
    attendanceOverride: override,
    userRole,
  });
  if (!dashboard.canCalculate) {
    if (!dashboard.attendancePolicyConfigured) {
      throw new Error('Configure an attendance payroll policy and divisor before creating a payroll run.');
    }
    if (!dashboard.employees.length) {
      throw new Error('No eligible employee records were found for the selected payroll period.');
    }
    if (dashboard.salaryIncompleteEmployees > 0) {
      throw new Error(`A salary structure or salary record is missing for ${dashboard.salaryIncompleteEmployees} employee(s). Payroll generation is blocked.`);
    }
    if (dashboard.attendancePolicyIncompleteEmployees > 0) {
      throw new Error('Configure the weekly-off schedule for every selected employee before creating a payroll run.');
    }
    const affected = dashboard.employees
      .filter(employee => employee.attendanceIncomplete)
      .map(employee => employee.employeeName)
      .slice(0, 5);
    throw new Error(`Payroll calculation blocked because attendance or policy data is incomplete for ${dashboard.attendanceIncompleteEmployees} employee(s).${affected.length ? ` Review: ${affected.join(', ')}.` : ''} An authorized administrator may approve an override with a reason.`);
  }
  const run = await PayrollRun.create({
    branch: normalizedBranch,
    fiscalYear: String(fiscalYear).trim(),
    payrollMonth: normalizedMonth,
    periodYear: Number(periodYear),
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: `${String(periodYear)}-${normalizedMonth}`,
    employeeCount: dashboard.summary.employeeCount,
    grossSalary: dashboard.summary.totalGross,
    totalDeductions: dashboard.summary.totalDeductions,
    totalEmployerContributions: dashboard.summary.totalEmployerContribution,
    totalTax: dashboard.employees.reduce((sum, item) => sum + Number(item.tax || 0), 0),
    totalNetSalary: dashboard.summary.totalNet,
    totalEmployerCost: dashboard.summary.totalGross + dashboard.summary.totalEmployerContribution,
    status: 'DRAFT',
    createdBy: String(createdBy || 'system').trim(),
    attendanceOverride: override,
    attendanceOverrideBy: override ? String(createdBy || '').trim() : '',
    attendanceOverrideReason: override ? String(attendanceOverrideReason).trim() : '',
  });

  for (const employee of dashboard.employees) {
    await PayrollItem.create({
      payrollRun: run._id,
      employee: employee.employeeId,
      employeeCode: employee.employeeCode,
      basicSalary: employee.basicSalary,
      allowances: employee.allowances,
      grossSalary: employee.grossSalary,
      taxableIncome: employee.taxableIncome,
      taxAmount: employee.tax,
      employeeDeductions: employee.deductions,
      employerContributions: employee.employerContribution,
      netSalary: employee.netSalary,
      employerCost: employee.grossSalary + employee.employerContribution,
      status: 'DRAFT',
      attendanceSnapshot: {
        ...employee.attendance,
        calculation: employee.attendancePay,
        override: override ? {
          approvedBy: String(createdBy || '').trim(),
          reason: String(attendanceOverrideReason).trim(),
        } : null,
      },
      calculationBreakdown: {
        employeeContribution: employee.employeeContribution,
        employerContribution: employee.employerContribution,
        attendance: employee.attendancePay,
      },
    });
  }

  return run;
};

module.exports = {
  ensureSettings,
  normalizeNumber,
  getComponentTotal,
  normalizePayrollComponents,
  calculateEmployeePayrollPreview,
  getPayrollDashboard,
  saveSettings,
  savePayrollComponent,
  setPayrollComponentStatus,
  createTaxScheme,
  createSalaryStructure,
  getEmployeeSalaryHistory,
  createPayrollRun,
  getActiveSalaryStructure,
  getActiveEmployees,
  getDefaultTaxScheme,
  EmployeeAdvance,
  EmployeeLoan,
  SalaryStructure,
  PayrollRun,
  PayrollItem,
  SalaryRevision,
};
