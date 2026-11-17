const assert = require('assert');
const { hashStatement, parseBankStatementCsv } = require('../utils/bankReconciliation');

const rows = parseBankStatementCsv(
  'Date,Description,Reference,Debit,Credit\r\n2025-01-03,"Electricity, bill",CHQ-1,8000.00,0\r\n2025-01-04,Fee deposit,,0,15000'
);
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].description, 'Electricity, bill');
assert.strictEqual(rows[0].debit, 8000);
assert.strictEqual(rows[1].credit, 15000);
assert.throws(
  () => parseBankStatementCsv('Date,Debit,Credit\n2025-01-03,0,0'),
  /exactly one/
);
assert.throws(
  () => parseBankStatementCsv('Date,Description\n2025-01-03,Deposit'),
  /headers/
);
assert.strictEqual(hashStatement({ ledgerId: 'a', from: '1', to: '2', openingBalance: 0, csv: 'x' }).length, 64);

console.log('Bank reconciliation CSV tests passed.');
