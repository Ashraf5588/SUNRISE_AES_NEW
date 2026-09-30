const mongoose = require('mongoose');
const Class = require('../../model/billingschema/Class');
const Student = require('../../model/billingschema/Student');

const AcademicSession = require('../../model/billingschema/AcademicSession');
const FeeStructure = require('../../model/billingschema/feestructureschema');
const School = require('../../model/billingschema/School');
const Transport = require('../../model/billingschema/transport');
const Discount = require('../../model/billingschema/Discount');
const OpeningBalance = require('../../model/billingschema/OpeningBalance');
const feeheadModel = require('../../model/billingschema/feeheadschema').feeheadModel;
const { importOpeningBalance } = require('../../services/billingService');

const loadOpeningBalanceData = async () => {
  const [students, openingBalances] = await Promise.all([
    Student.find().populate('class', 'name').populate('academicSession', 'titleBS').sort({ name: 1 }).lean(),
    OpeningBalance.find()
      .populate({ path: 'student', select: 'studentCode name class section', populate: { path: 'class', select: 'name' } })
      .sort({ createdAt: -1 })
      .lean()
  ]);
  const studentsWithOpeningBalance = new Set(
    openingBalances.filter((entry) => entry.student?._id).map((entry) => String(entry.student._id))
  );
  return {
    students: students.map((student) => ({
      ...student,
      hasOpeningBalance: studentsWithOpeningBalance.has(String(student._id))
    })),
    openingBalances,
    todayAD: new Date().toISOString().slice(0, 10)
  };
};

exports.openingBalancesPage = async (req, res) => {
  try {
    res.render('setup/openingbalance', {
      ...(await loadOpeningBalanceData()),
      formValues: {},
      error: '',
      saved: req.query.saved === '1'
    });
  } catch (error) {
    console.error('Unable to load opening balances:', error);
    res.status(500).send('Unable to load opening balances.');
  }
};

exports.createOpeningBalance = async (req, res) => {
  const formValues = {
    student: String(req.body.student || '').trim(),
    amount: String(req.body.amount || '').trim(),
    asOfDateAD: String(req.body.asOfDateAD || '').trim(),
    sourceNote: String(req.body.sourceNote || '').trim()
  };
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const asOfDateAD = new Date(`${formValues.asOfDateAD}T00:00:00.000Z`);
  const validDate = datePattern.test(formValues.asOfDateAD) &&
    !Number.isNaN(asOfDateAD.getTime()) &&
    asOfDateAD.toISOString().slice(0, 10) === formValues.asOfDateAD;
  const validAmount = /^-?\d+(?:\.\d{1,2})?$/.test(formValues.amount) &&
    Number.isFinite(Number(formValues.amount)) && Number(formValues.amount) !== 0;

  let error = '';
  if (!mongoose.isValidObjectId(formValues.student)) error = 'Choose a student from the list.';
  else if (!validAmount) error = 'Enter a non-zero amount with no more than two decimal places. Use a negative amount for an advance or credit.';
  else if (!validDate) error = 'Enter a valid as-of date.';
  else if (!formValues.sourceNote || formValues.sourceNote.length > 300) error = 'Enter a source note up to 300 characters.';

  if (error) {
    return res.status(400).render('setup/openingbalance', {
      ...(await loadOpeningBalanceData()), formValues, error, saved: false
    });
  }

  try {
    const student = await Student.findById(formValues.student).lean();
    if (!student) {
      return res.status(400).render('setup/openingbalance', {
        ...(await loadOpeningBalanceData()), formValues, error: 'The selected student was not found.', saved: false
      });
    }
    await importOpeningBalance({
      studentId: student._id,
      amount: Number(formValues.amount),
      asOfDateAD,
      sourceNote: formValues.sourceNote,
      enteredBy: req.user?.teacherName || req.user?.username || req.body.enteredBy || 'Billing administrator'
    });
    return res.redirect('/setup/opening-balances?saved=1');
  } catch (submitError) {
    const duplicate = submitError.code === 'OPENING_BALANCE_EXISTS' || submitError.code === 11000;
    console.error('Unable to save opening balance:', submitError);
    return res.status(duplicate ? 409 : 400).render('setup/openingbalance', {
      ...(await loadOpeningBalanceData()),
      formValues,
      error: duplicate ? 'This student already has an opening balance. Each student can have only one.' : 'Unable to save the opening balance. No changes were saved.',
      saved: false
    });
  }
};

// ---- Classes ----
exports.listClasses = async (req, res) => {
  const classes = await Class.find().sort({ order: 1 });
  res.render('setup/classes', { classes });
};

exports.createClass = async (req, res) => {
  const { name, order } = req.body;
  await Class.create({ name, order: Number(order) });
  res.redirect('/setup/classes');
};

