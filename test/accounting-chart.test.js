const assert = require('assert');
const {
  ACCOUNT_NATURES,
  LEDGER_TYPES,
  getNormalBalance,
  normalizeAccountCode,
  normalizeAccountName,
  validateLedgerNature,
} = require('../utils/accountingChart');

assert.deepStrictEqual(
  ACCOUNT_NATURES.map(({ value, normalBalance }) => [value, normalBalance]),
  [
    ['ASSET', 'DEBIT'],
    ['LIABILITY', 'CREDIT'],
    ['EQUITY', 'CREDIT'],
    ['INCOME', 'CREDIT'],
    ['EXPENSE', 'DEBIT'],
  ],
  'Account natures should use their conventional normal balances'
);

assert.strictEqual(getNormalBalance('ASSET'), 'DEBIT');
assert.strictEqual(getNormalBalance('EXPENSE'), 'DEBIT');
assert.strictEqual(getNormalBalance('LIABILITY'), 'CREDIT');
assert.strictEqual(getNormalBalance('EQUITY'), 'CREDIT');
assert.strictEqual(getNormalBalance('INCOME'), 'CREDIT');

for (const type of LEDGER_TYPES) {
  assert.strictEqual(
    validateLedgerNature(type.value, type.nature || 'ASSET'),
    '',
    `${type.label} should be allowed under its matching group`
  );
  if (type.nature) {
    const otherNature = ACCOUNT_NATURES.find(nature => nature.value !== type.nature).value;
    assert.ok(
      validateLedgerNature(type.value, otherNature),
      `${type.label} should not be allowed under ${otherNature}`
    );
  }
}

assert.ok(validateLedgerNature('NOT_A_LEDGER_TYPE', 'ASSET'), 'Unknown ledger types should fail validation');
assert.strictEqual(normalizeAccountCode(' cash-01 '), 'CASH-01');
assert.strictEqual(normalizeAccountName('  Current   Assets  '), 'Current Assets');

console.log('Accounting chart tests passed.');
