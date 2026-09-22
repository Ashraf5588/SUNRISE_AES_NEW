const path = require("path");
const multer  = require('multer')
const fs= require("fs");
const express = require("express");
const bs = require("bikram-sambat-js");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema } = require("../model/schema");
const { studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema,terminalSchema,newsubjectSchema } = require("../model/adminschema");
const {examSchema}= require("../model/examschema");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentClassModel = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");

const bcrypt = require("bcrypt");
const {holiday} = require('../model/holidayschema')
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const terminalModel = mongoose.model("terminal", terminalSchema, "terminal");
const { marksheetsetupschemaForAdmin ,routineSchema} = require("../model/marksheetschema");
const teacherSchema = require("../model/admin").teacherSchema;
const { onlineAttendanceSchema } = require("../model/onlineattendanceschema");
const { fail } = require("assert");
const routineModel = mongoose.model("routine", routineSchema, "routine");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const Portfolio = require("../model/portfolio");
const HealthRecord = require("../model/nurseschema");
const onlineAttendance = mongoose.model("onlineAttendance", onlineAttendanceSchema, "onlineAttendance");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const usermodel = mongoose.model("users", teacherSchema, "users");

const {feeheadschema} = require("../model/billing/feeheadschema");
const feeheadmodel = mongoose.model("FeeHead", feeheadschema, "feehead");
const {feestructureschema} = require("../model/billing/feestructureschema");
const feestructuremodel = mongoose.model("FeeStructure", feestructureschema, "feestructure");
const {feeInvoiceSchema} = require("../model/billing/feeinvoiceschema");
const feeInvoiceModel = mongoose.model("FeeInvoice", feeInvoiceSchema, "feeinvoice");
const {feePaymentSchema} = require("../model/billing/feepaymentschema");
const feePaymentModel = mongoose.model("FeePayment", feePaymentSchema, "feepayment");

