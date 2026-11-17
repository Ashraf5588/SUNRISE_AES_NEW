const path = require("path");
const crypto = require('crypto');
const multer  = require('multer')
const fs= require("fs");
const express = require("express");
const bs = require("../../utils/bikramSambat");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../../utils/path");
const { studentSchema } = require("../../model/schema");
const { studentrecordschema } = require("../../model/adminschema");
const { classSchema, subjectSchema,terminalSchema,newsubjectSchema } = require("../../model/adminschema");
const {examSchema}= require("../../model/examschema");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentClassModel = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");

const bcrypt = require("bcrypt");
const {holiday} = require('../../model/holidayschema')
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const terminalModel = mongoose.model("terminal", terminalSchema, "terminal");
const { marksheetsetupschemaForAdmin ,routineSchema} = require("../../model/marksheetschema");
const teacherSchema = require("../../model/admin").teacherSchema;
const { onlineAttendanceSchema } = require("../../model/onlineattendanceschema");
const { fail } = require("assert");
const routineModel = mongoose.model("routine", routineSchema, "routine");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const Portfolio = require("../../model/portfolio");
const HealthRecord = require("../../model/nurseschema");
const onlineAttendance = mongoose.model("onlineAttendance", onlineAttendanceSchema, "onlineAttendance");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const usermodel = mongoose.model("users", teacherSchema, "users");

const {feeheadschema} = require("../../model/billingschema/feeheadschema");
const feeheadmodel = mongoose.model("FeeHead", feeheadschema, "feehead");
const feestructuremodel = require("../../model/billingschema/feestructureschema");
const AccountGroup = require("../../model/billingschema/AccountGroup");
const AccountLedger = require("../../model/billingschema/AccountLedger");
const { JournalVoucher, VoucherCounter } = require("../../model/billingschema/JournalVoucher");
const { formatVoucherNumber, validateJournalEntries } = require("../../utils/journalVoucher");
const { createJournalVoucher } = require('../../services/accountingService');
const {
  accountingVoucherNumber,
  formatVoucherType,
  getVoucherDisplayStatus,
} = require('../../utils/accounting');
const {
  calculateLedgerBalances,
  classifyCashBankLedger,
  getNormalBalanceLabel,
} = require("../../utils/cashBank");
const {
  ACCOUNT_NATURES,
  LEDGER_TYPES,
  getNormalBalance,
  normalizeAccountCode,
  normalizeAccountName,
  validateLedgerNature,
} = require("../../utils/accountingChart");

const Student = require('../../model/billingschema/Student');
const Class = require('../../model/billingschema/Class');
const Invoice = require('../../model/billingschema/Invoice');
const Payment = require('../../model/billingschema/Payment');
const AcademicSession = require('../../model/billingschema/AcademicSession');
const School = require('../../model/billingschema/School');
const {
  generateMonthlyInvoice,
  getClassMonthlyInvoiceFeeOptions,
  getExistingMonthlyInvoices,
  getMonthlyInvoiceFeeOptions,
  submitStudentPayment,
} = require('../../services/billingService');
const {
  createInvoiceGenerationKey,
  parseInvoiceAmount,
} = require('../../utils/billingFeeSelection');

