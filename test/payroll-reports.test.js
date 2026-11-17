const assert = require('assert');
const test = require('node:test');
const mongoose = require('mongoose');
const reports = require('../services/payrollReportsService');
const { JournalVoucher } = require('../model/billingschema/JournalVoucher');
const {
  EmployeeAdvance,
  EmployeeLoan,
  PayrollItem,
  PayrollPayment,
  PayrollRun,
  SalaryRevision,
  SalaryStructure,
} = require('../model/payrollSchema');

const Staff = mongoose.models.staff;
const originalMethods = {
  staffFind: Staff.find,
  runFind: PayrollRun.find,
  itemFind: PayrollItem.find,
  advanceFind: EmployeeAdvance.find,
  loanFind: EmployeeLoan.find,
  paymentFind: PayrollPayment.find,
  paymentAggregate: PayrollPayment.aggregate,
  revisionFind: SalaryRevision.find,
  structureFind: SalaryStructure.find,
  voucherFind: JournalVoucher.find,
};

const employeeId = new mongoose.Types.ObjectId();
const runId = new mongoose.Types.ObjectId();
const payrollItemId = new mongoose.Types.ObjectId();
const employees = [{
  _id: employeeId,
  staffName: 'Report Test Employee',
  employeeCode: 'RPT-001',
  department: 'Teaching',
  branchName: 'Main',
}];
const runs = [{
  _id: runId,
  fiscalYear: '2082/83',
  payrollMonth: '02',
  periodLabel: '2082/83-02',
  branch: 'Main',
  status: 'CALCULATED',
  totalEmployerCost: 1200,
}];
const items = [{
  _id: payrollItemId,
  payrollRun: runId,
  employee: employeeId,
  employeeCode: 'RPT-001',
  basicSalary: 1000,
  allowances: 100,
  grossSalary: 1100,
  taxAmount: 50,
  employeeDeductions: 100,
  employerContributions: 100,
  advanceRecovery: 25,
  loanInstallment: 0,
  netSalary: 975,
  employerCost: 1200,
  status: 'VALID',
}];

const query = value => ({
  select() { return this; },
  sort() { return this; },
  populate() { return this; },
  lean() { return Promise.resolve(value); },
});

