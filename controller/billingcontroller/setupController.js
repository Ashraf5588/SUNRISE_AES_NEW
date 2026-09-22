const Class = require('../../models/Class');
const Student = require('../../models/Student');
const FeeCategory = require('../../models/FeeCategory');
const AcademicSession = require('../../models/AcademicSession');
const FeeStructure = require('../../models/FeeStructure');
const School = require('../../models/School');
const Transport = require('../../model/billingschema/transport');
const Discount = require('../../model/billingschema/Discount');
const feeheadModel = require('../../model/billing/feeheadschema').feeheadModel;
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
      .populate('title.feehead', 'name'),
    Student.find().sort({ name: 1 }).select('_id name'),
    FeeCategory.find().sort({ name: 1 }).select('_id name')
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
