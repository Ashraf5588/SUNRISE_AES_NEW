const mongoose = require('mongoose');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const Student = require('../../model/billingschema/Student');
const { classSchema } = require('../../model/adminschema');
const AcademicSession = require('../../model/billingschema/AcademicSession');
const Transport = require('../../model/billingschema/transport');
const Invoice = require('../../model/billingschema/Invoice');
const Payment = require('../../model/billingschema/Payment');
const LedgerEntry = require('../../model/billingschema/LedgerEntry');
const { getCurrentBalance, importOpeningBalance } = require('../../services/billingService');
const bs = require('../../utils/bikramSambat');

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
  const [classes, sessions, transportRoutes] = await Promise.all([
    ClassModel.find({}).sort({ studentClass: 1, section: 1 }).lean(),
    AcademicSession.find().sort({ startDateAD: -1 }).lean(),
    Transport.find().populate('academicSession', 'titleBS').sort({ routeName: 1 }).lean(),
  ]);
  return {
    classes,
    sessions,
    transportRoutes,
    todayBS: String(bs.ADToBS(new Date()) || '').slice(0, 10),
    toBSDate: bs.ADToBS,
  };
};

const parseStudentCsv = (buffer) => new Promise((resolve, reject) => {
  const rows = [];
  Readable.from([buffer]).pipe(csvParser()).on('data', (row) => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
});

exports.listStudents = async (req, res) => {
  try {
    const [students, formData] = await Promise.all([
      Student.find().populate('class').populate('transportRoute', 'routeName').sort({ name: 1 }).lean(),
      loadStudentFormData(),
    ]);
    res.render('students/list', {
      students,
      ...formData,
      studentCounts: {
        total: students.length,
        active: students.filter(student => student.status === 'ACTIVE').length,
        inactive: students.filter(student => student.status === 'INACTIVE').length,
        busUsers: students.filter(student => student.usesSchoolBus && student.transportRoute).length,
      },
    });
  } catch (error) {
    console.error('Error loading student register:', error);
    res.status(500).send('Unable to load student register.');
  }
};

exports.newStudentForm = async (req, res) => {
  try {
    res.render('students/form', {
      student: null,
      importResult: null,
      fieldErrors: {},
      formValues: {},
      ...(await loadStudentFormData()),
    });
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
          usesSchoolBus: false,
          transportRoute: null,
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
  try {
    const {
      studentCode, name, class: classId, section, guardianName, guardianPhone,
      admissionDateAD, admissionDateBS, academicSession, migratedFromOldSystem,
      openingDueAmount, openingDueAsOfDate, openingDueNote,
    } = req.body;
    const usesSchoolBus = req.body.usesSchoolBus === 'on';
    const fieldErrors = {};
    const normalizedCode = String(studentCode || '').trim();
    const normalizedName = String(name || '').trim();
    const convertedAdmissionDateAD = admissionDateBS
      ? bs.BSToAD(admissionDateBS)
      : String(admissionDateAD || '').slice(0, 10);
    const admissionDate = convertedAdmissionDateAD ? new Date(convertedAdmissionDateAD) : null;

    if (!normalizedCode) fieldErrors.studentCode = 'Enter the student code.';
    if (!normalizedName) fieldErrors.name = 'Enter the student name.';
    if (!mongoose.isValidObjectId(classId) || !await ClassModel.exists({ _id: classId })) {
      fieldErrors.class = 'Choose a valid class.';
    }
    if (!mongoose.isValidObjectId(academicSession) || !await AcademicSession.exists({ _id: academicSession })) {
      fieldErrors.academicSession = 'Choose a valid academic session.';
    }
    if (!admissionDate || Number.isNaN(admissionDate.getTime())) {
      fieldErrors.admissionDateBS = 'Enter a valid Nepali admission date.';
    }
    if (normalizedCode && await Student.exists({ studentCode: normalizedCode })) {
      fieldErrors.studentCode = 'This student code is already in use.';
    }
    let transportRoute = null;
    if (usesSchoolBus) {
      if (!mongoose.isValidObjectId(req.body.transportRoute)) {
        fieldErrors.transportRoute = 'Choose a transport route or switch off school bus.';
      } else {
        transportRoute = await Transport.findOne({
          _id: req.body.transportRoute,
          academicSession,
        }).select('_id transportFee').lean();
        if (!transportRoute) {
          fieldErrors.transportRoute = 'Choose a route for the selected academic session.';
        } else if (!Number.isFinite(Number(transportRoute.transportFee)) || Number(transportRoute.transportFee) <= 0) {
          fieldErrors.transportRoute = 'The selected route does not have a valid transport fee.';
        }
      }
    }

    if (Object.keys(fieldErrors).length) {
      if (req.accepts('json')) {
        return res.status(400).json({ success: false, fieldErrors });
      }
      return res.status(400).render('students/form', {
        student: null,
        importResult: null,
        fieldErrors,
        formValues: req.body,
        ...(await loadStudentFormData()),
      });
    }

    const student = await Student.create({
      studentCode: normalizedCode,
      name: normalizedName,
      class: classId,
      section,
      guardianName,
      guardianPhone,
      admissionDateAD: admissionDate,
      academicSession,
      usesSchoolBus,
      transportRoute: usesSchoolBus ? transportRoute._id : null,
      migratedFromOldSystem: migratedFromOldSystem === 'on',
      status: 'ACTIVE',
    });

    if (migratedFromOldSystem === 'on' && Number(openingDueAmount) > 0) {
      await importOpeningBalance({
        studentId: student._id,
        amount: Number(openingDueAmount),
        asOfDateAD: openingDueAsOfDate || new Date(),
        sourceNote: openingDueNote || 'Migrated from previous billing software',
        enteredBy: req.body.enteredBy || 'admin',
      });
    }

    if (req.accepts('json')) {
      return res.status(201).json({ success: true, studentId: String(student._id) });
    }
    return res.redirect(`/students/${student._id}`);
  } catch (error) {
    console.error('Error creating student:', error);
    if (error.code === 11000) {
      if (req.accepts('json')) {
        return res.status(400).json({
          success: false,
          fieldErrors: { studentCode: 'This student code is already in use.' },
        });
      }
      try {
        return res.status(400).render('students/form', {
          student: null,
          importResult: null,
          fieldErrors: { studentCode: 'This student code is already in use.' },
          formValues: req.body,
          ...(await loadStudentFormData()),
        });
      } catch (renderError) {
        console.error('Error reloading student form after duplicate code:', renderError);
        return res.status(500).send('Unable to reload student form.');
      }
    }
    if (req.accepts('json')) {
      return res.status(500).json({ success: false, error: 'Unable to save the student.' });
    }
    return res.status(500).send('Unable to save student.');
  }
};

exports.editStudentForm = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send('Student not found');
    }

    const student = await Student.findById(req.params.id)
      .populate('class', 'studentClass section')
      .populate('academicSession', 'titleBS')
      .populate('transportRoute', 'routeName transportFee academicSession')
      .lean();
    if (!student) return res.status(404).send('Student not found');
    res.render('students/form', {
      student,
      importResult: null,
      fieldErrors: {},
      formValues: {},
      ...(await loadStudentFormData()),
    });
  } catch (error) {
    console.error('Error loading student edit form:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.updateStudent = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).send('Student not found');
  }

  try {
    const {
      studentCode, name, class: classId, section, guardianName,
      guardianPhone, admissionDateAD, admissionDateBS, academicSession, status,
    } = req.body;
    const usesSchoolBus = req.body.usesSchoolBus === 'on';
    const fieldErrors = {};
    const convertedAdmissionDateAD = admissionDateBS
      ? bs.BSToAD(admissionDateBS)
      : String(admissionDateAD || '').slice(0, 10);
    const admissionDate = convertedAdmissionDateAD ? new Date(convertedAdmissionDateAD) : null;
    if (!admissionDate || Number.isNaN(admissionDate.getTime())) {
      fieldErrors.admissionDateBS = 'Enter a valid Nepali admission date.';
    }
    let transportRoute = null;
    if (usesSchoolBus) {
      if (!mongoose.isValidObjectId(req.body.transportRoute)) {
        fieldErrors.transportRoute = 'Choose a transport route or switch off school bus.';
      } else {
        transportRoute = await Transport.findOne({
          _id: req.body.transportRoute,
          academicSession,
        }).select('_id transportFee').lean();
        if (!transportRoute) {
          fieldErrors.transportRoute = 'Choose a route for the selected academic session.';
        } else if (!Number.isFinite(Number(transportRoute.transportFee)) || Number(transportRoute.transportFee) <= 0) {
          fieldErrors.transportRoute = 'The selected route does not have a valid transport fee.';
        }
      }
    }
    if (Object.keys(fieldErrors).length) {
      const [student, formData] = await Promise.all([
        Student.findById(req.params.id).lean(),
        loadStudentFormData(),
      ]);
      return res.status(400).render('students/form', {
        student,
        importResult: null,
        fieldErrors,
        formValues: req.body,
        ...formData,
      });
    }

    await Student.findByIdAndUpdate(req.params.id, {
      studentCode, name, class: classId, section, guardianName,
      guardianPhone, admissionDateAD: admissionDate, academicSession, status,
      usesSchoolBus,
      transportRoute: usesSchoolBus ? transportRoute._id : null,
    }, { runValidators: true });

    return res.redirect(`/students/${req.params.id}`);
  } catch (error) {
    console.error('Error updating student:', error);
    return res.status(500).send('Unable to update student.');
  }
};

exports.viewStudentProfile = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).send('Student not found');
  }

  const student = await Student.findById(req.params.id)
    .populate('class')
    .populate('academicSession')
    .populate('transportRoute');

  if (!student) {
    return res.status(404).send('Student not found');
  }

  const invoices = await Invoice.find({ student: student._id }).sort({ billDateAD: -1 });
  const payments = await Payment.find({ student: student._id }).sort({ paymentDateAD: -1 });
  const ledger = await LedgerEntry.find({ student: student._id }).sort({ date: 1, createdAt: 1 });
  const balance = await getCurrentBalance(student._id);

  res.render('students/profile', { student, invoices, payments, ledger, balance });
};
