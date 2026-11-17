const assert = require('node:assert/strict');
const test = require('node:test');
const { PayrollSettings } = require('../model/payrollSchema');
const {
  calculateEmployeePayrollPreview,
  normalizePayrollComponents,
} = require('../services/payrollService');

test('repairs legacy payroll titles with calculation type stored in the basis field', () => {
  const settings = new PayrollSettings({
    components: [
      { category: 'ALLOWANCE', type: 'ALLOWANCE', basis: 'PERCENT' },
      { category: 'DEDUCTION', type: 'DEDUCTION', basis: 'FIXED' },
    ],
  });

  normalizePayrollComponents(settings.components);

  assert.deepEqual(settings.components.map(({ category, type, basis }) => ({ category, type, basis })), [
    { category: 'ALLOWANCE', type: 'PERCENT', basis: 'BASIC' },
    { category: 'DEDUCTION', type: 'FIXED', basis: 'BASIC' },
  ]);
  assert.equal(settings.validateSync(), undefined);
});

test('preserves valid payroll component calculation and basis settings', () => {
  const components = [
    { category: 'ALLOWANCE', type: 'FIXED', basis: 'BASIC' },
    { category: 'DEDUCTION', type: 'PERCENT', basis: 'GROSS' },
  ];

  normalizePayrollComponents(components);

  assert.deepEqual(components.map(({ category, type, basis }) => ({ category, type, basis })), [
    { category: 'ALLOWANCE', type: 'FIXED', basis: 'BASIC' },
    { category: 'DEDUCTION', type: 'PERCENT', basis: 'GROSS' },
  ]);
});

test('uses employee-specific earning and deduction amounts in payroll previews', async () => {
  const preview = await calculateEmployeePayrollPreview(
    { _id: 'employee-1', staffName: 'Test Employee', allowances: [], deductions: [] },
    {},
    {
      basicSalary: 2000,
      earningComponents: [
        { code: 'FARE', type: 'FIXED', amount: 1200, active: true, taxable: true },
        { code: 'BONUS', type: 'PERCENT', rate: 10, basis: 'BASIC', active: true, taxable: false },
      ],
      deductionComponents: [
        { code: 'UNIFORM', type: 'FIXED', amount: 100, active: true },
      ],
    },
  );

  assert.equal(preview.grossSalary, 3400);
  assert.equal(preview.taxableIncome, 3200);
  assert.equal(preview.deductions, 100);
  assert.equal(preview.netSalary, 3300);
});
