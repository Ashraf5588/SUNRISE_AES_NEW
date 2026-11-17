const assert = require('assert');
const Module = require('module');
const path = require('path');
const { buildFeeHeadIncomeEntries } = require('../utils/feeHeadIncome');

const feeHeads = [
  { _id: 'monthly', feehead: 'Monthly Fee', incomeLedger: '4001' },
  { _id: 'annual', feehead: 'Annual Fee', incomeLedger: '4002' },
  { _id: 'stationery', feehead: 'Stationery', incomeLedger: '4007' },
];
const ledgers = [
  { _id: '4001', code: '4001', nature: 'INCOME', isActive: true },
  { _id: '4002', code: '4002', nature: 'INCOME', isActive: true },
  { _id: '4007', code: '4007', nature: 'INCOME', isActive: true },
];

const multipleFeeEntries = buildFeeHeadIncomeEntries([
  { feeCategory: 'monthly', label: 'Monthly Fee - Baisakh', amount: 10000 },
  { feeCategory: 'annual', label: 'Annual Fee', amount: 5000 },
  { feeCategory: 'stationery', label: 'Stationery', amount: 750 },
], feeHeads, ledgers);

assert.deepStrictEqual(multipleFeeEntries, [
  { ledger: '4001', debit: 0, credit: 10000 },
  { ledger: '4002', debit: 0, credit: 5000 },
  { ledger: '4007', debit: 0, credit: 750 },
], 'Each fee head credits its own configured income ledger.');

const repeatedFeeHeadEntries = buildFeeHeadIncomeEntries([
  { feeCategory: 'monthly', label: 'Monthly Fee - Baisakh', amount: 10000 },
  { feeCategory: 'monthly', label: 'Monthly Fee - Jestha', amount: 10000 },
], feeHeads, ledgers);
assert.deepStrictEqual(repeatedFeeHeadEntries, [
  { ledger: '4001', debit: 0, credit: 20000 },
], 'Lines mapped to the same ledger are combined.');

assert.throws(
  () => buildFeeHeadIncomeEntries(
    [{ feeCategory: 'missing', label: 'Unmapped Activity Fee', amount: 1000 }],
    [{ _id: 'missing', feehead: 'Unmapped Activity Fee', incomeLedger: null }],
    ledgers
  ),
  /Fee head "Unmapped Activity Fee" has no income ledger mapping/,
  'An unmapped fee head is rejected with its name.',
);

assert.throws(
  () => buildFeeHeadIncomeEntries(
    [{ feeCategory: 'missing', label: 'Zero-value Unmapped Fee', amount: 0 }],
    [{ _id: 'missing', feehead: 'Zero-value Unmapped Fee', incomeLedger: null }],
    ledgers
  ),
  /Fee head "Zero-value Unmapped Fee" has no income ledger mapping/,
  'Even a zero-value included fee head requires a mapping.',
);

assert.throws(
  () => buildFeeHeadIncomeEntries(
    [{ feeCategory: 'annual', label: 'Annual Fee', amount: 5000 }],
    feeHeads,
    ledgers.map(ledger => ledger._id === '4002' ? { ...ledger, isActive: false } : ledger)
  ),
  /Fee head "Annual Fee" is mapped to an inactive or unavailable income ledger/,
  'An inactive mapped ledger is rejected.',
);

assert.throws(
  () => buildFeeHeadIncomeEntries(
    [{ feeCategory: 'stationery', label: 'Stationery', amount: 750 }],
    feeHeads,
    ledgers.map(ledger => ledger._id === '4007' ? { ...ledger, nature: 'EXPENSE' } : ledger)
  ),
  /Fee head "Stationery" must be mapped to an active income ledger/,
  'A mapped non-income ledger is rejected.',
);

const serviceState = {
  invoices: [],
  ledgerEntries: [],
  vouchers: [],
  advanceMutations: 0,
};
const mockFeeHeads = feeHeads.map(feeHead => ({
  ...feeHead,
  frequency: 'monthly',
  appliedmonth: [],
}));
const mockLedgers = ledgers.map(ledger => ({ ...ledger }));
const structures = mockFeeHeads.map((feeHead, index) => ({
  amount: [10000, 5000, 750][index],
  feeCategory: { ...feeHead, frequency: 'monthly', appliedmonth: [] },
}));
const session = {};
const query = value => ({
  populate() { return this; },
  session() { return this; },
  lean() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});
const student = {
  _id: '000000000000000000000001',
  status: 'ACTIVE',
  academicSession: 'session-1',
  class: { _id: 'class-1' },
  admissionDateAD: new Date('2025-01-01T00:00:00.000Z'),
};
const school = { closedFiscalYearsBS: [], invoicePrefix: 'INV' };
const mockModels = {
  Student: { findById: () => query(student) },
  FeeStructure: { find: () => query(structures) },
  Discount: { find: () => query([]) },
  School: { findOne: () => query(school) },
  Invoice: class MockInvoice {
    constructor(data) { Object.assign(this, data); }
    async save() {
      if (!serviceState.invoices.includes(this)) serviceState.invoices.push(this);
      return this;
    }
    static findOne({ generationKey }) {
      return query(serviceState.invoices.find(invoice => invoice.generationKey === generationKey) || null);
    }
  },
  LedgerEntry: {
    aggregate: () => query([]),
    async create(entries) { serviceState.ledgerEntries.push(...entries); },
  },
};

