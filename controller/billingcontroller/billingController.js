const Student = require('../../models/Student');
const Invoice = require('../../models/Invoice');
const AcademicSession = require('../../models/AcademicSession');
const School = require('../../models/School');
const { generateMonthlyInvoice } = require('../../services/billingService');
const legacyBillingController = require('../billingcontroller');

exports.listInvoices = async (req, res) => {
  const invoices = await Invoice.find().populate('student').sort({ billDateAD: -1 }).limit(200);
  res.render('billing/list', { invoices });
};

exports.showGenerateForm = async (req, res) => {
  const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
  const students = await Student.find({ status: 'ACTIVE' }).sort({ name: 1 });
  res.render('billing/generate', { sessions, students });
};

// Handles BOTH bulk generation (all active students in a session) and
// single-student generation (e.g. billing one late admission right away),
// depending on whether studentId was submitted.
exports.generateBills = async (req, res) => {
  const { academicSession, billMonthBS, billDateAD, billDateBS, studentId } = req.body;
  const results = [];

  const students = studentId
    ? await Student.find({ _id: studentId })
    : await Student.find({ status: 'ACTIVE', academicSession });

  for (const student of students) {
    try {
      const invoice = await generateMonthlyInvoice({
        studentId: student._id,
        billMonthBS,
        billDateAD: new Date(billDateAD),
        billDateBS,
      });
      results.push({
        student: student.name,
        status: invoice ? `generated (${invoice.invoiceNumber})` : 'skipped - before admission date',
      });
    } catch (err) {
      results.push({ student: student.name, status: `error: ${err.message}` });
    }
  }

  res.render('billing/result', { results });
};

exports.viewInvoice = async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate({ path: 'student', populate: { path: 'class' } })
    .populate('academicSession');
  const school = await School.findOne();
  res.render('billing/invoice', { invoice, school });
};

module.exports = {
  ...legacyBillingController,
  ...module.exports,
};
