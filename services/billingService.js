const mongoose = require('mongoose');
const Student = require('../model/billingschema/Student');
const FeeStructure = require('../model/billingschema/feestructureschema');

const Discount = require('../model/billingschema/Discount');
const Invoice = require('../model/billingschema/Invoice');
const Payment = require('../model/billingschema/Payment');
const LedgerEntry = require('../model/billingschema/LedgerEntry');
const OpeningBalance = require('../model/billingschema/OpeningBalance');
const School = require('../model/billingschema/School');
const { getNextSequence } = require('../model/billingschema/Counter');

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
  }).populate('feeCategory');

  const discounts = await Discount.find({
    student: studentId,
    $or: [{ validToAD: { $exists: false } }, { validToAD: { $gte: billDateAD } }],
  });

  const currentItems = [];

  for (const fs of structures) {
    const feeCategory = fs.feeCategory;
    if (!feeCategory) continue;

    const freq = feeCategory.frequency;
    const include = freq === 'MONTHLY' || (freq === 'ONE_TIME' && isAdmissionMonth);
    if (!include) continue;

    let amount = fs.amount;
    const matchingDiscount = discounts.find(
      (d) => !d.feeCategory || String(d.feeCategory) === String(feeCategory._id)
    );
    if (matchingDiscount) {
      amount =
        matchingDiscount.type === 'PERCENTAGE'
          ? amount - (amount * matchingDiscount.value) / 100
          : amount - matchingDiscount.value;
    }

    currentItems.push({
      feeCategory: feeCategory._id,
      label: `${feeCategory.name}${freq === 'MONTHLY' ? ' - ' + billMonthBS : ''}`,
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
