const mongoose = require('mongoose');
const Class = require('../../model/billingschema/Class');
const Student = require('../../model/billingschema/Student');

const AcademicSession = require('../../model/billingschema/AcademicSession');
const FeeStructure = require('../../model/billingschema/feestructureschema');
const Invoice = require('../../model/billingschema/Invoice');
const School = require('../../model/billingschema/School');
const Transport = require('../../model/billingschema/transport');
const Discount = require('../../model/billingschema/Discount');
const OpeningBalance = require('../../model/billingschema/OpeningBalance');
const feeheadModel = require('../../model/billingschema/feeheadschema').feeheadModel;
const { importOpeningBalance } = require('../../services/billingService');
const bs = require('../../utils/bikramSambat');

const loadOpeningBalanceData = async () => {
  const [students, openingBalances] = await Promise.all([
    Student.find().populate('class', 'name studentClass').populate('academicSession', 'titleBS').sort({ name: 1 }).lean(),
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
  res.render('setup/sessions', {
    sessions,
    editSession: null,
    error: '',
    success: req.query.updated === '1'
      ? 'Academic session updated successfully.'
      : req.query.deleted === '1' ? 'Academic session deleted successfully.' : '',
    formValues: {},
    toBSDate: value => bs.ADToBS(value),
  });
};

exports.editSessionForm = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Academic session not found.');
  const [sessions, editSession] = await Promise.all([
    AcademicSession.find().sort({ startDateAD: -1 }),
    AcademicSession.findById(req.params.id),
  ]);
  if (!editSession) return res.status(404).send('Academic session not found.');
  return res.render('setup/sessions', {
    sessions,
    editSession,
    error: '',
    success: '',
    formValues: {},
    toBSDate: value => bs.ADToBS(value),
  });
};

const getValidatedSessionInput = body => {
  const titleBS = String(body.titleBS || '').trim();
  const startDateBS = String(body.startDateBS || '').trim();
  const endDateBS = String(body.endDateBS || '').trim();

  if (!/^\d{4}$/.test(titleBS)) throw new Error('Enter the academic year as a four-digit BS year.');
  const startDateADText = bs.BSToAD(startDateBS);
  const endDateADText = bs.BSToAD(endDateBS);
  if (!startDateADText || !endDateADText) throw new Error('Enter valid BS start and end dates.');
  const startDateAD = new Date(`${startDateADText}T00:00:00.000Z`);
  const endDateAD = new Date(`${endDateADText}T00:00:00.000Z`);
  if (startDateAD > endDateAD) throw new Error('The end date must be on or after the start date.');

  return {
    titleBS,
    startDateAD,
    endDateAD,
    isActive: String(body.isActive || '') === 'true',
  };
};

exports.createSession = async (req, res) => {
  try {
    const input = getValidatedSessionInput(req.body);
    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        if (input.isActive) {
          await AcademicSession.updateMany({}, { $set: { isActive: false } }, { session: mongoSession });
        }
        await AcademicSession.create([input], { session: mongoSession });
      });
    } finally {
      await mongoSession.endSession();
    }
    return res.redirect('/setup/sessions');
  } catch (error) {
    const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
    return res.status(400).render('setup/sessions', {
      sessions,
      editSession: null,
      error: error.message,
      success: '',
      formValues: req.body,
      toBSDate: value => bs.ADToBS(value),
    });
  }
};

exports.updateSession = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Academic session not found.');
  try {
    const input = getValidatedSessionInput(req.body);
    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const session = await AcademicSession.findById(req.params.id).session(mongoSession);
        if (!session) throw new Error('Academic session not found.');
        if (input.isActive) {
          await AcademicSession.updateMany(
            { _id: { $ne: session._id } },
            { $set: { isActive: false } },
            { session: mongoSession }
          );
        }
        Object.assign(session, input);
        await session.save({ session: mongoSession });
      });
    } finally {
      await mongoSession.endSession();
    }
    return res.redirect('/setup/sessions?updated=1');
  } catch (error) {
    const [sessions, editSession] = await Promise.all([
      AcademicSession.find().sort({ startDateAD: -1 }),
      AcademicSession.findById(req.params.id),
    ]);
    return res.status(400).render('setup/sessions', {
      sessions,
      editSession,
      error: error.message,
      success: '',
      formValues: req.body,
      toBSDate: value => bs.ADToBS(value),
    });
  }
};

