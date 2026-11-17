const mongoose = require('mongoose');
const Student = require('../model/billingschema/Student');
const AcademicSession = require('../model/billingschema/AcademicSession');
const FeeStructure = require('../model/billingschema/feestructureschema');
const { feeheadModel } = require('../model/billingschema/feeheadschema');
const { classSchema } = require('../model/adminschema');

const Discount = require('../model/billingschema/Discount');
const Invoice = require('../model/billingschema/Invoice');
const Payment = require('../model/billingschema/Payment');
const LedgerEntry = require('../model/billingschema/LedgerEntry');
const OpeningBalance = require('../model/billingschema/OpeningBalance');
const School = require('../model/billingschema/School');
const Transport = require('../model/billingschema/transport');
const { getNextSequence } = require('../model/billingschema/Counter');
const AccountLedger = require('../model/billingschema/AccountLedger');
const {
  assertOpenFiscalYear,
  applyStudentAdvances,
  dateFromBS,
  getInvoiceLedgerRows,
  postInvoiceVoucher,
  submitStudentPayment,
  withAccountingTransaction,
} = require('./accountingService');
const { formatFiscalYearBS } = require('../utils/accounting');
const {
  buildFeeHeadOptions,
  createInvoiceGenerationKey,
  isValidBillingMonth,
  normalizeBillingMonth,
  selectInvoiceFeeItems,
} = require('../utils/billingFeeSelection');
const StudentClass = mongoose.models.studentClass
  || mongoose.model('studentClass', classSchema, 'classlist');

const isDiscountActiveOnDate = (entry, dateAD) =>
  (!entry.validFromAD || entry.validFromAD <= dateAD)
  && (!entry.validToAD || entry.validToAD >= dateAD);

async function loadMonthlyInvoiceFeeOptions(student, billMonthBS, date, session) {
  let structureQuery = FeeStructure.find({
    academicSession: student.academicSession,
    class: student.class._id,
  });
  let feeHeadQuery = feeheadModel.find({}).populate({
    path: 'incomeLedger',
    model: AccountLedger,
    select: 'code name nature isActive',
  });
  let discountQuery = Discount.find({ student: student._id }).lean();
  let transportQuery = student.usesSchoolBus && student.transportRoute
    ? Transport.findOne({ _id: student.transportRoute, academicSession: student.academicSession }).lean()
    : Promise.resolve(null);
  if (session) {
    structureQuery = structureQuery.session(session);
    feeHeadQuery = feeHeadQuery.session(session);
    discountQuery = discountQuery.session(session);
    if (student.usesSchoolBus && student.transportRoute) {
      transportQuery = transportQuery.session(session);
    }
  }
  const [structures, feeHeads, discounts, transportRoute] = await Promise.all([
    structureQuery,
    feeHeadQuery,
    discountQuery,
    transportQuery,
  ]);
  const discountEntries = discounts
    .flatMap(discount => discount.title || [])
    .filter(entry => isDiscountActiveOnDate(entry, date.dateAD));
  return buildFeeHeadOptions(structures, {
    feeHeads,
    billMonthBS,
    billDateAD: date.dateAD,
    admissionDateAD: student.admissionDateAD,
    discounts: discountEntries,
    transport: transportRoute
      ? { fee: Number(transportRoute.transportFee), routeName: transportRoute.routeName }
      : null,
  });
}

async function getMonthlyInvoiceFeeOptions({ studentId, billMonthBS, billDateBS }) {
  if (!mongoose.isValidObjectId(studentId)) throw new Error('Choose a valid student.');
  if (!isValidBillingMonth(billMonthBS)) throw new Error('Choose a valid BS billing month.');
  const date = dateFromBS(billDateBS);
  const student = await Student.findById(studentId).populate('class');
  if (!student) throw new Error('Student not found.');
  if (student.status !== 'ACTIVE') throw new Error('Fee selection is only available for active students.');
  const options = await loadMonthlyInvoiceFeeOptions(student, billMonthBS, date);
  return {
    student: {
      id: String(student._id),
      name: student.name,
      studentCode: student.studentCode,
    },
    feeHeads: options.map(option => ({
      ...option,
      incomeLedger: option.incomeLedger && typeof option.incomeLedger === 'object'
        ? {
          id: String(option.incomeLedger._id || option.incomeLedger),
          code: option.incomeLedger.code || '',
          name: option.incomeLedger.name || '',
          nature: option.incomeLedger.nature || '',
          isActive: option.incomeLedger.isActive !== false,
        }
        : option.incomeLedger ? { id: String(option.incomeLedger), code: '', name: '', nature: '', isActive: true } : null,
    })),
  };
}

