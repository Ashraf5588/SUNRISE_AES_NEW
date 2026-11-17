const assert = require('assert');
const {
  accountingVoucherNumber,
  calculateStudentPaymentAdvance,
  choosePostingStatus,
  formatVoucherType,
  getVoucherDisplayStatus,
  formatFiscalYearBS,
} = require('../utils/accounting');

assert.strictEqual(formatFiscalYearBS('2082-04-01'), '2082/083');
assert.strictEqual(formatFiscalYearBS('2083-01-15'), '2082/083');
assert.strictEqual(formatFiscalYearBS('invalid'), '');
assert.strictEqual(accountingVoucherNumber('RECEIPT', 1), 'RV-000001');
assert.strictEqual(accountingVoucherNumber('CONTRA', 1), 'CV-000001');
assert.strictEqual(formatVoucherType('CONTRA'), 'Contra');
assert.strictEqual(formatVoucherType('OPENING_BALANCE'), 'Opening Balance');
assert.strictEqual(getVoucherDisplayStatus({ status: 'POSTED', reversedBy: 'RV-000001' }), 'REVERSED');
assert.strictEqual(getVoucherDisplayStatus({ status: 'POSTED', reversedBy: null }), 'POSTED');
assert.strictEqual(getVoucherDisplayStatus({ status: 'PENDING_ADMIN_APPROVAL' }), 'PENDING_ADMIN_APPROVAL');
assert.strictEqual(getVoucherDisplayStatus({ status: 'POSTED', reversalOf: 'JV-000003' }), 'POSTED');
assert.deepStrictEqual(calculateStudentPaymentAdvance({
  amountMinor: 10000,
  totalAllocatedMinor: 6000,
  postedReceivableMinor: 2000,
}), {
  advanceMinor: 4000,
  unmappedReceivableMinor: 4000,
});
assert.deepStrictEqual(calculateStudentPaymentAdvance({
  amountMinor: 10000,
  totalAllocatedMinor: 10000,
  postedReceivableMinor: 10000,
}), {
  advanceMinor: 0,
  unmappedReceivableMinor: 0,
});
assert.throws(() => calculateStudentPaymentAdvance({
  amountMinor: 1000,
  totalAllocatedMinor: 1001,
  postedReceivableMinor: 0,
}), /inconsistent/);
assert.strictEqual(choosePostingStatus('CASHIER', 0, 100), 'PENDING_ACCOUNTANT_REVIEW');
assert.strictEqual(choosePostingStatus('ACCOUNTANT', 1000, 999), 'POSTED');
assert.strictEqual(choosePostingStatus('ACCOUNTANT', 1000, 1000), 'PENDING_ADMIN_APPROVAL');
assert.strictEqual(choosePostingStatus('ADMIN', 0, 100000), 'POSTED');
assert.throws(() => choosePostingStatus('TEACHER', 0, 100), /not authorized/);

console.log('Accounting workflow tests passed.');
