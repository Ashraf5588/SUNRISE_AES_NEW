const crypto = require('crypto');
const mongoose = require('mongoose');
const bs = require('../../utils/bikramSambat');
const AccountLedger = require('../../model/billingschema/AccountLedger');
const School = require('../../model/billingschema/School');
const Invoice = require('../../model/billingschema/Invoice');
const Payment = require('../../model/billingschema/Payment');
const LedgerEntry = require('../../model/billingschema/LedgerEntry');
const { JournalVoucher } = require('../../model/billingschema/JournalVoucher');
const BankReconciliation = require('../../model/billingschema/BankReconciliation');
const {
  calculateLedgerBalances,
  classifyCashBankLedger,
  getNormalBalanceLabel,
} = require('../../utils/cashBank');
const { toMinorUnits } = require('../../utils/journalVoucher');
const {
  formatFiscalYearBS,
  formatVoucherType,
  getVoucherDisplayStatus,
} = require('../../utils/accounting');
const { hashStatement, parseBankStatementCsv } = require('../../utils/bankReconciliation');
const {
  changeVoucherApproval,
  closeFiscalYear,
  createCashBankVoucher,
  loadActiveLedger,
  reversePostedVoucher,
  withAccountingTransaction,
} = require('../../services/accountingService');

const DAY_MS = 24 * 60 * 60 * 1000;

const kathmanduDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const parseDateInput = value => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
};

const dateOnly = date => date.toISOString().slice(0, 10);

function getDateFilter(query, school) {
  const range = String(query.range || (query.from && query.to ? 'custom' : 'month'));
  const today = parseDateInput(kathmanduDate());
  if (!today) throw new Error('Unable to determine today’s date.');
  const tomorrow = new Date(today.getTime() + DAY_MS);
  let from;
  let toExclusive;

  if (range === 'today') {
    from = today;
    toExclusive = tomorrow;
  } else if (range === 'week') {
    const weekday = today.getUTCDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    from = new Date(today.getTime() - mondayOffset * DAY_MS);
    toExclusive = tomorrow;
  } else if (range === 'month') {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    toExclusive = tomorrow;
  } else if (range === 'fiscal-year') {
    const fiscal = String(school.currentFiscalYearBS || '').trim();
    const match = /^(\d{4})\/\d{3}$/.exec(fiscal);
    if (!match) throw new Error('Configure the current BS fiscal year before using fiscal-year filters.');
    const fromAD = String(bs.BSToAD(`${match[1]}-04-01`) || '');
    const endAD = String(bs.BSToAD(`${Number(match[1]) + 1}-04-01`) || '');
    from = parseDateInput(fromAD);
    toExclusive = parseDateInput(endAD);
    if (!from || !toExclusive) throw new Error('Unable to convert the configured BS fiscal year to AD.');
  } else if (range === 'custom') {
    from = parseDateInput(query.from);
    const to = parseDateInput(query.to);
    if (!from || !to || from > to) throw new Error('Choose a valid custom date range.');
    toExclusive = new Date(to.getTime() + DAY_MS);
  } else {
    throw new Error('Choose a valid date filter.');
  }
  return {
    range,
    from,
    toExclusive,
    fromText: dateOnly(from),
    toText: dateOnly(new Date(toExclusive.getTime() - DAY_MS)),
  };
}

function addEntriesToRows(vouchers, selectedLedgerIds, openingBalance = 0) {
  const selectedIds = new Set(selectedLedgerIds.map(String));
  const rows = [];
  for (const voucher of vouchers) {
    for (const entry of voucher.entries || []) {
      const ledgerId = String(entry.ledger?._id || entry.ledger || '');
      if (!selectedIds.has(ledgerId)) continue;
      rows.push({
        voucherId: voucher._id,
        voucherNumber: voucher.voucherNumber,
        voucherType: voucher.voucherType,
        voucherTypeLabel: formatVoucherType(voucher.voucherType),
        dateAD: voucher.dateAD,
        dateBS: voucher.dateBS,
        narration: voucher.narration,
        ledger: entry.ledger,
        debit: Number(entry.debit || 0),
        credit: Number(entry.credit || 0),
        referenceNumber: voucher.transactionDetails?.referenceNumber || '',
        status: getVoucherDisplayStatus(voucher),
        createdAt: voucher.createdAt,
      });
    }
  }
  rows.sort((a, b) => new Date(a.dateAD) - new Date(b.dateAD)
    || new Date(a.createdAt) - new Date(b.createdAt));
  let balance = openingBalance;
  rows.forEach(row => {
    balance = Math.round((balance + row.debit - row.credit) * 100) / 100;
    row.runningBalance = balance;
  });
  return rows;
}

