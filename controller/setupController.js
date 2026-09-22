
const Class = require('../models/Class');
const FeeCategory = require('../models/FeeCategory');
const AcademicSession = require('../models/AcademicSession');
const FeeStructure = require('../models/FeeStructure');
const School = require('../models/School');

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
  const { titleBS, startDateAD, endDateAD } = req.body;
  await AcademicSession.create({ titleBS, startDateAD, endDateAD });
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