async function getClassMonthlyInvoiceFeeOptions({
  classIds,
  academicSession,
  billMonthBS,
  billDateBS,
}) {
  const ids = [...new Set((Array.isArray(classIds) ? classIds : [classIds])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
  if (!ids.length || ids.some(id => !mongoose.isValidObjectId(id))) {
    throw new Error('Choose one or more valid classes and sections.');
  }
  if (!mongoose.isValidObjectId(academicSession)) throw new Error('Choose a valid academic session.');
  if (!isValidBillingMonth(billMonthBS)) throw new Error('Choose a valid BS billing month.');
  const date = dateFromBS(billDateBS);
  const [session, classes, students, feeHeads, structures] = await Promise.all([
    AcademicSession.findById(academicSession).lean(),
    StudentClass.find({ _id: { $in: ids }, studentClass: { $exists: true, $ne: '' } }).lean(),
    Student.find({
      status: 'ACTIVE',
      academicSession,
      class: { $in: ids },
    }).select('class academicSession name studentCode usesSchoolBus transportRoute').lean(),
    feeheadModel.find({}).populate({
      path: 'incomeLedger',
      model: AccountLedger,
      select: 'code name nature isActive',
    }).lean(),
    FeeStructure.find({ academicSession, class: { $in: ids } }).lean(),
  ]);
  if (!session) throw new Error('Choose a valid academic session.');
  if (classes.length !== ids.length) throw new Error('One or more selected classes are unavailable.');

  const routedStudentIds = students
    .filter(student => student.usesSchoolBus && student.transportRoute)
    .map(student => student.transportRoute);
  const validRoutes = routedStudentIds.length
    ? await Transport.find({
      _id: { $in: routedStudentIds },
      academicSession,
    }).distinct('_id')
    : [];
  const validRouteIds = new Set(validRoutes.map(String));
  const existingInvoices = await getExistingMonthlyInvoices(students, billMonthBS, billDateBS);

  return {
    classes: classes.map(classItem => {
      const classStudents = students.filter(student => String(student.class) === String(classItem._id));
      const classInvoices = classStudents.map(student => existingInvoices.get(
        createInvoiceGenerationKey(student._id, academicSession, billDateBS, billMonthBS)
      )).filter(Boolean);
      const alreadyBilledCount = classInvoices.length;
      const cancelledInvoiceCount = classInvoices.filter(invoice => invoice.isCancelled).length;
      const hasRouteUsers = classStudents.some(student => student.usesSchoolBus
        && student.transportRoute
        && validRouteIds.has(String(student.transportRoute)));
      const classStructures = structures.filter(structure => String(structure.class) === String(classItem._id));
      const feeOptions = buildFeeHeadOptions(classStructures, {
        feeHeads,
        billMonthBS,
        billDateAD: date.dateAD,
        admissionDateAD: null,
        transport: hasRouteUsers
          ? { routeSpecific: true, routeName: 'Saved student route (individual fare)' }
          : null,
      });
      return {
        id: String(classItem._id),
        name: classItem.studentClass,
        section: classItem.section || '',
        studentCount: classStudents.length,
        alreadyBilledCount,
        cancelledInvoiceCount,
        remainingStudentCount: classStudents.length - alreadyBilledCount,
        students: classStudents.map(student => {
          const existingInvoice = existingInvoices.get(
            createInvoiceGenerationKey(student._id, academicSession, billDateBS, billMonthBS)
          );
          return {
            id: String(student._id),
            name: student.name,
            studentCode: student.studentCode,
            alreadyBilled: Boolean(existingInvoice),
            invoiceNumber: existingInvoice?.invoiceNumber || '',
            invoiceCancelled: Boolean(existingInvoice?.isCancelled),
          };
        }),
        feeHeads: feeOptions.map(option => ({
          ...option,
          incomeLedger: option.incomeLedger && typeof option.incomeLedger === 'object'
            ? {
              id: String(option.incomeLedger._id || option.incomeLedger),
              code: option.incomeLedger.code || '',
              name: option.incomeLedger.name || '',
              nature: option.incomeLedger.nature || '',
              isActive: option.incomeLedger.isActive !== false,
            }
            : option.incomeLedger
              ? { id: String(option.incomeLedger), code: '', name: '', nature: '', isActive: true }
              : null,
        })),
      };
    }),
  };
}

async function getExistingMonthlyInvoices(students, billMonthBS, billDateBS) {
  const eligibleStudents = (students || [])
    .filter(student => student?._id && student?.academicSession)
  if (!eligibleStudents.length) return new Map();
  const studentIds = [...new Set(eligibleStudents.map(student => String(student._id)))];
  const sessionIds = [...new Set(eligibleStudents.map(student => String(student.academicSession)))];
  const billingYear = String(billDateBS || '').slice(0, 4);
  const invoices = await Invoice.find({
    student: { $in: studentIds },
    academicSession: { $in: sessionIds },
    billDateBS: new RegExp(`^${billingYear}-`),
  })
    .select('generationKey student academicSession billMonthBS billDateBS invoiceNumber isCancelled')
    .sort({ createdAt: -1 })
    .lean();
  const normalizedMonth = normalizeBillingMonth(billMonthBS);
  const existingByGenerationKey = new Map();
  invoices.forEach(invoice => {
    if (normalizeBillingMonth(invoice.billMonthBS) !== normalizedMonth) return;
    const key = createInvoiceGenerationKey(
      invoice.student,
      invoice.academicSession,
      invoice.billDateBS,
      invoice.billMonthBS
    );
    if (!existingByGenerationKey.has(key)) existingByGenerationKey.set(key, invoice);
  });
  return existingByGenerationKey;
}

async function getCurrentBalance(studentId, session) {
  const aggregation = LedgerEntry.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
        debits: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } },
        credits: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
      },
    },
  ]);
  if (session) aggregation.session(session);
  const result = await aggregation;
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