test('payroll reports filter, total, reconcile, and export persisted payroll data', async t => {
  t.after(() => {
    Staff.find = originalMethods.staffFind;
    PayrollRun.find = originalMethods.runFind;
    PayrollItem.find = originalMethods.itemFind;
    EmployeeAdvance.find = originalMethods.advanceFind;
    EmployeeLoan.find = originalMethods.loanFind;
    PayrollPayment.find = originalMethods.paymentFind;
    PayrollPayment.aggregate = originalMethods.paymentAggregate;
    SalaryRevision.find = originalMethods.revisionFind;
    SalaryStructure.find = originalMethods.structureFind;
    JournalVoucher.find = originalMethods.voucherFind;
  });

  assert.throws(() => reports.buildFilters({ payrollMonth: '13' }), /month number from 1 to 12/);
  assert.throws(() => reports.buildFilters({ fromDate: '2026-03-02', toDate: '2026-03-01' }), /on or before/);
  assert.strictEqual(reports.buildFilters({ payrollMonth: '2' }).payrollMonth, '2');
  assert.deepStrictEqual(reports.summarize('tax-deduction', [{ taxAmount: 10 }, { taxAmount: 5 }]).taxAmount, 15);

  Staff.find = () => query(employees);
  PayrollRun.find = () => query(runs);
  PayrollItem.find = () => query(items);
  EmployeeAdvance.find = () => query([{
    _id: new mongoose.Types.ObjectId(),
    employee: employeeId,
    amount: 300,
    outstandingBalance: 200,
    monthlyInstallment: 100,
    recoveryStartMonth: '03',
    requestDate: new Date('2026-03-01T00:00:00.000Z'),
    status: 'PARTIALLY_RECOVERED',
    purpose: 'Emergency',
  }]);
  EmployeeLoan.find = () => query([{
    _id: new mongoose.Types.ObjectId(),
    employee: employeeId,
    principal: 500,
    interestRate: 0,
    method: 'FIXED',
    installmentAmount: 100,
    outstandingPrincipal: 300,
    outstandingInterest: 0,
    recoveryStartMonth: '03',
    status: 'ACTIVE',
  }]);
  PayrollPayment.find = () => query([{
    _id: new mongoose.Types.ObjectId(),
    payrollRun: runId,
    payrollItem: payrollItemId,
    employee: employeeId,
    amount: 400,
    paymentMode: 'BANK',
    paymentDate: new Date('2026-03-15T00:00:00.000Z'),
    referenceNumber: 'PAY-001',
    status: 'PARTIAL',
  }]);
  PayrollPayment.aggregate = async () => [{ _id: { payrollRun: runId, employee: employeeId }, paid: 400 }];
  SalaryRevision.find = () => query([]);
  SalaryStructure.find = () => query([{
    _id: new mongoose.Types.ObjectId(),
    employee: employees[0],
    fiscalYear: '2082/83',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    basicSalary: 1000,
    status: 'HISTORICAL',
  }]);
  JournalVoucher.find = () => query([{
    sourceId: runId,
    totalDebit: 1200,
    totalCredit: 1200,
    voucherNumber: 'JV-PAYROLL-1',
  }]);

  const register = await reports.getPayrollReport('monthly-register', {
    fiscalYear: '2082/83',
    payrollMonth: '2',
  });
  assert.strictEqual(register.rows.length, 1);
  assert.strictEqual(register.rows[0].employeeName, 'Report Test Employee');
  assert.strictEqual(register.summary.grossSalary, 1100);
  assert.strictEqual(register.summary.netSalary, 975);

  const department = await reports.getPayrollReport('department-salary', {});
  assert.strictEqual(department.rows[0].departmentOrBranch, 'Teaching');
  assert.strictEqual(department.rows[0].employeeCount, 1);
  const tax = await reports.getPayrollReport('tax-deduction', {});
  assert.strictEqual(tax.rows.length, 1);
  assert.strictEqual(tax.summary.taxAmount, 50);
  const annualTax = await reports.getPayrollReport('annual-tax', {});
  assert.strictEqual(annualTax.rows.length, 1);
  assert.strictEqual(annualTax.rows[0].fiscalYear, '2082/83');
  const history = await reports.getPayrollReport('salary-history', {});
  assert.strictEqual(history.rows.length, 1);
  assert.strictEqual(history.rows[0].basicSalary, 1000);
  const advances = await reports.getPayrollReport('advance-register', {});
  assert.strictEqual(advances.rows[0].outstandingBalance, 200);
  const loans = await reports.getPayrollReport('loan-report', {});
  assert.strictEqual(loans.rows[0].outstandingPrincipal, 300);
  const payments = await reports.getPayrollReport('salary-payments', {});
  assert.strictEqual(payments.rows[0].amount, 400);
  const outstanding = await reports.getPayrollReport('outstanding-salary', {});
  assert.strictEqual(outstanding.rows[0].outstandingSalary, 575);

  const reconciliation = await reports.getPayrollReport('accounting-reconciliation', { fiscalYear: '2082/83' });
  assert.strictEqual(reconciliation.rows.length, 1);
  assert.strictEqual(reconciliation.rows[0].isReconciled, true);

  const workbook = await reports.exportPayrollReport('monthly-register', { fiscalYear: '2082/83' }, 'xls');
  assert.match(workbook.contentType, /application\/vnd\.ms-excel/);
  assert.match(workbook.body, /Report Test Employee/);
  const pdf = await reports.exportPayrollReport('monthly-register', { fiscalYear: '2082/83' }, 'pdf');
  assert.match(pdf.contentType, /application\/pdf/);
  assert(Buffer.isBuffer(pdf.body));
  assert.strictEqual(pdf.body.subarray(0, 4).toString(), '%PDF');
});