exports.billingDashboard = async (req, res) => {
  try {
   const [studentCount, invoiceStats, paymentStats, recentPayments] = await Promise.all([
     studentRecord.countDocuments({ status: { $nin: ['Inactive', 'inactive'] } }),
     feeInvoiceModel.aggregate([{ $group: { _id: null, billed: { $sum: '$totalAmount' }, outstanding: { $sum: { $subtract: ['$totalAmount', '$paidAmount'] } }, count: { $sum: 1 } } }]),
     feePaymentModel.aggregate([{ $group: { _id: null, collected: { $sum: '$amount' } } }]),
     feePaymentModel.find().sort({ paidAt: -1 }).limit(8).lean()
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
    const feeheads = await feeheadmodel.find().sort({ createdAt: -1 }).lean();
    return res.render("./billingfirst/feehead", {
      title: "Fee Head",
      feeheads,
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
    const [feeheads, editFeeHead] = await Promise.all([
      feeheadmodel.find().sort({ createdAt: -1 }).lean(),
      feeheadmodel.findById(req.params.id).lean()
    ]);

    if (!editFeeHead) {
      return res.status(404).send("Fee head not found");
    }

    return res.render("./billingfirst/feehead", {
      title: "Edit Fee Head",
      feeheads,
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
    const appliedmonth = Array.isArray(req.body.appliedmonth)
      ? req.body.appliedmonth
      : req.body.appliedmonth
        ? [req.body.appliedmonth]
        : [];
    console.log("Received data:", { feehead, appliedmonth, reportname });
    console.log("body data", req.body);

await feeheadmodel.create({
  feehead: feehead,
  appliedmonth: appliedmonth,
  reportname: reportname,
  frequency: frequency,
  group: group || 'General'
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
    const appliedmonth = Array.isArray(req.body.appliedmonth)
      ? req.body.appliedmonth
      : req.body.appliedmonth
        ? [req.body.appliedmonth]
        : [];

    await feeheadmodel.findByIdAndUpdate(req.params.id, {
      feehead,
      frequency,
      appliedmonth,
      reportname,
      group: group || 'General'
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

const loadFeeStructureData = async (editFeeStructure = null) => {
  const [feeheads, feeStructures, classes] = await Promise.all([
    feeheadmodel.find().sort({ feehead: 1 }).lean(),
    feestructuremodel.find().sort({ createdAt: -1 }).lean(),
    studentClassModel.distinct('studentClass')
  ]);

  return {
    feeheads,
    feeStructures,
    classes: classes.filter(Boolean).sort(),
    editFeeStructure
  };
};

exports.feeStructure = async (req, res) => {
  try {
    return res.render('./billingfirst/feestructure', {
      title: 'Fee Structure',
      ...(await loadFeeStructureData())
    });
  } catch (error) {
    console.error('Error fetching fee structure data:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.addFeeStructure = async (req, res) => {
  try {
    const { feeheadId, frequency, group, description, amount } = req.body;
    const feehead = await feeheadmodel.findById(feeheadId).lean();
    const forClasses = Array.isArray(req.body.forClasses)
      ? req.body.forClasses
      : req.body.forClasses ? [req.body.forClasses] : [];

    if (!feehead) {
      return res.status(400).send('Invalid fee head');
    }

    await feestructuremodel.create({
      feehead: feehead.feehead,
      feeheadId,
      forClasses,
      frequency,
      description,
      amount: Number(amount),
      group
    });
    res.redirect('/feestructure');
  } catch (error) {
    console.error('Error adding fee structure:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.editFeeStructure = async (req, res) => {
  try {
    const editFeeStructure = await feestructuremodel.findById(req.params.id).lean();
    if (!editFeeStructure) {
      return res.status(404).send('Fee structure not found');
    }

    return res.render('./billingfirst/feestructure', {
      title: 'Edit Fee Structure',
      ...(await loadFeeStructureData(editFeeStructure))
    });
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
const getReceiptNumber = () => `RCT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const nepaliMonths = ['Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

const invoicePageData = async (editInvoice = null) => {
  const [students, feeStructures, invoices] = await Promise.all([
    studentRecord.find({ status: { $nin: ['Inactive', 'inactive'] } }).sort({ studentClass: 1, section: 1, roll: 1 }).lean(),
    feestructuremodel.find().sort({ feehead: 1 }).lean(),
    feeInvoiceModel.find().sort({ createdAt: -1 }).limit(100).lean()
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

    await feeInvoiceModel.create({
      invoiceNo: getInvoiceNumber(), studentId: student._id, reg: student.reg || student.regdNo || '',
      studentName: student.name, studentClass: student.studentClass || '', section: student.section || '',
      academicYear: req.body.academicYear, nepaliMonth: req.body.nepaliMonth, items, discount, totalAmount,
      notes: req.body.notes || ''
    });
    res.redirect('/fee-invoices');
  } catch (error) {
    console.error('Error creating fee invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.viewFeeInvoice = async (req, res) => {
  try {
    const invoice = await feeInvoiceModel.findById(req.params.id).lean();
    if (!invoice) return res.status(404).send('Invoice not found');
    const payments = await feePaymentModel.find({ invoiceId: invoice._id }).sort({ paidAt: -1 }).lean();
    return res.render('./billingfirst/feeinvoice', { title: invoice.invoiceNo, invoice, payments });
  } catch (error) {
    console.error('Error loading fee invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.deleteFeeInvoice = async (req, res) => {
  try {
    const paymentCount = await feePaymentModel.countDocuments({ invoiceId: req.params.id });
    if (paymentCount) return res.status(400).send('Paid invoices cannot be deleted');
    await feeInvoiceModel.findByIdAndDelete(req.params.id);
    res.redirect('/fee-invoices');
  } catch (error) {
    console.error('Error deleting fee invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.feePayments = async (req, res) => {
  try {
    const [invoices, payments] = await Promise.all([
      feeInvoiceModel.find({ $expr: { $lt: ['$paidAmount', '$totalAmount'] } }).sort({ createdAt: -1 }).lean(),
      feePaymentModel.find().sort({ paidAt: -1 }).limit(100).lean()
    ]);
    return res.render('./billingfirst/feepayments', { title: 'Fee Payments', invoices, payments });
  } catch (error) {
    console.error('Error fetching fee payments:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.addFeePayment = async (req, res) => {
  try {
    const invoice = await feeInvoiceModel.findById(req.body.invoiceId);
    const amount = Number(req.body.amount);
    const balance = invoice ? invoice.totalAmount - invoice.paidAmount : 0;
    if (!invoice || !Number.isFinite(amount) || amount <= 0 || amount > balance) {
      return res.status(400).send('Invalid payment amount or invoice');
    }

    const payment = await feePaymentModel.create({
      receiptNo: getReceiptNumber(), invoiceId: invoice._id, studentId: invoice.studentId,
      reg: invoice.reg, studentName: invoice.studentName, amount,
      paymentMethod: req.body.paymentMethod, referenceNo: req.body.referenceNo || '',
      receivedBy: req.user?.teacherName || req.user?.username || '', remarks: req.body.remarks || ''
    });
    invoice.paidAmount += amount;
    invoice.status = invoice.paidAmount >= invoice.totalAmount ? 'PAID' : 'PARTIAL';
    await invoice.save();
    res.redirect(`/fee-receipts/${payment._id}`);
  } catch (error) {
    console.error('Error recording fee payment:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.viewFeeReceipt = async (req, res) => {
  try {
    const payment = await feePaymentModel.findById(req.params.id).lean();
    if (!payment) return res.status(404).send('Receipt not found');
    const invoice = await feeInvoiceModel.findById(payment.invoiceId).lean();
    return res.render('./billingfirst/feereceipt', { title: payment.receiptNo, payment, invoice });
  } catch (error) {
    console.error('Error loading fee receipt:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const invoices = await feeInvoiceModel.find().sort({ createdAt: -1 }).limit(200).lean();
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

exports.generateBills = async (req, res) => {
  try {
    return res.status(501).send('Legacy billing generation route is disabled. Use the fee invoice flow instead.');
  } catch (error) {
    console.error('Error generating bills:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.viewInvoice = async (req, res) => {
  try {
    const invoice = await feeInvoiceModel.findById(req.params.id).lean();
    if (!invoice) return res.status(404).send('Invoice not found');
    return res.render('billing/invoice', { title: invoice.invoiceNo, invoice, school: { name: 'School' } });
  } catch (error) {
    console.error('Error loading invoice:', error);
    res.status(500).send('Internal Server Error');
  }
};

