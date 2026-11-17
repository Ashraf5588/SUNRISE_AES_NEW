const assert = require('assert');
const {
  buildFeeHeadOptions,
  createInvoiceGenerationKey,
  normalizeBillingMonth,
  selectInvoiceFeeItems,
} = require('../utils/billingFeeSelection');

const structures = [
  {
    _id: 'structure-monthly',
    amount: 1200,
    feeCategory: {
      _id: 'monthly',
      feehead: 'Monthly Fee',
      frequency: 'monthly',
      appliedmonth: [],
      incomeLedger: '4001',
    },
  },
  {
    _id: 'structure-annual',
    amount: 5000,
    feeCategory: {
      _id: 'annual',
      feehead: 'Annual Fee',
      frequency: 'yearly',
      appliedmonth: ['baisakh'],
      incomeLedger: '4002',
    },
  },
  {
    _id: 'structure-quarterly',
    amount: 900,
    feeCategory: {
      _id: 'quarterly',
      feehead: 'Quarterly Fee',
      frequency: 'quarterly',
      appliedmonth: ['baisakh', 'shrawan', 'mangsir', 'falgun'],
      incomeLedger: '4003',
    },
  },
];

const billDateAD = new Date('2026-04-14T00:00:00.000Z');
const admissionDateAD = new Date('2025-01-01T00:00:00.000Z');
const baisakhOptions = buildFeeHeadOptions(structures, {
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD,
});
assert.deepStrictEqual(
  baisakhOptions.filter(option => option.applicable).map(option => option.feeCategory),
  ['monthly', 'annual', 'quarterly'],
  'Monthly, configured annual, and scheduled quarterly fees are applicable in Baisakh.'
);
assert.deepStrictEqual(
  selectInvoiceFeeItems(baisakhOptions).map(item => item.feeCategory),
  ['monthly', 'annual', 'quarterly'],
  'All applicable fees are selected by default.'
);

const shrawanOptions = buildFeeHeadOptions(structures, {
  billMonthBS: 'Shrawan',
  billDateAD,
  admissionDateAD,
});
assert.deepStrictEqual(
  shrawanOptions.filter(option => option.applicable).map(option => option.feeCategory),
  ['monthly', 'quarterly'],
  'The annual fee is not applicable outside its configured month.'
);
const unscheduledAnnual = buildFeeHeadOptions([{
  amount: 3000,
  feeCategory: { _id: 'annual-unscheduled', feehead: 'Annual Fee', frequency: 'yearly', appliedmonth: [] },
}], {
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD: billDateAD,
});
assert.strictEqual(unscheduledAnnual[0].applicable, false, 'A yearly fee without a configured billing month is not auto-selected.');
assert.strictEqual(
  selectInvoiceFeeItems(unscheduledAnnual, ['annual-unscheduled']).length,
  1,
  'An accountant can explicitly select a configured fee head outside its default schedule for this invoice.'
);

const allFeeHeadRows = buildFeeHeadOptions(structures.slice(0, 1), {
  feeHeads: [
    ...structures.map(structure => structure.feeCategory),
    { _id: 'missing-structure', feehead: 'Sports Fee', frequency: 'yearly', appliedmonth: ['baisakh'] },
  ],
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD,
});
assert.strictEqual(allFeeHeadRows.length, 4, 'All configured fee heads are displayed even without a class fee structure.');
const missingStructure = allFeeHeadRows.find(option => option.feeCategory === 'missing-structure');
assert.strictEqual(missingStructure.scheduled, true);
assert.strictEqual(missingStructure.hasStructure, false);
assert.strictEqual(missingStructure.amount, null);
const manuallyPricedFee = selectInvoiceFeeItems(allFeeHeadRows, ['missing-structure'], {
  'missing-structure': '325.50',
})[0];
assert.strictEqual(manuallyPricedFee.amount, 325.5, 'An accountant can enter an amount for a fee without a class structure.');
assert.strictEqual(manuallyPricedFee.feeStructureId, null, 'A manually priced fee snapshots without a fee-structure reference.');
assert.throws(
  () => selectInvoiceFeeItems(allFeeHeadRows, ['missing-structure']),
  /Enter an amount for fee head "Sports Fee"/,
  'A selected fee without a configured amount requires an accountant-entered amount.'
);
assert.throws(
  () => selectInvoiceFeeItems(allFeeHeadRows, ['missing-structure'], { 'missing-structure': '0' }),
  /must be greater than zero/,
  'A zero amount is rejected for a selected fee.'
);
assert.throws(
  () => selectInvoiceFeeItems(allFeeHeadRows, ['missing-structure'], { 'missing-structure': '12.345' }),
  /no more than two decimal places/,
  'Amounts with unsupported precision are rejected.'
);
assert.throws(
  () => selectInvoiceFeeItems(allFeeHeadRows, ['missing-structure'], { 'missing-structure': '1000000000000' }),
  /supported range/,
  'Amounts above the accounting-supported range are rejected.'
);
assert.strictEqual(normalizeBillingMonth('Asar'), 'ashad');
assert.strictEqual(normalizeBillingMonth('Baishakh'), 'baisakh');
assert.strictEqual(normalizeBillingMonth('Baishak'), 'baisakh');
assert.strictEqual(normalizeBillingMonth('Ashadh'), 'ashad');
assert.strictEqual(
  createInvoiceGenerationKey('student-1', 'session-1', '2083-07-28', 'Asar'),
  'student-1:session-1:2083:ashad',
  'Invoice idempotency keys normalize BS month aliases and are stable within the same academic year.'
);

