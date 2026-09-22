const mongoose = require('mongoose');
const Student = require('../../models/Student');
const { classSchema } = require('../../model/adminschema');
const AcademicSession = require('../../models/AcademicSession');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const LedgerEntry = require('../../models/LedgerEntry');
const { getCurrentBalance, importOpeningBalance } = require('../../services/billingService');

const ClassModel = mongoose.models.studentClass || mongoose.model('studentClass', classSchema, 'classlist');

exports.listStudents = async (req, res) => {
  const students = await Student.find().populate('class').sort({ name: 1 });
  res.render('students/list', { students });
};

exports.newStudentForm = async (req, res) => {
  try {
    const classes = await ClassModel.find({}).sort({ studentClass: 1, section: 1 }).lean();
    const sessions = await AcademicSession.find().sort({ startDateAD: -1 }).lean();
    res.render('students/form', { student: null, classes, sessions });
  } catch (error) {
    console.error('Error loading student form:', error);
    res.status(500).send('Internal Server Error');
  }
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
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send('Student not found');
    }

    const student = await Student.findById(req.params.id).lean();
    const classes = await ClassModel.find({}).sort({ studentClass: 1, section: 1 }).lean();
    const sessions = await AcademicSession.find().sort({ startDateAD: -1 }).lean();
    res.render('students/form', { student, classes, sessions });
  } catch (error) {
    console.error('Error loading student edit form:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.updateStudent = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).send('Student not found');
  }

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
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).send('Student not found');
  }

  const student = await Student.findById(req.params.id)
    .populate('class')
    .populate('academicSession');

  if (!student) {
    return res.status(404).send('Student not found');
  }

  const invoices = await Invoice.find({ student: student._id }).sort({ billDateAD: -1 });
  const payments = await Payment.find({ student: student._id }).sort({ paymentDateAD: -1 });
  const ledger = await LedgerEntry.find({ student: student._id }).sort({ date: 1, createdAt: 1 });
  const balance = await getCurrentBalance(student._id);

  res.render('students/profile', { student, invoices, payments, ledger, balance });
};
