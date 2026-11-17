const mongoose = require('mongoose');
const {
  EmployeeAdvance,
  EmployeeLoan,
  PayrollItem,
  PayrollPayment,
  PayrollRun,
  SalaryRevision,
  SalaryStructure,
} = require('../model/payrollSchema');
const { staffSchema } = require('../model/staffschema');
const { JournalVoucher } = require('../model/billingschema/JournalVoucher');
const { createExcelXml, createReportPdf } = require('../utils/accountingReports');

const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');
const PAGE_SIZE = 50;
const MAX_EXPORT_ROWS = 20000;

const REPORTS = {
  'monthly-register': { title: 'Monthly Payroll Register', source: 'items' },
  'annual-register': { title: 'Annual Payroll Register', source: 'items' },
  'salary-history': { title: 'Employee Salary History', source: 'history' },
  'department-salary': { title: 'Department-wise Salary', source: 'items' },
  'branch-salary': { title: 'Branch-wise Salary', source: 'items' },
  'salary-expense': { title: 'Salary Expense', source: 'items' },
  'outstanding-salary': { title: 'Outstanding Salary', source: 'payments' },
  'advance-register': { title: 'Employee Advance Register', source: 'advances' },
  'advance-recovery': { title: 'Employee Advance Recovery', source: 'items' },
  'loan-report': { title: 'Employee Loan Report', source: 'loans' },
  'tax-deduction': { title: 'Tax Deduction Report', source: 'items' },
  'statutory-contributions': { title: 'SSF / PF / CIT Report', source: 'items' },
  'employer-contributions': { title: 'Employer Contribution Report', source: 'items' },
  'salary-payments': { title: 'Salary Payment Register', source: 'payments' },
  'accounting-reconciliation': { title: 'Payroll Accounting Reconciliation', source: 'reconciliation' },
  'annual-tax': { title: 'Annual Tax Summary', source: 'items' },
  'payroll-variance': { title: 'Payroll Variance Report', source: 'items' },
};

const money = value => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(`${String(value).trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${label} date.`);
  return date;
}

function buildFilters(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const filters = {
    fiscalYear: String(query.fiscalYear || '').trim(),
    payrollMonth: String(query.payrollMonth || '').trim(),
    department: String(query.department || '').trim(),
    branch: String(query.branch || '').trim(),
    employeeSearch: String(query.employeeSearch || '').trim(),
    fromDate: parseDate(query.fromDate, 'start'),
    toDate: parseDate(query.toDate, 'end'),
    page,
  };
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    throw new Error('The start date must be on or before the end date.');
  }
  if (filters.payrollMonth && !/^\d{1,2}$/.test(filters.payrollMonth)) {
    throw new Error('Payroll month must be a month number from 1 to 12.');
  }
  if (filters.payrollMonth && (Number(filters.payrollMonth) < 1 || Number(filters.payrollMonth) > 12)) {
    throw new Error('Payroll month must be a month number from 1 to 12.');
  }
  return filters;
}

async function findEmployees(filters) {
  const criteria = {};
  if (filters.department) criteria.department = filters.department;
  if (filters.branch) criteria.branchName = filters.branch;
  if (filters.employeeSearch) {
    const search = new RegExp(escapeRegex(filters.employeeSearch), 'i');
    criteria.$or = [{ staffName: search }, { employeeCode: search }];
  }
  return Staff.find(criteria)
    .select('staffName employeeCode department branchName')
    .lean();
}

function buildRunCriteria(filters, employeeBranchFilter = false) {
  const criteria = {};
  if (filters.fiscalYear) criteria.fiscalYear = filters.fiscalYear;
  if (filters.payrollMonth) {
    const paddedMonth = String(Number(filters.payrollMonth)).padStart(2, '0');
    criteria.payrollMonth = { $in: [paddedMonth, String(Number(filters.payrollMonth))] };
  }
  if (filters.branch && !employeeBranchFilter) criteria.branch = filters.branch;
  if (filters.fromDate || filters.toDate) {
    criteria.createdAt = {};
    if (filters.fromDate) criteria.createdAt.$gte = filters.fromDate;
    if (filters.toDate) {
      const exclusive = new Date(filters.toDate);
      exclusive.setUTCDate(exclusive.getUTCDate() + 1);
      criteria.createdAt.$lt = exclusive;
    }
  }
  return criteria;
}