// ---- Fee categories ----
exports.listFeeCategories = async (req, res) => {
  const feeCategories = await FeeCategory.find();
  res.render('setup/feeCategories', { feeCategories });
};

exports.createFeeCategory = async (req, res) => {
  const { name, frequency, isTaxable } = req.body;
  await FeeCategory.create({ name, frequency, isTaxable: isTaxable === 'on' });
  res.redirect('/setup/fee-categories');
};

// ---- Academic sessions ----
exports.listSessions = async (req, res) => {
  const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
  res.render('setup/sessions', { sessions });
};

exports.createSession = async (req, res) => {
  const { titleBS, startDateAD, endDateAD,isActive } = req.body;
  await AcademicSession.create({ titleBS, startDateAD, endDateAD, isActive });
  res.redirect('/setup/sessions');
};

exports.listTransportFees = async (req, res) => {
  const transportFees = await Transport.find().populate('academicSession').sort({ createdAt: -1 });
  const academicSessions = await AcademicSession.find().sort({ startDateAD: -1 });
  res.render('setup/transportfee', { transportFees, academicSessions });
};

exports.createTransportFee = async (req, res) => {
  const { routeName, transportFee, academicSession } = req.body;
  await Transport.create({ routeName, transportFee: Number(transportFee), academicSession });
  res.redirect('/setup/transportfee');
};

// discount setup
exports.discountdata = async (req, res) => {
  const feeHeads = await feeheadModel.find()
  const [discounts, students, feeCategories] = await Promise.all([
    Discount.find().sort({ createdAt: -1 })
      .populate('student', 'name')
      .populate({ path: 'title.feehead', model: feeheadModel, select: 'feehead' }),
    Student.find().sort({ name: 1 }).select('_id name'),
    feeheadModel.find().sort({ feehead: 1 }).select('_id feehead frequency')
  ]);

  res.render('setup/discount', { discounts, students, feeCategories, feeHeads });
};

exports.createDiscountFee = async (req, res) => {
  const { student, title } = req.body;

  if (!student) {
    return res.status(400).send('Student is required.');
  }

  const titleEntries = Array.isArray(title) ? title : [title];
  const normalizedEntries = titleEntries
    .filter(Boolean)
    .filter((entry) => entry.feehead && entry.discountType && entry.value !== undefined && entry.value !== '' && !Number.isNaN(Number(entry.value)))
    .map((entry) => ({
      feehead: entry.feehead,
      discountType: entry.discountType,
      value: Number(entry.value),
      validFromAD: entry.validFromAD || undefined,
      validToAD: entry.validToAD || undefined,
      reason: entry.reason || undefined,
    }));

  if (normalizedEntries.length === 0) {
    return res.status(400).send('At least one valid discount entry is required.');
  }

  const existingDiscount = await Discount.findOne({ student });

  if (existingDiscount) {
    existingDiscount.title.push(...normalizedEntries);
    await existingDiscount.save();
  } else {
    await Discount.create({ student, title: normalizedEntries });
  }

  res.redirect('/setup/discount');
};




exports.createSession = async (req, res) => {
  const { titleBS, startDateAD, endDateAD,isActive } = req.body;
  await AcademicSession.create({ titleBS, startDateAD, endDateAD, isActive });
  res.redirect('/setup/sessions');
};

// ---- Fee structures (amount per session + class + category) ----
exports.listFeeStructures = async (req, res) => {
  const feeStructures = await FeeStructure.find()
    .populate('academicSession')
    .populate('class')
    .populate('feeCategory');
  const classes = await Class.find().sort({ order: 1 });
  const feeCategories = await FeeCategory.find();
  const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
  res.render('setup/feeStructures', { feeStructures, classes, feeCategories, sessions });
};

exports.createFeeStructure = async (req, res) => {
  const { academicSession, class: classId, feeCategory, amount } = req.body;
  await FeeStructure.create({
    academicSession,
    class: classId,
    feeCategory,
    amount: Number(amount),
  });
  res.redirect('/setup/fee-structures');
};

// ---- School settings (PAN, invoice/receipt prefixes, fiscal year) ----
exports.getSchoolSettings = async (req, res) => {
  const school = await School.findOne();
  res.render('setup/school', { school });
};

exports.updateSchoolSettings = async (req, res) => {
  const {
    name, address, panNumber, vatRegistered, phone, email,
    invoicePrefix, receiptPrefix, currentFiscalYearBS,
  } = req.body;

  const data = {
    name, address, panNumber, phone, email, invoicePrefix,
    receiptPrefix, currentFiscalYearBS,
    vatRegistered: vatRegistered === 'on',
  };

  const school = await School.findOne();
  if (school) {
    await School.findByIdAndUpdate(school._id, data);
  } else {
    await School.create(data);
  }
  res.redirect('/setup/school');
};