async function getBookData({ ledgerIds, from, toExclusive, session }) {
  if (!ledgerIds.length) return { opening: 0, rows: [], closing: 0 };
  const before = JournalVoucher.aggregate([
    { $match: { status: 'POSTED', dateAD: { $lt: from } } },
    { $unwind: '$entries' },
    { $match: { 'entries.ledger': { $in: ledgerIds } } },
    { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
  ]);
  if (session) before.session(session);
  const [openingTotal] = await before;
  const opening = Math.round(((openingTotal?.debit || 0) - (openingTotal?.credit || 0)) * 100) / 100;
  const query = JournalVoucher.find({
    status: 'POSTED',
    dateAD: { $gte: from, $lt: toExclusive },
    'entries.ledger': { $in: ledgerIds },
  }).populate('entries.ledger', 'code name ledgerType group').sort({ dateAD: 1, createdAt: 1 });
  if (session) query.session(session);
  const vouchers = await query.lean();
  const rows = addEntriesToRows(vouchers, ledgerIds, opening);
  return { opening, rows, closing: rows.length ? rows[rows.length - 1].runningBalance : opening };
}

exports.cashBank = async (req, res) => {
  try {
    const school = await School.findOne().lean();
    if (!school) return res.status(503).send('Configure school accounting settings before using Cash & Bank.');
    const filters = getDateFilter(req.query, school);
    const allLedgers = await AccountLedger.find({ isActive: { $ne: false } })
      .populate('group', 'name code')
      .sort({ code: 1 })
      .lean();
    const cash = allLedgers.filter(ledger => classifyCashBankLedger(ledger) === 'cash');
    const bank = allLedgers.filter(ledger => classifyCashBankLedger(ledger) === 'bank');
    const ledgers = [...cash, ...bank];
    const ledgerIds = ledgers.map(ledger => ledger._id);
    const totals = ledgerIds.length ? await JournalVoucher.aggregate([
      { $match: { status: 'POSTED' } },
      { $unwind: '$entries' },
      { $match: { 'entries.ledger': { $in: ledgerIds } } },
      { $group: { _id: '$entries.ledger', debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
    ]) : [];
    const balances = calculateLedgerBalances(totals);
    const accountData = ledgers.map(ledger => {
      const balance = balances.get(String(ledger._id)) || 0;
      return { ...ledger, balance, balanceSide: getNormalBalanceLabel(balance, ledger.normalBalance), lastTransaction: null };
    });
    if (ledgerIds.length) {
      const lastTransactions = await JournalVoucher.aggregate([
        { $match: { status: 'POSTED', 'entries.ledger': { $in: ledgerIds } } },
        { $unwind: '$entries' },
        { $match: { 'entries.ledger': { $in: ledgerIds } } },
        { $sort: { dateAD: -1, createdAt: -1 } },
        { $group: { _id: '$entries.ledger', dateAD: { $first: '$dateAD' }, voucherNumber: { $first: '$voucherNumber' } } },
      ]);
      const lastByLedger = new Map(lastTransactions.map(item => [String(item._id), item]));
      accountData.forEach(ledger => { ledger.lastTransaction = lastByLedger.get(String(ledger._id)) || null; });
    }

    const typeFilter = String(req.query.type || '');
    const kindFilter = String(req.query.kind || '');
    const accountFilter = String(req.query.account || '');
    let transactionLedgerIds = ledgers;
    if (kindFilter === 'cash') transactionLedgerIds = cash;
    if (kindFilter === 'bank') transactionLedgerIds = bank;
    if (accountFilter && mongoose.isValidObjectId(accountFilter)) {
      transactionLedgerIds = transactionLedgerIds.filter(ledger => String(ledger._id) === accountFilter);
    }
    const recentQuery = {
      status: 'POSTED',
      dateAD: { $gte: filters.from, $lt: filters.toExclusive },
      'entries.ledger': { $in: transactionLedgerIds.map(ledger => ledger._id) },
    };
    if (typeFilter) recentQuery.voucherType = typeFilter;
    const recentVouchers = transactionLedgerIds.length
      ? await JournalVoucher.find(recentQuery)
        .populate('entries.ledger', 'code name ledgerType group')
        .sort({ dateAD: -1, createdAt: -1 })
        .limit(100)
        .lean()
      : [];
    const selectedIds = transactionLedgerIds.map(ledger => String(ledger._id));
    const recentTransactions = addEntriesToRows(recentVouchers, selectedIds).reverse();
    const total = list => Math.round(list.reduce((sum, item) => sum + Math.round(item.balance * 100), 0)) / 100;
    const cashLedgers = accountData.filter(ledger => classifyCashBankLedger(ledger) === 'cash');
    const bankLedgers = accountData.filter(ledger => classifyCashBankLedger(ledger) === 'bank');
    const pendingQuery = req.user.role === 'CASHIER'
      ? { submittedBy: req.user._id, status: { $in: ['PENDING_ACCOUNTANT_REVIEW', 'PENDING_ADMIN_APPROVAL'] } }
      : { status: { $in: ['PENDING_ACCOUNTANT_REVIEW', 'PENDING_ADMIN_APPROVAL'] } };
    const pendingCount = await JournalVoucher.countDocuments(pendingQuery);
    return res.render('./billingfirst/cashbank', {
      title: 'Cash & Bank',
      cash: cashLedgers,
      bank: bankLedgers,
      totalCash: total(cashLedgers),
      totalBank: total(bankLedgers),
      totalCashBank: total(cashLedgers) + total(bankLedgers),
      activeCashCount: cashLedgers.length,
      activeBankCount: bankLedgers.length,
      recentTransactions,
      transactionAccounts: ledgers,
      operationLedgers: allLedgers.filter(ledger => !classifyCashBankLedger(ledger)),
      transactionTypes: ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'FEE_INVOICE', 'FEE_RECEIPT', 'REVERSAL'],
      formatVoucherType,
      filter: { ...filters, kind: kindFilter, account: accountFilter, type: typeFilter },
      pendingCount,
      currentRole: req.user.role,
      currentPath: '/cashbank',
      updatedAt: new Date(),
      todayBS: String(bs.ADToBS(new Date()) || '').slice(0, 10),
      idempotencyKey: crypto.randomBytes(24).toString('hex'),
      error: '',
    });
  } catch (error) {
    console.error('Error loading cash and bank dashboard:', error);
    return res.status(500).send(`Unable to load Cash & Bank: ${error.message}`);
  }
};

exports.createCashBankOperation = async (req, res) => {
  try {
    await createCashBankVoucher({
      kind: String(req.body.kind || '').trim().toUpperCase(),
      dateBS: req.body.dateBS,
      narration: req.body.narration,
      amount: req.body.amount,
      cashBankLedgerId: req.body.cashBankLedgerId,
      offsetLedgerId: req.body.offsetLedgerId,
      fromLedgerId: req.body.fromLedgerId,
      toLedgerId: req.body.toLedgerId,
      paymentMethod: String(req.body.paymentMethod || '').trim().toUpperCase(),
      partyName: req.body.partyName,
      referenceNumber: req.body.referenceNumber,
      idempotencyKey: req.body.idempotencyKey,
      user: req.user,
    });
    return res.redirect('/cashbank?status=submitted');
  } catch (error) {
    console.error('Error creating cash or bank transaction:', error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : error.code === 11000 ? 409 : 400;
    return res.status(status).send(error.message || 'Unable to save the transaction.');
  }
};

exports.ledgerStatement = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Ledger account not found.');
  try {
    const school = await School.findOne().lean();
    const ledger = await AccountLedger.findById(req.params.id).populate('group', 'name code').lean();
    if (!ledger || !classifyCashBankLedger(ledger)) return res.status(404).send('Cash or bank ledger account not found.');
    const filters = getDateFilter(req.query, school);
    const data = await getBookData({ ledgerIds: [ledger._id], from: filters.from, toExclusive: filters.toExclusive });
    return res.render('./billingfirst/cashBankBook', {
      title: `${ledger.name} ledger`,
      kind: classifyCashBankLedger(ledger),
      ledgers: [ledger],
      selectedLedger: ledger._id,
      ...data,
      filters,
      currentPath: `/cashbank/book/${classifyCashBankLedger(ledger)}`,
    });
  } catch (error) {
    console.error('Error loading cash/bank ledger:', error);
    return res.status(500).send(`Unable to load the ledger statement: ${error.message}`);
  }
};

exports.cashBankBook = async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  if (!['cash', 'bank'].includes(kind)) return res.status(404).send('Cash or bank book not found.');
  try {
    const school = await School.findOne().lean();
    const filters = getDateFilter(req.query, school);
    const allLedgers = await AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name code').sort({ code: 1 }).lean();
    const ledgers = allLedgers.filter(ledger => classifyCashBankLedger(ledger) === kind);
    const selectedLedgerId = String(req.query.account || '');
    if (selectedLedgerId && !ledgers.some(ledger => String(ledger._id) === selectedLedgerId)) {
      return res.status(400).send('Choose a valid active ledger account.');
    }
    const selected = selectedLedgerId ? ledgers.filter(ledger => String(ledger._id) === selectedLedgerId) : ledgers;
    const data = await getBookData({
      ledgerIds: selected.map(ledger => ledger._id),
      from: filters.from,
      toExclusive: filters.toExclusive,
    });
    return res.render('./billingfirst/cashBankBook', {
      title: `${kind === 'cash' ? 'Cash' : 'Bank'} Book`,
      kind,
      ledgers,
      selectedLedger: selectedLedgerId,
      ...data,
      filters,
      currentPath: `/cashbank/book/${kind}`,
    });
  } catch (error) {
    console.error(`Error loading ${kind} book:`, error);
    return res.status(500).send(`Unable to load ${kind} book: ${error.message}`);
  }
};

exports.exportCashBankBook = async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  if (!['cash', 'bank'].includes(kind)) return res.status(404).send('Cash or bank book not found.');
  try {
    const school = await School.findOne().lean();
    const filters = getDateFilter(req.query, school);
    const ledgers = await AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name').lean();
    const matching = ledgers.filter(ledger => classifyCashBankLedger(ledger) === kind);
    const accountId = String(req.query.account || '');
    const selected = accountId ? matching.filter(ledger => String(ledger._id) === accountId) : matching;
    if (accountId && !selected.length) return res.status(400).send('Choose a valid active ledger account.');
    const data = await getBookData({ ledgerIds: selected.map(ledger => ledger._id), from: filters.from, toExclusive: filters.toExclusive });
    const lines = [
      ['Date BS', 'Date AD', 'Voucher', 'Account', 'Description', 'Debit', 'Credit', 'Running balance'],
      ...data.rows.map(row => [
        row.dateBS,
        dateOnly(new Date(row.dateAD)),
        row.voucherNumber,
        row.ledger?.name || '',
        row.narration,
        row.debit.toFixed(2),
        row.credit.toFixed(2),
        row.runningBalance.toFixed(2),
      ]),
    ];
    const csv = lines.map(line => line.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-book-${filters.fromText}-${filters.toText}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error(`Error exporting ${kind} book:`, error);
    return res.status(400).send(error.message || 'Unable to export the book.');
  }
};

exports.accountingSettings = async (req, res) => {
  try {
    const [school, ledgers] = await Promise.all([
      School.findOne().populate('accountsReceivableLedger defaultFeeIncomeLedger studentAdvanceLedger retainedEarningsLedger').lean(),
      AccountLedger.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean(),
    ]);
    if (!school) return res.status(503).send('Configure school settings before accounting setup.');
    return res.render('./billingfirst/accountingSettings', {
      title: 'Accounting Settings',
      school,
      ledgers,
      error: '',
      status: req.query.status,
      currentPath: '/accounting/settings',
    });
  } catch (error) {
    console.error('Unable to load accounting settings:', error);
    return res.status(500).send('Unable to load accounting settings.');
  }
};

exports.saveAccountingSettings = async (req, res) => {
  try {
    const school = await School.findOne();
    if (!school) return res.status(503).send('Configure school settings before accounting setup.');
    const fiscalYear = String(req.body.currentFiscalYearBS || '').trim();
    if (!/^\d{4}\/\d{3}$/.test(fiscalYear)) throw new Error('Enter the current fiscal year in YYYY/YYY BS format.');
    const thresholdMinor = toMinorUnits(req.body.accountantApprovalThreshold || '0');
    if (thresholdMinor === null || thresholdMinor < 0) throw new Error('Enter a non-negative approval threshold with up to two decimal places.');

    const mappings = [
      ['accountsReceivableLedger', 'ASSET', 'Accounts Receivable'],
      ['defaultFeeIncomeLedger', 'INCOME', 'Default Fee Income'],
      ['studentAdvanceLedger', 'LIABILITY', 'Student Advances'],
      ['retainedEarningsLedger', 'EQUITY', 'Retained Earnings'],
    ];
    const updates = {};
    for (const [field, nature, label] of mappings) {
      const ledger = await loadActiveLedger(req.body[field], null);
      if (ledger.nature !== nature) throw new Error(`${label} must use ${nature.toLowerCase()} account nature.`);
      updates[field] = ledger._id;
    }
    school.set({
      ...updates,
      currentFiscalYearBS: fiscalYear,
      accountantApprovalThreshold: thresholdMinor / 100,
    });
    await school.save();
    return res.redirect('/accounting/settings?status=saved');
  } catch (error) {
    console.error('Unable to save accounting settings:', error);
    const [school, ledgers] = await Promise.all([
      School.findOne().populate('accountsReceivableLedger defaultFeeIncomeLedger studentAdvanceLedger retainedEarningsLedger').lean(),
      AccountLedger.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean(),
    ]);
    return res.status(error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400)
      .render('./billingfirst/accountingSettings', {
        title: 'Accounting Settings',
        school,
        ledgers,
        error: error.message,
        status: '',
        currentPath: '/accounting/settings',
      });
  }
};

exports.closeFiscalYear = async (req, res) => {
  try {
    const close = await closeFiscalYear(req.body.fiscalYearBS, req.user);
    return res.redirect(`/accounting/settings?status=closed&year=${encodeURIComponent(close.fiscalYearBS)}`);
  } catch (error) {
    console.error('Unable to close fiscal year:', error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400;
    return res.status(status).send(error.message || 'Unable to close fiscal year.');
  }
};

exports.historicalReconciliation = async (req, res) => {
  try {
    const [unlinkedInvoices, unlinkedPayments] = await Promise.all([
      Invoice.aggregate([
        { $match: { isCancelled: false, currentTotal: { $gt: 0 }, $or: [{ journalVoucher: null }, { journalVoucher: { $exists: false } }] } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$currentTotal' } } },
      ]),
      Payment.aggregate([
        { $match: { $or: [{ journalVoucher: null }, { journalVoucher: { $exists: false } }] } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);
    const report = {
      invoices: unlinkedInvoices[0] || { count: 0, amount: 0 },
      payments: unlinkedPayments[0] || { count: 0, amount: 0 },
      generatedAt: new Date(),
    };
    return res.render('./billingfirst/historicalAccountingReconciliation', {
      title: 'Historical Accounting Review',
      report,
      currentPath: '/accounting/historical-reconciliation',
    });
  } catch (error) {
    console.error('Unable to prepare historical accounting report:', error);
    return res.status(500).send('Unable to prepare historical accounting report.');
  }
};

exports.voucherQueue = async (req, res) => {
  try {
    const filter = req.user.role === 'CASHIER' ? { submittedBy: req.user._id } : {};
    const [vouchers, todayBS] = await Promise.all([
      JournalVoucher.find(filter)
        .populate('entries.ledger', 'code name')
        .populate('submittedBy reviewedBy approvedBy postedBy')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      Promise.resolve(String(bs.ADToBS(new Date()) || '').slice(0, 10)),
    ]);
    return res.render('./billingfirst/accountingVoucherQueue', {
      title: 'Accounting Vouchers',
      vouchers: vouchers.map(voucher => ({
        ...voucher,
        displayStatus: getVoucherDisplayStatus(voucher),
      })),
      formatVoucherType,
      todayBS,
      currentRole: req.user.role,
      statusMessage: req.query.status === 'submitted' ? 'Voucher submitted to the approval workflow.' : '',
      currentPath: '/accounting/vouchers',
    });
  } catch (error) {
    console.error('Unable to load accounting voucher queue:', error);
    return res.status(500).send('Unable to load accounting vouchers.');
  }
};

const handleVoucherAction = async (req, res, action) => {
  try {
    await changeVoucherApproval(req.params.id, action, req.user, req.body.reason);
    return res.redirect('/accounting/vouchers');
  } catch (error) {
    console.error(`Unable to ${action.toLowerCase()} accounting voucher:`, error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400;
    return res.status(status).send(error.message || 'Unable to update voucher approval.');
  }
};

exports.reviewVoucher = (req, res) => handleVoucherAction(req, res, 'REVIEW');
exports.approveVoucher = (req, res) => handleVoucherAction(req, res, 'APPROVE');
exports.rejectVoucher = (req, res) => handleVoucherAction(req, res, 'REJECT');

exports.reverseVoucher = async (req, res) => {
  try {
    await reversePostedVoucher(req.params.id, req.body.dateBS, req.body.reason, req.user);
    return res.redirect('/accounting/vouchers?status=reversed');
  } catch (error) {
    console.error('Unable to reverse accounting voucher:', error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400;
    return res.status(status).send(error.message || 'Unable to reverse voucher.');
  }
};

exports.reconciliationPage = async (req, res) => {
  try {
    const [allLedgers, history] = await Promise.all([
      AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name').sort({ code: 1 }).lean(),
      BankReconciliation.find().populate('bankLedger', 'code name').sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    return res.render('./billingfirst/bankReconciliation', {
      title: 'Bank Reconciliation',
      bankLedgers: allLedgers.filter(ledger => classifyCashBankLedger(ledger) === 'bank'),
      history,
      currentPath: '/accounting/reconciliation',
      error: '',
    });
  } catch (error) {
    console.error('Unable to load bank reconciliation:', error);
    return res.status(500).send('Unable to load bank reconciliation.');
  }
};

exports.createReconciliation = async (req, res) => {
  try {
    const ledger = await loadActiveLedger(req.body.bankLedger, null);
    if (classifyCashBankLedger(ledger) !== 'bank') throw new Error('Choose an active bank ledger account.');
    const from = parseDateInput(req.body.fromAD);
    const to = parseDateInput(req.body.toAD);
    if (!from || !to || from > to) throw new Error('Choose a valid AD statement date range.');
    const openingBalance = Number(req.body.openingBalance);
    if (!Number.isFinite(openingBalance) || !/^-?\d+(?:\.\d{1,2})?$/.test(String(req.body.openingBalance || '').trim())) {
      throw new Error('Enter a valid opening statement balance.');
    }
    const csvText = String(req.body.csvText || '');
    if (csvText.length > 1000000) throw new Error('The statement CSV must be no larger than 1 MB.');
    const statementTransactions = parseBankStatementCsv(csvText);
    if (statementTransactions.some(item => item.dateAD < from || item.dateAD > to)) {
      throw new Error('Every CSV transaction date must be within the selected statement range.');
    }
    const statementHash = hashStatement({
      ledgerId: ledger._id,
      from: dateOnly(from),
      to: dateOnly(to),
      openingBalance,
      csv: csvText,
    });

    const reconciliation = await withAccountingTransaction(async session => {
      const duplicate = await BankReconciliation.findOne({ statementHash }).session(session);
      if (duplicate) return duplicate;
      const book = await getBookData({
        ledgerIds: [ledger._id],
        from,
        toExclusive: new Date(to.getTime() + DAY_MS),
        session,
      });
      const statements = statementTransactions.map(transaction => ({ ...transaction }));
      const unmatchedBooks = [...book.rows];
      statements.forEach(statement => {
        const statementMinor = Math.round((statement.credit - statement.debit) * 100);
        const matchIndex = unmatchedBooks.findIndex(row => {
          const bookMinor = Math.round((row.debit - row.credit) * 100);
          const sameDate = dateOnly(new Date(row.dateAD)) === dateOnly(statement.dateAD);
          const reference = statement.reference.trim().toLowerCase();
          const sameReference = !reference
            || [row.voucherNumber, row.referenceNumber].some(value => String(value || '').toLowerCase() === reference);
          return sameDate && statementMinor === bookMinor && sameReference;
        });
        if (matchIndex >= 0) {
          statement.matchedVoucher = unmatchedBooks[matchIndex].voucherId;
          unmatchedBooks.splice(matchIndex, 1);
        }
      });
      const statementMovement = statements.reduce((sum, transaction) => sum + transaction.credit - transaction.debit, 0);
      const statementBalance = Math.round((openingBalance + statementMovement) * 100) / 100;
      const bookOpeningBalance = book.opening;
      const bookClosingBalance = book.closing;
      const document = new BankReconciliation({
        bankLedger: ledger._id,
        statementFromAD: from,
        statementToAD: to,
        openingBalance,
        statementBalance,
        bookOpeningBalance,
        bookClosingBalance,
        unreconciledDifference: Math.round((statementBalance - bookClosingBalance) * 100) / 100,
        transactions: statements,
        unmatchedBookTransactions: unmatchedBooks.map(row => ({
          voucher: row.voucherId,
          dateAD: row.dateAD,
          dateBS: row.dateBS,
          voucherNumber: row.voucherNumber,
          description: row.narration,
          reference: row.referenceNumber,
          debit: row.debit,
          credit: row.credit,
        })),
        unmatchedStatementCount: statements.filter(item => !item.matchedVoucher).length,
        unmatchedBookCount: unmatchedBooks.length,
        statementHash,
        createdBy: req.user._id,
      });
      await document.save({ session });
      return document;
    });
    return res.redirect(`/accounting/reconciliation/${reconciliation._id}`);
  } catch (error) {
    console.error('Unable to reconcile bank statement:', error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : error.code === 11000 ? 409 : 400;
    const [allLedgers, history] = await Promise.all([
      AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name').sort({ code: 1 }).lean(),
      BankReconciliation.find().populate('bankLedger', 'code name').sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    return res.status(status).render('./billingfirst/bankReconciliation', {
      title: 'Bank Reconciliation',
      bankLedgers: allLedgers.filter(ledger => classifyCashBankLedger(ledger) === 'bank'),
      history,
      currentPath: '/accounting/reconciliation',
      error: error.message || 'Unable to reconcile bank statement.',
    });
  }
};

exports.viewReconciliation = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Reconciliation not found.');
  try {
    const reconciliation = await BankReconciliation.findById(req.params.id)
      .populate('bankLedger', 'code name')
      .populate('transactions.matchedVoucher', 'voucherNumber dateBS narration')
      .lean();
    if (!reconciliation) return res.status(404).send('Reconciliation not found.');
    return res.render('./billingfirst/bankReconciliationResult', {
      title: 'Reconciliation Result',
      reconciliation,
      currentPath: '/accounting/reconciliation',
    });
  } catch (error) {
    console.error('Unable to load reconciliation result:', error);
    return res.status(500).send('Unable to load reconciliation result.');
  }
};
