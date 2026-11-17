const assert = require('assert');
const { PDFDocument } = require('pdf-lib');
const bs = require('../utils/bikramSambat');
const {
  DAY_MS,
  dateOnly,
  resolveAsOf,
  resolvePeriod,
} = require('../utils/accountingReportDates');
const {
  calculateBalanceSheet,
  calculateCashFlow,
  calculateCashLedgerBalanceMinor,
  calculateOpeningCashMinor,
  calculateProfitAndLoss,
  calculateTrialBalance,
  openingBalanceDateBS,
  createExcelXml,
  createReportPdf,
} = require('../utils/accountingReports');

const groupAssets = { _id: 'assets', code: '100', name: 'Current Assets' };
const groupEquity = { _id: 'equity', code: '300', name: 'Equity' };
const groupIncome = { _id: 'income', code: '400', name: 'Operating Income' };
const groupExpense = { _id: 'expense', code: '500', name: 'Operating Expenses' };
const ledgers = [
  { _id: 'cash', code: '101', name: 'Cash in Hand', nature: 'ASSET', ledgerType: 'CASH', normalBalance: 'DEBIT', group: groupAssets },
  { _id: 'petty', code: '102', name: 'Petty Cash', nature: 'ASSET', ledgerType: 'CASH', normalBalance: 'DEBIT', group: groupAssets },
  { _id: 'bank', code: '103', name: 'Main Bank Account', nature: 'ASSET', ledgerType: 'BANK', normalBalance: 'DEBIT', group: groupAssets },
  { _id: 'reserve', code: '104', name: 'Reserve Bank Account', nature: 'ASSET', ledgerType: 'BANK', normalBalance: 'DEBIT', group: groupAssets },
  { _id: 'capital', code: '301', name: 'Opening Capital', nature: 'EQUITY', ledgerType: 'CAPITAL', normalBalance: 'CREDIT', group: groupEquity },
  { _id: 'tuition', code: '401', name: 'Tuition Income', nature: 'INCOME', ledgerType: 'INCOME', normalBalance: 'CREDIT', group: groupIncome },
  { _id: 'electricity', code: '501', name: 'Electricity Expense', nature: 'EXPENSE', ledgerType: 'EXPENSE', normalBalance: 'DEBIT', group: groupExpense },
  { _id: 'fixed', code: '151', name: 'Equipment', nature: 'ASSET', ledgerType: 'FIXED_ASSET', normalBalance: 'DEBIT', group: groupAssets },
  { _id: 'loan', code: '202', name: 'Unclassified borrowing', nature: 'LIABILITY', ledgerType: 'GENERAL', normalBalance: 'CREDIT', group: { _id: 'liability', code: '200', name: 'Liabilities' } },
  { _id: 'receivable', code: '1100', name: 'Student Receivables', nature: 'ASSET', ledgerType: 'RECEIVABLE', normalBalance: 'DEBIT', group: groupAssets },
  { _id: 'payable', code: '2001', name: 'Accounts Payable', nature: 'LIABILITY', ledgerType: 'PAYABLE', normalBalance: 'CREDIT', group: { _id: 'liability', code: '200', name: 'Liabilities' } },
  { _id: 'office-supplies', code: '5201', name: 'Office Supplies Expense', nature: 'EXPENSE', ledgerType: 'EXPENSE', normalBalance: 'DEBIT', group: groupExpense },
];

const openingSnapshot = [
  { voucherNumber: 'JV-000002', ledger: 'cash', debit: 20000, credit: 0 },
  { voucherNumber: 'JV-000002', ledger: 'petty', debit: 5000, credit: 0 },
  { voucherNumber: 'JV-000002', ledger: 'bank', debit: 100000, credit: 0 },
  { voucherNumber: 'JV-000002', ledger: 'reserve', debit: 0, credit: 0 },
  { voucherNumber: 'JV-000002', ledger: 'capital', debit: 0, credit: 125000 },
];