const servicePath = path.resolve(__dirname, '../services/billingService.js');
const originalLoad = Module._load;
const mockAccountingService = {
  assertOpenFiscalYear() {},
  applyStudentAdvances: async () => {
    serviceState.advanceMutations++;
    return [];
  },
  dateFromBS: () => ({ dateBS: '2082-02-01', dateAD: new Date('2025-05-15T00:00:00.000Z') }),
  getInvoiceLedgerRows: async items => buildFeeHeadIncomeEntries(items, mockFeeHeads, mockLedgers),
  postInvoiceVoucher: async (invoice, currentSession, user, entries) => {
    assert.strictEqual(currentSession, session, 'Voucher posting uses the active transaction session.');
    serviceState.vouchers.push({ invoice: invoice.invoiceNumber, entries });
    if (serviceState.failPosting) throw new Error('Simulated posting failure.');
    invoice.journalVoucher = 'voucher-1';
    await invoice.save({ session: currentSession });
    return { _id: 'voucher-1' };
  },
  submitStudentPayment: async () => {},
  withAccountingTransaction: async work => {
    const snapshot = {
      invoices: serviceState.invoices.length,
      ledgerEntries: serviceState.ledgerEntries.length,
      vouchers: serviceState.vouchers.length,
      advanceMutations: serviceState.advanceMutations,
    };
    try {
      return await work(session);
    } catch (error) {
      serviceState.invoices.length = snapshot.invoices;
      serviceState.ledgerEntries.length = snapshot.ledgerEntries;
      serviceState.vouchers.length = snapshot.vouchers;
      serviceState.advanceMutations = snapshot.advanceMutations;
      throw error;
    }
  },
};

const modelRequests = new Map([
  ['../model/billingschema/Student', mockModels.Student],
  ['../model/billingschema/feestructureschema', mockModels.FeeStructure],
  ['../model/billingschema/feeheadschema', {
    feeheadModel: { find: () => query(mockFeeHeads) },
  }],
  ['../model/billingschema/Discount', { find: mockModels.Discount.find }],
  ['../model/billingschema/Invoice', mockModels.Invoice],
  ['../model/billingschema/Payment', {}],
  ['../model/billingschema/LedgerEntry', mockModels.LedgerEntry],
  ['../model/billingschema/OpeningBalance', {}],
  ['../model/billingschema/School', mockModels.School],
  ['../model/billingschema/Counter', { getNextSequence: async () => 1 }],
  ['./accountingService', mockAccountingService],
]);

let billingService;
try {
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === servicePath && modelRequests.has(request)) return modelRequests.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  billingService = require(servicePath);
} finally {
  Module._load = originalLoad;
}

function resetServiceState() {
  serviceState.invoices.length = 0;
  serviceState.ledgerEntries.length = 0;
  serviceState.vouchers.length = 0;
  serviceState.advanceMutations = 0;
  serviceState.failPosting = false;
}

const invoiceInput = {
  studentId: student._id,
  billMonthBS: 'Baisakh',
  billDateBS: '2082-02-01',
  user: { _id: 'admin-1', role: 'ADMIN' },
};

