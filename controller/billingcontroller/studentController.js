const mongoose = require('mongoose');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const Student = require('../../model/billingschema/Student');
const { classSchema } = require('../../model/adminschema');
const AcademicSession = require('../../model/billingschema/AcademicSession');
const Invoice = require('../../model/billingschema/Invoice');
const Payment = require('../../model/billingschema/Payment');
const LedgerEntry = require('../../model/billingschema/LedgerEntry');
const { getCurrentBalance, importOpeningBalance } = require('../../services/billingService');

const ClassModel = mongoose.models.studentClass || mongoose.model('studentClass', classSchema, 'classlist');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const studentCsvHeaders = [
  'studentCode', 'name', 'class', 'section', 'guardianName', 'guardianPhone',
  'admissionDateAD', 'academicSession', 'status', 'migratedFromOldSystem',
];

const loadStudentFormData = async () => {
  const [classes, sessions] = await Promise.all([
    ClassModel.find({}).sort({ studentClass: 1, section: 1 }).lean(),
    AcademicSession.find().sort({ startDateAD: -1 }).lean(),
  ]);
  return { classes, sessions };
};

const parseStudentCsv = (buffer) => new Promise((resolve, reject) => {
  const rows = [];
  Readable.from([buffer]).pipe(csvParser()).on('data', (row) => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
});

exports.listStudents = async (req, res) => {
  const students = await Student.find().populate('class').sort({ name: 1 });
  res.render('students/list', { students });
};

exports.newStudentForm = async (req, res) => {
  try {
    res.render('students/form', { student: null, ...(await loadStudentFormData()) });
  } catch (error) {
    console.error('Error loading student form:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.downloadStudentTemplate = (req, res) => {
  res.type('text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.csv"');
  res.send(`${studentCsvHeaders.join(',')}\nSTU-001,Example Student,Nursery,A,Parent Name,9800000000,2026-04-14,2083,ACTIVE,false\n`);
};

exports.importStudentsCsv = [upload.single('studentCsv'), async (req, res) => {
  const importResult = { inserted: 0, skipped: 0, errors: [] };
  try {
    if (!req.file) return res.status(400).send('Please select a CSV file.');

    const [rows, classes, sessions] = await Promise.all([
      parseStudentCsv(req.file.buffer),
      ClassModel.find({}).lean(),
      AcademicSession.find({}).lean(),
    ]);
    const classMap = new Map(classes.map((item) => [String(item.studentClass).trim().toLowerCase(), item._id]));
    const sessionMap = new Map(sessions.map((item) => [String(item.titleBS).trim().toLowerCase(), item._id]));

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];
      const studentCode = String(row.studentCode || '').trim();
      const name = String(row.name || '').trim();
      const className = String(row.class || '').trim().toLowerCase();
      const sessionName = String(row.academicSession || '').trim().toLowerCase();
      const admissionDate = new Date(row.admissionDateAD);

      if (!studentCode || !name || !classMap.has(className) || !sessionMap.has(sessionName) || Number.isNaN(admissionDate.getTime())) {
        importResult.skipped += 1;
        importResult.errors.push(`Row ${rowNumber}: studentCode, name, class, academicSession, and a valid admissionDateAD are required.`);
        continue;
      }
      if (await Student.exists({ studentCode })) {
        importResult.skipped += 1;
        importResult.errors.push(`Row ${rowNumber}: studentCode ${studentCode} already exists.`);
        continue;
      }

      try {
        await Student.create({
          studentCode,
          name,
          class: classMap.get(className),
          section: String(row.section || '').trim(),
          guardianName: String(row.guardianName || '').trim(),
          guardianPhone: String(row.guardianPhone || '').trim(),
          admissionDateAD: admissionDate,
          academicSession: sessionMap.get(sessionName),
          status: ['ACTIVE', 'INACTIVE', 'TRANSFERRED'].includes(String(row.status || 'ACTIVE').toUpperCase())
            ? String(row.status || 'ACTIVE').toUpperCase()
            : 'ACTIVE',
          migratedFromOldSystem: ['true', '1', 'yes', 'on'].includes(String(row.migratedFromOldSystem || '').trim().toLowerCase()),
        });
        importResult.inserted += 1;
      } catch (error) {
        importResult.skipped += 1;
        importResult.errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    res.render('students/form', { student: null, ...(await loadStudentFormData()), importResult });
  } catch (error) {
    console.error('Error importing students CSV:', error);
    res.status(400).send(`CSV import failed: ${error.message}`);
  }
}];

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
    res.render('students/form', { student, ...(await loadStudentFormData()) });
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