const routeTransportOptions = buildFeeHeadOptions([{
  _id: 'class-transport-structure',
  amount: 700,
  feeCategory: 'transport',
}], {
  feeHeads: [
    { _id: 'transport', feehead: 'Transport Fee', group: 'Transport', frequency: 'monthly', appliedmonth: [] },
  ],
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD,
  transport: { fee: 1850, routeName: 'North Route' },
});
assert.strictEqual(routeTransportOptions[0].applicable, true, 'A saved bus route makes its transport charge applicable.');
assert.strictEqual(routeTransportOptions[0].amount, 1850, 'Transport is priced from the selected route, not a class fee structure.');
assert.strictEqual(routeTransportOptions[0].feeStructureId, '', 'Route-priced transport does not point to a class-fee snapshot.');
assert.strictEqual(routeTransportOptions[0].transportRouteName, 'North Route');
assert.strictEqual(
  selectInvoiceFeeItems(routeTransportOptions)[0].amount,
  1850,
  'Route-based transport is included in bulk billing by default.'
);
assert.strictEqual(selectInvoiceFeeItems(routeTransportOptions)[0].routeSpecific, false, 'Route snapshots keep route metadata without treating the item as route-specific in the invoice snapshot.');
assert.strictEqual(
  selectInvoiceFeeItems(routeTransportOptions, ['transport'], undefined, {
    skipUnavailableTransportFeeHeadIds: ['transport'],
  })[0].amount,
  1850,
  'Class billing still uses the saved route fare for students who have a valid route.'
);
assert.strictEqual(
  selectInvoiceFeeItems(routeTransportOptions, ['transport'], undefined, { skipUnavailableTransportFeeHeadIds: null })[0].amount,
  1850,
  'Null transport skip arrays are normalized instead of crashing during validation.'
);
assert.strictEqual(selectInvoiceFeeItems(routeTransportOptions)[0].feeStructureId, null);
const busFeeOption = buildFeeHeadOptions([], {
  feeHeads: [{ _id: 'bus', feehead: 'School Bus Fee', group: 'General', frequency: 'monthly' }],
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD,
  transport: { fee: 1850, routeName: 'North Route' },
})[0];
assert.strictEqual(busFeeOption.applicable, true, 'School-bus fee heads also use the saved route fare.');
const noBusRouteOptions = buildFeeHeadOptions([], {
  feeHeads: routeTransportOptions.map(option => ({
    _id: option.feeCategory,
    feehead: option.feeHeadName,
    group: 'Transport',
    frequency: 'monthly',
  })),
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD,
});
assert.strictEqual(noBusRouteOptions[0].applicable, false, 'Transport is not automatically billed without a saved bus route.');
const classRoutePreview = buildFeeHeadOptions([{
  _id: 'class-transport-structure',
  amount: 700,
  feeCategory: 'transport',
}], {
  feeHeads: [
    { _id: 'transport', feehead: 'Transport Fee', group: 'Transport', frequency: 'monthly', appliedmonth: [] },
  ],
  billMonthBS: 'Baisakh',
  billDateAD,
  admissionDateAD,
  transport: { routeSpecific: true, routeName: 'Saved student route (individual fare)' },
})[0];
assert.strictEqual(classRoutePreview.applicable, true, 'Class preview can select route-priced transport for students using the bus.');
assert.strictEqual(classRoutePreview.amount, null, 'Class preview does not replace each student route fare with a class-wide amount.');
assert.strictEqual(classRoutePreview.routeSpecific, true);
assert.deepStrictEqual(
  selectInvoiceFeeItems([...baisakhOptions, ...noBusRouteOptions], ['monthly', 'transport'], undefined, {
    skipUnavailableTransportFeeHeadIds: ['transport'],
  }).map(item => item.feeCategory),
  ['monthly'],
  'Class billing skips route transport for students without a saved bus route while retaining other selected fees.'
);
assert.strictEqual(
  selectInvoiceFeeItems(noBusRouteOptions, ['transport'], { transport: '500' }, {
    skipUnavailableTransportFeeHeadIds: [],
  })[0].amount,
  500,
  'A deliberately selected class-wide transport amount remains usable when no route-based fare applies.'
);

const selectedOnly = selectInvoiceFeeItems(baisakhOptions, ['monthly', 'quarterly']);
assert.deepStrictEqual(selectedOnly.map(item => item.feeCategory), ['monthly', 'quarterly']);
assert.deepStrictEqual(selectedOnly.map(item => item.amount), [1200, 900]);
assert.deepStrictEqual(selectedOnly.map(item => item.feeHeadName), ['Monthly Fee', 'Quarterly Fee']);
assert.deepStrictEqual(selectedOnly.map(item => item.frequency), ['monthly', 'quarterly']);
assert.deepStrictEqual(selectedOnly.map(item => item.feeStructureId), ['structure-monthly', 'structure-quarterly']);
assert.strictEqual(selectedOnly.reduce((sum, item) => sum + item.amount, 0), 2100);
const changedAmount = selectInvoiceFeeItems(baisakhOptions, ['monthly'], { monthly: '1350.25' })[0];
assert.strictEqual(changedAmount.amount, 1350.25, 'An accountant can override the fee-structure default for this invoice.');
assert.strictEqual(structures[0].amount, 1200, 'Changing an invoice amount does not modify the fee structure.');
assert.throws(
  () => selectInvoiceFeeItems(baisakhOptions, []),
  /Select at least one configured fee head/,
  'An explicitly empty selection is not treated as the automatic default.'
);
assert.strictEqual(
  selectInvoiceFeeItems(shrawanOptions, ['annual'])[0].feeCategory,
  'annual',
  'An accountant can opt in an out-of-schedule fee that has a configured class amount.'
);

console.log('Billing fee selection schedule and snapshot tests passed.');
