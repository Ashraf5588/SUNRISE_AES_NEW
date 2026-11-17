const payrollService = require('../services/payrollService');
const mongoose = require('mongoose');
const { staffSchema } = require('../model/staffschema');
const { SalaryStructure, PayrollSettings, PayrollTaxScheme } = require('../model/payrollSchema');

const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');

const isChecked = value => value === true || value === 'true' || value === 'on' || value === '1';
const parseEmployeeComponentValues = employee => {
  if (typeof employee.componentValuesJson === 'string') {
    try {
      const values = JSON.parse(employee.componentValuesJson || '{}');
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error('Employee component values must be an object.');
      }
      return values;
    } catch (error) {
      throw new Error('Unable to read an employee’s earning and deduction values.');
    }
  }
  return employee.componentValues && typeof employee.componentValues === 'object'
    ? employee.componentValues
    : {};
};

const dashboard = async (req, res) => {
  try {
    const data = await payrollService.getPayrollDashboard({
      periodYear: req.query.periodYear || new Date().getFullYear(),
      payrollMonth: req.query.payrollMonth || new Date().getMonth() + 1,
      userRole: req.user?.role || '',
    });
    return res.render('billingfirst/payroll', {
      ...data,
      currentUser: req.user || {},
      title: 'Payroll Dashboard',
      error: req.query.error || null,
    });
  } catch (error) {
    console.error('Unable to load payroll dashboard:', error);
    return res.status(500).render('billingfirst/payroll', {
      settings: { taxRate: 0, employeeContributionRate: 0, employerContributionRate: 0, monthlyDeduction: 0, payrollCycle: 'MONTHLY' },
      summary: { employeeCount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0, totalEmployerContribution: 0 },
      employees: [],
      error: 'Unable to load payroll dashboard.',
      currentUser: req.user || {},
      title: 'Payroll Dashboard',
      periodYear: Number(req.query.periodYear || new Date().getFullYear()),
      payrollMonth: String(req.query.payrollMonth || new Date().getMonth() + 1).padStart(2, '0'),
    });
  }
};

const listSalaryStructures = async (req, res) => {
  try {
    const [settings, allStructures, taxSchemes, employees] = await Promise.all([
      PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 }).lean(),
      SalaryStructure.find().sort({ effectiveFrom: -1 }).lean(),
      PayrollTaxScheme.find().sort({ effectiveFrom: -1 }).lean(),
      Staff.find({ staffName: { $exists: true, $ne: '' } })
        .select('staffName employeeCode department salaryRecords')
        .sort({ staffName: 1 })
        .lean(),
    ]);
    const fiscalYear = String(req.query.fiscalYear || settings?.fiscalYear || '2082/83');
    const components = payrollService.normalizePayrollComponents(settings?.components)
      .filter(component => component.active !== false
        && ['ALLOWANCE', 'EARNING', 'DEDUCTION', 'TAX'].includes(component.category)
        && ['FIXED', 'PERCENT'].includes(component.type));
    const fiscalYears = [...new Set([
      fiscalYear,
      settings?.fiscalYear,
      '2082/83',
      ...allStructures.map(structure => structure.fiscalYear),
    ].filter(Boolean))].sort().reverse();
    const structureByEmployee = new Map();
    allStructures
      .filter(structure => structure.fiscalYear === fiscalYear)
      .forEach(structure => {
        const employeeId = String(structure.employee);
        if (!structureByEmployee.has(employeeId)) structureByEmployee.set(employeeId, structure);
      });
    const employeeRows = employees.map(employee => {
      const structure = structureByEmployee.get(String(employee._id));
      const salaryRecords = Array.isArray(employee.salaryRecords) ? employee.salaryRecords : [];
      const latestSalary = [...salaryRecords].sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')))[0];
      const savedComponents = [
        ...(Array.isArray(structure?.earningComponents) ? structure.earningComponents : []),
        ...(Array.isArray(structure?.deductionComponents) ? structure.deductionComponents : []),
      ];
      const componentValues = {};
      components.forEach(component => {
        const savedComponent = savedComponents.find(item => item.code === component.code && item.type === component.type);
        componentValues[String(component._id)] = savedComponent
          ? component.type === 'PERCENT' ? savedComponent.rate : savedComponent.amount
          : component.type === 'PERCENT' ? component.rate : component.amount;
      });
      return {
        ...employee,
        basicSalary: structure
          ? structure.basicSalary
          : latestSalary?.basicSalary ?? '',
        structureStatus: structure?.status || '',
        componentValues,
      };
    });

    return res.render('billingfirst/payroll-structures', {
      currentUser: req.user || {},
      title: 'Payroll structures',
      employees: employeeRows,
      components,
      fiscalYear,
      fiscalYears,
      payrollCycle: settings?.payrollCycle || 'MONTHLY',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      taxSchemes,
      error: req.query.error || null,
      saved: req.query.saved === '1',
    });
  } catch (error) {
    console.error('Unable to load payroll structure list:', error);
    return res.status(500).render('billingfirst/payroll-structures', {
      currentUser: req.user || {},
      title: 'Payroll structures',
      employees: [],
      components: [],
      fiscalYear: '2082/83',
      fiscalYears: ['2082/83'],
      payrollCycle: 'MONTHLY',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      taxSchemes: [],
      error: 'Unable to load payroll structure list.',
      saved: false,
    });
  }
};