exports.deleteSession = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Academic session not found.');
  try {
    const session = await AcademicSession.findById(req.params.id).lean();
    if (!session) return res.status(404).send('Academic session not found.');

    const [students, invoices, feeStructures, transportFees] = await Promise.all([
      Student.countDocuments({ academicSession: session._id }),
      Invoice.countDocuments({ academicSession: session._id }),
      FeeStructure.countDocuments({ academicSession: session._id }),
      Transport.countDocuments({ academicSession: session._id }),
    ]);
    const dependencies = [
      students && `${students} student(s)`,
      invoices && `${invoices} invoice(s)`,
      feeStructures && `${feeStructures} fee structure(s)`,
      transportFees && `${transportFees} transport fee(s)`,
    ].filter(Boolean);

    if (dependencies.length) {
      const error = `This session cannot be deleted because it is referenced by ${dependencies.join(', ')}.`;
      const sessions = await AcademicSession.find().sort({ startDateAD: -1 });
      return res.status(409).render('setup/sessions', {
        sessions,
        editSession: null,
        error,
        success: '',
        formValues: {},
        toBSDate: value => bs.ADToBS(value),
      });
    }

    await AcademicSession.deleteOne({ _id: session._id });
    return res.redirect('/setup/sessions?deleted=1');
  } catch (error) {
    console.error('Unable to delete academic session:', error);
    return res.status(500).send('Unable to delete academic session.');
  }
};

exports.listTransportFees = async (req, res) => {
  try {
    const [transportFees, academicSessions, editRoute] = await Promise.all([
      Transport.find().populate('academicSession').sort({ createdAt: -1 }),
      AcademicSession.find().sort({ startDateAD: -1 }),
      req.params.id && mongoose.isValidObjectId(req.params.id)
        ? Transport.findById(req.params.id)
        : Promise.resolve(null),
    ]);
    if (req.params.id && !editRoute) return res.status(404).send('Transport route not found.');
    return res.render('setup/transportfee', {
      transportFees,
      academicSessions,
      editRoute,
      error: req.query.error || '',
      success: req.query.saved === '1' ? 'Transport route updated successfully.' : '',
    });
  } catch (error) {
    console.error('Unable to load transport fee setup:', error);
    return res.status(500).send('Unable to load transport fee setup.');
  }
};

exports.createTransportFee = async (req, res) => {
  const { routeName, transportFee, academicSession } = req.body;
  const amount = Number(transportFee);
  if (!String(routeName || '').trim() || String(transportFee ?? '').trim() === '' || !Number.isFinite(amount) || amount < 0
    || !mongoose.isValidObjectId(academicSession)) {
    return res.status(400).send('Enter a route name, valid non-negative monthly fare, and academic session.');
  }
  try {
    if (!await AcademicSession.exists({ _id: academicSession })) {
      return res.status(400).send('The selected academic session does not exist.');
    }
    await Transport.create({ routeName: String(routeName).trim(), transportFee: amount, academicSession });
    return res.redirect('/setup/transportfee');
  } catch (error) {
    console.error('Unable to create transport route:', error);
    return res.status(500).send('Unable to save transport route.');
  }
};

exports.updateTransportFee = async (req, res) => {
  const { routeName, transportFee, academicSession } = req.body;
  const amount = Number(transportFee);
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Transport route not found.');
  if (!String(routeName || '').trim() || String(transportFee ?? '').trim() === '' || !Number.isFinite(amount) || amount < 0
    || !mongoose.isValidObjectId(academicSession)) {
    return res.status(400).send('Enter a route name, valid non-negative monthly fare, and academic session.');
  }
  try {
    if (!await AcademicSession.exists({ _id: academicSession })) {
      return res.status(400).send('The selected academic session does not exist.');
    }
    const route = await Transport.findByIdAndUpdate(
      req.params.id,
      { routeName: String(routeName).trim(), transportFee: amount, academicSession },
      { runValidators: true, new: true }
    );
    if (!route) return res.status(404).send('Transport route not found.');
    return res.redirect('/setup/transportfee?saved=1');
  } catch (error) {
    console.error('Unable to update transport route:', error);
    return res.status(500).send('Unable to update transport route.');
  }
};

exports.deleteTransportFee = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Transport route not found.');
  try {
    const route = await Transport.findById(req.params.id).lean();
    if (!route) return res.status(404).send('Transport route not found.');
    const assignedStudent = await Student.exists({ transportRoute: route._id });
    if (assignedStudent) {
      return res.redirect(`/setup/transportfee?error=${encodeURIComponent('This route is assigned to one or more students. Reassign them before deleting it.')}`);
    }
    await Transport.deleteOne({ _id: route._id });
    return res.redirect('/setup/transportfee');
  } catch (error) {
    console.error('Unable to delete transport route:', error);
    return res.status(500).send('Unable to delete transport route.');
  }
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
