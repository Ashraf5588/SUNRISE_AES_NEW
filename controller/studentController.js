const Student = require('../models/Student');
const Class = require('../models/Class');
const AcademicSession = require('../models/AcademicSession');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const LedgerEntry = require('../models/LedgerEntry');
const { getCurrentBalance, importOpeningBalance } = require('../services/billingService');

exports.listStudents = async (req, res) => {
  const students = await Student.find().populate('class').sort({ name: 1 });
  res.render('students/list', { students });
};

exports.newStudentForm = async (req, res) => {
  const classes = await Class.find().sort({ order: 1 });
  const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
  res.render('students/form', { student: null, classes, sessions });
};

exports.createStudent = async (req, res) => {
  const {
    studentCode, name, class: classId, section, guardianName, guardianPhone,
    admissionDateAD, academicSession, migratedFromOldSystem,
    openingDueAmount, openingDueAsOfDate, openingDueNote,
  } = req.body;

  const student = await Student.create({
    studentCode,
    name,
    class: classId,
    section,
    guardianName,
    guardianPhone,
    admissionDateAD,
    academicSession,
    migratedFromOldSystem: migratedFromOldSystem === 'on',
    status: 'ACTIVE',
  });

  // If this student is carrying a due from the old software, import it as
  // a one-time opening balance so it shows up as previousDue on their
  // very first invoice from this system.
  if (migratedFromOldSystem === 'on' && Number(openingDueAmount) > 0) {
    await importOpeningBalance({
      studentId: student._id,
      amount: Number(openingDueAmount),
      asOfDateAD: openingDueAsOfDate || new Date(),
      sourceNote: openingDueNote || 'Migrated from previous billing software',
      enteredBy: req.body.enteredBy || 'admin',
    });
  }

  res.redirect(`/students/${student._id}`);
};

exports.editStudentForm = async (req, res) => {
  const student = await Student.findById(req.params.id);
  const classes = await Class.find().sort({ order: 1 });
  const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
  res.render('students/form', { student, classes, sessions });
};

exports.updateStudent = async (req, res) => {
  const {
    studentCode, name, class: classId, section, guardianName,
    guardianPhone, admissionDateAD, academicSession, status,
  } = req.body;

  await Student.findByIdAndUpdate(req.params.id, {
    studentCode, name, class: classId, section, guardianName,
    guardianPhone, admissionDateAD, academicSession, status,
  });

  res.redirect(`/students/${req.params.id}`);
};

exports.viewStudentProfile = async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate('class')
    .populate('academicSession');

  const invoices = await Invoice.find({ student: student._id }).sort({ billDateAD: -1 });
  const payments = await Payment.find({ student: student._id }).sort({ paymentDateAD: -1 });
  const ledger = await LedgerEntry.find({ student: student._id }).sort({ date: 1, createdAt: 1 });
  const balance = await getCurrentBalance(student._id);

  res.render('students/profile', { student, invoices, payments, ledger, balance });
};
