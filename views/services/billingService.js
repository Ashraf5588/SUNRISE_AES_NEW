const mongoose = require('mongoose');
const Student = require('../models/Student');
const FeeStructure = require('../models/FeeStructure');
const FeeCategory = require('../models/FeeCategory');
const Discount = require('../models/Discount');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const LedgerEntry = require('../models/LedgerEntry');
const OpeningBalance = require('../models/OpeningBalance');
const School = require('../models/School');
const { getNextSequence } = require('../models/Counter');

/**
 * Returns a student's current outstanding balance by summing the ledger -
 * this is the source of truth, independent of any cached field.
 */
async function getCurrentBalance(studentId) {
  const result = await LedgerEntry.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
        debits: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } },
        credits: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
      },
    },
  ]);
  if (!result.length) return 0;
  return result[0].debits - result[0].credits;
}

/**
 * One-time step when migrating a student from the old software.
 * Creates the OpeningBalance record AND the matching ledger DEBIT so the
 * student's history starts correctly. Call this once per migrated student
 * before any monthly billing runs.
 */
async function importOpeningBalance({ studentId, amount, asOfDateAD, sourceNote, enteredBy }) {
  const opening = await OpeningBalance.create({
    student: studentId,
    amount,
    asOfDateAD,
    sourceNote,
    enteredBy,
  });

  if (amount !== 0) {
    await LedgerEntry.create({
      student: studentId,
      date: asOfDateAD,
      type: amount > 0 ? 'DEBIT' : 'CREDIT',
      amount: Math.abs(amount),
      referenceType: 'OPENING_BALANCE',
      referenceId: opening._id,
      description: sourceNote || 'Opening balance from old system',
      runningBalance: amount,
    });
  }

  return opening;
}

/**
 * Generates the monthly pre-bill for one student.
 * Handles late admission automatically: if billDateAD is before the
 * student's admissionDateAD, no invoice is generated for that month.
 * ONE_TIME fee items (e.g. Admission Fee) are only included when
 * billDateAD falls in the same month as admissionDateAD.
 */
async function generateMonthlyInvoice({ studentId, billMonthBS, billDateAD, billDateBS }) {
  const student = await Student.findById(studentId).populate('class');
  if (!student) throw new Error('Student not found');
  if (student.status !== 'ACTIVE') return null;

  // Skip months before the student even joined - this is the core of the
  // "admission 3 months later" support.
  if (billDateAD < student.admissionDateAD) return null;

  const isAdmissionMonth =
    billDateAD.getFullYear() === student.admissionDateAD.getFullYear() &&
    billDateAD.getMonth() === student.admissionDateAD.getMonth();

  const structures = await FeeStructure.find({
    academicSession: student.academicSession,
    class: student.class._id,
  }).populate('feeCategory');

  const discounts = await Discount.find({
    student: studentId,
    $or: [{ validToAD: { $exists: false } }, { validToAD: { $gte: billDateAD } }],
  });

  const currentItems = [];

  for (const fs of structures) {
    const freq = fs.feeCategory.frequency;
    const include = freq === 'MONTHLY' || (freq === 'ONE_TIME' && isAdmissionMonth);
    if (!include) continue;

    let amount = fs.amount;
    const matchingDiscount = discounts.find(
      (d) => !d.feeCategory || String(d.feeCategory) === String(fs.feeCategory._id)
    );
    if (matchingDiscount) {
      amount =
        matchingDiscount.type === 'PERCENTAGE'
          ? amount - (amount * matchingDiscount.value) / 100
          : amount - matchingDiscount.value;
    }

    currentItems.push({
      feeCategory: fs.feeCategory._id,
      label: `${fs.feeCategory.name}${freq === 'MONTHLY' ? ' - ' + billMonthBS : ''}`,
      amount,
    });
  }

  const currentTotal = currentItems.reduce((sum, i) => sum + i.amount, 0);
  const previousDue = await getCurrentBalance(studentId);
  const grandTotal = previousDue + currentTotal;

  const school = await School.findOne();
  const seq = await getNextSequence(`invoice_${school.currentFiscalYearBS.replace('/', '_')}`);
  const invoiceNumber = `${school.invoicePrefix}-${school.currentFiscalYearBS.replace(
    '/',
    ''
  )}-${String(seq).padStart(6, '0')}`;

  const invoice = await Invoice.create({
    invoiceNumber,
    student: studentId,
    academicSession: student.academicSession,
    billMonthBS,
    billDateAD,
    billDateBS,
    previousDue,
    currentItems,
    currentTotal,
    grandTotal,
    paidAmount: 0,
    balanceDue: grandTotal,
    status: 'UNPAID',
  });

  // Only the NEW charge is debited - previousDue is already sitting in the
  // ledger from earlier periods, the invoice just displays it as a total.
  if (currentTotal > 0) {
    await LedgerEntry.create({
      student: studentId,
      date: billDateAD,
      type: 'DEBIT',
      amount: currentTotal,
      referenceType: 'INVOICE',
      referenceId: invoice._id,
      description: `Invoice ${invoiceNumber}`,
      runningBalance: grandTotal,
    });
  }

  return invoice;
}

/**
 * Records a payment and allocates it across the student's oldest unpaid
 * invoices first (FIFO) - handles both "pays exactly this month" and
 * "pays several months' dues at once".
 */
async function recordPayment({ studentId, amount, paymentDateAD, paymentDateBS, mode, collectedBy, remarks }) {
  const school = await School.findOne();
  const seq = await getNextSequence(`receipt_${school.currentFiscalYearBS.replace('/', '_')}`);
  const receiptNumber = `${school.receiptPrefix}-${school.currentFiscalYearBS.replace(
    '/',
    ''
  )}-${String(seq).padStart(6, '0')}`;

  const unpaidInvoices = await Invoice.find({
    student: studentId,
    status: { $in: ['UNPAID', 'PARTIAL'] },
    isCancelled: false,
  }).sort({ billDateAD: 1 });

  let remaining = amount;
  const allocations = [];

  for (const invoice of unpaidInvoices) {
    if (remaining <= 0) break;
    const owed = invoice.balanceDue;
    const applied = Math.min(owed, remaining);

    invoice.paidAmount += applied;
    invoice.balanceDue -= applied;
    invoice.status = invoice.balanceDue === 0 ? 'PAID' : 'PARTIAL';
    await invoice.save();

    allocations.push({ invoice: invoice._id, amountApplied: applied });
    remaining -= applied;
  }
  // Any leftover (overpayment/advance) is simply not allocated to an
  // invoice - it still reduces the ledger balance and shows as credit.

  const payment = await Payment.create({
    receiptNumber,
    student: studentId,
    amount,
    paymentDateAD,
    paymentDateBS,
    mode,
    allocations,
    collectedBy,
    remarks,
  });

  const balanceAfter = (await getCurrentBalance(studentId)) - amount;
  await LedgerEntry.create({
    student: studentId,
    date: paymentDateAD,
    type: 'CREDIT',
    amount,
    referenceType: 'PAYMENT',
    referenceId: payment._id,
    description: `Receipt ${receiptNumber}`,
    runningBalance: balanceAfter,
  });

  return payment;
}

module.exports = {
  getCurrentBalance,
  importOpeningBalance,
  generateMonthlyInvoice,
  recordPayment,
};
