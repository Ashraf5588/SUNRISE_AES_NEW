const mongoose = require('mongoose');
const Student = require('../model/billingschema/Student');
const FeeStructure = require('../model/billingschema/feestructureschema');
const { feeheadModel } = require('../model/billingschema/feeheadschema');

const Discount = require('../model/billingschema/Discount');
const Invoice = require('../model/billingschema/Invoice');
const Payment = require('../model/billingschema/Payment');
const LedgerEntry = require('../model/billingschema/LedgerEntry');
const OpeningBalance = require('../model/billingschema/OpeningBalance');
const School = require('../model/billingschema/School');
const { getNextSequence } = require('../model/billingschema/Counter');

const normalizeMonth = (month) => {
  const normalized = String(month || '').trim().toLowerCase();
  return normalized === 'baishakh' ? 'baisakh' : normalized;
};

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

async function importOpeningBalance({ studentId, amount, asOfDateAD, sourceNote, enteredBy }) {
  if (!mongoose.isValidObjectId(studentId)) throw new Error('Select a valid student.');
  if (!Number.isFinite(Number(amount)) || Number(amount) === 0) throw new Error('Opening balance must be a non-zero amount.');
  const asOfDate = new Date(asOfDateAD);
  if (Number.isNaN(asOfDate.getTime())) throw new Error('Enter a valid as-of date.');
  if (await OpeningBalance.exists({ student: studentId })) {
    const error = new Error('An opening balance already exists for this student.');
    error.code = 'OPENING_BALANCE_EXISTS';
    throw error;
  }

  const opening = new OpeningBalance({
    student: studentId,
    amount: Number(amount),
    asOfDateAD: asOfDate,
    sourceNote: String(sourceNote || '').trim() || 'Migrated from previous billing software',
    enteredBy: String(enteredBy || '').trim(),
  });
  try {
    await opening.save();
  } catch (error) {
    if (error.code === 11000) {
      const duplicateError = new Error('An opening balance already exists for this student.');
      duplicateError.code = 'OPENING_BALANCE_EXISTS';
      throw duplicateError;
    }
    throw error;
  }

  try {
    await LedgerEntry.create({
      student: studentId,
      date: asOfDate,
      type: Number(amount) > 0 ? 'DEBIT' : 'CREDIT',
      amount: Math.abs(Number(amount)),
      referenceType: 'OPENING_BALANCE',
      referenceId: opening._id,
      description: opening.sourceNote,
      runningBalance: Number(amount),
    });
  } catch (error) {
    await OpeningBalance.deleteOne({ _id: opening._id });
    throw error;
  }

  return opening;
}

async function generateMonthlyInvoice({ studentId, billMonthBS, billDateAD, billDateBS }) {
  const student = await Student.findById(studentId).populate('class');
  if (!student) throw new Error('Student not found');
  if (student.status !== 'ACTIVE') return null;
  if (billDateAD < student.admissionDateAD) return null;

  const isAdmissionMonth =
    billDateAD.getFullYear() === student.admissionDateAD.getFullYear() &&
    billDateAD.getMonth() === student.admissionDateAD.getMonth();

  const structures = await FeeStructure.find({
    academicSession: student.academicSession,
    class: student.class._id,
  }).populate({ path: 'feeCategory', model: feeheadModel });

  const discounts = await Discount.find({ student: studentId }).lean();
  const discountEntries = discounts.flatMap((discount) => discount.title || []).filter((entry) => {
    const startsOnOrBeforeBillDate = !entry.validFromAD || entry.validFromAD <= billDateAD;
    const endsOnOrAfterBillDate = !entry.validToAD || entry.validToAD >= billDateAD;
    return startsOnOrBeforeBillDate && endsOnOrAfterBillDate;
  });

  const currentItems = [];

  for (const fs of structures) {
    const feeHead = fs.feeCategory;
    if (!feeHead) continue;

    const frequency = String(feeHead.frequency || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const appliedMonths = Array.isArray(feeHead.appliedmonth)
      ? feeHead.appliedmonth.map(normalizeMonth)
      : [];
    const normalizedBillMonth = normalizeMonth(billMonthBS);
    const isOneTime = ['one_time', 'onetime', 'annual', 'yearly'].includes(frequency);
    const include = appliedMonths.length
      ? appliedMonths.includes(normalizedBillMonth)
      : frequency === 'monthly' || (isOneTime && isAdmissionMonth);
    if (!include) continue;

    let amount = fs.amount;
    const matchingDiscount = discountEntries.find(
      (entry) => String(entry.feehead) === String(feeHead._id)
    );
    if (matchingDiscount) {
      amount =
        matchingDiscount.discountType === 'PERCENTAGE'
          ? amount - (amount * matchingDiscount.value) / 100
          : amount - matchingDiscount.value;
    }

    currentItems.push({
      feeCategory: feeHead._id,
      label: `${feeHead.feehead || feeHead.name || 'Fee'}${appliedMonths.length > 1 || frequency === 'monthly' ? ' - ' + billMonthBS : ''}`,
      amount,
    });
  }

  const currentTotal = currentItems.reduce((sum, item) => sum + item.amount, 0);
  const previousDue = await getCurrentBalance(studentId);
  const grandTotal = previousDue + currentTotal;

  const school = await School.findOne();
  const seq = await getNextSequence(`invoice_${(school && school.currentFiscalYearBS ? school.currentFiscalYearBS : '2082/083').replace('/', '_')}`);
  const invoiceNumber = `${(school && school.invoicePrefix) ? school.invoicePrefix : 'INV'}-${(school && school.currentFiscalYearBS ? school.currentFiscalYearBS : '2082/083').replace('/', '')}-${String(seq).padStart(6, '0')}`;

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

async function recordPayment({ studentId, amount, paymentDateAD, paymentDateBS, mode, collectedBy, remarks }) {
  const school = await School.findOne();
  const prefix = school && school.receiptPrefix ? school.receiptPrefix : 'RCT';
  const fiscal = school && school.currentFiscalYearBS ? school.currentFiscalYearBS : '2082/083';
  const seq = await getNextSequence(`receipt_${fiscal.replace('/', '_')}`);
  const receiptNumber = `${prefix}-${fiscal.replace('/', '')}-${String(seq).padStart(6, '0')}`;

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