(async () => {
  resetServiceState();
  const mappedLedger = mockFeeHeads[1].incomeLedger;
  mockFeeHeads[1].incomeLedger = null;
  await assert.rejects(
    billingService.generateMonthlyInvoice(invoiceInput),
    /Fee head "Annual Fee" has no income ledger mapping/,
    'Invoice generation rejects an unmapped included fee head.'
  );
  assert.strictEqual(serviceState.invoices.length, 0, 'Mapping validation creates no invoice.');
  assert.strictEqual(serviceState.ledgerEntries.length, 0, 'Mapping validation creates no student ledger entry.');
  assert.strictEqual(serviceState.vouchers.length, 0, 'Mapping validation creates no accounting voucher.');
  assert.strictEqual(serviceState.advanceMutations, 0, 'Mapping validation happens before advance allocation.');
  mockFeeHeads[1].incomeLedger = mappedLedger;

  resetServiceState();
  serviceState.failPosting = true;
  await assert.rejects(
    billingService.generateMonthlyInvoice(invoiceInput),
    /Simulated posting failure/,
    'A posting failure is returned to the caller.'
  );
  assert.strictEqual(serviceState.invoices.length, 0, 'Failed posting leaves no invoice.');
  assert.strictEqual(serviceState.ledgerEntries.length, 0, 'Failed posting leaves no student ledger entry.');
  assert.strictEqual(serviceState.vouchers.length, 0, 'Failed posting leaves no accounting voucher.');
  assert.strictEqual(serviceState.advanceMutations, 0, 'Failed posting rolls back advance allocations.');

  resetServiceState();
  const firstInvoice = await billingService.generateMonthlyInvoice(invoiceInput);
  const firstVoucherCount = serviceState.vouchers.length;
  const firstLedgerEntryCount = serviceState.ledgerEntries.length;
  assert.deepStrictEqual(serviceState.vouchers[0].entries, [
    { ledger: '4001', debit: 0, credit: 10000 },
    { ledger: '4002', debit: 0, credit: 5000 },
    { ledger: '4007', debit: 0, credit: 750 },
  ], 'Invoice generation passes all distinct mapped income lines to voucher posting.');
  const duplicateInvoice = await billingService.generateMonthlyInvoice(invoiceInput);
  assert.strictEqual(duplicateInvoice, firstInvoice, 'A repeated generation key returns the existing invoice.');
  const duplicateStatus = await billingService.generateMonthlyInvoice({
    ...invoiceInput,
    returnExistingStatus: true,
  });
  assert.strictEqual(duplicateStatus.invoice, firstInvoice, 'Callers can identify an existing invoice without changing the default service return.');
  assert.strictEqual(duplicateStatus.alreadyExists, true, 'Existing invoice status is explicit for billing-run summaries.');
  assert.strictEqual(serviceState.invoices.length, 1, 'Duplicate generation does not create another invoice.');
  assert.strictEqual(serviceState.vouchers.length, firstVoucherCount, 'Duplicate generation does not create another voucher.');
  assert.strictEqual(serviceState.ledgerEntries.length, firstLedgerEntryCount, 'Duplicate generation does not create another student ledger entry.');

  resetServiceState();
  mockFeeHeads[1].incomeLedger = null;
  const selectedOnlyInvoice = await billingService.generateMonthlyInvoice({
    ...invoiceInput,
    selectedFeeHeadIds: ['monthly'],
    feeHeadAmounts: { monthly: '9825.50' },
  });
  assert.deepStrictEqual(selectedOnlyInvoice.currentItems.map(item => item.feeCategory), ['monthly']);
  assert.strictEqual(selectedOnlyInvoice.currentItems[0].amount, 9825.5, 'The accountant-entered amount is saved in the invoice snapshot.');
  assert.strictEqual(selectedOnlyInvoice.currentTotal, 9825.5, 'The invoice total uses the overridden amount.');
  assert.deepStrictEqual(serviceState.vouchers[0].entries, [
    { ledger: '4001', debit: 0, credit: 9825.5 },
  ], 'The overridden amount posts to the selected fee head ledger; unselected unmapped heads do not affect accounting.');
  mockFeeHeads[1].incomeLedger = mappedLedger;

  resetServiceState();
  const monthlyLedger = mockFeeHeads[0].incomeLedger;
  mockFeeHeads[0].incomeLedger = null;
  await assert.rejects(
    billingService.generateMonthlyInvoice({
      ...invoiceInput,
      selectedFeeHeadIds: ['monthly'],
      feeHeadAmounts: { monthly: '12500' },
    }),
    /Fee head "Monthly Fee" has no income ledger mapping/,
    'The entered fee amount still follows strict fee-head ledger mapping validation.'
  );
  assert.strictEqual(serviceState.invoices.length, 0, 'Mapping failure after an amount override creates no invoice.');
  mockFeeHeads[0].incomeLedger = monthlyLedger;

  resetServiceState();
  await assert.rejects(
    billingService.generateMonthlyInvoice({
      ...invoiceInput,
      selectedFeeHeadIds: ['monthly'],
      feeHeadAmounts: { monthly: '' },
    }),
    /valid amount/,
    'An invalid accountant-entered amount is rejected before creating accounting records.'
  );
  assert.strictEqual(serviceState.invoices.length, 0, 'Invalid amounts create no invoice.');
  assert.strictEqual(serviceState.ledgerEntries.length, 0, 'Invalid amounts create no student ledger entry.');
  assert.strictEqual(serviceState.vouchers.length, 0, 'Invalid amounts create no accounting voucher.');

  resetServiceState();
  await assert.rejects(
    billingService.generateMonthlyInvoice({ ...invoiceInput, selectedFeeHeadIds: [] }),
    /Select at least one configured fee head/,
    'An explicit empty fee selection is rejected.'
  );
  assert.strictEqual(serviceState.invoices.length, 0, 'An empty selection creates no invoice.');
  assert.strictEqual(serviceState.ledgerEntries.length, 0, 'An empty selection creates no student ledger entry.');
  assert.strictEqual(serviceState.vouchers.length, 0, 'An empty selection creates no accounting voucher.');

  console.log('Fee-head mapping and invoice transaction tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