const fiscalYear = '2082/083';
const fiscalStart = bs.BSToAD('2082-04-01');
const nextFiscalStart = bs.BSToAD('2083-04-01');
const fiscalEnd = dateOnly(new Date(Date.parse(`${nextFiscalStart}T00:00:00.000Z`) - DAY_MS));
const fiscalPeriod = resolvePeriod({ fiscalYear }, { currentFiscalYearBS: fiscalYear });
assert.strictEqual(fiscalPeriod.fromText, fiscalStart);
assert.strictEqual(fiscalPeriod.toText, fiscalEnd);
assert.strictEqual(dateOnly(fiscalPeriod.toExclusive), nextFiscalStart);
const customFiscalPeriod = resolvePeriod({
  fiscalYear,
  from: fiscalStart,
  to: fiscalEnd,
}, { currentFiscalYearBS: fiscalYear });
assert.strictEqual(customFiscalPeriod.days, fiscalPeriod.days);
assert.throws(
  () => resolvePeriod({ fiscalYear, from: fiscalStart, to: nextFiscalStart }, { currentFiscalYearBS: fiscalYear }),
  /must remain within fiscal year/,
);
assert.throws(
  () => resolvePeriod({ fiscalYear, from: '2082-02-31', to: fiscalEnd }, { currentFiscalYearBS: fiscalYear }),
  /valid start and end date/,
);
assert.throws(
  () => resolvePeriod({ fiscalYear, from: fiscalEnd, to: fiscalStart }, { currentFiscalYearBS: fiscalYear }),
  /valid start and end date/,
);
assert.throws(
  () => resolvePeriod({ fiscalYear: '2082/084' }, { currentFiscalYearBS: fiscalYear }),
  /valid fiscal year/,
);
const balanceSheetDate = resolveAsOf({ fiscalYear, asOf: fiscalStart }, { currentFiscalYearBS: fiscalYear });
assert.strictEqual(balanceSheetDate.asOfText, fiscalStart);
assert.strictEqual(balanceSheetDate.asOfBS, '2082-04-01');
assert.strictEqual(dateOnly(balanceSheetDate.earningsToExclusive), nextFiscalStart);
assert.throws(
  () => resolveAsOf({ fiscalYear, asOf: nextFiscalStart }, { currentFiscalYearBS: fiscalYear }),
  /must be within fiscal year/,
);

const openingAggregates = openingSnapshot.reduce((result, line) => {
  let ledger = result.find(item => item._id === line.ledger);
  if (!ledger) {
    ledger = { _id: line.ledger, openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0 };
    result.push(ledger);
  }
  ledger.openingDebit += line.debit;
  ledger.openingCredit += line.credit;
  return result;
}, []);

const trialBalance = calculateTrialBalance(ledgers, openingAggregates, { includeZero: true });
assert.strictEqual(trialBalance.totals.openingDebit, 125000, 'JV-000002 known cash and bank opening debits total Rs. 125,000');
assert.strictEqual(trialBalance.totals.openingCredit, 125000, 'The opening voucher remains balanced');
assert.strictEqual(trialBalance.totals.closingDebit, 125000);
assert.strictEqual(trialBalance.totals.closingCredit, 125000);
assert.strictEqual(trialBalance.rows.find(row => row.ledger._id === 'cash').closingDebit, 20000);
assert.strictEqual(trialBalance.rows.find(row => row.ledger._id === 'petty').closingDebit, 5000);
assert.strictEqual(trialBalance.rows.find(row => row.ledger._id === 'bank').closingDebit, 100000);
assert.strictEqual(trialBalance.rows.find(row => row.ledger._id === 'reserve').closingDebit, 0);

const withoutZero = calculateTrialBalance(ledgers, openingAggregates);
assert(!withoutZero.rows.some(row => row.ledger._id === 'reserve'), 'Zero balance accounts can be excluded');
const withZero = calculateTrialBalance(ledgers, openingAggregates, { includeZero: true });
assert(withZero.rows.some(row => row.ledger._id === 'reserve'), 'Zero balance accounts can be included');
const assetGroup = calculateTrialBalance(ledgers, openingAggregates, { groupId: 'assets' });
assert.strictEqual(assetGroup.totals.closingDebit, 125000, 'Account group filters preserve their own balances');

const periodAggregates = [
  { _id: 'cash', debit: 10000, credit: 5000 },
  { _id: 'tuition', debit: 0, credit: 10000 },
  { _id: 'electricity', debit: 5000, credit: 0 },
];
const profitAndLoss = calculateProfitAndLoss(ledgers, periodAggregates);
assert.strictEqual(profitAndLoss.totalIncome, 10000);
assert.strictEqual(profitAndLoss.totalExpense, 5000);
assert.strictEqual(profitAndLoss.netProfit, 5000);

