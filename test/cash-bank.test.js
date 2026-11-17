const assert = require('assert');
const {
  calculateLedgerBalances,
  classifyCashBankLedger,
  getNormalBalanceLabel,
} = require('../utils/cashBank');

assert.strictEqual(classifyCashBankLedger({ ledgerType: 'CASH' }), 'cash');
assert.strictEqual(classifyCashBankLedger({ ledgerType: 'BANK' }), 'bank');
assert.strictEqual(classifyCashBankLedger({ ledgerType: 'GENERAL', group: { name: 'Cash in Hand' } }), 'cash');
assert.strictEqual(classifyCashBankLedger({ ledgerType: 'GENERAL', group: { name: 'Current Bank Accounts' } }), 'bank');
assert.strictEqual(classifyCashBankLedger({ ledgerType: 'GENERAL', group: { name: 'Accounts Receivable' } }), '');

const balances = calculateLedgerBalances([
  { _id: 'cash', debit: 1200.1, credit: 200.05 },
  { _id: 'bank', debit: 0.1, credit: 0 },
  { _id: 'overdrawn-bank', debit: 300, credit: 450 },
]);
assert.strictEqual(balances.get('cash'), 1000.05, 'Debit balance is debits less credits');
assert.strictEqual(balances.get('bank'), 0.1, 'Currency balances use two-decimal precision');
assert.strictEqual(balances.get('overdrawn-bank'), -150, 'Credit balance remains negative for an asset ledger');
assert.strictEqual(getNormalBalanceLabel(0, 'DEBIT'), 'DEBIT');
assert.strictEqual(getNormalBalanceLabel(10, 'DEBIT'), 'DEBIT');
assert.strictEqual(getNormalBalanceLabel(-10, 'DEBIT'), 'CREDIT');

console.log('Cash and bank ledger tests passed.');