const saveSettings = async (req, res) => {
  try {
    await payrollService.saveSettings({
      fiscalYear: req.body.fiscalYear,
      taxRate: req.body.taxRate,
      employeeContributionRate: req.body.employeeContributionRate,
      employerContributionRate: req.body.employerContributionRate,
      monthlyDeduction: req.body.monthlyDeduction,
      payrollCycle: req.body.payrollCycle,
      attendancePolicy: {
        configured: isChecked(req.body.attendancePolicyConfigured),
        salaryDayCountMethod: req.body.salaryDayCountMethod,
        fixedMonthlyDivisor: req.body.fixedMonthlyDivisor,
        weeklyOffDays: Array.isArray(req.body.weeklyOffDays)
          ? req.body.weeklyOffDays
          : req.body.weeklyOffDays ? [req.body.weeklyOffDays] : [],
        deductUnpaidLeave: isChecked(req.body.deductUnpaidLeave),
        deductUnapprovedAbsence: isChecked(req.body.deductUnapprovedAbsence),
        payRecordedOvertime: isChecked(req.body.payRecordedOvertime),
        overtimeHourlyRate: req.body.overtimeHourlyRate,
        applyLatePenalty: isChecked(req.body.applyLatePenalty),
        latePenaltyPerMinute: req.body.latePenaltyPerMinute,
        applyEarlyDeparturePenalty: isChecked(req.body.applyEarlyDeparturePenalty),
        earlyPenaltyPerMinute: req.body.earlyPenaltyPerMinute,
      },
      updatedBy: req.user?.username || req.user?.teacherName || 'admin',
    });
    return res.redirect('/payroll?saved=1');
  } catch (error) {
    console.error('Unable to save payroll settings:', error);
    return res.redirect('/payroll?error=' + encodeURIComponent(error.message || 'Unable to save payroll settings.'));
  }
};

