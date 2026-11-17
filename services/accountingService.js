const mongoose = require('mongoose');
const bs = require('../utils/bikramSambat');
const AccountLedger = require('../model/billingschema/AccountLedger');
const School = require('../model/billingschema/School');
const Invoice = require('../model/billingschema/Invoice');
const Payment = require('../model/billingschema/Payment');
const LedgerEntry = require('../model/billingschema/LedgerEntry');
const { feeheadModel } = require('../model/billingschema/feeheadschema');
const Student = require('../model/billingschema/Student');
const { getNextSequence } = require('../model/billingschema/Counter');
const { JournalVoucher, VoucherCounter } = require('../model/billingschema/JournalVoucher');
const FiscalYearClose = require('../model/billingschema/FiscalYearClose');
const { classifyCashBankLedger } = require('../utils/cashBank');
const {
  accountingVoucherNumber,
  calculateStudentPaymentAdvance,
  choosePostingStatus,
  formatFiscalYearBS,
} = require('../utils/accounting');
const {
  buildContraVoucherData,
  toMinorUnits,
  validateJournalEntries,
} = require('../utils/journalVoucher');
const { buildFeeHeadIncomeEntries } = require('../utils/feeHeadIncome');

const transactionUnavailableMessage =
  'Accounting posting is disabled because this MongoDB connection does not support transactions. Configure and verify a replica set or sharded cluster before enabling posting. No accounting records were written.';

function assertTransactionSupport() {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  if (!['ReplicaSetWithPrimary', 'Sharded'].includes(topologyType)) {
    const error = new Error(transactionUnavailableMessage);
    error.code = 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE';
    throw error;
  }
}