async function generateMonthlyInvoice({
  studentId,
  billMonthBS,
  billDateBS,
  selectedFeeHeadIds,
  feeHeadAmounts,
  skipUnavailableTransportFeeHeadIds = [],
  returnExistingStatus = false,
  user,
}) {
  if (!isValidBillingMonth(billMonthBS)) throw new Error('Choose a valid BS billing month.');
  const date = dateFromBS(billDateBS);
  let generationKey;
  try {
    const result = await withAccountingTransaction(async session => {
      const student = await Student.findById(studentId).populate('class').session(session);
      if (!student) throw new Error('Student not found');
      if (student.status !== 'ACTIVE') return { invoice: null, alreadyExists: false };
      generationKey = createInvoiceGenerationKey(studentId, student.academicSession, billDateBS, billMonthBS);
      const existing = await Invoice.findOne({ generationKey }).session(session);
      if (existing) return { invoice: existing, alreadyExists: true };
      if (date.dateAD < student.admissionDateAD) return { invoice: null, alreadyExists: false };

      const feeHeadOptions = await loadMonthlyInvoiceFeeOptions(student, billMonthBS, date, session);
      const currentItems = selectInvoiceFeeItems(feeHeadOptions, selectedFeeHeadIds, feeHeadAmounts, {
        skipUnavailableTransportFeeHeadIds,
      });
      if (!currentItems.length) return { invoice: null, alreadyExists: false };

      const currentTotal = currentItems.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;
      const school = await School.findOne().session(session);
      if (!school) throw new Error('Configure school billing settings before generating invoices.');
      assertOpenFiscalYear(date.dateBS, school);
      const incomeEntries = await getInvoiceLedgerRows(currentItems, session);
      const previousDue = await getCurrentBalance(studentId, session);
      const advanceAllocations = await applyStudentAdvances({
        studentId,
        currentTotal,
        previousDue,
        session,
      });
      const advanceApplied = advanceAllocations.reduce((sum, allocation) => sum + allocation.amountApplied, 0);
      const balanceDue = Math.max(0, Math.round((previousDue + currentTotal) * 100) / 100);
      const grandTotal = Math.round((balanceDue + advanceApplied) * 100) / 100;
      const fiscal = formatFiscalYearBS(date.dateBS);
      if (!fiscal) throw new Error('The bill date does not identify a valid BS fiscal year.');
      const sequence = await getNextSequence(`invoice_${fiscal.replace('/', '_')}`, session);
      const invoiceNumber = `${school.invoicePrefix || 'INV'}-${fiscal.replace('/', '')}-${String(sequence).padStart(6, '0')}`;
      const invoice = new Invoice({
        invoiceNumber,
        student: studentId,
        academicSession: student.academicSession,
        billMonthBS,
        billDateAD: date.dateAD,
        billDateBS: date.dateBS,
        generationKey,
        previousDue,
        currentItems,
        currentTotal,
        grandTotal,
        paidAmount: advanceApplied,
        balanceDue,
        advanceAllocations,
        status: balanceDue === 0 ? 'PAID' : advanceApplied > 0 ? 'PARTIAL' : 'UNPAID',
      });
      await invoice.save({ session });

      if (currentTotal > 0) {
        const runningBalance = Math.round((previousDue + currentTotal) * 100) / 100;
        await LedgerEntry.create([{
          student: studentId,
          date: date.dateAD,
          type: 'DEBIT',
          amount: currentTotal,
          referenceType: 'INVOICE',
          referenceId: invoice._id,
          description: `Invoice ${invoiceNumber}`,
          runningBalance,
        }], { session });
        const voucher = await postInvoiceVoucher(invoice, session, user, incomeEntries);
        invoice.journalVoucher = voucher._id;
      }
      return { invoice, alreadyExists: false };
    });
    return returnExistingStatus ? result : result.invoice;
  } catch (error) {
    if (error.code === 11000 && generationKey) {
      const existing = await Invoice.findOne({ generationKey });
      if (existing) return returnExistingStatus
        ? { invoice: existing, alreadyExists: true }
        : existing;
    }
    throw error;
  }
}

async function recordPayment(options) {
  const result = await submitStudentPayment(options);
  return result.payment || result.voucher;
}

module.exports = {
  getCurrentBalance,
  importOpeningBalance,
  generateMonthlyInvoice,
  getClassMonthlyInvoiceFeeOptions,
  getExistingMonthlyInvoices,
  getMonthlyInvoiceFeeOptions,
  recordPayment,
  submitStudentPayment,
};