exports.billingDashboard = async (req, res) => {
  try {
   const [studentCount, invoiceStats, paymentStats, recentPayments] = await Promise.all([
     studentRecord.countDocuments({ status: { $nin: ['Inactive', 'inactive'] } }),
    Invoice.aggregate([{ $group: { _id: null, billed: { $sum: '$grandTotal' }, outstanding: { $sum: '$balanceDue' }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $group: { _id: null, collected: { $sum: '$amount' } } }]),
    Payment.find().sort({ paymentDateAD: -1 }).limit(8).lean()
   ]);
   return res.render("./billingfirst/feedashboard", {
    title: "Billing Dashboard",
    studentCount,
    invoiceStats: invoiceStats[0] || { billed: 0, outstanding: 0, count: 0 },
    collected: paymentStats[0]?.collected || 0,
    recentPayments
   });
  }
  catch (error) {
    console.error("Error fetching billing data:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.feeHead = async (req, res) => {
  try {
    const [feeheads, incomeLedgers] = await Promise.all([
      feeheadmodel.find().populate('incomeLedger', 'name code nature isActive').sort({ createdAt: -1 }).lean(),
      AccountLedger.find({ nature: 'INCOME', isActive: { $ne: false } }).sort({ code: 1 }).lean(),
    ]);
    return res.render("./billingfirst/feehead", {
      title: "Fee Head",
      feeheads,
      incomeLedgers,
      editFeeHead: null
    });
  } 
  catch (error) {
    console.error("Error fetching fee head data:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.editFeeHead = async (req, res) => {
  try {
    const [feeheads, editFeeHead, incomeLedgers] = await Promise.all([
      feeheadmodel.find().populate('incomeLedger', 'name code nature isActive').sort({ createdAt: -1 }).lean(),
      feeheadmodel.findById(req.params.id).lean(),
      AccountLedger.find({ nature: 'INCOME', isActive: { $ne: false } }).sort({ code: 1 }).lean(),
    ]);

    if (!editFeeHead) {
      return res.status(404).send("Fee head not found");
    }

    return res.render("./billingfirst/feehead", {
      title: "Edit Fee Head",
      feeheads,
      incomeLedgers,
      editFeeHead
    });
  } catch (error) {
    console.error("Error loading fee head for editing:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.addFeeHead = async (req, res) => {
  try {
    const { feehead, reportname, frequency, group } = req.body;
    const incomeLedger = String(req.body.incomeLedger || '').trim();
    const appliedmonth = Array.isArray(req.body.appliedmonth)
      ? req.body.appliedmonth
      : req.body.appliedmonth
        ? [req.body.appliedmonth]
        : [];
    console.log("Received data:", { feehead, appliedmonth, reportname });
    console.log("body data", req.body);
    if (incomeLedger) {
      if (!mongoose.isValidObjectId(incomeLedger)
        || !await AccountLedger.exists({ _id: incomeLedger, nature: 'INCOME', isActive: { $ne: false } })) {
        return res.status(400).send('Select an active income ledger account.');
      }
    }

await feeheadmodel.create({
  feehead: feehead,
  appliedmonth: appliedmonth,
  reportname: reportname,
  frequency: frequency,
  group: group || 'General',
  incomeLedger: incomeLedger || null,
});
    res.redirect('/feehead');
  } catch (error) {
    console.error("Error adding fee head:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.updateFeeHead = async (req, res) => {
  try {
    const { feehead, reportname, frequency, group } = req.body;
    const incomeLedger = String(req.body.incomeLedger || '').trim();
    const appliedmonth = Array.isArray(req.body.appliedmonth)
      ? req.body.appliedmonth
      : req.body.appliedmonth
        ? [req.body.appliedmonth]
        : [];

    if (incomeLedger && (!mongoose.isValidObjectId(incomeLedger)
      || !await AccountLedger.exists({ _id: incomeLedger, nature: 'INCOME', isActive: { $ne: false } }))) {
      return res.status(400).send('Select an active income ledger account.');
    }

    await feeheadmodel.findByIdAndUpdate(req.params.id, {
      feehead,
      frequency,
      appliedmonth,
      reportname,
      group: group || 'General',
      incomeLedger: incomeLedger || null,
    }, { runValidators: true });

    res.redirect('/feehead');
  } catch (error) {
    console.error("Error updating fee head:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.deleteFeeHead = async (req, res) => {
  try {
    await feeheadmodel.findByIdAndDelete(req.params.id);
    res.redirect('/feehead');
  } catch (error) {
    console.error("Error deleting fee head:", error);
    res.status(500).send("Internal Server Error");
  }
};

const loadFeeStructureData = async (selectedSessionId = '') => {
  const [feeheads, feeStructures, billingClasses, legacyClasses, sessions] = await Promise.all([
    feeheadmodel.find().sort({ feehead: 1 }).lean(),
    feestructuremodel.find(selectedSessionId ? { academicSession: selectedSessionId } : {}).lean(),
    Class.find().sort({ order: 1, name: 1 }).lean(),
    studentClassModel.find({ studentClass: { $exists: true, $ne: '' } }).sort({ studentClass: 1 }).lean(),
    AcademicSession.find().sort({ startDateAD: -1 }).lean()
  ]);
  const classes = legacyClasses.length
    ? Array.from(
        legacyClasses.reduce((uniqueClasses, item) => {
          const className = String(item.studentClass || '').trim();
          const classKey = className.toLowerCase();
          if (className && !uniqueClasses.has(classKey)) {
            uniqueClasses.set(classKey, {
              ...item,
              name: className,
              order: uniqueClasses.size,
            });
          }
          return uniqueClasses;
        }, new Map()).values()
      )
    : billingClasses;

  const amounts = {};
  feeStructures.forEach((structure) => {
    amounts[`${structure.class}:${structure.feeCategory}`] = structure.amount;
  });

  return {
    feeheads,
    feeStructures,
    classes,
    sessions,
    selectedSessionId,
    amounts
  };
};

exports.feeStructure = async (req, res) => {
  try {
    return res.render('./billingfirst/feestructure', {
      title: 'Fee Structure',
      ...(await loadFeeStructureData(req.query.academicSession || ''))
    });
  } catch (error) {
    console.error('Error fetching fee structure data:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.addFeeStructure = async (req, res) => {
  try {
    const { academicSession, amounts = {} } = req.body;
    if (!academicSession) return res.status(400).send('Academic year is required');

    const [billingClasses, legacyClasses, feeheads] = await Promise.all([
      Class.find().select('_id'),
      studentClassModel.find({ studentClass: { $exists: true, $ne: '' } }).select('_id'),
      feeheadmodel.find().select('_id')
    ]);
    const classIds = new Set([...billingClasses, ...legacyClasses].map((item) => String(item._id)));
    const feeheadIds = new Set(feeheads.map((item) => String(item._id)));

    for (const [classId, classAmounts] of Object.entries(amounts)) {
      if (!classIds.has(classId) || !classAmounts || typeof classAmounts !== 'object') continue;
      for (const [feeheadId, rawAmount] of Object.entries(classAmounts)) {
        if (!feeheadIds.has(feeheadId)) continue;
        const amount = String(rawAmount).trim();
        const filter = { academicSession, class: classId, feeCategory: feeheadId };
        if (amount === '') {
          await feestructuremodel.deleteOne(filter);
          continue;
        }
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount < 0) continue;
        await feestructuremodel.updateOne(filter, { $set: { amount: numericAmount } }, { upsert: true });
      }
    }

    res.redirect(`/feestructure?academicSession=${encodeURIComponent(academicSession)}`);
  } catch (error) {
    console.error('Error adding fee structure:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.editFeeStructure = async (req, res) => {
  try {
    const structure = await feestructuremodel.findById(req.params.id).lean();
    if (!structure) return res.status(404).send('Fee structure not found');
    return res.redirect(`/feestructure?academicSession=${encodeURIComponent(structure.academicSession)}`);
  } catch (error) {
    console.error('Error loading fee structure for editing:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.updateFeeStructure = async (req, res) => {
  try {
    const { feeheadId, frequency, group, description, amount } = req.body;
    const feehead = await feeheadmodel.findById(feeheadId).lean();
    const forClasses = Array.isArray(req.body.forClasses)
      ? req.body.forClasses
      : req.body.forClasses ? [req.body.forClasses] : [];

    if (!feehead) {
      return res.status(400).send('Invalid fee head');
    }

    await feestructuremodel.findByIdAndUpdate(req.params.id, {
      feehead: feehead.feehead,
      feeheadId,
      forClasses,
      frequency,
      description,
      amount: Number(amount),
      group
    }, { runValidators: true });
    res.redirect('/feestructure');
  } catch (error) {
    console.error('Error updating fee structure:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.deleteFeeStructure = async (req, res) => {
  try {
    await feestructuremodel.findByIdAndDelete(req.params.id);
    res.redirect('/feestructure');
  } catch (error) {
    console.error('Error deleting fee structure:', error);
    res.status(500).send('Internal Server Error');
  }
};

const getInvoiceNumber = () => `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const nepaliMonths = ['Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

const invoicePageData = async (editInvoice = null) => {
  const [students, feeStructures, invoices] = await Promise.all([
    studentRecord.find({ status: { $nin: ['Inactive', 'inactive'] } }).sort({ studentClass: 1, section: 1, roll: 1 }).lean(),
    feestructuremodel.find().sort({ feehead: 1 }).lean(),
    Invoice.find().sort({ createdAt: -1 }).limit(100).lean()
  ]);
  return { students, feeStructures, invoices, nepaliMonths, editInvoice };
};

exports.feeInvoices = async (req, res) => {
  try {
    return res.render('./billingfirst/feeinvoices', { title: 'Fee Invoices', ...(await invoicePageData()) });
  } catch (error) {
    console.error('Error fetching fee invoices:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.addFeeInvoice = async (req, res) => {
  try {
    const student = await studentRecord.findById(req.body.studentId).lean();
    const structureIds = Array.isArray(req.body.feeStructureIds) ? req.body.feeStructureIds : [req.body.feeStructureIds].filter(Boolean);
    const structures = await feestructuremodel.find({ _id: { $in: structureIds } }).lean();
    const discount = Math.max(0, Number(req.body.discount) || 0);
    const items = structures.map((item) => ({ feehead: item.feehead, feeStructureId: item._id, amount: Number(item.amount) || 0 }));
    const totalAmount = Math.max(0, items.reduce((sum, item) => sum + item.amount, 0) - discount);

    if (!student || !items.length || !req.body.academicYear || !req.body.nepaliMonth) {
      return res.status(400).send('Student, academic year, month, and at least one fee are required');
    }

    const academicSession = await AcademicSession.findOne();
    if (!academicSession) {
      return res.status(400).send('An academic session is required');
    }

    await Invoice.create({
      invoiceNumber: getInvoiceNumber(),
      student: student._id,
      academicSession: academicSession._id,
      billMonthBS: req.body.nepaliMonth,
      billDateAD: new Date(),
      billDateBS: req.body.nepaliMonth,
      currentItems: items.map((item) => ({ label: item.feehead, amount: item.amount })),
      currentTotal: totalAmount,
      grandTotal: totalAmount,
      balanceDue: totalAmount,
    });
    res.redirect('/fee-invoices');
  } catch (error) {
    console.error('Error creating fee invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.viewFeeInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).send('Invoice not found');
    const payments = await Payment.find({ 'allocations.invoice': invoice._id }).sort({ paymentDateAD: -1 }).lean();
    return res.render('./billingfirst/feeinvoice', { title: invoice.invoiceNumber, invoice, payments });
  } catch (error) {
    console.error('Error loading fee invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.deleteFeeInvoice = async (req, res) => {
  try {
    const paymentCount = await Payment.countDocuments({ 'allocations.invoice': req.params.id });
    if (paymentCount) return res.status(400).send('Paid invoices cannot be deleted');
    await Invoice.findByIdAndUpdate(req.params.id, { isCancelled: true, cancelReason: 'Cancelled by administrator' });
    res.redirect('/fee-invoices');
  } catch (error) {
    console.error('Error deleting fee invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.feePayments = async (req, res) => {
  try {
    const paymentFilter = req.user.role === 'CASHIER' ? { collectedByUser: req.user._id } : {};
    const [invoices, payments, cashBankLedgers, todayBS] = await Promise.all([
      Invoice.find({ isCancelled: false, balanceDue: { $gt: 0 } }).populate('student', 'name studentCode').sort({ createdAt: -1 }).lean(),
      Payment.find(paymentFilter).populate('student', 'name studentCode').sort({ paymentDateAD: -1 }).limit(100).lean(),
      AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name').sort({ code: 1 }).lean(),
      Promise.resolve(String(bs.ADToBS(new Date()) || '').slice(0, 10)),
    ]);
    const cashBankAccounts = cashBankLedgers.filter(ledger => classifyCashBankLedger(ledger));
    return res.render('./billingfirst/feepayments', {
      title: 'Fee Payments',
      invoices,
      payments,
      cashBankAccounts,
      todayBS,
      idempotencyKey: crypto.randomBytes(24).toString('hex'),
      error: '',
    });
  } catch (error) {
    console.error('Error fetching fee payments:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.addFeePayment = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.body.invoiceId);
    const amount = req.body.amount;
    if (!invoice || Number(amount) <= 0 || (!req.body.paymentMethod || !req.body.depositLedgerId)) {
      return res.status(400).send('Invalid payment amount or invoice');
    }

    const result = await submitStudentPayment({
      studentId: invoice.student,
      amount,
      paymentDateBS: req.body.paymentDateBS,
      mode: req.body.paymentMethod,
      depositLedgerId: req.body.depositLedgerId,
      referenceNumber: req.body.referenceNumber,
      idempotencyKey: req.body.idempotencyKey,
      collectedBy: req.user?.teacherName || req.user?.username || '',
      remarks: req.body.remarks || '',
      user: req.user,
    });
    if (result.payment) return res.redirect(`/fee-receipts/${result.payment._id}`);
    return res.redirect('/accounting/vouchers?status=submitted');
  } catch (error) {
    console.error('Error recording fee payment:', error);
    const status = error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400;
    return res.status(status).send(error.message || 'Unable to record fee receipt.');
  }
};

exports.viewFeeReceipt = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student', 'name studentCode')
      .populate('allocations.invoice')
      .populate('depositLedger', 'code name')
      .lean();
    if (!payment) return res.status(404).send('Receipt not found');
    if (req.user.role === 'CASHIER' && String(payment.collectedByUser || '') !== String(req.user._id)) {
      return res.status(404).send('Receipt not found');
    }
    const school = await School.findOne().lean();
    return res.render('payments/receipt', { payment, school });
  } catch (error) {
    console.error('Error loading fee receipt:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.listInvoices = async (req, res) => {
  try {    const invoices = await Invoice.find().sort({ createdAt: -1 }).limit(200).lean();
    return res.render('billing/list', { title: 'Invoices', invoices });
  } catch (error) {
    console.error('Error loading invoices:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.showGenerateForm = async (req, res) => {
  try {
    const students = await studentRecord.find({ status: { $nin: ['Inactive', 'inactive'] } }).sort({ studentClass: 1, section: 1, roll: 1 }).lean();
    return res.render('billing/generate', { title: 'Generate Bills', students, sessions: [] });
  } catch (error) {
    console.error('Error loading bill generation form:', error);
    res.status(500).send('Internal Server Error');
  }
};



exports.listInvoices = async (req, res) => {
  const invoices = await Invoice.find().populate('student').sort({ billDateAD: -1 }).limit(200);
  res.render('billing/list', { invoices });
};

exports.showInvoicePrintPage = async (req, res) => {
  try {
    const [sessions, classes] = await Promise.all([
      AcademicSession.find().sort({ startDateAD: -1 }).lean(),
      studentClassModel.find({ studentClass: { $exists: true, $ne: '' } })
        .sort({ classorder: 1, studentClass: 1, section: 1 })
        .lean(),
    ]);
    const filters = {
      academicSession: String(req.query.academicSession || ''),
      billMonthBS: String(req.query.billMonthBS || ''),
      classId: String(req.query.classId || ''),
      studentId: String(req.query.studentId || ''),
    };
    const students = [];
    let invoices = [];
    let invoiceLimitReached = false;
    let error = '';
    const months = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
    const hasFilters = Object.values(filters).some(Boolean);

    if (hasFilters && (!filters.academicSession || !mongoose.isValidObjectId(filters.academicSession)
      || !filters.billMonthBS || !months.includes(filters.billMonthBS))) {
      error = 'Choose a valid academic session and billing month.';
    } else if (hasFilters && filters.classId && !mongoose.isValidObjectId(filters.classId)) {
      error = 'Choose a valid class or section.';
    } else if (hasFilters && filters.studentId && !mongoose.isValidObjectId(filters.studentId)) {
      error = 'Choose a valid student.';
    } else if (filters.academicSession && filters.billMonthBS) {
      const studentQuery = {
        academicSession: filters.academicSession,
        status: 'ACTIVE',
      };
      if (filters.classId) studentQuery.class = filters.classId;
      const matchingStudents = await Student.find(studentQuery)
        .populate('class', 'studentClass section')
        .sort({ name: 1 })
        .lean();
      students.push(...matchingStudents);
      if (filters.studentId && !matchingStudents.some(item => String(item._id) === filters.studentId)) {
        error = 'The selected student does not belong to this session and class.';
      } else {
        const studentIds = filters.studentId
          ? [filters.studentId]
          : matchingStudents.map(item => item._id);
        if (studentIds.length) {
          const [count, matchingInvoices] = await Promise.all([
            Invoice.countDocuments({
              academicSession: filters.academicSession,
              billMonthBS: filters.billMonthBS,
              student: { $in: studentIds },
              isCancelled: { $ne: true },
            }),
            Invoice.find({
              academicSession: filters.academicSession,
              billMonthBS: filters.billMonthBS,
              student: { $in: studentIds },
              isCancelled: { $ne: true },
            })
              .populate({ path: 'student', populate: { path: 'class' } })
              .populate('academicSession')
              .sort({ createdAt: -1 })
              .limit(1000)
              .lean(),
          ]);
          invoices = matchingInvoices;
          invoiceLimitReached = count > invoices.length;
        }
      }
    }

    return res.render('billing/print', {
      sessions,
      classes,
      students,
      invoices,
      filters,
      error,
      invoiceLimitReached,
      months,
    });
  } catch (error) {
    console.error('Error loading pre-bill print page:', error);
    return res.status(500).send('Unable to load invoices for printing.');
  }
};

exports.printInvoiceBatch = async (req, res) => {
  const rawIds = req.body.invoiceIds === undefined
    ? []
    : Array.isArray(req.body.invoiceIds)
      ? req.body.invoiceIds.flatMap(value => String(value || '').split(','))
      : String(req.body.invoiceIds || '').split(',');
  const invoiceIds = [...new Set(rawIds.map(id => id.trim()).filter(Boolean))];
  if (!invoiceIds.length || invoiceIds.some(id => !mongoose.isValidObjectId(id))) {
    return res.status(400).send('Select at least one valid invoice to print.');
  }

  try {
    const [invoices, school] = await Promise.all([
      Invoice.find({ _id: { $in: invoiceIds } })
        .populate({ path: 'student', populate: { path: 'class' } })
        .populate('academicSession')
        .sort({ createdAt: -1 })
        .lean(),
      School.findOne().lean(),
    ]);
    if (invoices.length !== invoiceIds.length) {
      return res.status(404).send('One or more selected invoices could not be found. Reload the invoice list and try again.');
    }
    return res.render('billing/printBatch', { invoices, school });
  } catch (error) {
    console.error('Error loading invoice print batch:', error);
    return res.status(500).send('Unable to load selected invoices for printing.');
  }
};

exports.showGenerateForm = async (req, res) => {
  try {
    const [sessions, students, classes] = await Promise.all([
      AcademicSession.find().sort({ startDateAD: -1 }).lean(),
      Student.find({ status: 'ACTIVE' }).populate('class', 'studentClass section').sort({ name: 1 }).lean(),
      studentClassModel.find({ studentClass: { $exists: true, $ne: '' } })
        .sort({ classorder: 1, studentClass: 1, section: 1 })
        .lean(),
    ]);
    const activeStudentCounts = {};
    students.forEach(student => {
      if (!student.class || !student.academicSession) return;
      const key = `${student.academicSession}:${student.class._id}`;
      activeStudentCounts[key] = (activeStudentCounts[key] || 0) + 1;
    });
    return res.render('billing/generate', {
      sessions,
      students,
      classes,
      activeStudentCounts,
      todayBS: String(bs.ADToBS(new Date()) || '').slice(0, 10),
      error: '',
    });
  } catch (error) {
    console.error('Error loading invoice generation form:', error);
    return res.status(500).send('Unable to load invoice generation form.');
  }
};

exports.previewMonthlyBillFeeHeads = async (req, res) => {
  try {
    const result = await getMonthlyInvoiceFeeOptions({
      studentId: req.query.studentId,
      billMonthBS: req.query.billMonthBS,
      billDateBS: req.query.billDateBS,
    });
    return res.json(result);
  } catch (error) {
    console.error('Unable to preview applicable invoice fee heads:', error);
    return res.status(400).json({ error: error.message || 'Unable to load fee heads.' });
  }
};

exports.previewClassMonthlyBillFeeHeads = async (req, res) => {
  try {
    const classIds = req.query.classIds === undefined
      ? []
      : Array.isArray(req.query.classIds) ? req.query.classIds : [req.query.classIds];
    const result = await getClassMonthlyInvoiceFeeOptions({
      classIds,
      academicSession: req.query.academicSession,
      billMonthBS: req.query.billMonthBS,
      billDateBS: req.query.billDateBS,
    });
    return res.json(result);
  } catch (error) {
    console.error('Unable to preview class-wise invoice fee heads:', error);
    return res.status(400).json({ error: error.message || 'Unable to load class fee heads.' });
  }
};

function validateClassFeeSelections(selections, previewClasses, selectedClassIds) {
  const normalized = new Map();
  for (const classId of selectedClassIds) {
    const classPreview = previewClasses.find(item => item.id === classId);
    if (!classPreview) throw new Error('One or more selected classes are unavailable. Reload the preview.');
    if (classPreview.remainingStudentCount === 0) {
      normalized.set(classId, {
        selectedStudentIds: [],
        selectedFeeHeadIds: [],
        feeHeadAmounts: {},
        routeSpecificTransportFeeHeadIds: [],
      });
      continue;
    }
    const selection = selections[classId];
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
      throw new Error('Review recipients and fee heads for every selected class before generating invoices.');
    }
    const rawStudentIds = selection.studentIds === undefined
      ? []
      : Array.isArray(selection.studentIds)
        ? selection.studentIds.map(String)
        : [String(selection.studentIds)];
    const selectedStudentIds = [...new Set(rawStudentIds.map(id => id.trim()).filter(Boolean))];
    const knownStudentIds = new Set((classPreview.students || []).map(student => student.id));
    if (selectedStudentIds.some(id => !mongoose.isValidObjectId(id) || !knownStudentIds.has(id))) {
      throw new Error('A selected student is no longer eligible for this class billing run. Reload the preview.');
    }
    const eligibleStudentIds = new Set((classPreview.students || [])
      .filter(student => !student.alreadyBilled)
      .map(student => student.id));
    const remainingStudentIds = selectedStudentIds.filter(id => eligibleStudentIds.has(id));
    if (!remainingStudentIds.length) {
      normalized.set(classId, {
        selectedStudentIds: [],
        selectedFeeHeadIds: [],
        feeHeadAmounts: {},
        routeSpecificTransportFeeHeadIds: [],
      });
      continue;
    }
    const selectedIds = selection.selectedFeeHeadIds === undefined
      ? []
      : Array.isArray(selection.selectedFeeHeadIds)
        ? selection.selectedFeeHeadIds.map(String)
        : [String(selection.selectedFeeHeadIds)];
    const uniqueIds = [...new Set(selectedIds.map(id => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      throw new Error('Select at least one fee head for every selected class.');
    }
    const feeAmounts = selection.feeHeadAmounts === undefined ? {} : selection.feeHeadAmounts;
    if (!feeAmounts || typeof feeAmounts !== 'object' || Array.isArray(feeAmounts)) {
      throw new Error('Class fee amounts are invalid. Review the fee preview and try again.');
    }
    const optionsById = new Map((classPreview?.feeHeads || []).map(item => [item.feeCategory, item]));
    for (const id of uniqueIds) {
      const option = optionsById.get(id);
      if (!option) throw new Error('One or more selected fee heads are unavailable. Reload the class fee preview.');
      const hasAmount = Object.prototype.hasOwnProperty.call(feeAmounts, id);
      if (option.routeSpecific) {
        if (hasAmount) throw new Error('Route-specific transport fares cannot be overridden for a whole class.');
      } else {
        if (!hasAmount) throw new Error(`Enter an amount for fee head "${option.feeHeadName}".`);
        parseInvoiceAmount(feeAmounts[id], option.feeHeadName);
      }
    }
    normalized.set(classId, {
      selectedStudentIds: remainingStudentIds,
      selectedFeeHeadIds: uniqueIds,
      feeHeadAmounts: feeAmounts,
      routeSpecificTransportFeeHeadIds: uniqueIds.filter(id => optionsById.get(id).routeSpecific),
    });
  }
  return normalized;
}

exports.generateBills = async (req, res) => {
  const { academicSession, billMonthBS, billDateBS, studentId } = req.body;
  const billingMode = req.body.billingMode === 'individual' ? 'individual' : 'classWise';
  const selectedClassIds = req.body.selectedClassIds === undefined
    ? []
    : [...new Set((Array.isArray(req.body.selectedClassIds) ? req.body.selectedClassIds : [req.body.selectedClassIds])
      .map(value => String(value || '').trim())
      .filter(Boolean))];
  const selectedFeeHeadIds = req.body.selectedFeeHeadIds === undefined
    ? []
    : Array.isArray(req.body.selectedFeeHeadIds) ? req.body.selectedFeeHeadIds : [req.body.selectedFeeHeadIds];
  const feeHeadAmounts = req.body.feeHeadAmounts;
  const classFeeSelections = req.body.classFeeSelections && typeof req.body.classFeeSelections === 'object'
    ? req.body.classFeeSelections
    : {};
  const results = [];

  if (!mongoose.isValidObjectId(academicSession)) {
    return res.render('billing/result', {
      results: [{ student: 'Billing selection', status: 'error: Select a valid academic session.' }],
    });
  }

  let students = [];
  let normalizedClassFeeSelections = new Map();
  let existingClassInvoices = new Map();
  if (billingMode === 'individual') {
    if (!mongoose.isValidObjectId(studentId)) {
      return res.render('billing/result', {
        results: [{ student: 'Individual billing', status: 'error: Select a student to generate an individual invoice.' }],
      });
    }
    students = await Student.find({
      _id: studentId,
      status: 'ACTIVE',
      academicSession,
    }).lean();
    if (!students.length) {
      return res.render('billing/result', {
        results: [{ student: 'Individual billing', status: 'error: The selected student is not active in this academic session.' }],
      });
    }
  } else {
    if (!selectedClassIds.length) {
      return res.render('billing/result', {
        results: [{ student: 'Class-wise billing', status: 'error: Select at least one class and section before generating invoices.' }],
      });
    }
    const invalidClassId = selectedClassIds.find(id => !mongoose.isValidObjectId(id));
    if (invalidClassId) {
      return res.render('billing/result', {
        results: [{ student: 'Class-wise billing', status: 'error: One or more selected classes are invalid. Reload the page and try again.' }],
      });
    }
    const selectedClasses = await studentClassModel.find({
      _id: { $in: selectedClassIds },
      studentClass: { $exists: true, $ne: '' },
    }).select('_id studentClass section').lean();
    if (selectedClasses.length !== selectedClassIds.length) {
      return res.render('billing/result', {
        results: [{ student: 'Class-wise billing', status: 'error: One or more selected classes are no longer available. Reload the page and try again.' }],
      });
    }
    try {
      const preview = await getClassMonthlyInvoiceFeeOptions({
        classIds: selectedClassIds,
        academicSession,
        billMonthBS,
        billDateBS,
      });
      normalizedClassFeeSelections = validateClassFeeSelections(
        classFeeSelections,
        preview.classes,
        selectedClassIds
      );
    } catch (error) {
      return res.render('billing/result', {
        results: [{ student: 'Class-wise billing', status: `error: ${error.message}` }],
      });
    }
    const activeClassStudents = await Student.find({
      status: 'ACTIVE',
      academicSession,
      class: { $in: selectedClassIds },
    }).lean();
    existingClassInvoices = await getExistingMonthlyInvoices(activeClassStudents, billMonthBS, billDateBS);
    const selectedStudentIds = new Set(selectedClassIds.flatMap(classId =>
      normalizedClassFeeSelections.get(classId).selectedStudentIds
    ));
    const activeStudentsById = new Map(activeClassStudents.map(student => [String(student._id), student]));
    const inactiveSelection = [...selectedStudentIds].find(id => !activeStudentsById.has(id));
    if (inactiveSelection) {
      return res.render('billing/result', {
        results: [{ student: 'Class-wise billing', status: 'error: A selected student is no longer active in this session. Reload the preview.' }],
      });
    }
    activeClassStudents.forEach(currentStudent => {
      const currentKey = createInvoiceGenerationKey(
        currentStudent._id,
        currentStudent.academicSession,
        billDateBS,
        billMonthBS
      );
      if (existingClassInvoices.has(currentKey)) {
        results.push({
          student: currentStudent.name,
          status: `skipped - already has invoice ${existingClassInvoices.get(currentKey).invoiceNumber}`,
        });
      } else if (!selectedStudentIds.has(String(currentStudent._id))) {
        results.push({
          student: currentStudent.name,
          status: 'skipped - excluded from this billing run',
        });
      }
    });
    students = activeClassStudents.filter(student => selectedStudentIds.has(String(student._id)));
    const selectedClassesWithStudents = new Set(activeClassStudents.map(student => String(student.class)));
    selectedClasses
      .filter(classItem => !selectedClassesWithStudents.has(String(classItem._id)))
      .forEach(classItem => {
        results.push({
          student: `${classItem.studentClass}${classItem.section ? ` - ${classItem.section}` : ''}`,
          status: 'skipped - no active students in this class and session',
        });
      });
  }

  for (const student of students) {
    try {
      if (billingMode === 'individual' && req.body.feeSelectionLoaded !== 'true') {
        throw new Error('Load and confirm the applicable fee-head selection before generating this student invoice.');
      }
      const studentGenerationKey = createInvoiceGenerationKey(
        student._id,
        student.academicSession,
        billDateBS,
        billMonthBS
      );
      const existingClassInvoice = existingClassInvoices.get(studentGenerationKey);
      if (existingClassInvoice) {
        results.push({
          student: student.name,
          status: `skipped - already has invoice ${existingClassInvoice.invoiceNumber}${existingClassInvoice.isCancelled ? ' (cancelled record)' : ''}`,
        });
        continue;
      }
      const generationResult = await generateMonthlyInvoice({
        studentId: student._id,
        billMonthBS,
        billDateBS,
        selectedFeeHeadIds: billingMode === 'individual' ? selectedFeeHeadIds : undefined,
        feeHeadAmounts: billingMode === 'individual' ? feeHeadAmounts : undefined,
        ...(billingMode === 'classWise'
          ? {
            selectedFeeHeadIds: normalizedClassFeeSelections.get(String(student.class)).selectedFeeHeadIds,
            feeHeadAmounts: normalizedClassFeeSelections.get(String(student.class)).feeHeadAmounts,
            skipUnavailableTransportFeeHeadIds:
              normalizedClassFeeSelections.get(String(student.class)).routeSpecificTransportFeeHeadIds,
          }
          : {}),
        returnExistingStatus: true,
        user: req.user,
      });
      const invoice = generationResult.invoice;
      results.push({
        student: student.name,
        status: generationResult.alreadyExists
          ? `skipped - already has invoice ${invoice.invoiceNumber}${invoice.isCancelled ? ' (cancelled record)' : ''}`
          : invoice
            ? `generated (${invoice.invoiceNumber})`
            : 'skipped - before admission date or no applicable selected fees',
        ...(invoice && !generationResult.alreadyExists ? { invoiceId: String(invoice._id) } : {}),
      });
    } catch (err) {
      results.push({ student: student.name, status: `error: ${err.message}` });
    }
  }

  res.render('billing/result', {
    results,
    printInvoiceIds: results.filter(result => result.invoiceId).map(result => result.invoiceId),
  });
};

exports.viewInvoice = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).send('Invoice not found');
  }

  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate({ path: 'student', populate: { path: 'class' } })
      .populate('academicSession');
    if (!invoice) return res.status(404).send('Invoice not found');

    const school = await School.findOne();
    return res.render('billing/invoice', { invoice, school });
  } catch (error) {
    console.error('Error loading invoice:', error);
    return res.status(500).send('Unable to load invoice.');
  }
};

const renderChartOfAccounts = async (req, res, options = {}) => {
  const [groups, ledgers] = await Promise.all([
    AccountGroup.find().populate('parentGroup', 'name code').sort({ nature: 1, name: 1 }).lean(),
    AccountLedger.find().populate('group', 'name code nature').sort({ code: 1 }).lean(),
  ]);
  return res.status(options.status || 200).render('./billingfirst/chartsofAccount', {
    title: 'Chart of Accounts',
    groups,
    ledgers,
    accountNatures: ACCOUNT_NATURES,
    ledgerTypes: LEDGER_TYPES,
    message: options.message || '',
    error: options.error || '',
    groupForm: options.groupForm || {},
    ledgerForm: options.ledgerForm || {},
    currentPath: '/chartsofAccount',
  });
};

exports.cashBank = async (req, res) => {
  try {
    const allLedgers = await AccountLedger.find()
      .populate('group', 'name code')
      .sort({ code: 1 })
      .lean();
    const cashLedgers = [];
    const bankLedgers = [];
    allLedgers.forEach(ledger => {
      const accountType = classifyCashBankLedger(ledger);
      if (accountType === 'cash') cashLedgers.push(ledger);
      if (accountType === 'bank') bankLedgers.push(ledger);
    });

    const cashBankLedgerIds = [...cashLedgers, ...bankLedgers].map(ledger => ledger._id);
    const totals = cashBankLedgerIds.length
      ? await JournalVoucher.aggregate([
        { $match: { status: 'POSTED' } },
        { $unwind: '$entries' },
        { $match: { 'entries.ledger': { $in: cashBankLedgerIds } } },
        {
          $group: {
            _id: '$entries.ledger',
            debit: { $sum: '$entries.debit' },
            credit: { $sum: '$entries.credit' },
          },
        },
      ])
      : [];
    const balances = calculateLedgerBalances(totals);
    const addBalances = ledgerList => ledgerList.map(ledger => {
      const balance = balances.get(String(ledger._id)) || 0;
      return {
        ...ledger,
        balance,
        balanceSide: getNormalBalanceLabel(balance, ledger.normalBalance),
      };
    });
    const cash = addBalances(cashLedgers);
    const bank = addBalances(bankLedgers);
    const totalInMinorUnits = ledgerList => ledgerList.reduce(
      (total, ledger) => total + Math.round(ledger.balance * 100),
      0
    );
    const totalCash = totalInMinorUnits(cash) / 100;
    const totalBank = totalInMinorUnits(bank) / 100;
    const currentPath = '/cashbank';
    return res.render('./billingfirst/cashbank', {
      title: 'Cash & Bank',
      cash,
      bank,
      totalCash,
      totalBank,
      totalCashBank: totalCash + totalBank,
      currentPath,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error loading cash and bank ledgers:', error);
    return res.status(500).send('Unable to load cash and bank balances.');
  }
};

const getLatestVoucherSequence = async () => {
  const [result] = await JournalVoucher.aggregate([
    { $match: { voucherNumber: /^JV-\d+$/ } },
    {
      $project: {
        sequence: {
          $convert: {
            input: { $arrayElemAt: [{ $split: ['$voucherNumber', '-'] }, 1] },
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $group: { _id: null, maximum: { $max: '$sequence' } } },
  ]);
  return result?.maximum || 0;
};

const getVoucherNumberPreview = async () => {
  const counter = await VoucherCounter.findById('JOURNAL').lean();
  const sequence = counter ? counter.sequence : await getLatestVoucherSequence();
  return accountingVoucherNumber('JOURNAL', sequence + 1);
};

const getNextVoucherNumber = async () => {
  let counter = await VoucherCounter.findById('JOURNAL').lean();
  if (!counter) {
    try {
      await VoucherCounter.create({
        _id: 'JOURNAL',
        sequence: await getLatestVoucherSequence(),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  const nextCounter = await VoucherCounter.findOneAndUpdate(
    { _id: 'JOURNAL' },
    { $inc: { sequence: 1 } },
    { new: true, runValidators: true }
  ).lean();
  if (!nextCounter) throw new Error('Unable to allocate the next journal voucher number.');
  return formatVoucherNumber(nextCounter.sequence);
};

const getJournalVoucherPageData = async () => {
  const [ledgers, vouchers, voucherNumberPreview] = await Promise.all([
    AccountLedger.find({ isActive: { $ne: false } }).populate('group', 'name code').sort({ code: 1 }).lean(),
    JournalVoucher.find()
      .populate('entries.ledger', 'name code')
      .populate('revisionHistory.entries.ledger', 'name code')
      .sort({ dateAD: -1, createdAt: -1 })
      .limit(100)
      .lean(),
    getVoucherNumberPreview(),
  ]);
  return {
    ledgers,
    idempotencyKey: crypto.randomBytes(24).toString('hex'),
    vouchers: vouchers.map(voucher => ({
      ...voucher,
      dateAdDisplay: voucher.dateAD.toISOString().slice(0, 10),
      voucherTypeLabel: formatVoucherType(voucher.voucherType),
      displayStatus: getVoucherDisplayStatus(voucher),
    })),
    voucherNumberPreview,
  };
};

exports.journalVoucher = async (req, res) => {
  try {
    const [pageData, todayBs] = await Promise.all([
      getJournalVoucherPageData(),
      Promise.resolve(String(bs.ADToBS(new Date()) || '').slice(0, 10)),
    ]);
    const todayAd = String(bs.BSToAD(todayBs) || '').slice(0, 10);
    return res.render('./billingfirst/journalVoucher', {
      title: 'Journal Voucher Entry',
      ...pageData,
      todayBs,
      todayAd,
      message: req.query.status === 'saved'
        ? 'Journal voucher posted successfully.'
        : req.query.status === 'updated'
          ? 'Journal voucher updated successfully. The previous version is retained in its audit history.'
          : '',
      error: '',
      form: {},
      editingVoucher: null,
      currentPath: '/journal-voucher',
      currentRole: req.user.role,
    });
  } catch (error) {
    console.error('Error loading journal voucher page:', error);
    return res.status(500).send('Unable to load journal voucher entry.');
  }
};

exports.convertJournalVoucherDate = (req, res) => {
  const dateBS = String(req.query.bsDate || '').trim();
  const dateAD = bs.BSToAD(dateBS);
  if (!dateAD) return res.status(400).json({ error: 'Enter a valid Nepali BS date.' });
  return res.json({ dateBS, dateAD });
};

exports.editJournalVoucher = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Journal voucher not found.');
  try {
    const [voucher, pageData] = await Promise.all([
      JournalVoucher.findById(req.params.id).populate('entries.ledger', 'name code').lean(),
      getJournalVoucherPageData(),
    ]);
    if (!voucher) return res.status(404).send('Journal voucher not found.');
    if (voucher.status !== 'DRAFT') {
      return res.status(409).send('Posted vouchers are immutable. Use the reversal workflow to correct this transaction.');
    }

    return res.render('./billingfirst/journalVoucher', {
      title: `Edit ${voucher.voucherNumber}`,
      ...pageData,
      todayBs: String(bs.ADToBS(new Date()) || '').slice(0, 10),
      todayAd: String(bs.BSToAD(voucher.dateBS) || '').slice(0, 10),
      message: '',
      error: '',
      form: {
        dateBS: voucher.dateBS,
        narration: voucher.narration,
        entries: voucher.entries.map(entry => ({
          ledger: entry.ledger ? String(entry.ledger._id) : '',
          debit: entry.debit,
          credit: entry.credit,
        })),
        revision: Number(voucher.revision || 0),
      },
      editingVoucher: {
        _id: String(voucher._id),
        voucherNumber: voucher.voucherNumber,
        revision: Number(voucher.revision || 0),
      },
      currentPath: '/journal-voucher',
    });
  } catch (error) {
    console.error('Error loading journal voucher for editing:', error);
    return res.status(500).send('Unable to load journal voucher for editing.');
  }
};

exports.createJournalVoucher = async (req, res) => {
  const dateBS = typeof req.body.dateBS === 'string' ? req.body.dateBS.trim() : '';
  const dateAD = String(bs.BSToAD(dateBS) || '').trim();
  const narration = typeof req.body.narration === 'string' ? req.body.narration.trim() : '';
  const submittedEntries = Array.isArray(req.body.entries)
    ? req.body.entries
    : req.body.entries && typeof req.body.entries === 'object'
      ? Object.values(req.body.entries)
      : [];
  const form = { dateBS, narration, entries: submittedEntries };

  try {
    if (!dateAD) {
      const pageData = await getJournalVoucherPageData();
      return res.status(400).render('./billingfirst/journalVoucher', {
        title: 'Journal Voucher Entry',
        ...pageData,
        todayBs: String(bs.ADToBS(new Date()) || '').slice(0, 10),
        todayAd: '',
        message: '',
        error: 'Enter a valid Nepali BS date.',
        form,
        editingVoucher: null,
        currentPath: '/journal-voucher',
      });
    }
    if (!narration || narration.length > 500) {
      const pageData = await getJournalVoucherPageData();
      return res.status(400).render('./billingfirst/journalVoucher', {
        title: 'Journal Voucher Entry',
        ...pageData,
        todayBs: String(bs.ADToBS(new Date()) || '').slice(0, 10),
        todayAd: dateAD,
        message: '',
        error: 'Enter a narration of no more than 500 characters.',
        form,
        editingVoucher: null,
        currentPath: '/journal-voucher',
      });
    }

    const accountIds = [...new Set(submittedEntries.map(entry => String(entry?.ledger || '').trim()).filter(Boolean))];
    const validAccountIds = accountIds.filter(accountId => mongoose.isValidObjectId(accountId));
    const ledgers = validAccountIds.length
      ? await AccountLedger.find({ _id: { $in: validAccountIds }, isActive: { $ne: false } }).select('_id').lean()
      : [];
    const validated = validateJournalEntries(submittedEntries, ledgers);
    if (validated.error) {
      const pageData = await getJournalVoucherPageData();
      return res.status(400).render('./billingfirst/journalVoucher', {
        title: 'Journal Voucher Entry',
        ...pageData,
        todayBs: String(bs.ADToBS(new Date()) || '').slice(0, 10),
        todayAd: dateAD,
        message: '',
        error: validated.error,
        form,
        editingVoucher: null,
        currentPath: '/journal-voucher',
      });
    }

    const voucher = await createJournalVoucher({
      dateBS,
      narration,
      submittedEntries,
      idempotencyKey: req.body.idempotencyKey,
      user: req.user,
    });
    if (voucher.status !== 'POSTED') return res.redirect('/accounting/vouchers?status=submitted');
    return res.redirect('/journal-voucher?status=saved');
  } catch (error) {
    if (error.code === 11000) {
      console.error('Duplicate journal voucher number while saving:', error);
      return res.status(409).send('Unable to allocate a unique journal voucher number. Please submit again.');
    }
    console.error('Error creating journal voucher:', error);
    return res.status(error.code === 'ACCOUNTING_TRANSACTIONS_UNAVAILABLE' ? 503 : 400)
      .send(error.message || 'Unable to save journal voucher.');
  }
};

exports.updateJournalVoucher = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Journal voucher not found.');

  const dateBS = typeof req.body.dateBS === 'string' ? req.body.dateBS.trim() : '';
  const dateAD = String(bs.BSToAD(dateBS) || '').trim();
  const narration = typeof req.body.narration === 'string' ? req.body.narration.trim() : '';
  const submittedEntries = Array.isArray(req.body.entries)
    ? req.body.entries
    : req.body.entries && typeof req.body.entries === 'object'
      ? Object.values(req.body.entries)
      : [];
  const submittedRevision = Number(req.body.revision);
  const form = {
    dateBS,
    narration,
    entries: submittedEntries,
    revision: Number.isSafeInteger(submittedRevision) && submittedRevision >= 0 ? submittedRevision : 0,
  };

  const renderEditError = async (status, errorMessage) => {
    const [voucher, pageData] = await Promise.all([
      JournalVoucher.findById(req.params.id).select('voucherNumber revision').lean(),
      getJournalVoucherPageData(),
    ]);
    if (!voucher) return res.status(404).send('Journal voucher not found.');
    return res.status(status).render('./billingfirst/journalVoucher', {
      title: `Edit ${voucher.voucherNumber}`,
      ...pageData,
      todayBs: String(bs.ADToBS(new Date()) || '').slice(0, 10),
      todayAd: dateAD,
      message: '',
      error: errorMessage,
      form,
      editingVoucher: {
        _id: String(voucher._id),
        voucherNumber: voucher.voucherNumber,
        revision: form.revision,
      },
      currentPath: '/journal-voucher',
    });
  };

  try {
    const original = await JournalVoucher.findById(req.params.id).lean();
    if (!original) return res.status(404).send('Journal voucher not found.');
    if (original.status !== 'DRAFT') {
      return res.status(409).send('Posted vouchers are immutable. Use the reversal workflow to correct this transaction.');
    }
    if (!dateAD) return await renderEditError(400, 'Enter a valid Nepali BS date.');
    if (!narration || narration.length > 500) {
      return await renderEditError(400, 'Enter a narration of no more than 500 characters.');
    }

    const accountIds = [...new Set(submittedEntries.map(entry => String(entry?.ledger || '').trim()).filter(Boolean))];
    const validAccountIds = accountIds.filter(accountId => mongoose.isValidObjectId(accountId));
    const ledgers = validAccountIds.length
      ? await AccountLedger.find({ _id: { $in: validAccountIds }, isActive: { $ne: false } }).select('_id').lean()
      : [];
    const validated = validateJournalEntries(submittedEntries, ledgers);
    if (validated.error) return await renderEditError(400, validated.error);

    const expectedRevision = form.revision;
    const revisionFilter = {
      _id: original._id,
      $or: [{ revision: expectedRevision }],
    };
    if (expectedRevision === 0) revisionFilter.$or.push({ revision: { $exists: false } });

    const updated = await JournalVoucher.findOneAndUpdate(
      revisionFilter,
      {
        $set: {
          dateBS,
          dateAD: new Date(`${dateAD}T00:00:00.000Z`),
          narration,
          entries: validated.entries,
          totalDebit: validated.totalDebit,
          totalCredit: validated.totalCredit,
        },
        $inc: { revision: 1 },
        $push: {
          revisionHistory: {
            revision: Number(original.revision || 0),
            dateBS: original.dateBS,
            dateAD: original.dateAD,
            narration: original.narration,
            entries: original.entries,
            totalDebit: original.totalDebit,
            totalCredit: original.totalCredit,
            editedAt: new Date(),
            editedBy: req.user?.teacherName || req.user?.username || '',
          },
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return await renderEditError(409, 'This voucher was updated by another user. Reload it before making further changes.');
    }
    return res.redirect('/journal-voucher?status=updated');
  } catch (error) {
    console.error('Error updating journal voucher:', error);
    return res.status(500).send('Unable to update journal voucher.');
  }
};

exports.chartOfAccounts = async (req, res) => {
  try {
    const messages = {
      groupCreated: 'Account group created successfully.',
      ledgerCreated: 'Ledger account created successfully.',
      ledgerUpdated: 'Ledger account status updated successfully.',
    };
    return await renderChartOfAccounts(req, res, { message: messages[req.query.status] || '' });
  } catch (error) {
    console.error('Error loading chart of accounts:', error);
    return res.status(500).send('Unable to load chart of accounts.');
  }
};

exports.addAccountGroup = async (req, res) => {
  const groupForm = {
    code: normalizeAccountCode(req.body.code),
    name: normalizeAccountName(req.body.name),
    nature: String(req.body.nature || '').trim().toUpperCase(),
    parentGroup: String(req.body.parentGroup || '').trim(),
  };
  try {
    if (!groupForm.code || !groupForm.name
      || !ACCOUNT_NATURES.some(nature => nature.value === groupForm.nature)) {
      return await renderChartOfAccounts(req, res, {
        status: 400,
        error: 'Enter an account code and name, and choose a valid account nature.',
        groupForm,
      });
    }

    let parentGroup = null;
    if (groupForm.parentGroup) {
      if (!mongoose.isValidObjectId(groupForm.parentGroup)) {
        return await renderChartOfAccounts(req, res, {
          status: 400, error: 'Choose a valid parent group.', groupForm,
        });
      }
      parentGroup = await AccountGroup.findById(groupForm.parentGroup).lean();
      if (!parentGroup || parentGroup.nature !== groupForm.nature) {
        return await renderChartOfAccounts(req, res, {
          status: 400,
          error: 'A sub-group must have the same account nature as its parent group.',
          groupForm,
        });
      }
    }

    await AccountGroup.create({
      code: groupForm.code,
      name: groupForm.name,
      normalizedName: groupForm.name.toLowerCase(),
      nature: groupForm.nature,
      parentGroup: parentGroup ? parentGroup._id : null,
      normalBalance: getNormalBalance(groupForm.nature),
    });
    return res.redirect('/chartsofAccount?status=groupCreated');
  } catch (error) {
    if (error.code === 11000) {
      return await renderChartOfAccounts(req, res, {
        status: 409,
        error: 'That account code or group name already exists.',
        groupForm,
      });
    }
    console.error('Error creating account group:', error);
    return res.status(500).send('Unable to create account group.');
  }
};

exports.addLedgerAccount = async (req, res) => {
  const ledgerForm = {
    code: normalizeAccountCode(req.body.code),
    name: normalizeAccountName(req.body.name),
    group: String(req.body.group || '').trim(),
    ledgerType: String(req.body.ledgerType || 'GENERAL').trim().toUpperCase(),
  };
  try {
    if (!ledgerForm.code || !ledgerForm.name || !mongoose.isValidObjectId(ledgerForm.group)) {
      return await renderChartOfAccounts(req, res, {
        status: 400,
        error: 'Enter an account code and name, and choose a valid account group.',
        ledgerForm,
      });
    }

    const group = await AccountGroup.findById(ledgerForm.group).lean();
    if (!group) {
      return await renderChartOfAccounts(req, res, {
        status: 400, error: 'The selected account group could not be found.', ledgerForm,
      });
    }
    const typeError = validateLedgerNature(ledgerForm.ledgerType, group.nature);
    if (typeError) {
      return await renderChartOfAccounts(req, res, {
        status: 400, error: typeError, ledgerForm,
      });
    }

    await AccountLedger.create({
      code: ledgerForm.code,
      name: ledgerForm.name,
      normalizedName: ledgerForm.name.toLowerCase(),
      group: group._id,
      nature: group.nature,
      ledgerType: ledgerForm.ledgerType,
      normalBalance: group.normalBalance,
    });
    return res.redirect('/chartsofAccount?status=ledgerCreated');
  } catch (error) {
    if (error.code === 11000) {
      return await renderChartOfAccounts(req, res, {
        status: 409,
        error: 'That account code or ledger name already exists.',
        ledgerForm,
      });
    }
    console.error('Error creating ledger account:', error);
    return res.status(500).send('Unable to create ledger account.');
  }
};

exports.setLedgerStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Ledger account not found.');
  const activeInput = String(req.body.isActive || '').toLowerCase();
  if (!['true', 'false'].includes(activeInput)) return res.status(400).send('Choose a valid ledger status.');
  const isActive = activeInput === 'true';
  try {
    const ledger = await AccountLedger.findById(req.params.id);
    if (!ledger) return res.status(404).send('Ledger account not found.');
    if (!isActive) {
      const school = await School.findOne().lean();
      const mapped = school && [
        school.accountsReceivableLedger,
        school.defaultFeeIncomeLedger,
        school.studentAdvanceLedger,
      ].some(id => String(id || '') === String(ledger._id));
      const feeHeadMapping = await feeheadmodel.exists({ incomeLedger: ledger._id });
      if (mapped || feeHeadMapping) {
        return res.status(409).send('Remap accounting settings and fee heads before deactivating this ledger.');
      }
    }
    ledger.isActive = isActive;
    await ledger.save();
    return res.redirect('/chartsofAccount?status=ledgerUpdated');
  } catch (error) {
    console.error('Unable to update ledger account status:', error);
    return res.status(500).send('Unable to update the ledger account.');
  }
};

module.exports = {
 
  ...module.exports,
};