const balanceSheetLedgers = [
  ...ledgers.filter(ledger => ['cash', 'petty', 'bank', 'reserve', 'capital'].includes(ledger._id)),
  ledgers.find(ledger => ledger._id === 'tuition'),
  ledgers.find(ledger => ledger._id === 'electricity'),
];
const balanceSheetTotals = openingAggregates.map(item => ({
  _id: item._id,
  debit: item.openingDebit,
  credit: item.openingCredit,
}));
for (const movement of periodAggregates) {
  let total = balanceSheetTotals.find(item => item._id === movement._id);
  if (!total) {
    total = { _id: movement._id, debit: 0, credit: 0 };
    balanceSheetTotals.push(total);
  }
  total.debit += movement.debit;
  total.credit += movement.credit;
}
const balanceSheet = calculateBalanceSheet(balanceSheetLedgers, balanceSheetTotals, 50000000);
assert.strictEqual(balanceSheet.assets, 130000);
assert.strictEqual(balanceSheet.equity, 625000);
assert.strictEqual(balanceSheet.difference, -495000, 'The report exposes imbalance instead of adjusting it');
assert.strictEqual(balanceSheet.isBalanced, false);
const balancedSheet = calculateBalanceSheet(balanceSheetLedgers, balanceSheetTotals, 500000);
assert.strictEqual(balancedSheet.isBalanced, true);
const postClosingBalances = balanceSheetTotals.map(item => ({ ...item }));
for (const closingLine of [
  { _id: 'tuition', debit: 10000, credit: 0 },
  { _id: 'electricity', debit: 0, credit: 5000 },
  { _id: 'capital', debit: 0, credit: 5000 },
]) {
  const total = postClosingBalances.find(item => item._id === closingLine._id);
  total.debit += closingLine.debit;
  total.credit += closingLine.credit;
}
const duplicateProfitSheet = calculateBalanceSheet(balanceSheetLedgers, postClosingBalances, 500000);
assert.strictEqual(duplicateProfitSheet.isBalanced, false, 'A posted closing voucher must not be combined with the same current-period profit');

const cashAccounts = [ledgers.find(ledger => ledger._id === 'cash'), ledgers.find(ledger => ledger._id === 'bank')];
const vouchers = [
  { status: 'POSTED', voucherType: 'RECEIPT', entries: [{ ledger: cashAccounts[0], debit: 10000, credit: 0 }, { ledger: ledgers.find(ledger => ledger._id === 'tuition'), debit: 0, credit: 10000 }] },
  { status: 'POSTED', voucherType: 'PAYMENT', entries: [{ ledger: ledgers.find(ledger => ledger._id === 'electricity'), debit: 5000, credit: 0 }, { ledger: cashAccounts[0], debit: 0, credit: 5000 }] },
  { status: 'POSTED', voucherType: 'CONTRA', entries: [{ ledger: cashAccounts[0], debit: 20000, credit: 0 }, { ledger: cashAccounts[1], debit: 0, credit: 20000 }] },
  { status: 'POSTED', voucherType: 'PAYMENT', entries: [{ ledger: ledgers.find(ledger => ledger._id === 'fixed'), debit: 2000, credit: 0 }, { ledger: cashAccounts[1], debit: 0, credit: 2000 }] },
  { status: 'POSTED', voucherType: 'RECEIPT', entries: [{ ledger: cashAccounts[1], debit: 3000, credit: 0 }, { ledger: ledgers.find(ledger => ledger._id === 'capital'), debit: 0, credit: 3000 }] },
  { status: 'POSTED', voucherType: 'RECEIPT', entries: [{ ledger: cashAccounts[1], debit: 4000, credit: 0 }, { ledger: ledgers.find(ledger => ledger._id === 'loan'), debit: 0, credit: 4000 }] },
  { status: 'PENDING_ADMIN_APPROVAL', voucherType: 'RECEIPT', entries: [{ ledger: cashAccounts[0], debit: 9000, credit: 0 }, { ledger: ledgers.find(ledger => ledger._id === 'tuition'), debit: 0, credit: 9000 }] },
  { status: 'REJECTED', voucherType: 'PAYMENT', entries: [{ ledger: ledgers.find(ledger => ledger._id === 'electricity'), debit: 1000, credit: 0 }, { ledger: cashAccounts[0], debit: 0, credit: 1000 }] },
  { status: 'POSTED', voucherType: 'RECEIPT', entries: [{ ledger: cashAccounts[0], debit: 10000, credit: 0 }, { ledger: ledgers.find(ledger => ledger._id === 'tuition'), debit: 0, credit: 10000 }] },
  { status: 'POSTED', voucherType: 'REVERSAL', entries: [{ ledger: cashAccounts[0], debit: 0, credit: 10000 }, { ledger: ledgers.find(ledger => ledger._id === 'tuition'), debit: 10000, credit: 0 }] },
];
const cashFlow = calculateCashFlow(vouchers, cashAccounts, 125000, 135000);
assert.strictEqual(cashFlow.operating, 5000, 'Draft/rejected/pending entries do not enter cash flow; posted reversal nets the original');
assert.strictEqual(cashFlow.investing, -2000);
assert.strictEqual(cashFlow.financing, 3000);
assert.strictEqual(cashFlow.unclassified, 4000, 'Unsupported liability classification remains visible');
assert.strictEqual(cashFlow.netIncrease, 10000);
assert.strictEqual(cashFlow.openingCash, 125000);
assert.strictEqual(cashFlow.closingCash, 135000);
assert.strictEqual(cashFlow.reconciliationDifference, 0);
assert.strictEqual(cashFlow.contraVouchersExcluded, 1);