function employeeName(employee) {
  return employee?.staffName || employee?.employeeCode || 'Employee';
}

function rowsForItems(reportKey, items, employees, runs) {
  const runMap = new Map(runs.map(run => [String(run._id), run]));
  const mapped = items.map(item => ({
    item,
    employee: employees.get(String(item.employee)),
    run: runMap.get(String(item.payrollRun)),
  })).filter(row => row.run);

  if (reportKey === 'department-salary' || reportKey === 'branch-salary') {
    const keyField = reportKey === 'department-salary' ? 'department' : 'branchName';
    const groups = new Map();
    for (const { item, employee } of mapped) {
      const key = employee?.[keyField] || 'Unassigned';
      const group = groups.get(key) || {
        departmentOrBranch: key,
        employees: new Set(),
        grossSalary: 0,
        employeeDeductions: 0,
        employerContributions: 0,
        netSalary: 0,
      };
      group.employees.add(String(item.employee));
      group.grossSalary += Number(item.grossSalary || 0);
      group.employeeDeductions += Number(item.employeeDeductions || 0);
      group.employerContributions += Number(item.employerContributions || 0);
      group.netSalary += Number(item.netSalary || 0);
      groups.set(key, group);
    }
    return [...groups.values()].map(group => ({
      ...group,
      employeeCount: group.employees.size,
      employees: undefined,
      grossSalary: money(group.grossSalary),
      employeeDeductions: money(group.employeeDeductions),
      employerContributions: money(group.employerContributions),
      netSalary: money(group.netSalary),
    })).sort((a, b) => a.departmentOrBranch.localeCompare(b.departmentOrBranch));
  }

  if (reportKey === 'payroll-variance') {
    const runOrder = [...runs].sort((a, b) => String(b.periodLabel || '').localeCompare(String(a.periodLabel || '')));
    const currentRun = runOrder[0];
    const previousRun = runOrder.find(run => run._id.toString() !== currentRun?._id.toString());
    const current = new Map(mapped.filter(row => row.run._id.equals(currentRun?._id)).map(row => [String(row.item.employee), row.item]));
    const previous = new Map(mapped.filter(row => row.run._id.equals(previousRun?._id)).map(row => [String(row.item.employee), row.item]));
    const employeeIds = new Set([...current.keys(), ...previous.keys()]);
    return [...employeeIds].map(id => {
      const employee = employees.get(id);
      const currentItem = current.get(id);
      const previousItem = previous.get(id);
      const currentNet = Number(currentItem?.netSalary || 0);
      const previousNet = Number(previousItem?.netSalary || 0);
      return {
        employeeName: employeeName(employee),
        employeeCode: employee?.employeeCode || '',
        currentPeriod: currentRun?.periodLabel || '',
        previousPeriod: previousRun?.periodLabel || '',
        currentGross: money(currentItem?.grossSalary),
        previousGross: money(previousItem?.grossSalary),
        grossVariance: money(Number(currentItem?.grossSalary || 0) - Number(previousItem?.grossSalary || 0)),
        currentNet: money(currentNet),
        previousNet: money(previousNet),
        netVariance: money(currentNet - previousNet),
      };
    }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  return mapped.map(({ item, employee, run }) => ({
    period: run.periodLabel || `${run.fiscalYear}-${run.payrollMonth}`,
    fiscalYear: run.fiscalYear || '',
    employeeName: employeeName(employee),
    employeeCode: employee?.employeeCode || item.employeeCode || '',
    department: employee?.department || '',
    branch: employee?.branchName || run.branch || '',
    basicSalary: money(item.basicSalary),
    allowances: money(item.allowances),
    grossSalary: money(item.grossSalary),
    taxAmount: money(item.taxAmount),
    employeeDeductions: money(item.employeeDeductions),
    employerContributions: money(item.employerContributions),
    advanceRecovery: money(item.advanceRecovery),
    loanInstallment: money(item.loanInstallment),
    netSalary: money(item.netSalary),
    employerCost: money(item.employerCost),
    status: item.status || run.status,
    _id: item._id,
    employeeId: item.employee,
    runId: run._id,
  }));
}

function columnsFor(reportKey) {
  if (reportKey === 'salary-history') {
    return [
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['fiscalYear', 'Fiscal year'],
      ['revisionNumber', 'Revision'],
      ['effectiveFrom', 'Effective from'],
      ['effectiveUntil', 'Effective until'],
      ['basicSalary', 'Basic salary'],
      ['status', 'Status'],
      ['reason', 'Reason'],
    ];
  }
  if (reportKey === 'advance-register') {
    return [
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['requestDate', 'Request date'],
      ['amount', 'Advance amount'],
      ['outstandingBalance', 'Outstanding'],
      ['monthlyInstallment', 'Installment'],
      ['recoveryStartMonth', 'Recovery start'],
      ['status', 'Status'],
      ['purpose', 'Purpose'],
    ];
  }
  if (reportKey === 'loan-report') {
    return [
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['principal', 'Principal'],
      ['interestRate', 'Interest rate'],
      ['method', 'Method'],
      ['installmentAmount', 'Installment'],
      ['outstandingPrincipal', 'Outstanding principal'],
      ['outstandingInterest', 'Outstanding interest'],
      ['recoveryStartMonth', 'Recovery start'],
      ['status', 'Status'],
    ];
  }
  if (reportKey === 'salary-payments') {
    return [
      ['period', 'Period'],
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['amount', 'Payment amount'],
      ['paymentMode', 'Mode'],
      ['paymentDate', 'Payment date'],
      ['referenceNumber', 'Reference'],
      ['status', 'Status'],
    ];
  }
  if (reportKey === 'outstanding-salary') {
    return [
      ['period', 'Period'],
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['netSalary', 'Net payable'],
      ['salaryPaid', 'Salary paid'],
      ['outstandingSalary', 'Outstanding salary'],
    ];
  }
  if (reportKey === 'accounting-reconciliation') {
    return [
      ['period', 'Period'],
      ['branch', 'Branch'],
      ['employeeCount', 'Employees'],
      ['status', 'Payroll status'],
      ['expectedEmployerCost', 'Expected payroll expense'],
      ['voucherNumber', 'Posted voucher'],
      ['ledgerDebit', 'Ledger debit'],
      ['ledgerCredit', 'Ledger credit'],
      ['difference', 'Debit difference'],
      ['isReconciled', 'Reconciled'],
    ];
  }
  if (reportKey === 'annual-tax') {
    return [
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['fiscalYear', 'Fiscal year'],
      ['grossSalary', 'Annual gross'],
      ['taxAmount', 'Annual tax deducted'],
    ];
  }
  if (reportKey === 'statutory-contributions') {
    return [
      ['period', 'Period'],
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['employeeDeductions', 'Aggregate employee deductions'],
      ['employerContributions', 'Aggregate employer contributions'],
    ];
  }
  if (reportKey === 'advance-recovery') {
    return [
      ['period', 'Period'],
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['advanceRecovery', 'Advance recovery'],
    ];
  }
  if (reportKey === 'tax-deduction') {
    return [
      ['period', 'Period'],
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['grossSalary', 'Gross salary'],
      ['taxAmount', 'Tax deducted'],
    ];
  }
  if (reportKey === 'employer-contributions') {
    return [
      ['period', 'Period'],
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['department', 'Department'],
      ['branch', 'Branch'],
      ['employerContributions', 'Employer contributions'],
      ['employerCost', 'Employer cost'],
    ];
  }
  if (reportKey === 'department-salary' || reportKey === 'branch-salary') {
    return [
      ['departmentOrBranch', 'Department / Branch'],
      ['employeeCount', 'Employees'],
      ['grossSalary', 'Gross salary'],
      ['employeeDeductions', 'Employee deductions'],
      ['employerContributions', 'Employer contributions'],
      ['netSalary', 'Net salary'],
    ];
  }
  if (reportKey === 'payroll-variance') {
    return [
      ['employeeName', 'Employee'],
      ['employeeCode', 'Code'],
      ['previousPeriod', 'Previous period'],
      ['currentPeriod', 'Current period'],
      ['previousGross', 'Previous gross'],
      ['currentGross', 'Current gross'],
      ['grossVariance', 'Gross variance'],
      ['previousNet', 'Previous net'],
      ['currentNet', 'Current net'],
      ['netVariance', 'Net variance'],
    ];
  }
  return [
    ['period', 'Period'],
    ['employeeName', 'Employee'],
    ['employeeCode', 'Code'],
    ['department', 'Department'],
    ['branch', 'Branch'],
    ['basicSalary', 'Basic salary'],
    ['allowances', 'Allowances'],
    ['grossSalary', 'Gross salary'],
    ['taxAmount', 'Tax'],
    ['employeeDeductions', 'Employee deductions'],
    ['employerContributions', 'Employer contributions'],
    ['advanceRecovery', 'Advance recovery'],
    ['loanInstallment', 'Loan installment'],
    ['netSalary', 'Net salary'],
    ['employerCost', 'Employer cost'],
    ['status', 'Status'],
  ];
}

function makeExportRows(rows, columns) {
  return rows.map(row => columns.map(([key]) => row[key] ?? ''));
}

async function loadItemReport(reportKey, filters, { skipDateRange = false } = {}) {
  const employees = await findEmployees(filters);
  const employeeMap = new Map(employees.map(employee => [String(employee._id), employee]));
  const employeeIds = employees.map(employee => employee._id);
  const runFilters = skipDateRange
    ? { ...filters, fromDate: null, toDate: null }
    : filters;
  const runs = await PayrollRun.find(buildRunCriteria(runFilters))
    .sort({ fiscalYear: 1, payrollMonth: 1, createdAt: 1 })
    .lean();
  const runIds = runs.map(run => run._id);
  const itemCriteria = { payrollRun: { $in: runIds } };
  if (filters.department || filters.branch || filters.employeeSearch) {
    itemCriteria.employee = { $in: employeeIds };
  }
  const items = await PayrollItem.find(itemCriteria).sort({ createdAt: 1, _id: 1 }).lean();
  const rows = rowsForItems(reportKey, items, employeeMap, runs);
  return { rows, runs, employees: employeeMap };
}

async function loadHistoryReport(filters) {
  const employees = await findEmployees(filters);
  const criteria = { employee: { $in: employees.map(employee => employee._id) } };
  if (filters.fromDate || filters.toDate) {
    criteria.effectiveFrom = {};
    if (filters.fromDate) criteria.effectiveFrom.$gte = filters.fromDate;
    if (filters.toDate) criteria.effectiveFrom.$lte = filters.toDate;
  }
  if (filters.fiscalYear) criteria.fiscalYear = filters.fiscalYear;
  const revisions = await SalaryRevision.find({
    employee: criteria.employee,
    ...(criteria.effectiveFrom ? { effectiveFrom: criteria.effectiveFrom } : {}),
  })
    .populate('employee', 'staffName employeeCode department branchName')
    .populate('structure', 'fiscalYear')
    .sort({ effectiveFrom: -1 })
    .lean();
  const revisionRows = revisions.map(revision => ({
    effectiveFrom: revision.effectiveFrom ? new Date(revision.effectiveFrom).toISOString().slice(0, 10) : '',
    effectiveUntil: '',
    employeeName: employeeName(revision.employee),
    employeeCode: revision.employee?.employeeCode || '',
    department: revision.employee?.department || '',
    branch: revision.employee?.branchName || '',
    fiscalYear: String(revision.snapshot?.fiscalYear || revision.structure?.fiscalYear || ''),
    revisionNumber: revision.revisionNumber,
    basicSalary: money(revision.snapshot?.basicSalary),
    status: 'REVISION',
    reason: revision.reason || '',
    _id: revision._id,
    structureId: revision.structure?._id ? String(revision.structure._id) : '',
  }));
  const filteredRevisions = filters.fiscalYear
    ? revisionRows.filter(row => row.fiscalYear === filters.fiscalYear)
    : revisionRows;
  const structures = await SalaryStructure.find(criteria)
    .populate('employee', 'staffName employeeCode department branchName')
    .sort({ effectiveFrom: -1 })
    .lean();
  const revisionsByStructure = new Set(filteredRevisions.map(row => row.structureId).filter(Boolean));
  const fallbackRows = structures
    .filter(structure => !revisionsByStructure.has(String(structure._id)))
    .map(structure => ({
    effectiveFrom: structure.effectiveFrom ? new Date(structure.effectiveFrom).toISOString().slice(0, 10) : '',
    effectiveUntil: structure.effectiveUntil ? new Date(structure.effectiveUntil).toISOString().slice(0, 10) : '',
    employeeName: employeeName(structure.employee),
    employeeCode: structure.employee?.employeeCode || structure.employeeCode || '',
    department: structure.employee?.department || '',
    branch: structure.employee?.branchName || '',
    fiscalYear: structure.fiscalYear || '',
    revisionNumber: structure.revisionCount || '',
    basicSalary: money(structure.basicSalary),
    status: structure.status || '',
    reason: '',
    _id: structure._id,
    }));
  const rows = [...filteredRevisions, ...fallbackRows];
  return { rows, runs: [], employees: new Map() };
}

async function loadAdvanceReport(reportKey, filters) {
  const employees = await findEmployees(filters);
  const employeeMap = new Map(employees.map(employee => [String(employee._id), employee]));
  const employeeIds = employees.map(employee => employee._id);
  const dateCriteria = {};
  if (filters.fromDate) dateCriteria.$gte = filters.fromDate;
  if (filters.toDate) {
    const exclusive = new Date(filters.toDate);
    exclusive.setUTCDate(exclusive.getUTCDate() + 1);
    dateCriteria.$lt = exclusive;
  }

  if (reportKey === 'advance-recovery') {
    const { rows } = await loadItemReport(reportKey, filters);
    return {
      rows: rows.filter(row => row.advanceRecovery > 0),
      runs: [],
      employees: employeeMap,
    };
  }
  if (reportKey === 'advance-register') {
    const criteria = { employee: { $in: employeeIds } };
    if (Object.keys(dateCriteria).length) criteria.requestDate = dateCriteria;
    const records = await EmployeeAdvance.find(criteria).sort({ requestDate: -1 }).lean();
    return {
      rows: records.map(record => ({
        employeeName: employeeName(employeeMap.get(String(record.employee))),
        employeeCode: record.employeeCode || employeeMap.get(String(record.employee))?.employeeCode || '',
        requestDate: record.requestDate ? new Date(record.requestDate).toISOString().slice(0, 10) : '',
        amount: money(record.amount),
        outstandingBalance: money(record.outstandingBalance),
        monthlyInstallment: money(record.monthlyInstallment),
        recoveryStartMonth: record.recoveryStartMonth || '',
        status: record.status || '',
        purpose: record.purpose || '',
        _id: record._id,
      })),
      runs: [],
      employees: employeeMap,
    };
  }

  const records = await EmployeeLoan.find({ employee: { $in: employeeIds } }).sort({ approvedDate: -1 }).lean();
  return {
    rows: records.map(record => ({
      employeeName: employeeName(employeeMap.get(String(record.employee))),
      employeeCode: record.employeeCode || employeeMap.get(String(record.employee))?.employeeCode || '',
      principal: money(record.principal),
      interestRate: money(record.interestRate),
      method: record.method || '',
      installmentAmount: money(record.installmentAmount),
      outstandingPrincipal: money(record.outstandingPrincipal),
      outstandingInterest: money(record.outstandingInterest),
      recoveryStartMonth: record.recoveryStartMonth || '',
      status: record.status || '',
      _id: record._id,
    })),
    runs: [],
    employees: employeeMap,
  };
}

async function loadPaymentReport(filters) {
  const { rows, runs, employees } = await loadItemReport('salary-payments', filters, { skipDateRange: true });
  const runIds = runs.map(run => run._id);
  const payments = await PayrollPayment.find({
    payrollRun: { $in: runIds },
    employee: { $in: [...employees.keys()] },
  })
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
  const itemById = new Map(rows.map(row => [String(row._id), row]));
  const mappedPayments = payments.map(payment => {
    const employee = employees.get(String(payment.employee));
    const item = itemById.get(String(payment.payrollItem));
    return {
      period: item?.period || runs.find(run => run._id.equals(payment.payrollRun))?.periodLabel || '',
      employeeName: employeeName(employee),
      employeeCode: employee?.employeeCode || '',
      amount: money(payment.amount),
      paymentMode: payment.paymentMode || '',
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : '',
      referenceNumber: payment.referenceNumber || '',
      status: payment.status || '',
      _id: payment._id,
    };
  });
  if (filters.fromDate || filters.toDate) {
    return {
      rows: mappedPayments.filter(payment => {
        if (!payment.paymentDate) return false;
        const date = new Date(`${payment.paymentDate}T00:00:00.000Z`);
        return (!filters.fromDate || date >= filters.fromDate)
          && (!filters.toDate || date <= filters.toDate);
      }),
      runs,
      employees,
    };
  }
  return { rows: mappedPayments, runs, employees };
}

async function loadOutstandingReport(filters) {
  const { rows, runs, employees } = await loadItemReport('outstanding-salary', filters);
  const payments = await PayrollPayment.aggregate([
    { $match: { payrollRun: { $in: runs.map(run => run._id) }, status: { $in: ['PAID', 'PARTIAL'] } } },
    { $group: { _id: { payrollRun: '$payrollRun', employee: '$employee' }, paid: { $sum: '$amount' } } },
  ]);
  const paidByEmployeeAndRun = new Map(payments.map(payment => [
    `${payment._id.payrollRun}:${payment._id.employee}`,
    Number(payment.paid || 0),
  ]));
  const outstanding = rows.map(row => {
    const paid = paidByEmployeeAndRun.get(`${row.runId}:${row.employeeId}`) || 0;
    return { ...row, salaryPaid: money(paid), outstandingSalary: money(Math.max(0, row.netSalary - paid)) };
  }).filter(row => row.outstandingSalary > 0);
  return { rows: outstanding, runs, employees };
}

async function loadReconciliation(filters) {
  const { rows, runs } = await loadItemReport('accounting-reconciliation', filters);
  const vouchers = await JournalVoucher.find({
    sourceType: { $regex: /^PAYROLL$/i },
    sourceId: { $in: runs.map(run => run._id) },
    status: 'POSTED',
  }).select('sourceId totalDebit totalCredit voucherNumber').lean();
  const voucherByRun = new Map(vouchers.map(voucher => [String(voucher.sourceId), voucher]));
  const rowsByRun = new Map();
  for (const row of rows) {
    const current = rowsByRun.get(String(row.runId)) || {
      runId: row.runId,
      period: row.period,
      employeeCount: 0,
      grossSalary: 0,
      employeeDeductions: 0,
      employerContributions: 0,
      netSalary: 0,
      employerCost: 0,
    };
    current.employeeCount += 1;
    current.grossSalary += row.grossSalary;
    current.employeeDeductions += row.employeeDeductions;
    current.employerContributions += row.employerContributions;
    current.netSalary += row.netSalary;
    current.employerCost += row.employerCost;
    rowsByRun.set(String(row.runId), current);
  }
  return {
    rows: runs.map(run => {
      const totals = rowsByRun.get(String(run._id)) || {};
      const voucher = voucherByRun.get(String(run._id));
      const debit = money(voucher?.totalDebit || 0);
      const credit = money(voucher?.totalCredit || 0);
      const expectedCost = money(totals.employerCost || run.totalEmployerCost || 0);
      return {
        period: run.periodLabel || `${run.fiscalYear}-${run.payrollMonth}`,
        branch: run.branch || '',
        status: run.status || '',
        employeeCount: Number(totals.employeeCount || run.employeeCount || 0),
        expectedEmployerCost: expectedCost,
        voucherNumber: voucher?.voucherNumber || 'Not posted',
        ledgerDebit: debit,
        ledgerCredit: credit,
        difference: money(debit - expectedCost),
        isReconciled: Boolean(voucher && debit === expectedCost && credit === expectedCost),
        _id: run._id,
      };
    }),
    runs,
    employees: new Map(),
  };
}

function filterRowsByReport(reportKey, rows) {
  if (reportKey === 'tax-deduction') return rows.filter(row => row.taxAmount > 0);
  if (reportKey === 'statutory-contributions') return rows.filter(row => row.employeeDeductions > 0 || row.employerContributions > 0);
  if (reportKey === 'employer-contributions') return rows.filter(row => row.employerContributions > 0);
  if (reportKey === 'advance-recovery') return rows.filter(row => row.advanceRecovery > 0);
  if (reportKey === 'annual-tax') {
    const annual = new Map();
    for (const row of rows.filter(item => item.taxAmount > 0)) {
      const key = `${row.employeeId}:${row.fiscalYear}`;
      const current = annual.get(key) || {
        employeeName: row.employeeName,
        employeeCode: row.employeeCode,
        department: row.department,
        branch: row.branch,
        fiscalYear: row.fiscalYear,
        grossSalary: 0,
        taxAmount: 0,
      };
      current.grossSalary += row.grossSalary;
      current.taxAmount += row.taxAmount;
      annual.set(key, current);
    }
    return [...annual.values()].map(row => ({
      ...row,
      grossSalary: money(row.grossSalary),
      taxAmount: money(row.taxAmount),
    }));
  }
  if (reportKey === 'salary-expense') return rows.filter(row => row.grossSalary > 0 || row.employerCost > 0);
  return rows;
}

function summarize(reportKey, rows) {
  const sum = key => money(rows.reduce((total, row) => total + Number(row[key] || 0), 0));
  if (reportKey === 'accounting-reconciliation') {
    return {
      runCount: rows.length,
      reconciledCount: rows.filter(row => row.isReconciled).length,
      unreconciledCount: rows.filter(row => !row.isReconciled).length,
      expectedEmployerCost: sum('expectedEmployerCost'),
      ledgerDebit: sum('ledgerDebit'),
      ledgerCredit: sum('ledgerCredit'),
      difference: sum('difference'),
    };
  }
  return {
    rowCount: rows.length,
    grossSalary: sum('grossSalary'),
    taxAmount: sum('taxAmount'),
    employeeDeductions: sum('employeeDeductions'),
    employerContributions: sum('employerContributions'),
    advanceRecovery: sum('advanceRecovery'),
    loanInstallment: sum('loanInstallment'),
    netSalary: sum('netSalary'),
    employerCost: sum('employerCost'),
    salaryPaid: sum('salaryPaid'),
    outstandingSalary: sum('outstandingSalary'),
    amount: sum('amount'),
    outstandingBalance: sum('outstandingBalance'),
    principal: sum('principal'),
    outstandingPrincipal: sum('outstandingPrincipal'),
  };
}

async function getPayrollReport(reportKey, query = {}, { exportMode = false } = {}) {
  const report = REPORTS[reportKey];
  if (!report) throw new Error('Choose a supported payroll report.');
  const filters = buildFilters(query);
  let loaded;

  if (report.source === 'history') loaded = await loadHistoryReport(filters);
  else if (report.source === 'advances' || reportKey === 'advance-recovery' || reportKey === 'loan-report') {
    loaded = await loadAdvanceReport(reportKey, filters);
  } else if (report.source === 'payments') {
    loaded = reportKey === 'outstanding-salary'
      ? await loadOutstandingReport(filters)
      : await loadPaymentReport(filters);
  } else if (report.source === 'reconciliation') loaded = await loadReconciliation(filters);
  else loaded = await loadItemReport(reportKey, filters);

  const allRows = filterRowsByReport(reportKey, loaded.rows);
  if (exportMode && allRows.length > MAX_EXPORT_ROWS) {
    throw new Error(`This report has more than ${MAX_EXPORT_ROWS.toLocaleString()} rows. Narrow the filters before exporting.`);
  }
  const summary = summarize(reportKey, allRows);
  const columns = columnsFor(reportKey);
  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const rows = exportMode ? allRows : allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return {
    report: { key: reportKey, title: report.title },
    rows,
    allRows: exportMode ? allRows : undefined,
    columns,
    exportRows: makeExportRows(rows, columns),
    summary,
    filters: {
      ...filters,
      fromDate: filters.fromDate ? filters.fromDate.toISOString().slice(0, 10) : '',
      toDate: filters.toDate ? filters.toDate.toISOString().slice(0, 10) : '',
    },
    pagination: { page, pageCount, totalRows: allRows.length, pageSize: PAGE_SIZE },
    reportKeys: Object.entries(REPORTS).map(([key, value]) => ({ key, title: value.title })),
    periodLabel: [
      filters.fiscalYear || 'All fiscal years',
      filters.payrollMonth ? `Month ${filters.payrollMonth}` : '',
      filters.fromDate ? `From ${filters.fromDate.toISOString().slice(0, 10)}` : '',
      filters.toDate ? `To ${filters.toDate.toISOString().slice(0, 10)}` : '',
    ].filter(Boolean).join(' | '),
  };
}

async function exportPayrollReport(reportKey, query, format, schoolName = 'School') {
  const data = await getPayrollReport(reportKey, query, { exportMode: true });
  const options = {
    title: data.report.title,
    schoolName,
    periodLabel: data.periodLabel,
    columns: data.columns.map(([, label]) => label),
    rows: data.exportRows,
  };
  if (format === 'xls') return { contentType: 'application/vnd.ms-excel; charset=utf-8', body: `\uFEFF${createExcelXml(options)}` };
  if (format === 'pdf') return { contentType: 'application/pdf', body: await createReportPdf(options) };
  throw new Error('Choose xls or pdf export format.');
}

module.exports = {
  MAX_EXPORT_ROWS,
  PAGE_SIZE,
  REPORTS,
  buildFilters,
  exportPayrollReport,
  getPayrollReport,
  summarize,
};