async function withAccountingTransaction(work) {
  assertTransactionSupport();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function actorId(user) {
  if (!user?._id || !mongoose.isValidObjectId(user._id)) {
    throw new Error('A valid authenticated user is required for accounting transactions.');
  }
  return user._id;
}

function dateFromBS(dateBS) {
  const normalized = String(dateBS || '').trim();
  const converted = String(bs.BSToAD(normalized) || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(converted)) {
    throw new Error('Enter a valid Nepali BS date.');
  }
  const date = new Date(`${converted}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('The BS date could not be converted to AD.');
  return { dateBS: normalized, dateAD: date };
}

async function schoolSettings(session) {
  const query = School.findOne();
  if (session) query.session(session);
  const school = await query;
  if (!school) throw new Error('Configure school accounting settings before recording transactions.');
  return school;
}

function assertOpenFiscalYear(dateBS, school) {
  const fiscalYear = formatFiscalYearBS(dateBS);
  if (!fiscalYear) throw new Error('The BS date does not identify a valid fiscal year.');
  if ((school.closedFiscalYearsBS || []).includes(fiscalYear)) {
    throw new Error(`Fiscal year ${fiscalYear} is closed. Post an adjustment in an open fiscal year.`);
  }
  return fiscalYear;
}

async function loadActiveLedger(ledgerId, session) {
  if (!mongoose.isValidObjectId(ledgerId)) throw new Error('Choose a valid ledger account.');
  const query = AccountLedger.findOne({ _id: ledgerId, isActive: { $ne: false } })
    .populate('group', 'name');
  if (session) query.session(session);
  const ledger = await query.lean();
  if (!ledger) throw new Error('The selected ledger is inactive or unavailable.');
  return ledger;
}

async function loadSettingsLedger(id, expectedNature, description, session) {
  if (!id) throw new Error(`Configure an active ${description} ledger in Accounting Settings.`);
  const ledger = await loadActiveLedger(id, session);
  if (ledger.nature !== expectedNature) {
    throw new Error(`The configured ${description} ledger must have ${expectedNature.toLowerCase()} nature.`);
  }
  return ledger;
}

async function allocateVoucherNumber(voucherType, session) {
  const counterKey = voucherType;
  let counter = await VoucherCounter.findById(counterKey).session(session).lean();
  if (!counter) {
    const prefix = accountingVoucherNumber(voucherType, 0).split('-')[0];
    const existing = await JournalVoucher.find({ voucherNumber: new RegExp(`^${prefix}-\\d+$`) })
      .select('voucherNumber')
      .session(session)
      .lean();
    const maximum = existing.reduce((highest, voucher) => {
      const sequence = Number(String(voucher.voucherNumber).split('-')[1]);
      return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
    }, 0);
    try {
      await VoucherCounter.create([{ _id: counterKey, sequence: maximum }], { session });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  const next = await VoucherCounter.findByIdAndUpdate(
    counterKey,
    { $inc: { sequence: 1 } },
    { new: true, runValidators: true, session }
  ).lean();
  if (!next) throw new Error('Unable to allocate a unique accounting voucher number.');
  return accountingVoucherNumber(voucherType, next.sequence);
}

function auditEvent(action, user, notes = '') {
  return { action, actor: actorId(user), at: new Date(), notes: String(notes || '').trim() };
}

async function buildVoucher({
  voucherType,
  dateBS,
  narration,
  entries,
  amount,
  user,
  school,
  session,
  idempotencyKey,
  paymentRequest,
  transactionDetails,
  sourceType = '',
  sourceId = null,
}) {
  const date = dateFromBS(dateBS);
  assertOpenFiscalYear(date.dateBS, school);
  if (!Array.isArray(entries) || entries.length < 2) throw new Error('An accounting voucher requires at least two entries.');
  let debitMinor = 0;
  let creditMinor = 0;
  for (const [index, entry] of entries.entries()) {
    const debit = toMinorUnits(entry.debit);
    const credit = toMinorUnits(entry.credit);
    if (debit === null || credit === null || (debit > 0) === (credit > 0)) {
      throw new Error(`Voucher entry ${index + 1} must have a valid amount on exactly one side.`);
    }
    debitMinor += debit;
    creditMinor += credit;
  }
  if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)
    || debitMinor <= 0 || debitMinor !== creditMinor) {
    throw new Error('The voucher is not balanced. Total debit must equal total credit.');
  }
  const postedStatus = choosePostingStatus(user.role, school.accountantApprovalThreshold, amount);
  const voucherNumber = await allocateVoucherNumber(voucherType, session);
  const voucher = new JournalVoucher({
    voucherNumber,
    voucherType,
    ...date,
    narration: String(narration || '').trim(),
    entries,
    totalDebit: debitMinor / 100,
    totalCredit: creditMinor / 100,
    status: postedStatus,
    createdBy: String(user.teacherName || user.username || ''),
    submittedBy: actorId(user),
    postedBy: postedStatus === 'POSTED' ? actorId(user) : null,
    idempotencyKey,
    paymentRequest,
    transactionDetails,
    sourceType,
    sourceId,
    auditEvents: [auditEvent(postedStatus === 'POSTED' ? 'POSTED' : 'SUBMITTED', user)],
  });
  await voucher.save({ session });
  return voucher;
}

async function getInvoiceLedgerRows(invoiceItems, session) {
  const feeHeadIds = [...new Set((invoiceItems || []).map(item => String(item.feeCategory || '')).filter(mongoose.isValidObjectId))];
  const feeHeads = feeHeadIds.length
    ? await feeheadModel.find({ _id: { $in: feeHeadIds } }).session(session).lean()
    : [];
  const ledgerIds = [...new Set(feeHeads.map(feeHead => String(feeHead.incomeLedger || '')).filter(mongoose.isValidObjectId))];
  const ledgers = ledgerIds.length
    ? await AccountLedger.find({ _id: { $in: ledgerIds } }).session(session).lean()
    : [];
  return buildFeeHeadIncomeEntries(invoiceItems, feeHeads, ledgers);
}

async function postInvoiceVoucher(invoice, session, user, validatedIncomeEntries) {
  if (invoice.currentTotal <= 0) return null;
  const school = await schoolSettings(session);
  const date = dateFromBS(invoice.billDateBS);
  assertOpenFiscalYear(date.dateBS, school);
  const receivableLedger = await loadSettingsLedger(
    school.accountsReceivableLedger,
    'ASSET',
    'accounts receivable',
    session
  );
  const incomeEntries = validatedIncomeEntries || await getInvoiceLedgerRows(invoice.currentItems, session);
  const credits = incomeEntries.reduce((sum, entry) => sum + entry.credit, 0);
  const debit = Math.round(Number(invoice.currentTotal) * 100) / 100;
  if (Math.round(credits * 100) !== Math.round(debit * 100)) {
    throw new Error('The invoice fee-head mappings do not balance to the invoice total.');
  }

  const entries = [{ ledger: receivableLedger._id, debit, credit: 0 }, ...incomeEntries];
  const advanceApplied = Math.round(Number(invoice.paidAmount || 0) * 100) / 100;
  if (advanceApplied > 0) {
    const advanceLedger = await loadSettingsLedger(
      school.studentAdvanceLedger,
      'LIABILITY',
      'student advance',
      session
    );
    entries.push(
      { ledger: advanceLedger._id, debit: advanceApplied, credit: 0 },
      { ledger: receivableLedger._id, debit: 0, credit: advanceApplied }
    );
  }
  const voucher = await buildVoucher({
    voucherType: 'FEE_INVOICE',
    dateBS: invoice.billDateBS,
    narration: `Fee invoice ${invoice.invoiceNumber}`,
    entries,
    amount: debit,
    user,
    school,
    session,
    idempotencyKey: `invoice:${invoice._id}`,
    sourceType: 'FEE_INVOICE',
    sourceId: invoice._id,
  });
  invoice.journalVoucher = voucher._id;
  await invoice.save({ session });
  return voucher;
}

async function applyStudentAdvances({ studentId, currentTotal, previousDue, session }) {
  const totalMinor = Math.round(Number(currentTotal || 0) * 100);
  const balanceMinor = Math.round(Number(previousDue || 0) * 100);
  if (totalMinor <= 0 || balanceMinor >= 0) return [];

  const payments = await Payment.find({
    student: studentId,
    isReversed: false,
    advanceAmount: { $gt: 0 },
  }).sort({ paymentDateAD: 1, createdAt: 1 }).session(session);
  const availableMinor = payments.reduce((sum, payment) => (
    sum + Math.max(0, Math.round((Number(payment.advanceAmount || 0) - Number(payment.advanceApplied || 0)) * 100))
  ), 0);
  if (availableMinor < Math.abs(balanceMinor)) {
    throw new Error('This student has an unapplied historical credit without a linked General Ledger receipt. Review the historical accounting report before issuing a new invoice.');
  }

  let remaining = Math.min(totalMinor, Math.abs(balanceMinor), availableMinor);
  const allocations = [];
  for (const payment of payments) {
    if (remaining <= 0) break;
    const available = Math.max(0, Math.round((Number(payment.advanceAmount || 0) - Number(payment.advanceApplied || 0)) * 100));
    const applied = Math.min(available, remaining);
    if (!applied) continue;
    payment.advanceApplied = Math.round((Number(payment.advanceApplied || 0) * 100) + applied) / 100;
    await payment.save({ session });
    allocations.push({ payment: payment._id, amountApplied: applied / 100 });
    remaining -= applied;
  }
  return allocations;
}

async function getStudentBalance(studentId, session) {
  const aggregate = LedgerEntry.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
        debits: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } },
        credits: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
      },
    },
  ]);
  if (session) aggregate.session(session);
  const [result] = await aggregate;
  return result ? Number(result.debits || 0) - Number(result.credits || 0) : 0;
}

function amountMinorUnits(amount) {
  const minor = toMinorUnits(amount);
  if (minor === null || minor <= 0) throw new Error('Enter a valid positive amount with up to two decimal places.');
  return minor;
}

async function activeCashBankLedger(ledgerId, expectedType, session) {
  const ledger = await loadActiveLedger(ledgerId, session);
  if (classifyCashBankLedger(ledger) !== expectedType) {
    throw new Error(`Choose an active ${expectedType} account.`);
  }
  return ledger;
}

async function createCashBankVoucher({
  kind,
  dateBS,
  narration,
  amount,
  cashBankLedgerId,
  offsetLedgerId,
  fromLedgerId,
  toLedgerId,
  paymentMethod,
  partyName,
  referenceNumber,
  idempotencyKey,
  user,
}) {
  if (!idempotencyKey || String(idempotencyKey).length > 100) {
    throw new Error('A valid transaction idempotency key is required. Reload the form and submit again.');
  }
  return withAccountingTransaction(async session => {
    const existing = await JournalVoucher.findOne({ idempotencyKey }).session(session).lean();
    if (existing) return existing;

    const school = await schoolSettings(session);
    const minor = amountMinorUnits(amount);
    const value = minor / 100;
    let entries;
    let transactionDetails;
    let voucherType;

    if (kind === 'RECEIPT' || kind === 'PAYMENT') {
      const expectedType = paymentMethod === 'BANK' ? 'bank' : 'cash';
      const moneyLedger = await activeCashBankLedger(cashBankLedgerId, expectedType, session);
      const offsetLedger = await loadActiveLedger(offsetLedgerId, session);
      if (String(moneyLedger._id) === String(offsetLedger._id)
        || classifyCashBankLedger(offsetLedger)) {
        throw new Error('Select a different active ledger for the income, liability, receivable, or expense side.');
      }

      entries = kind === 'RECEIPT'
        ? [{ ledger: moneyLedger._id, debit: value, credit: 0 }, { ledger: offsetLedger._id, debit: 0, credit: value }]
        : [{ ledger: offsetLedger._id, debit: value, credit: 0 }, { ledger: moneyLedger._id, debit: 0, credit: value }];
      transactionDetails = {
        partyName: String(partyName || '').trim(),
        amount: value,
        paymentMethod,
        cashBankLedger: moneyLedger._id,
        offsetLedger: offsetLedger._id,
        referenceNumber: String(referenceNumber || '').trim(),
      };
      voucherType = kind;
    } else if (kind === 'CONTRA') {
      const fromLedger = await loadActiveLedger(fromLedgerId, session);
      const toLedger = await loadActiveLedger(toLedgerId, session);
      const contraVoucher = buildContraVoucherData({
        fromLedger,
        toLedger,
        amountMinor: minor,
        referenceNumber,
      });
      entries = contraVoucher.entries;
      transactionDetails = contraVoucher.transactionDetails;
      voucherType = contraVoucher.voucherType;
    } else {
      throw new Error('Unsupported cash and bank transaction type.');
    }

    return buildVoucher({
      voucherType,
      dateBS,
      narration,
      entries,
      amount: value,
      user,
      school,
      session,
      idempotencyKey,
      transactionDetails,
    });
  });
}

async function createJournalVoucher({ dateBS, narration, submittedEntries, idempotencyKey, user }) {
  if (!idempotencyKey || String(idempotencyKey).length > 100) {
    throw new Error('A valid transaction idempotency key is required. Reload the form and submit again.');
  }
  const description = String(narration || '').trim();
  if (!description || description.length > 500) throw new Error('Enter a narration of no more than 500 characters.');
  return withAccountingTransaction(async session => {
    const existing = await JournalVoucher.findOne({ idempotencyKey }).session(session);
    if (existing) return existing;
    const school = await schoolSettings(session);
    const date = dateFromBS(dateBS);
    assertOpenFiscalYear(date.dateBS, school);
    const accountIds = [...new Set((submittedEntries || [])
      .map(entry => String(entry?.ledger || '').trim())
      .filter(mongoose.isValidObjectId))];
    const ledgers = accountIds.length
      ? await AccountLedger.find({ _id: { $in: accountIds }, isActive: { $ne: false } }).session(session).lean()
      : [];
    const validated = validateJournalEntries(submittedEntries, ledgers);
    if (validated.error) throw new Error(validated.error);
    return buildVoucher({
      voucherType: 'JOURNAL',
      dateBS: date.dateBS,
      narration: description,
      entries: validated.entries,
      amount: validated.totalDebit,
      user,
      school,
      session,
      idempotencyKey,
    });
  });
}

async function prepareStudentPaymentEntries({ studentId, amount, depositLedgerId, mode, school, session }) {
  const expectedType = mode === 'BANK' ? 'bank' : mode === 'CASH' ? 'cash' : '';
  if (!expectedType) throw new Error('Choose Cash or Bank as the payment method.');
  const depositLedger = await activeCashBankLedger(depositLedgerId, expectedType, session);
  const receivable = await loadSettingsLedger(
    school.accountsReceivableLedger,
    'ASSET',
    'accounts receivable',
    session
  );
  const advance = await loadSettingsLedger(
    school.studentAdvanceLedger,
    'LIABILITY',
    'student advance',
    session
  );
  const outstanding = await Invoice.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        status: { $in: ['UNPAID', 'PARTIAL'] },
        isCancelled: false,
        journalVoucher: { $type: 'objectId' },
      },
    },
    { $group: { _id: null, balance: { $sum: '$balanceDue' } } },
  ]).session(session);
  const outstandingMinor = Math.max(0, Math.round(Number(outstanding[0]?.balance || 0) * 100));
  const amountMinor = amountMinorUnits(amount);
  const toReceivable = Math.min(amountMinor, outstandingMinor);
  const entries = [{ ledger: depositLedger._id, debit: amountMinor / 100, credit: 0 }];
  if (toReceivable > 0) entries.push({ ledger: receivable._id, debit: 0, credit: toReceivable / 100 });
  if (amountMinor > toReceivable) entries.push({ ledger: advance._id, debit: 0, credit: (amountMinor - toReceivable) / 100 });
  return { entries, depositLedger, amountMinor };
}

async function finalizeStudentPayment(voucher, session, user) {
  const request = voucher.paymentRequest;
  if (!request?.student || !request.depositLedger || !request.amount) {
    throw new Error('The saved student receipt request is incomplete.');
  }
  const student = await Student.findById(request.student).session(session);
  if (!student) throw new Error('The student for this receipt no longer exists.');
  const school = await schoolSettings(session);
  const prepared = await prepareStudentPaymentEntries({
    studentId: student._id,
    amount: request.amount,
    depositLedgerId: request.depositLedger,
    mode: request.mode,
    school,
    session,
  });

  const unpaidInvoices = await Invoice.find({
    student: student._id,
    status: { $in: ['UNPAID', 'PARTIAL'] },
    isCancelled: false,
  }).sort({ billDateAD: 1 }).session(session);
  let remaining = prepared.amountMinor;
  let allocatedToPostedReceivables = 0;
  const allocations = [];
  for (const invoice of unpaidInvoices) {
    if (remaining <= 0) break;
    const owed = Math.max(0, Math.round(Number(invoice.balanceDue || 0) * 100));
    const applied = Math.min(owed, remaining);
    if (!applied) continue;
    invoice.paidAmount = (Math.round(Number(invoice.paidAmount || 0) * 100) + applied) / 100;
    invoice.balanceDue = (owed - applied) / 100;
    invoice.status = invoice.balanceDue === 0 ? 'PAID' : 'PARTIAL';
    await invoice.save({ session });
    allocations.push({ invoice: invoice._id, amountApplied: applied / 100 });
    if (invoice.journalVoucher) allocatedToPostedReceivables += applied;
    remaining -= applied;
  }

  const schoolForReceipt = school;
  const fiscal = formatFiscalYearBS(voucher.dateBS);
  if (!fiscal) throw new Error('The receipt date does not identify a valid BS fiscal year.');
  const sequence = await getNextSequence(`receipt_${fiscal.replace('/', '_')}`, session);
  const receiptNumber = `${schoolForReceipt.receiptPrefix || 'RCT'}-${fiscal.replace('/', '')}-${String(sequence).padStart(6, '0')}`;
  const totalAllocatedMinor = allocations.reduce(
    (sum, allocation) => sum + Math.round(allocation.amountApplied * 100),
    0
  );
  const advanceBreakdown = calculateStudentPaymentAdvance({
    amountMinor: prepared.amountMinor,
    totalAllocatedMinor,
    postedReceivableMinor: allocatedToPostedReceivables,
  });
  const payment = new Payment({
    receiptNumber,
    student: student._id,
    amount: prepared.amountMinor / 100,
    paymentDateAD: voucher.dateAD,
    paymentDateBS: voucher.dateBS,
    mode: request.mode,
    allocations,
    collectedBy: String(user.teacherName || user.username || ''),
    collectedByUser: voucher.submittedBy,
    remarks: request.remarks || '',
    depositLedger: request.depositLedger,
    journalVoucher: voucher._id,
    idempotencyKey: voucher.idempotencyKey,
    referenceNumber: request.referenceNumber || '',
    advanceAmount: advanceBreakdown.advanceMinor / 100,
    unmappedReceivableAmount: advanceBreakdown.unmappedReceivableMinor / 100,
  });
  await payment.save({ session });

  const balanceAfter = await getStudentBalance(student._id, session) - prepared.amountMinor / 100;
  await LedgerEntry.create([{
    student: student._id,
    date: voucher.dateAD,
    type: 'CREDIT',
    amount: prepared.amountMinor / 100,
    referenceType: 'PAYMENT',
    referenceId: payment._id,
    description: `Receipt ${receiptNumber}`,
    runningBalance: balanceAfter,
  }], { session });

  const advanceMinor = prepared.amountMinor - allocatedToPostedReceivables;
  const receivable = await loadSettingsLedger(school.accountsReceivableLedger, 'ASSET', 'accounts receivable', session);
  const actualEntries = [{ ledger: prepared.depositLedger._id, debit: prepared.amountMinor / 100, credit: 0 }];
  if (allocatedToPostedReceivables > 0) {
    actualEntries.push({ ledger: receivable._id, debit: 0, credit: allocatedToPostedReceivables / 100 });
  }
  if (advanceMinor > 0) {
    const advance = await loadSettingsLedger(school.studentAdvanceLedger, 'LIABILITY', 'student advance', session);
    actualEntries.push({ ledger: advance._id, debit: 0, credit: advanceMinor / 100 });
  }

  voucher.entries = actualEntries;
  voucher.totalDebit = prepared.amountMinor / 100;
  voucher.totalCredit = prepared.amountMinor / 100;
  voucher.sourceType = 'FEE_RECEIPT';
  voucher.sourceId = payment._id;
  voucher.paymentRequest.payment = payment._id;
  return payment;
}

async function submitStudentPayment({
  studentId,
  amount,
  paymentDateBS,
  mode,
  depositLedgerId,
  collectedBy,
  remarks,
  referenceNumber,
  idempotencyKey,
  user,
}) {
  if (!idempotencyKey || String(idempotencyKey).length > 100) {
    throw new Error('A valid transaction idempotency key is required. Reload the form and submit again.');
  }
  if (!mongoose.isValidObjectId(studentId)) throw new Error('Choose a valid student.');
  actorId(user);

  return withAccountingTransaction(async session => {
    const existing = await JournalVoucher.findOne({ idempotencyKey }).session(session);
    if (existing) return { voucher: existing, payment: existing.paymentRequest?.payment || null };
    const student = await Student.findById(studentId).session(session);
    if (!student) throw new Error('Student not found.');
    const school = await schoolSettings(session);
    const { entries, amountMinor } = await prepareStudentPaymentEntries({
      studentId,
      amount,
      depositLedgerId,
      mode,
      school,
      session,
    });
    const date = dateFromBS(paymentDateBS);
    assertOpenFiscalYear(date.dateBS, school);
    const voucher = await buildVoucher({
      voucherType: 'FEE_RECEIPT',
      dateBS: paymentDateBS,
      narration: String(remarks || '').trim() || `Fee receipt for ${student.name}`,
      entries,
      amount: amountMinor / 100,
      user,
      school,
      session,
      idempotencyKey,
      paymentRequest: {
        student: student._id,
        amount: amountMinor / 100,
        mode,
        depositLedger: depositLedgerId,
        referenceNumber: String(referenceNumber || '').trim(),
        remarks: String(remarks || '').trim(),
      },
      transactionDetails: {
        partyName: student.name,
        amount: amountMinor / 100,
        paymentMethod: mode,
        cashBankLedger: depositLedgerId,
        referenceNumber: String(referenceNumber || '').trim(),
      },
    });

    if (voucher.status === 'POSTED') {
      const payment = await finalizeStudentPayment(voucher, session, user);
      await voucher.save({ session });
      return { voucher, payment };
    }
    return { voucher, payment: null };
  });
}

async function changeVoucherApproval(voucherId, action, user, reason = '') {
  return withAccountingTransaction(async session => {
    const voucher = await JournalVoucher.findById(voucherId).session(session);
    if (!voucher) throw new Error('Voucher not found.');
    if (action === 'REVIEW') {
      if (user.role !== 'ACCOUNTANT' || voucher.status !== 'PENDING_ACCOUNTANT_REVIEW') {
        throw new Error('Only an accountant can review a voucher awaiting accountant review.');
      }
      voucher.status = 'PENDING_ADMIN_APPROVAL';
      voucher.reviewedBy = actorId(user);
      voucher.auditEvents.push(auditEvent('ACCOUNTANT_REVIEWED', user));
    } else if (action === 'APPROVE') {
      if (user.role !== 'ADMIN' || voucher.status !== 'PENDING_ADMIN_APPROVAL') {
        throw new Error('Only an administrator can approve a voucher awaiting administrator approval.');
      }
      const school = await schoolSettings(session);
      assertOpenFiscalYear(voucher.dateBS, school);
      if (!voucher.paymentRequest?.student) {
        const accountIds = [...new Set(voucher.entries.map(entry => String(entry.ledger)))];
        const activeAccounts = await AccountLedger.countDocuments({
          _id: { $in: accountIds },
          isActive: { $ne: false },
        }).session(session);
        if (activeAccounts !== accountIds.length) {
          throw new Error('A ledger on this pending voucher has since been deactivated. Reject it and submit a corrected voucher.');
        }
      }
      if (voucher.paymentRequest?.student) await finalizeStudentPayment(voucher, session, user);
      voucher.status = 'POSTED';
      voucher.approvedBy = actorId(user);
      voucher.postedBy = actorId(user);
      voucher.auditEvents.push(auditEvent('APPROVED_AND_POSTED', user));
    } else if (action === 'REJECT') {
      const mayReject = (user.role === 'ACCOUNTANT' && voucher.status === 'PENDING_ACCOUNTANT_REVIEW')
        || (user.role === 'ADMIN' && voucher.status === 'PENDING_ADMIN_APPROVAL');
      if (!mayReject) throw new Error('You are not authorized to reject this voucher at its current stage.');
      const rejectionReason = String(reason || '').trim();
      if (!rejectionReason) throw new Error('A rejection reason is required.');
      voucher.status = 'REJECTED';
      voucher.rejectedBy = actorId(user);
      voucher.rejectionReason = rejectionReason;
      voucher.auditEvents.push(auditEvent('REJECTED', user, rejectionReason));
    } else {
      throw new Error('Unsupported voucher approval action.');
    }
    await voucher.save({ session });
    return voucher;
  });
}

async function reversePostedVoucher(voucherId, dateBS, reason, user) {
  if (user.role !== 'ADMIN') throw new Error('Only an administrator can reverse a posted voucher.');
  const description = String(reason || '').trim();
  if (!description) throw new Error('A reversal reason is required.');

  return withAccountingTransaction(async session => {
    const original = await JournalVoucher.findById(voucherId).session(session);
    if (!original || original.status !== 'POSTED') throw new Error('Only a posted voucher can be reversed.');
    if (original.reversedBy) throw new Error('This voucher has already been reversed.');
    const school = await schoolSettings(session);
    const date = dateFromBS(dateBS);
    assertOpenFiscalYear(date.dateBS, school);
    const reversal = await buildVoucher({
      voucherType: 'REVERSAL',
      dateBS,
      narration: `Reversal of ${original.voucherNumber}: ${description}`,
      entries: original.entries.map(entry => ({
        ledger: entry.ledger,
        debit: entry.credit,
        credit: entry.debit,
      })),
      amount: original.totalDebit,
      user,
      school,
      session,
      sourceType: 'REVERSAL',
      sourceId: original._id,
    });
    reversal.reversalOf = original._id;
    await reversal.save({ session });

    if (original.paymentRequest?.payment) {
      const payment = await Payment.findById(original.paymentRequest.payment).session(session);
      if (!payment || payment.isReversed) throw new Error('The fee receipt is missing or already reversed.');
      for (const allocation of payment.allocations || []) {
        const invoice = await Invoice.findById(allocation.invoice).session(session);
        if (!invoice) throw new Error('An invoice allocated by this receipt no longer exists.');
        const amount = Math.round(Number(allocation.amountApplied || 0) * 100) / 100;
        invoice.paidAmount = Math.max(0, Math.round(Number(invoice.paidAmount || 0) * 100) / 100 - amount);
        invoice.balanceDue = Math.round((Number(invoice.balanceDue || 0) + amount) * 100) / 100;
        invoice.status = invoice.balanceDue === 0 ? 'PAID' : invoice.paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
        await invoice.save({ session });
      }
      if (Number(payment.advanceApplied || 0) > 0) {
        throw new Error('Reverse invoices using this student advance before reversing the receipt.');
      }
      payment.isReversed = true;
      payment.reversalReason = description;
      await payment.save({ session });
      const balanceAfter = await getStudentBalance(payment.student, session) + Number(payment.amount);
      await LedgerEntry.create([{
        student: payment.student,
        date: reversal.dateAD,
        type: 'DEBIT',
        amount: payment.amount,
        referenceType: 'ADJUSTMENT',
        referenceId: reversal._id,
        description: `Reversal of receipt ${payment.receiptNumber}: ${description}`,
        runningBalance: balanceAfter,
      }], { session });
    } else if (original.sourceType === 'FEE_INVOICE' && original.sourceId) {
      const invoice = await Invoice.findById(original.sourceId).session(session);
      if (!invoice || invoice.isCancelled) throw new Error('The fee invoice is missing or already cancelled.');
      if (await Payment.exists({ 'allocations.invoice': invoice._id, isReversed: false }).session(session)) {
        throw new Error('Reverse allocated payments before reversing this invoice.');
      }
      for (const allocation of invoice.advanceAllocations || []) {
        const payment = await Payment.findById(allocation.payment).session(session);
        if (!payment || payment.isReversed) continue;
        payment.advanceApplied = Math.max(
          0,
          Math.round((Number(payment.advanceApplied || 0) - Number(allocation.amountApplied || 0)) * 100) / 100
        );
        await payment.save({ session });
      }
      invoice.isCancelled = true;
      invoice.cancelReason = description;
      await invoice.save({ session });
      const balanceAfter = await getStudentBalance(invoice.student, session) - Number(invoice.currentTotal);
      await LedgerEntry.create([{
        student: invoice.student,
        date: reversal.dateAD,
        type: 'CREDIT',
        amount: invoice.currentTotal,
        referenceType: 'ADJUSTMENT',
        referenceId: reversal._id,
        description: `Reversal of invoice ${invoice.invoiceNumber}: ${description}`,
        runningBalance: balanceAfter,
      }], { session });
    }

    original.reversedBy = reversal._id;
    original.auditEvents.push(auditEvent('REVERSED', user, description));
    await original.save({ session });
    return reversal;
  });
}

async function closeFiscalYear(fiscalYearBS, user) {
  if (user.role !== 'ADMIN') throw new Error('Only an administrator can close a fiscal year.');
  const fiscalYear = String(fiscalYearBS || '').trim();
  const yearMatch = /^(\d{4})\/\d{3}$/.exec(fiscalYear);
  if (!yearMatch) throw new Error('Choose a valid fiscal year in YYYY/YYY BS format.');
  const startYear = Number(yearMatch[1]);
  const endYear = startYear + 1;
  const closeDateDays = bs.NepaliDate.dateConfigMap[String(endYear)]?.Chaitra;
  if (!closeDateDays) throw new Error(`The BS calendar for fiscal year ${fiscalYear} is unavailable.`);
  const closingDateBS = `${endYear}-03-${String(closeDateDays).padStart(2, '0')}`;
  const start = dateFromBS(`${startYear}-04-01`);
  const closing = dateFromBS(closingDateBS);
  const endExclusive = dateFromBS(`${endYear}-04-01`);

  return withAccountingTransaction(async session => {
    const school = await schoolSettings(session);
    if (school.currentFiscalYearBS !== fiscalYear) {
      throw new Error('Only the configured current fiscal year can be closed.');
    }
    if ((school.closedFiscalYearsBS || []).includes(fiscalYear)
      || await FiscalYearClose.exists({ fiscalYearBS: fiscalYear }).session(session)) {
      throw new Error(`Fiscal year ${fiscalYear} has already been closed.`);
    }
    const retainedEarnings = await loadSettingsLedger(
      school.retainedEarningsLedger,
      'EQUITY',
      'retained earnings',
      session
    );
    const balances = await JournalVoucher.aggregate([
      { $match: { status: 'POSTED', dateAD: { $gte: start.dateAD, $lt: endExclusive.dateAD } } },
      { $unwind: '$entries' },
      { $group: {
        _id: '$entries.ledger',
        debit: { $sum: '$entries.debit' },
        credit: { $sum: '$entries.credit' },
      } },
    ]).session(session);
    const ids = balances.map(balance => balance._id);
    const ledgerDocs = ids.length ? await AccountLedger.find({ _id: { $in: ids } }).session(session).lean() : [];
    const ledgersById = new Map(ledgerDocs.map(ledger => [String(ledger._id), ledger]));
    const entryRows = [];
    let incomeNetMinor = 0;
    let expenseNetMinor = 0;

    for (const balance of balances) {
      const ledger = ledgersById.get(String(balance._id));
      if (!ledger || !['INCOME', 'EXPENSE'].includes(ledger.nature)) continue;
      const debitMinor = Math.round(Number(balance.debit || 0) * 100);
      const creditMinor = Math.round(Number(balance.credit || 0) * 100);
      const netMinor = ledger.nature === 'INCOME'
        ? creditMinor - debitMinor
        : debitMinor - creditMinor;
      if (ledger.nature === 'INCOME') incomeNetMinor += netMinor;
      else expenseNetMinor += netMinor;
      if (netMinor > 0) {
        entryRows.push({
          ledger: ledger._id,
          debit: ledger.nature === 'INCOME' ? netMinor / 100 : 0,
          credit: ledger.nature === 'EXPENSE' ? netMinor / 100 : 0,
        });
      } else if (netMinor < 0) {
        entryRows.push({
          ledger: ledger._id,
          debit: ledger.nature === 'EXPENSE' ? Math.abs(netMinor) / 100 : 0,
          credit: ledger.nature === 'INCOME' ? Math.abs(netMinor) / 100 : 0,
        });
      }
    }

    const profitOrLossMinor = incomeNetMinor - expenseNetMinor;
    if (profitOrLossMinor > 0) {
      entryRows.push({ ledger: retainedEarnings._id, debit: 0, credit: profitOrLossMinor / 100 });
    } else if (profitOrLossMinor < 0) {
      entryRows.push({ ledger: retainedEarnings._id, debit: Math.abs(profitOrLossMinor) / 100, credit: 0 });
    }

    const closingRecord = new FiscalYearClose({
      fiscalYearBS: fiscalYear,
      closingDateBS,
      closingDateAD: closing.dateAD,
      retainedEarningsLedger: retainedEarnings._id,
      profitOrLoss: profitOrLossMinor / 100,
      closedBy: actorId(user),
    });
    await closingRecord.save({ session });

    if (entryRows.length >= 2) {
      const voucher = await buildVoucher({
        voucherType: 'CLOSING',
        dateBS: closingDateBS,
        narration: `Close income and expense accounts for ${fiscalYear}`,
        entries: entryRows,
        amount: Math.max(
          entryRows.reduce((sum, entry) => sum + entry.debit, 0),
          entryRows.reduce((sum, entry) => sum + entry.credit, 0)
        ),
        user,
        school,
        session,
        sourceType: 'FISCAL_YEAR_CLOSE',
        sourceId: closingRecord._id,
      });
      closingRecord.closingVoucher = voucher._id;
    }

    const permanentBalances = await JournalVoucher.aggregate([
      { $match: { status: 'POSTED', dateAD: { $lt: endExclusive.dateAD } } },
      { $unwind: '$entries' },
      { $group: {
        _id: '$entries.ledger',
        debit: { $sum: '$entries.debit' },
        credit: { $sum: '$entries.credit' },
      } },
    ]).session(session);
    const permanentIds = permanentBalances.map(balance => balance._id);
    const permanentLedgers = permanentIds.length
      ? await AccountLedger.find({ _id: { $in: permanentIds }, nature: { $in: ['ASSET', 'LIABILITY', 'EQUITY'] } }).session(session).lean()
      : [];
    const permanentNature = new Set(permanentLedgers.map(ledger => String(ledger._id)));
    closingRecord.openingBalances = permanentBalances
      .filter(balance => permanentNature.has(String(balance._id)))
      .map(balance => ({
        ledger: balance._id,
        amount: Math.round((Number(balance.debit || 0) - Number(balance.credit || 0)) * 100) / 100,
      }));
    await closingRecord.save({ session });

    school.closedFiscalYearsBS = [...new Set([...(school.closedFiscalYearsBS || []), fiscalYear])];
    school.currentFiscalYearBS = `${endYear}/${String(endYear + 1).slice(-3).padStart(3, '0')}`;
    await school.save({ session });
    return closingRecord;
  });
}

module.exports = {
  activeCashBankLedger,
  applyStudentAdvances,
  assertOpenFiscalYear,
  assertTransactionSupport,
  changeVoucherApproval,
  closeFiscalYear,
  createCashBankVoucher,
  createJournalVoucher,
  dateFromBS,
  getInvoiceLedgerRows,
  loadActiveLedger,
  loadSettingsLedger,
  postInvoiceVoucher,
  reversePostedVoucher,
  submitStudentPayment,
  transactionUnavailableMessage,
  withAccountingTransaction,
};