const openingVoucherDateAD = bs.BSToAD('2083-07-26');
const openingVoucher = {
  _id: 'opening-voucher',
  voucherNumber: 'JV-000002',
  voucherType: 'JOURNAL',
  status: 'POSTED',
  dateBS: '2083-07-26',
  dateAD: new Date(`${openingVoucherDateAD}T00:00:00.000Z`),
  narration: 'Opening balances brought forward for accounting system testing as of 2083-07-15 BS.',
  entries: [
    { ledger: ledgers.find(ledger => ledger._id === 'cash'), debit: 20000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'petty'), debit: 5000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'bank'), debit: 100000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'receivable'), debit: 30000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'fixed'), debit: 90000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'payable'), debit: 0, credit: 25000 },
    { ledger: ledgers.find(ledger => ledger._id === 'capital'), debit: 0, credit: 220000 },
  ],
};
const paymentVoucher = {
  voucherNumber: 'PV-000001',
  voucherType: 'PAYMENT',
  status: 'POSTED',
  dateAD: openingVoucher.dateAD,
  entries: [
    { ledger: ledgers.find(ledger => ledger._id === 'office-supplies'), debit: 1000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'bank'), debit: 0, credit: 1000 },
  ],
};
const duplicateVoucher = {
  voucherNumber: 'JV-000003',
  voucherType: 'JOURNAL',
  status: 'POSTED',
  dateAD: openingVoucher.dateAD,
  entries: [
    { ledger: ledgers.find(ledger => ledger._id === 'office-supplies'), debit: 1000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'bank'), debit: 0, credit: 1000 },
  ],
};
const duplicateReversal = {
  voucherNumber: 'RV-000001',
  voucherType: 'REVERSAL',
  status: 'POSTED',
  dateAD: openingVoucher.dateAD,
  entries: [
    { ledger: ledgers.find(ledger => ledger._id === 'office-supplies'), debit: 0, credit: 1000 },
    { ledger: ledgers.find(ledger => ledger._id === 'bank'), debit: 1000, credit: 0 },
  ],
};
const transferVoucher = {
  voucherNumber: 'CV-000001',
  voucherType: 'CONTRA',
  status: 'POSTED',
  dateAD: openingVoucher.dateAD,
  entries: [
    { ledger: ledgers.find(ledger => ledger._id === 'bank'), debit: 20000, credit: 0 },
    { ledger: ledgers.find(ledger => ledger._id === 'cash'), debit: 0, credit: 20000 },
  ],
};
assert.strictEqual(transferVoucher.voucherType, 'CONTRA');
assert.strictEqual(openingBalanceDateBS(openingVoucher), '2083-07-15');
assert.strictEqual(openingBalanceDateBS({
  voucherType: 'OPENING_BALANCE',
  dateBS: '2083-04-01',
}), '2083-04-01');
const activeCashAccounts = [
  ledgers.find(ledger => ledger._id === 'cash'),
  ledgers.find(ledger => ledger._id === 'petty'),
  ledgers.find(ledger => ledger._id === 'bank'),
];
const baselineDateAD = new Date(`${bs.BSToAD('2083-07-15')}T00:00:00.000Z`);
const activityFrom = new Date(baselineDateAD.getTime() + DAY_MS);
const openingVoucherCandidate = {
  voucher: openingVoucher,
  dateBS: '2083-07-15',
  date: baselineDateAD,
};
const openingCashMinor = calculateOpeningCashMinor([], [openingVoucherCandidate], activeCashAccounts, activityFrom);
assert.strictEqual(openingCashMinor, 12500000, 'Late-posted brought-forward voucher establishes the Rs. 125,000 opening cash balance');
const activityVouchers = [openingVoucher, paymentVoucher, duplicateVoucher, duplicateReversal, transferVoucher];
const cashTotalsByLedger = new Map();
for (const voucher of activityVouchers) {
  for (const entry of voucher.entries) {
    const ledgerId = String(entry.ledger?._id || entry.ledger);
    if (!activeCashAccounts.some(ledger => String(ledger._id) === ledgerId)) continue;
    const total = cashTotalsByLedger.get(ledgerId) || { _id: ledgerId, debit: 0, credit: 0 };
    total.debit += entry.debit;
    total.credit += entry.credit;
    cashTotalsByLedger.set(ledgerId, total);
  }
}
const closingCashMinor = calculateCashLedgerBalanceMinor([...cashTotalsByLedger.values()], activeCashAccounts);
assert.strictEqual(closingCashMinor, 12400000, 'Opening funds plus payment and net-zero reversal/transfer activity close at Rs. 124,000');
const openingBalanceCashFlow = calculateCashFlow(
  activityVouchers,
  activeCashAccounts,
  openingCashMinor / 100,
  closingCashMinor / 100,
  { activityFrom, openingBalanceDate: '2083-07-15' },
);
assert.strictEqual(openingBalanceCashFlow.openingCash, 125000);
assert.strictEqual(openingBalanceCashFlow.operating, -1000, 'The office-supplies payment is an operating cash outflow; duplicate and reversal net to zero');
assert.strictEqual(openingBalanceCashFlow.investing, 0);
assert.strictEqual(openingBalanceCashFlow.financing, 0, 'Brought-forward capital is not financing cash flow');
assert.strictEqual(openingBalanceCashFlow.netIncrease, -1000);
assert.strictEqual(openingBalanceCashFlow.closingCash, 124000);
assert.strictEqual(openingBalanceCashFlow.reconciliationDifference, 0);
assert.strictEqual(openingBalanceCashFlow.openingBalanceVouchersExcluded, 1);
assert.strictEqual(openingBalanceCashFlow.contraVouchersExcluded, 1);
const transferOnlyCashFlow = calculateCashFlow([transferVoucher], activeCashAccounts, 125000, 125000);
assert.strictEqual(transferOnlyCashFlow.netIncrease, 0, 'Internal cash-to-bank transfers do not change total cash and bank');
assert.strictEqual(transferOnlyCashFlow.contraVouchersExcluded, 1);
const transferProfitAndLoss = calculateProfitAndLoss(ledgers, [
  { _id: 'cash', debit: 0, credit: 20000 },
  { _id: 'bank', debit: 20000, credit: 0 },
]);
assert.strictEqual(transferProfitAndLoss.netProfit, 0, 'Contra transfers do not create income or expenses');
assert.strictEqual(transferProfitAndLoss.rows.length, 0);

