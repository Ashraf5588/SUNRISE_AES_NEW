const assert = require('assert');
const {
  buildContraVoucherData,
  formatVoucherNumber,
  validateJournalEntries,
} = require('../utils/journalVoucher');
const { accountingVoucherNumber, formatVoucherType } = require('../utils/accounting');

const cash = { _id: 'cash-id' };
const bank = { _id: 'bank-id', ledgerType: 'BANK', isActive: true };
cash.ledgerType = 'CASH';
cash.isActive = true;
const income = { _id: 'income-id' };
const ledgers = [cash, income];

const balanced = validateJournalEntries([
  { ledger: cash._id, debit: '1250.50', credit: '' },
  { ledger: income._id, debit: '', credit: '1,250.50' },
], ledgers);
assert.ok(balanced.error, 'Amounts with commas should not be silently accepted');

const valid = validateJournalEntries([
  { ledger: cash._id, debit: '1250.50', credit: '' },
  { ledger: income._id, debit: '', credit: '1250.50' },
  { ledger: '', debit: '', credit: '' },
], ledgers);
assert.strictEqual(valid.error, undefined);
assert.strictEqual(valid.totalDebit, 1250.5);
assert.strictEqual(valid.totalCredit, 1250.5);
assert.strictEqual(valid.entries.length, 2, 'Blank unused entry rows should be ignored');

assert.match(
  validateJournalEntries([{ ledger: cash._id, debit: '10', credit: '' }], ledgers).error,
  /at least two entries/
);
assert.match(
  validateJournalEntries([
    { ledger: cash._id, debit: '10', credit: '' },
    { ledger: income._id, debit: '', credit: '9' },
  ], ledgers).error,
  /not balanced/
);
assert.match(
  validateJournalEntries([
    { ledger: cash._id, debit: '10.001', credit: '' },
    { ledger: income._id, debit: '', credit: '10' },
  ], ledgers).error,
  /two decimal places/
);
assert.match(
  validateJournalEntries([
    { ledger: 'unlisted-id', debit: '10', credit: '' },
    { ledger: income._id, debit: '', credit: '10' },
  ], ledgers).error,
  /unavailable/
);
assert.match(
  validateJournalEntries([
    { ledger: cash._id, debit: '10', credit: '10' },
    { ledger: income._id, debit: '', credit: '10' },
  ], ledgers).error,
  /exactly one side/
);

assert.strictEqual(formatVoucherNumber(1), 'JV-0001');
assert.strictEqual(formatVoucherNumber(10000), 'JV-10000', 'Voucher sequence should not truncate after four digits');

const contraVoucherNumber = accountingVoucherNumber('CONTRA', 1);
const contraVoucher = buildContraVoucherData({
  fromLedger: cash,
  toLedger: bank,
  amountMinor: 200000,
  referenceNumber: 'TEST-TRANSFER-001',
});
assert.strictEqual(accountingVoucherNumber(contraVoucher.voucherType, 1), 'CV-000001');
assert.strictEqual(contraVoucherNumber, 'CV-000001');
assert.strictEqual(contraVoucher.voucherType, 'CONTRA', 'Fund Transfer data uses the authoritative CONTRA voucher type');
assert.deepStrictEqual(buildContraVoucherData({
  fromLedger: cash,
  toLedger: bank,
  amountMinor: 200000,
  referenceNumber: 'TEST-TRANSFER-001',
  offsetLedgerId: income._id,
}), contraVoucher, 'An unrelated Other Ledger selection does not affect a fund transfer');
assert.deepStrictEqual(contraVoucher.entries, [
  { ledger: bank._id, debit: 2000, credit: 0 },
  { ledger: cash._id, debit: 0, credit: 2000 },
]);
assert.strictEqual(contraVoucher.entries.reduce((sum, entry) => sum + entry.debit, 0), 2000);
assert.strictEqual(contraVoucher.entries.reduce((sum, entry) => sum + entry.credit, 0), 2000);
assert.strictEqual(contraVoucher.entries.some(entry => entry.ledger === income._id), false, 'Other Ledger selections are not part of contra entries');
assert.deepStrictEqual(contraVoucher.transactionDetails, {
  amount: 2000,
  fromLedger: cash._id,
  toLedger: bank._id,
  referenceNumber: 'TEST-TRANSFER-001',
});
assert.strictEqual(formatVoucherType('CONTRA'), 'Contra', 'A stored CONTRA voucher is displayed as Contra');
assert.throws(() => buildContraVoucherData({ fromLedger: cash, toLedger: { _id: 'inactive-bank', ledgerType: 'BANK', isActive: false }, amountMinor: 200000 }), /different active cash or bank/);
assert.throws(() => buildContraVoucherData({ fromLedger: cash, toLedger: income, amountMinor: 200000 }), /different active cash or bank/);
assert.throws(() => buildContraVoucherData({ fromLedger: cash, toLedger: cash, amountMinor: 200000 }), /different active cash or bank/);
assert.throws(() => buildContraVoucherData({ fromLedger: cash, toLedger: bank, amountMinor: 0 }), /positive transfer amount/);
assert.throws(() => buildContraVoucherData({ fromLedger: cash, toLedger: bank, amountMinor: -1 }), /positive transfer amount/);
assert.throws(() => buildContraVoucherData({ fromLedger: cash, toLedger: bank, amountMinor: 1.5 }), /positive transfer amount/);

console.log('Journal voucher validation tests passed.');