const saveStructure = async (req, res) => {
  try {
    const fiscalYear = String(req.body.fiscalYear || '').trim();
    const effectiveFrom = String(req.body.effectiveFrom || '').trim();
    const submittedEmployees = Array.isArray(req.body.employees)
      ? req.body.employees
      : [{ employeeId: req.body.employeeId, basicSalary: req.body.basicSalary }];
    const defaultBasicSalary = String(req.body.defaultBasicSalary ?? '').trim();
    const rows = submittedEmployees
      .filter(employee => employee && employee.employeeId)
      .map(employee => ({
        ...employee,
        employeeId: String(employee.employeeId).trim(),
        basicSalary: String(employee.basicSalary ?? '').trim() || defaultBasicSalary,
      }));

    if (!fiscalYear) throw new Error('Choose a fiscal year.');
    if (!effectiveFrom || Number.isNaN(Date.parse(effectiveFrom))) throw new Error('Choose a valid effective-from date.');
    if (!rows.length) throw new Error('No employees were submitted.');

    const employeeIds = rows.map(employee => employee.employeeId);
    if (employeeIds.some(id => !mongoose.isValidObjectId(id))) throw new Error('One or more employee records are invalid.');
    if (new Set(employeeIds).size !== employeeIds.length) throw new Error('An employee was submitted more than once.');
    if (rows.some(employee => employee.basicSalary === ''
      || !Number.isFinite(Number(employee.basicSalary))
      || Number(employee.basicSalary) < 0)) {
      throw new Error('Enter a non-negative basic salary for every employee, or set a default salary.');
    }

    const existingEmployees = await Staff.countDocuments({ _id: { $in: employeeIds } });
    if (existingEmployees !== employeeIds.length) throw new Error('One or more employee records could not be found.');

    const settings = await PayrollSettings.findOne({ active: true }).sort({ updatedAt: -1 }).lean();
    const catalogComponents = payrollService.normalizePayrollComponents(settings?.components)
      .filter(component => component.active !== false
        && ['ALLOWANCE', 'EARNING', 'DEDUCTION', 'TAX'].includes(component.category)
        && ['FIXED', 'PERCENT'].includes(component.type));
    const earningDefinitions = catalogComponents.filter(component => ['ALLOWANCE', 'EARNING'].includes(component.category));
    const deductionDefinitions = catalogComponents.filter(component => ['DEDUCTION', 'TAX'].includes(component.category));
    const getEmployeeComponents = (employee, definitions) => definitions.map(component => {
      const submittedValue = employee.componentValues?.[String(component._id)];
      const defaultValue = component.type === 'PERCENT' ? component.rate : component.amount;
      const value = submittedValue === undefined || String(submittedValue).trim() === ''
        ? Number(defaultValue || 0)
        : Number(submittedValue);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Enter a valid value for ${component.name || component.code}.`);
      }
      return {
        name: component.name,
        code: component.code,
        category: component.category,
        type: component.type,
        rate: component.type === 'PERCENT' ? value : 0,
        amount: component.type === 'FIXED' ? value : 0,
        basis: component.basis || 'BASIC',
        taxable: component.taxable !== false,
        active: true,
      };
    });

    for (const employee of rows) {
      employee.componentValues = parseEmployeeComponentValues(employee);
      employee.earningComponents = catalogComponents.length
        ? getEmployeeComponents(employee, earningDefinitions)
        : Array.isArray(req.body.earningComponents) ? req.body.earningComponents : [];
      employee.deductionComponents = catalogComponents.length
        ? getEmployeeComponents(employee, deductionDefinitions)
        : Array.isArray(req.body.deductionComponents) ? req.body.deductionComponents : [];
    }

    const createdBy = req.user?.username || req.user?.teacherName || 'admin';
    for (const employee of rows) {
      await payrollService.createSalaryStructure({
        employeeId: employee.employeeId,
        fiscalYear,
        basicSalary: Number(employee.basicSalary),
        earningComponents: employee.earningComponents,
        deductionComponents: employee.deductionComponents,
        employerContributions: Array.isArray(req.body.employerContributions) ? req.body.employerContributions : [],
        payrollCycle: req.body.payrollCycle,
        taxScheme: req.body.taxScheme || null,
        effectiveFrom,
        createdBy,
      });
    }
    return res.redirect(`/payroll/structures?fiscalYear=${encodeURIComponent(fiscalYear)}&saved=1`);
  } catch (error) {
    console.error('Unable to save salary structure:', error);
    const fiscalYear = String(req.body.fiscalYear || '').trim();
    const yearQuery = fiscalYear ? `&fiscalYear=${encodeURIComponent(fiscalYear)}` : '';
    return res.redirect('/payroll/structures?error=' + encodeURIComponent(error.message || 'Unable to save salary structure.') + yearQuery);
  }
};

const listPayrollComponents = async (req, res) => {
  try {
    const settings = await payrollService.ensureSettings();
    const components = payrollService.normalizePayrollComponents(settings.components);
    const editing = req.query.edit
      ? components.find(component => String(component._id) === String(req.query.edit)) || null
      : null;

    return res.render('billingfirst/additivesubtractive', {
      currentUser: req.user || {},
      title: 'Earnings and deductions',
      components,
      editing,
      error: req.query.error || (req.query.edit && !editing ? 'Payroll component not found.' : null),
      saved: req.query.saved === '1',
    });
  } catch (error) {
    console.error('Unable to load payroll components:', error);
    return res.status(500).render('billingfirst/additivesubtractive', {
      currentUser: req.user || {},
      title: 'Earnings and deductions',
      components: [],
      editing: null,
      error: 'Unable to load payroll components.',
      saved: false,
    });
  }
};

const savePayrollComponent = async (req, res) => {
  const componentId = String(req.body.componentId || '').trim();
  try {
    await payrollService.savePayrollComponent({
      componentId: componentId || null,
      code: req.body.code,
      name: req.body.name,
      category: req.body.category,
      type: req.body.type,
      value: req.body.value,
      basis: req.body.basis,
      taxable: isChecked(req.body.taxable),
      updatedBy: req.user?.username || req.user?.teacherName || 'admin',
    });
    return res.redirect('/payroll/components?saved=1');
  } catch (error) {
    console.error('Unable to save payroll component:', error);
    const editQuery = componentId ? `&edit=${encodeURIComponent(componentId)}` : '';
    return res.redirect('/payroll/components?error='
      + encodeURIComponent(error.message || 'Unable to save payroll component.')
      + editQuery);
  }
};

const setPayrollComponentStatus = async (req, res) => {
  try {
    const activeValue = String(req.body.active || '');
    if (!['true', 'false'].includes(activeValue)) throw new Error('Choose a valid component status.');
    await payrollService.setPayrollComponentStatus({
      componentId: req.params.id,
      active: activeValue === 'true',
      updatedBy: req.user?.username || req.user?.teacherName || 'admin',
    });
    return res.redirect('/payroll/components?saved=1');
  } catch (error) {
    console.error('Unable to update payroll component status:', error);
    return res.redirect('/payroll/components?error='
      + encodeURIComponent(error.message || 'Unable to update payroll component status.'));
  }
};

const listTaxSchemes = async (req, res) => {
  try {
    const schemes = await PayrollTaxScheme.find().sort({ effectiveFrom: -1 }).lean();
    return res.render('billingfirst/payroll-tax-schemes', {
      currentUser: req.user || {},
      title: 'Tax schemes',
      schemes,
      error: null,
    });
  } catch (error) {
    console.error('Unable to load tax schemes:', error);
    return res.status(500).render('billingfirst/payroll-tax-schemes', {
      currentUser: req.user || {},
      title: 'Tax schemes',
      schemes: [],
      error: 'Unable to load tax schemes.',
    });
  }
};

const saveTaxScheme = async (req, res) => {
  try {
    const payload = req.body;
  let slabs = Array.isArray(payload.slabs) ? payload.slabs : [];
  if (typeof payload.slabs === 'string') {
    try {
      const parsed = JSON.parse(payload.slabs);
      slabs = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
    } catch (error) {
      slabs = [];
    }
  }
    await payrollService.createTaxScheme({
      name: payload.name,
      fiscalYear: payload.fiscalYear,
      calculationMode: payload.calculationMode || 'PROGRESSIVE',
      slabs,
      createdBy: req.user?.username || req.user?.teacherName || 'admin',
    });
    return res.redirect('/payroll/tax-schemes?created=1');
  } catch (error) {
    console.error('Unable to save tax scheme:', error);
    return res.redirect('/payroll/tax-schemes?error=' + encodeURIComponent(error.message || 'Unable to save tax scheme.'));
  }
};

const createRun = async (req, res) => {
  try {
    const run = await payrollService.createPayrollRun({
      fiscalYear: req.body.fiscalYear || new Date().toISOString().slice(0, 4),
      payrollMonth: req.body.payrollMonth || new Date().toISOString().slice(5, 7),
      periodYear: req.body.periodYear || new Date().getFullYear(),
      branch: req.body.branch || '',
      createdBy: req.user?.username || req.user?.teacherName || 'admin',
      userRole: req.user?.role || '',
      attendanceOverride: isChecked(req.body.attendanceOverride),
      attendanceOverrideReason: req.body.attendanceOverrideReason || '',
    });
    return res.redirect('/payroll?run=' + encodeURIComponent(run.periodLabel)
      + '&periodYear=' + encodeURIComponent(run.periodYear)
      + '&payrollMonth=' + encodeURIComponent(run.payrollMonth));
  } catch (error) {
    console.error('Unable to create payroll run:', error);
    return res.redirect('/payroll?error=' + encodeURIComponent(error.message || 'Unable to generate payroll run.'));
  }
};

module.exports = {
  dashboard,
  listSalaryStructures,
  saveSettings,
  saveStructure,
  listPayrollComponents,
  savePayrollComponent,
  setPayrollComponentStatus,
  listTaxSchemes,
  saveTaxScheme,
  createRun,
};