const emptyTrialBalance = calculateTrialBalance(ledgers, [], { includeZero: true });
const emptyProfitAndLoss = calculateProfitAndLoss(ledgers, []);
const emptyBalanceSheet = calculateBalanceSheet(ledgers, [], 0);
assert.strictEqual(emptyTrialBalance.totals.closingDifference, 0);
assert.strictEqual(emptyProfitAndLoss.netProfit, 0);
assert.strictEqual(emptyBalanceSheet.isBalanced, true);

const excel = createExcelXml({
  title: 'Trial Balance',
  schoolName: 'Test School',
  periodLabel: '2082/083 BS',
  columns: ['Voucher', 'Balance'],
  rows: [['JV-000002', 125000]],
});
assert(excel.includes('JV-000002'));
assert(excel.includes('<Data ss:Type="Number">125000</Data>'));
assert(excel.includes('ss:ID="Currency"'));
assert(excel.includes('<Cell ss:StyleID="Currency"><Data ss:Type="Number">125000</Data></Cell>'));
assert(excel.startsWith('<?xml'));

(async () => {
  const pdf = await createReportPdf({
    title: 'Trial Balance',
    schoolName: 'Test School',
    periodLabel: '2082/083 BS',
    columns: ['Account', 'Debit', 'Credit'],
    rows: [['Cash in Hand', 20000, 0]],
  });
  const loadedPdf = await PDFDocument.load(pdf);
  assert.strictEqual(loadedPdf.getPageCount(), 1);
  console.log('Accounting report calculation and export tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
