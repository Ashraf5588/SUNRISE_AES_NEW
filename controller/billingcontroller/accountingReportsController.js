const mongoose = require('mongoose');
const bs = require('../../utils/bikramSambat');
const AccountGroup = require('../../model/billingschema/AccountGroup');
const AccountLedger = require('../../model/billingschema/AccountLedger');
const School = require('../../model/billingschema/School');
const { JournalVoucher } = require('../../model/billingschema/JournalVoucher');
const { classifyCashBankLedger } = require('../../utils/cashBank');
const {
  formatFiscalYearBS,
  formatVoucherType,
  getVoucherDisplayStatus,
} = require('../../utils/accounting');
const {
  DAY_MS,
  dateOnly,
  resolveAsOf,
  resolvePeriod,
} = require('../../utils/accountingReportDates');
const {
  calculateBalanceSheet,
  calculateCashFlow,
  calculateCashLedgerBalanceMinor,
  calculateOpeningCashMinor,
  calculateProfitAndLoss,
  calculateTrialBalance,
  createExcelXml,
  createReportPdf,
  openingBalanceDateBS,
  roundMinor,
} = require('../../utils/accountingReports');

const REPORTS = {
  'trial-balance': { title: 'Trial Balance', description: 'Review opening, period, and closing debit and credit balances.' },
  'general-ledger': { title: 'General Ledger', description: 'Inspect posted journal activity and running balances by account.' },
  'voucher-register': { title: 'Voucher Register', description: 'Search vouchers, posting states, approval history, and journal lines.' },
  'balance-sheet': { title: 'Balance Sheet', description: 'Review assets, liabilities, equity, and current-period result.' },
  'profit-loss': { title: 'Profit & Loss Statement', description: 'Review income, expenses, and the result for a selected period.' },
  'cash-flow': { title: 'Cash Flow Statement', description: 'Reconcile posted cash and bank movements for a selected period.' },
};
const VOUCHER_TYPES = ['JOURNAL', 'RECEIPT', 'PAYMENT', 'CONTRA', 'FEE_INVOICE', 'FEE_RECEIPT', 'REVERSAL', 'OPENING_BALANCE', 'CLOSING'];
const VOUCHER_STATUSES = ['DRAFT', 'PENDING_ACCOUNTANT_REVIEW', 'PENDING_ADMIN_APPROVAL', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'];
const PAGE_SIZE = 50;
const LEDGER_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 20000;

const formatMoney = value => `Rs. ${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function getFiscalYears(school, selectedYear) {
  const years = new Set([
    String(school.currentFiscalYearBS || '').trim(),
    ...(school.closedFiscalYearsBS || []).map(String),
  ].filter(year => /^\d{4}\/\d{3}$/.test(year)));
  if (selectedYear && selectedYear !== 'ALL' && /^\d{4}\/\d{3}$/.test(selectedYear)) years.add(selectedYear);
  const earliest = await JournalVoucher.findOne({ status: 'POSTED' })
    .sort({ dateAD: 1 })
    .select('dateBS')
    .lean();
  const earliestYear = Number(String(earliest?.dateBS || '').slice(0, 4));
  const currentMatch = /^(\d{4})\/\d{3}$/.exec(String(school.currentFiscalYearBS || ''));
  if (earliestYear && currentMatch) {
    const startYear = earliestYear - (Number(String(earliest.dateBS).slice(5, 7)) < 4 ? 1 : 0);
    const endYear = Number(currentMatch[1]);
    if (endYear >= startYear && endYear - startYear <= 40) {
      for (let year = startYear; year <= endYear; year += 1) {
        years.add(formatFiscalYearBS(`${year}-04-01`));
      }
    }
  }
  return [...years].filter(Boolean).sort((a, b) => b.localeCompare(a));
}

function dateMatch(period) {
  return { $gte: period.from, $lt: period.toExclusive };
}

async function getTrialBalanceAggregates(period) {
  return JournalVoucher.aggregate([
    { $match: { status: 'POSTED', dateAD: { $lt: period.toExclusive } } },
    { $unwind: '$entries' },
    { $group: {
      _id: '$entries.ledger',
      openingDebit: { $sum: { $cond: [{ $lt: ['$dateAD', period.from] }, '$entries.debit', 0] } },
      openingCredit: { $sum: { $cond: [{ $lt: ['$dateAD', period.from] }, '$entries.credit', 0] } },
      periodDebit: { $sum: { $cond: [{ $gte: ['$dateAD', period.from] }, '$entries.debit', 0] } },
      periodCredit: { $sum: { $cond: [{ $gte: ['$dateAD', period.from] }, '$entries.credit', 0] } },
    } },
  ]).allowDiskUse(true);
}

async function getLedgerAggregates(period, { excludeClosing = false } = {}) {
  const match = { status: 'POSTED', dateAD: dateMatch(period) };
  if (excludeClosing) match.voucherType = { $ne: 'CLOSING' };
  return JournalVoucher.aggregate([
    { $match: match },
    { $unwind: '$entries' },
    { $group: {
      _id: '$entries.ledger',
      debit: { $sum: '$entries.debit' },
      credit: { $sum: '$entries.credit' },
    } },
  ]).allowDiskUse(true);
}

async function getBalancesAsOf(toExclusive, { excludeClosingPeriod } = {}) {
  const match = { status: 'POSTED', dateAD: { $lt: toExclusive } };
  if (excludeClosingPeriod) {
    match.$or = [
      { voucherType: { $ne: 'CLOSING' } },
      { dateAD: { $lt: excludeClosingPeriod.from } },
      { dateAD: { $gte: excludeClosingPeriod.toExclusive } },
    ];
  }
  return JournalVoucher.aggregate([
    { $match: match },
    { $unwind: '$entries' },
    { $group: {
      _id: '$entries.ledger',
      debit: { $sum: '$entries.debit' },
      credit: { $sum: '$entries.credit' },
    } },
  ]).allowDiskUse(true);
}

async function getLedgerReport(ledgerId, period, page, exportMode) {
  if (!mongoose.isValidObjectId(ledgerId)) throw new Error('Choose a valid ledger account.');
  const ledger = await AccountLedger.findById(ledgerId).populate('group', 'name code').lean();
  if (!ledger) throw new Error('The selected ledger account was not found.');
  const pageSize = exportMode ? MAX_EXPORT_ROWS + 1 : LEDGER_PAGE_SIZE;
  const skip = exportMode ? 0 : (page - 1) * pageSize;
  const pipeline = [
    { $match: { status: 'POSTED', dateAD: { $lt: period.toExclusive }, 'entries.ledger': ledger._id } },
    { $unwind: '$entries' },
    { $match: { 'entries.ledger': ledger._id } },
    { $facet: {
      opening: [
        { $match: { dateAD: { $lt: period.from } } },
        { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
      ],
      periodTotals: [
        { $match: { dateAD: { $gte: period.from } } },
        { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' }, count: { $sum: 1 } } },
      ],
      priorPage: skip > 0 ? [
        { $match: { dateAD: { $gte: period.from } } },
        { $sort: { dateAD: 1, createdAt: 1, voucherNumber: 1 } },
        { $limit: skip },
        { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
      ] : [
        { $match: { _id: { $exists: false } } },
        { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
      ],
      rows: [
        { $match: { dateAD: { $gte: period.from } } },
        { $sort: { dateAD: 1, createdAt: 1, voucherNumber: 1 } },
        { $skip: skip },
        { $limit: pageSize },
        { $project: {
          voucherId: '$_id',
          voucherNumber: 1,
          voucherType: 1,
          status: 1,
          dateAD: 1,
          dateBS: 1,
          narration: 1,
          debit: '$entries.debit',
          credit: '$entries.credit',
          referenceNumber: { $ifNull: ['$transactionDetails.referenceNumber', ''] },
          isReversed: { $ne: ['$reversedBy', null] },
        } },
      ],
    } },
  ];
  const [result] = await JournalVoucher.aggregate(pipeline).allowDiskUse(true);
  const data = result || { opening: [], periodTotals: [], priorPage: [], rows: [] };
  const openingMinor = roundMinor(data.opening[0]?.debit) - roundMinor(data.opening[0]?.credit);
  const periodDebit = roundMinor(data.periodTotals[0]?.debit);
  const periodCredit = roundMinor(data.periodTotals[0]?.credit);
  const priorPageMinor = roundMinor(data.priorPage[0]?.debit) - roundMinor(data.priorPage[0]?.credit);
  let runningMinor = openingMinor + priorPageMinor;
  const rows = data.rows.map(row => {
    runningMinor += roundMinor(row.debit) - roundMinor(row.credit);
    return {
      ...row,
      displayStatus: getVoucherDisplayStatus({
        status: row.status,
        reversedBy: row.isReversed,
      }),
      runningBalance: runningMinor / 100,
      balanceSide: runningMinor < 0 ? 'CR' : 'DR',
    };
  });
  const count = Number(data.periodTotals[0]?.count || 0);
  if (exportMode && count > MAX_EXPORT_ROWS) throw new Error(`This ledger has more than ${MAX_EXPORT_ROWS.toLocaleString()} entries. Narrow the date range before exporting.`);
  return {
    ledger,
    rows,
    page,
    pageSize,
    count,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    openingBalance: openingMinor / 100,
    periodDebit: periodDebit / 100,
    periodCredit: periodCredit / 100,
    closingBalance: (openingMinor + periodDebit - periodCredit) / 100,
  };
}

async function getVoucherRegister(query, period, exportMode) {
  const filter = { dateAD: dateMatch(period) };
  const status = String(query.status || '').toUpperCase();
  const type = String(query.type || '').toUpperCase();
  const account = String(query.account || '').trim();
  const search = String(query.q || '').trim().slice(0, 100);
  const createdBy = String(query.createdBy || '').trim().slice(0, 100);
  if (status === 'REVERSED') {
    filter.status = 'POSTED';
    filter.reversedBy = { $ne: null };
  } else if (status && VOUCHER_STATUSES.includes(status)) {
    filter.status = status;
    if (status === 'POSTED') filter.reversedBy = null;
  }
  if (type && VOUCHER_TYPES.includes(type)) filter.voucherType = type;
  if (account) {
    if (!mongoose.isValidObjectId(account)) throw new Error('Choose a valid ledger account.');
    filter['entries.ledger'] = new mongoose.Types.ObjectId(account);
  }
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ voucherNumber: expression }, { narration: expression }, { createdBy: expression }];
  }
  if (createdBy) filter.createdBy = new RegExp(escapeRegex(createdBy), 'i');

  const count = await JournalVoucher.countDocuments(filter);
  const pageSize = exportMode ? MAX_EXPORT_ROWS + 1 : PAGE_SIZE;
  if (exportMode && count > MAX_EXPORT_ROWS) {
    throw new Error(`This register has more than ${MAX_EXPORT_ROWS.toLocaleString()} vouchers. Narrow the filters before exporting.`);
  }
  const page = exportMode ? 1 : Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const vouchers = await JournalVoucher.find(filter)
    .populate('entries.ledger', 'code name nature ledgerType group')
    .populate('submittedBy', 'teacherName username')
    .populate('approvedBy', 'teacherName username')
    .populate('reviewedBy', 'teacherName username')
    .populate('postedBy', 'teacherName username')
    .populate('reversedBy', 'voucherNumber')
    .populate('reversalOf', 'voucherNumber')
    .sort({ dateAD: -1, createdAt: -1, voucherNumber: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  return {
    vouchers: vouchers.map(voucher => ({
      ...voucher,
      displayStatus: getVoucherDisplayStatus(voucher),
    })),
    count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    filters: { status, type, account, q: search, createdBy },
  };
}

async function getCashFlowReport(period, ledgers) {
  const cashLedgers = ledgers.filter(ledger => ledger.isActive !== false && classifyCashBankLedger(ledger));
  const cashIds = cashLedgers.map(ledger => ledger._id);
  const closingBalances = await getBalancesAsOf(period.toExclusive);
  const closing = calculateCashLedgerBalanceMinor(closingBalances, cashLedgers) / 100;
  if (!cashIds.length) {
    return calculateCashFlow([], [], 0, closing, { openingBalanceDate: period.fromBS });
  }

  const query = {
    status: 'POSTED',
    dateAD: dateMatch(period),
    'entries.ledger': { $in: cashIds },
  };
  const count = await JournalVoucher.countDocuments(query);
  if (count > MAX_EXPORT_ROWS) throw new Error(`This range contains more than ${MAX_EXPORT_ROWS.toLocaleString()} cash and bank vouchers. Narrow the date range.`);
  const vouchers = await JournalVoucher.find(query)
    .populate('entries.ledger', 'code name nature ledgerType group')
    .sort({ dateAD: 1, createdAt: 1 })
    .lean();
  const openingVouchers = vouchers
    .map(voucher => {
      const dateBS = openingBalanceDateBS(voucher);
      if (!dateBS) return null;
      const dateAD = String(bs.BSToAD(dateBS) || '');
      const date = /^\d{4}-\d{2}-\d{2}$/.test(dateAD)
        ? new Date(`${dateAD}T00:00:00.000Z`)
        : null;
      if (!date || Number.isNaN(date.getTime())) {
        throw new Error(`Opening-balance voucher ${voucher.voucherNumber} has an invalid BS balance date.`);
      }
      return { voucher, dateBS, date };
    })
    .filter(Boolean);
  const baseline = openingVouchers
    .filter(item => item.date < period.toExclusive)
    .sort((a, b) => b.date - a.date)[0];
  const activityFrom = baseline && baseline.date >= period.from
    ? new Date(Math.max(period.from.getTime(), baseline.date.getTime() + DAY_MS))
    : period.from;
  const openingBalances = await getBalancesAsOf(activityFrom);
  const openingMinor = calculateOpeningCashMinor(openingBalances, openingVouchers, cashLedgers, activityFrom);
  return calculateCashFlow(vouchers, cashLedgers, openingMinor / 100, closing, {
    activityFrom,
    openingBalanceDate: baseline?.dateBS || period.fromBS,
  });
}

function asLedgerName(ledger) {
  return ledger ? `${ledger.code || ''} ${ledger.name || ''}`.trim() : '';
}

function exportData(type, data) {
  if (type === 'trial-balance') {
    const columns = ['Code', 'Account', 'Group', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'];
    const rows = data.rows.map(row => [
      row.ledger.code, row.ledger.name, row.ledger.group?.name || '',
      row.openingDebit, row.openingCredit, row.periodDebit, row.periodCredit, row.closingDebit, row.closingCredit,
    ]);
    rows.push(['', 'TOTAL', '', data.totals.openingDebit, data.totals.openingCredit, data.totals.periodDebit, data.totals.periodCredit, data.totals.closingDebit, data.totals.closingCredit]);
    return { columns, rows };
  }
  if (type === 'general-ledger') {
    const columns = ['Date BS', 'Date AD', 'Voucher', 'Type', 'Narration', 'Reference', 'Debit', 'Credit', 'Running balance', 'Side', 'Status'];
    const rows = [
      ['', '', '', '', 'Opening balance', '', '', '', data.openingBalance, data.openingBalance < 0 ? 'CR' : 'DR', ''],
      ...data.rows.map(row => [
        row.dateBS, dateOnly(new Date(row.dateAD)), row.voucherNumber, row.voucherType,
        row.narration, row.referenceNumber, Number(row.debit), Number(row.credit),
        row.runningBalance, row.balanceSide, row.displayStatus,
      ]),
      ['', '', '', '', 'Period total', '', data.periodDebit, data.periodCredit, data.closingBalance, data.closingBalance < 0 ? 'CR' : 'DR', ''],
    ];
    return { columns, rows };
  }
  if (type === 'voucher-register') {
    const columns = ['Date BS', 'Date AD', 'Voucher', 'Type', 'Narration', 'Debit', 'Credit', 'Created by', 'Approved by', 'Status', 'Journal lines'];
    return {
      columns,
      rows: data.vouchers.map(voucher => [
        voucher.dateBS,
        dateOnly(new Date(voucher.dateAD)),
        voucher.voucherNumber,
        voucher.voucherType,
        voucher.narration,
        Number(voucher.totalDebit),
        Number(voucher.totalCredit),
        voucher.createdBy || voucher.submittedBy?.teacherName || voucher.submittedBy?.username || '',
        voucher.approvedBy?.teacherName || voucher.approvedBy?.username || '',
        voucher.displayStatus,
        (voucher.entries || []).map(line => `${asLedgerName(line.ledger)} Dr ${Number(line.debit || 0).toFixed(2)} Cr ${Number(line.credit || 0).toFixed(2)}`).join(' | '),
      ]),
    };
  }
  if (type === 'balance-sheet') {
    const rows = [];
    for (const section of data.sections) {
      rows.push([section.nature, '', '', '']);
      for (const group of section.groups) {
        rows.push(['', group.name, '', group.total]);
        for (const item of group.ledgers) rows.push(['', '', asLedgerName(item.ledger), item.amount]);
      }
      if (section.nature === 'EQUITY') rows.push(['', 'Current-period profit / loss', '', section.currentProfit]);
      rows.push(['', `Total ${section.nature.toLowerCase()}`, '', section.total]);
    }
    rows.push(['', 'Assets less liabilities and equity', '', data.difference]);
    return { columns: ['Section', 'Account group', 'Account', 'Balance'], rows };
  }
  if (type === 'profit-loss') {
    const rows = [];
    for (const nature of ['INCOME', 'EXPENSE']) {
      rows.push([nature, '', '', '']);
      const groups = new Map();
      for (const item of data.rows.filter(row => row.ledger.nature === nature)) {
        const key = String(item.ledger.group?._id || '');
        if (!groups.has(key)) groups.set(key, { name: item.ledger.group?.name || 'Unassigned group', rows: [], total: 0, previous: 0 });
        groups.get(key).rows.push(item);
        groups.get(key).total += item.amount;
        groups.get(key).previous += item.previousAmount || 0;
      }
      for (const group of groups.values()) {
        rows.push(['', group.name, '', group.total, group.previous, group.total - group.previous]);
        for (const item of group.rows) rows.push(['', '', asLedgerName(item.ledger), item.amount, item.previousAmount || 0, item.amount - (item.previousAmount || 0)]);
      }
      const currentTotal = nature === 'INCOME' ? data.totalIncome : data.totalExpense;
      const priorTotal = nature === 'INCOME' ? data.comparison.totalIncome : data.comparison.totalExpense;
      rows.push(['', `Total ${nature.toLowerCase()}`, '', currentTotal, priorTotal, currentTotal - priorTotal]);
    }
    rows.push(['', 'Net profit / (loss)', '', data.netProfit, data.comparison.netProfit, data.netProfit - data.comparison.netProfit]);
    return { columns: ['Section', 'Account group', 'Account', 'Current period', 'Previous period', 'Change'], rows };
  }
  return {
    columns: ['Cash flow item', 'Amount', 'Classification'],
    rows: [
      ['Opening cash and bank balance', data.openingCash, 'Balance'],
      ['Operating activities', data.operating, 'Classified'],
      ['Investing activities', data.investing, 'Classified'],
      ['Financing activities', data.financing, 'Classified'],
      ['Unclassified cash movements', data.unclassified, 'Review required'],
      ['Net increase / (decrease)', data.netIncrease, 'Posted cash movement'],
      ['Closing cash and bank balance', data.closingCash, 'Balance'],
      ['Reconciliation difference', data.reconciliationDifference, 'Must be zero'],
    ],
  };
}

function reportFilterOptions(query, fiscalYears, ledgers, groups, type) {
  return {
    fiscalYears,
    ledgers,
    groups,
    type: String(query.type || ''),
    status: String(query.status || ''),
    account: String(query.account || ''),
    group: String(query.group || ''),
    q: String(query.q || ''),
    createdBy: String(query.createdBy || ''),
    includeZero: query.includeZero === '1' || query.includeZero === 'true',
    page: Math.max(1, Number.parseInt(query.page, 10) || 1),
    reportType: type,
  };
}

async function buildReport(type, query, { exportMode = false } = {}) {
  if (!REPORTS[type]) throw new Error('Choose a valid accounting report.');
  const school = await School.findOne().lean();
  if (!school) throw new Error('Configure school accounting settings before generating reports.');
  const selectedFiscalYear = query.fiscalYear === undefined
    ? school.currentFiscalYearBS
    : String(query.fiscalYear || '');
  const [fiscalYears, ledgers, groups] = await Promise.all([
    getFiscalYears(school, selectedFiscalYear),
    AccountLedger.find().populate('group', 'name code nature parentGroup').sort({ code: 1 }).lean(),
    AccountGroup.find().sort({ code: 1 }).lean(),
  ]);
  const filters = reportFilterOptions(query, fiscalYears, ledgers, groups, type);
  filters.fiscalYear = selectedFiscalYear === 'ALL'
    ? 'ALL'
    : selectedFiscalYear || school.currentFiscalYearBS;
  let period;
  let data;
  let selectedLedger = null;

  if (type === 'balance-sheet') {
    const asOf = resolveAsOf(query, school);
    period = {
      fiscalYear: asOf.fiscalYear,
      from: asOf.earningsFrom,
      toExclusive: asOf.asOfExclusive,
      fromText: dateOnly(asOf.earningsFrom),
      toText: asOf.asOfText,
      asOfText: asOf.asOfText,
      asOfBS: asOf.asOfBS,
      label: asOf.label,
    };
    const [balances, currentPeriod] = await Promise.all([
      getBalancesAsOf(asOf.asOfExclusive, {
        excludeClosingPeriod: {
          from: asOf.earningsFrom,
          toExclusive: asOf.earningsToExclusive,
        },
      }),
      getLedgerAggregates({ from: asOf.earningsFrom, toExclusive: asOf.asOfExclusive }),
    ]);
    const currentProfit = calculateProfitAndLoss(ledgers, currentPeriod).netProfit;
    data = calculateBalanceSheet(ledgers, balances, roundMinor(currentProfit));
  } else {
    period = resolvePeriod(query, school);
    if (type === 'trial-balance') {
      const aggregates = await getTrialBalanceAggregates(period);
      if (filters.group && !mongoose.isValidObjectId(filters.group)) throw new Error('Choose a valid account group.');
      data = calculateTrialBalance(ledgers, aggregates, {
        includeZero: filters.includeZero,
        groupId: filters.group,
      });
    } else if (type === 'general-ledger') {
      if (filters.account) {
        const page = exportMode ? 1 : filters.page;
        data = await getLedgerReport(filters.account, period, page, exportMode);
        selectedLedger = data.ledger;
      } else {
        data = {
          rows: [],
          page: 1,
          pageSize: LEDGER_PAGE_SIZE,
          count: 0,
          totalPages: 1,
          openingBalance: 0,
          periodDebit: 0,
          periodCredit: 0,
          closingBalance: 0,
        };
      }
    } else if (type === 'voucher-register') {
      data = await getVoucherRegister(query, period, exportMode);
      filters.page = data.page;
      filters.status = data.filters.status;
      filters.type = data.filters.type;
      filters.account = data.filters.account;
      filters.q = data.filters.q;
      filters.createdBy = data.filters.createdBy;
    } else if (type === 'profit-loss') {
      const aggregates = await getLedgerAggregates(period, { excludeClosing: true });
      data = calculateProfitAndLoss(ledgers, aggregates);
      const previousPeriod = {
        from: new Date(period.from.getTime() - period.days * DAY_MS),
        toExclusive: period.from,
      };
      const previousAggregates = await getLedgerAggregates(previousPeriod, { excludeClosing: true });
      data.comparison = calculateProfitAndLoss(ledgers, previousAggregates);
      const previousByLedger = new Map(data.comparison.rows.map(row => [String(row.ledger._id), row.amount]));
      const currentByLedger = new Map(data.rows.map(row => [String(row.ledger._id), row]));
      const reportLedgers = new Map([
        ...data.rows.map(row => [String(row.ledger._id), row.ledger]),
        ...data.comparison.rows.map(row => [String(row.ledger._id), row.ledger]),
      ]);
      data.rows = [...reportLedgers].map(([ledgerId, ledger]) => {
        const current = currentByLedger.get(ledgerId);
        const currentAmount = current?.amount || 0;
        const previousAmount = previousByLedger.get(ledgerId) || 0;
        return {
          ledger,
          amount: currentAmount,
          amountMinor: roundMinor(currentAmount),
          previousAmount,
        };
      }).filter(row => row.amount || row.previousAmount)
        .sort((a, b) => String(a.ledger.code).localeCompare(String(b.ledger.code), undefined, { numeric: true }));
      data.comparisonLabel = `${String(bs.ADToBS(previousPeriod.from) || '').slice(0, 10)} BS – ${String(bs.ADToBS(new Date(previousPeriod.toExclusive - DAY_MS)) || '').slice(0, 10)} BS`;
    } else if (type === 'cash-flow') {
      data = await getCashFlowReport(period, ledgers);
    }
  }

  const exportRows = exportData(type, data);
  const queryString = new URLSearchParams(Object.entries({
    fiscalYear: query.fiscalYear === undefined ? school.currentFiscalYearBS : query.fiscalYear,
    from: query.from || '',
    to: query.to || '',
    asOf: query.asOf || '',
    ledger: query.ledger || '',
    account: query.account || '',
    group: query.group || '',
    includeZero: filters.includeZero ? '1' : '',
    type: filters.type || '',
    status: filters.status || '',
    q: filters.q || '',
    createdBy: filters.createdBy || '',
  }).filter(([, value]) => value !== null && value !== undefined && String(value) !== '')).toString();
  return {
    school,
    reports: Object.entries(REPORTS).map(([key, value]) => ({ key, ...value })),
    report: REPORTS[type],
    reportType: type,
    period,
    data,
    selectedLedger,
    filters,
    exportRows,
    exportQuery: queryString,
    generatedAt: new Date(),
    formatMoney,
    formatVoucherType,
  };
}

exports.reportHome = async (req, res) => {
  try {
    const school = await School.findOne().lean();
    return res.render('./billingfirst/accountingReports', {
      title: 'Accounting Reports',
      reportHome: true,
      error: '',
      reports: Object.entries(REPORTS).map(([key, value]) => ({ key, ...value })),
      school,
      currentRole: req.user.role,
      currentPath: '/accounting/reports',
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Unable to load accounting reports:', error);
    return res.status(500).send('Unable to load accounting reports.');
  }
};

exports.showReport = async (req, res) => {
  try {
    const data = await buildReport(req.params.reportType, req.query);
    return res.render('./billingfirst/accountingReports', {
      title: data.report.title,
      reportHome: false,
      ...data,
      error: '',
      currentRole: req.user.role,
      currentPath: req.path,
    });
  } catch (error) {
    console.error('Unable to generate accounting report:', error);
    const status = error.message.startsWith('Choose') || error.message.startsWith('The selected')
      || error.message.startsWith('The balance') || error.message.startsWith('The BS calendar')
      ? 400
      : 500;
    return res.status(status).render('./billingfirst/accountingReports', {
      title: REPORTS[req.params.reportType]?.title || 'Accounting Reports',
      reportHome: false,
      report: REPORTS[req.params.reportType],
      reportType: req.params.reportType,
      error: error.message,
      school: await School.findOne().lean(),
      currentRole: req.user.role,
      currentPath: req.path,
      generatedAt: new Date(),
      reports: Object.entries(REPORTS).map(([key, value]) => ({ key, ...value })),
    });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const format = String(req.params.format || '').toLowerCase();
    if (!['pdf', 'xls'].includes(format)) return res.status(404).send('Unsupported report export format.');
    const data = await buildReport(req.params.reportType, req.query, { exportMode: true });
    const { columns, rows } = data.exportRows;
    const filename = `${req.params.reportType}-${dateOnly(new Date())}.${format}`;
    if (format === 'xls') {
      const workbook = createExcelXml({
        title: data.report.title,
        schoolName: data.school?.name || 'School',
        periodLabel: data.period.label,
        columns,
        rows,
      });
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(`\uFEFF${workbook}`);
    }
    const pdf = await createReportPdf({
      title: data.report.title,
      schoolName: data.school?.name || 'School',
      periodLabel: data.period.label,
      columns,
      rows,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (error) {
    console.error('Unable to export accounting report:', error);
    const status = error.message.startsWith('Choose') || error.message.includes('Narrow the')
      ? 400
      : 500;
    return res.status(status).send(error.message || 'Unable to export this accounting report.');
  }
};

exports.showVoucher = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Voucher not found.');
  try {
    const voucher = await JournalVoucher.findById(req.params.id)
      .populate('entries.ledger', 'code name nature ledgerType group')
      .populate('submittedBy', 'teacherName username')
      .populate('reviewedBy', 'teacherName username')
      .populate('approvedBy', 'teacherName username')
      .populate('postedBy', 'teacherName username')
      .populate('rejectedBy', 'teacherName username')
      .populate('reversedBy', 'voucherNumber')
      .populate('reversalOf', 'voucherNumber')
      .populate('auditEvents.actor', 'teacherName username')
      .lean();
    if (!voucher) return res.status(404).send('Voucher not found.');
    return res.render('./billingfirst/accountingReportVoucher', {
      title: `Voucher ${voucher.voucherNumber}`,
      voucher: { ...voucher, displayStatus: getVoucherDisplayStatus(voucher) },
      school: await School.findOne().lean(),
      currentRole: req.user.role,
      currentPath: '/accounting/reports/voucher-register',
      formatMoney,
      formatVoucherType,
    });
  } catch (error) {
    console.error('Unable to load accounting report voucher:', error);
    return res.status(500).send('Unable to load voucher details.');
  }
};
