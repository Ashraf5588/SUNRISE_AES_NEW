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
const Locker = require('../model/locker');
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const usermodel = mongoose.model("users", teacherSchema, "users");
const getSlipModel = () => {
 
  if (mongoose.models[`exam_marks`]) {
    return mongoose.models[`exam_marks`];
  }
  return mongoose.model(`exam_marks`, examSchema, `exam_marks`);
};

const issuedNepaliDate = String(bs.ADToBS(new Date()) || '').trim() || new Date().toLocaleDateString('en-GB');

const BS_MONTH_NAMES = {
  1: 'Baisakh',
  2: 'Jestha',
  3: 'Ashadh',
  4: 'Shrawan',
  5: 'Bhadra',
  6: 'Ashwin',
  7: 'Kartik',
  8: 'Mangsir',
  9: 'Poush',
  10: 'Magh',
  11: 'Falgun',
  12: 'Chaitra'
};

const NEPALI_MONTHS = {
  Baisakh: { maxDays: 31 },
  Jestha: { maxDays: 31 },
  Ashadh: { maxDays: 32 },
  Shrawan: { maxDays: 31 },
  Bhadra: { maxDays: 31 },
  Ashwin: { maxDays: 31 },
  Kartik: { maxDays: 30 },
  Mangsir: { maxDays: 29 },
  Poush: { maxDays: 30 },
  Magh: { maxDays: 29 },
  Falgun: { maxDays: 30 },
  Chaitra: { maxDays: 30 }
};

function normalizeText(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function getBsMonthNumber(monthName) {
  const normalized = normalizeText(monthName);
  for (const [key, value] of Object.entries(BS_MONTH_NAMES)) {
    if (normalizeText(value) === normalized) {
      return Number.parseInt(key, 10);
    }
  }
  return null;
}

function getBsMonthLength(monthName) {
  return NEPALI_MONTHS[monthName]?.maxDays || 32;
}

function getCanonicalMonthName(monthName) {
  if (!monthName) return '';
  const normalized = normalizeText(monthName);
  for (const [, value] of Object.entries(BS_MONTH_NAMES)) {
    if (normalizeText(value) === normalized) {
      return value;
    }
  }
  return String(monthName).trim();
}

function getStatusIsAbsent(status) {
  if (!status) return false;
  const normalized = normalizeText(status);
  return ['absent', 'ab', 'a', 'false'].includes(normalized);
}

function parseBsDate(bsDateString) {
  if (!bsDateString) return null;
  const parts = String(bsDateString).split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function getCurrentBSDate() {
  try {
    if (typeof bs.ADToBS === 'function') {
      const result = bs.ADToBS(new Date());
      const parsed = parseBsDate(result);
      if (parsed) return parsed;
    }
    if (typeof bs.toBS === 'function') {
      const result = bs.toBS(new Date());
      const parsed = parseBsDate(result);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.error('Error converting current date to BS:', err);
  }
  return { year: 2083, month: 2, day: 15 };
}

exports.locker = async (req, res) => {
  try{

const classlist = await studentClass.find({}).lean();
const subjectlist = await newsubject.find({}).lean().sort({subject:1});
const terminalList = await terminal.find({}).sort({terminal:1});
const marksheetSetupList = await marksheetSetup.find({}).sort({marksheetName:1});
const lockerRecords = await Locker.find({}).lean();
const currentDate = getCurrentBSDate();
const currentBsDate = `${currentDate.year}-${String(currentDate.month).padStart(2, '0')}-${String(currentDate.day).padStart(2, '0')}`;
const academicYear = String(marksheetSetupList[0] && marksheetSetupList[0].academicYear || currentDate.year);
const selectedTerminal = String(req.query.terminal || terminalList[0] && terminalList[0].terminal || 'FIRST');
const classGroups = [
  { name: 'Nursery - UKG', classes: ['Nursery', 'LKG', 'UKG'] },
  { name: 'One - Three', classes: ['One', 'Two', 'Three', '1', '2', '3'] },
  { name: 'Four - Five', classes: ['Four', 'Five', '4', '5'] },
  { name: 'Six - Seven', classes: ['Six', 'Seven', '6', '7'] },
  { name: 'Eight - Ten', classes: ['Eight', 'Nine', 'Ten', '8', '9', '10'] }
];
const lockerRows = [];
const classMap = new Map();
classlist.forEach((classItem) => {
  const classKey = normalizeText(classItem.studentClass);
  if (!classMap.has(classKey)) {
    classMap.set(classKey, { studentClass: classItem.studentClass, sections: new Set() });
  }
  classMap.get(classKey).sections.add(String(classItem.section || '').trim());
});

classMap.forEach((classData) => {
  const classSubjects = [...new Map(subjectlist
    .filter((subject) => normalizeText(subject.forClass) === normalizeText(classData.studentClass))
    .map((subject) => {
      const name = String(subject.newsubject || subject.subject || '').trim();
      return [normalizeText(name), name];
    })
    .filter(([key, name]) => key && name)
  ).values()];
  classSubjects.forEach((subject) => {
    const terminalName = selectedTerminal;
    const sectionValues = [...classData.sections].filter(Boolean);
    const savedRecords = lockerRecords.filter((record) =>
      normalizeText(record.subject) === normalizeText(subject)
      && normalizeText(record.studentClass) === normalizeText(classData.studentClass)
      && normalizeText(record.terminal) === normalizeText(terminalName)
      && String(record.academicYear) === academicYear
    );
    const saved = savedRecords.find((record) => sectionValues.includes(String(record.section || '').trim())) || savedRecords[0];
    lockerRows.push({
      studentClass: classData.studentClass,
      sections: sectionValues,
      subject,
      terminal: terminalName,
      academicYear,
      fromDate: saved && saved.fromDate || currentBsDate,
      toDate: saved && saved.toDate || currentBsDate
    });
  });
});
const groupTables = classGroups.map((group) => ({
  name: group.name,
  rows: lockerRows.filter((row) => group.classes.includes(String(row.studentClass)))
})).filter((group) => group.rows.length);
    res.render('./locker/locker', {
      classList: classlist,
      subjectList: subjectlist,
      terminalList: terminalList,
      marksheetSetupList: marksheetSetupList,
      lockerRecords,
      currentBsDate,
      academicYear,
      lockerRows,
      selectedTerminal,
      groupTables
    });

  }catch(err)
  {
    console.error('Error in locker controller:', err);
    res.status(500).send('Internal Server Error'+err);
  }
}

const normalizeLockerDate = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
};

exports.saveLocker = async (req, res) => {
  try {
    const fields = ['subject', 'studentClass', 'section', 'terminal', 'academicYear'];
    const values = Object.fromEntries(fields.map((field) => [field, String(req.body[field] || '').trim()]));
    values.fromDate = normalizeLockerDate(req.body.fromDate);
    values.toDate = normalizeLockerDate(req.body.toDate);
    if (fields.some((field) => !values[field]) || !values.fromDate || !values.toDate) {
      return res.status(400).json({ success: false, message: 'All locker fields are required.' });
    }
    if (values.fromDate > values.toDate) {
      return res.status(400).json({ success: false, message: 'Opening date cannot be after closing date.' });
    }
    await Locker.findOneAndUpdate(
      { subject: values.subject, studentClass: values.studentClass, section: values.section, terminal: values.terminal, academicYear: values.academicYear },
      values,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.redirect('/locker');
  } catch (error) {
    console.error('Error saving locker:', error);
    return res.status(500).send('Unable to save locker settings.');
  }
};

exports.saveLockerBulk = async (req, res) => {
  try {
    const fields = ['subject', 'studentClass', 'terminal', 'academicYear'];
    const values = Object.fromEntries(fields.map((field) => [field, String(req.body[field] || '').trim()]));
    const sections = Array.isArray(req.body.sections) ? req.body.sections : JSON.parse(String(req.body.sections || '[]'));
    values.fromDate = normalizeLockerDate(req.body.fromDate);
    values.toDate = normalizeLockerDate(req.body.toDate);
    if (fields.some((field) => !values[field]) || !sections.length || !values.fromDate || !values.toDate) {
      return res.status(400).json({ success: false, message: 'Complete locker data and at least one section are required.' });
    }
    if (values.fromDate > values.toDate) {
      return res.status(400).json({ success: false, message: 'Opening date cannot be after closing date.' });
    }
    await Promise.all(sections.map((section) => Locker.findOneAndUpdate(
      { subject: values.subject, studentClass: values.studentClass, section: String(section).trim(), terminal: values.terminal, academicYear: values.academicYear },
      { ...values, section: String(section).trim() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )));
    return res.redirect('/locker?terminal=' + encodeURIComponent(values.terminal));
  } catch (error) {
    console.error('Error saving locker rules by class:', error);
    return res.status(500).send('Unable to save locker settings.');
  }
};

exports.saveLockerAll = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'No locker rows to save.' });

    for (const row of rows) {
      const fromDate = normalizeLockerDate(row.fromDate);
      const toDate = normalizeLockerDate(row.toDate);
      const sections = Array.isArray(row.sections) ? row.sections : [];
      if (!row.subject || !row.studentClass || !row.terminal || !row.academicYear || !sections.length || !fromDate || !toDate || fromDate > toDate) {
        return res.status(400).json({ success: false, message: 'Every row must contain valid locker data and dates.' });
      }
      await Promise.all(sections.map((section) => Locker.findOneAndUpdate(
        { subject: String(row.subject).trim(), studentClass: String(row.studentClass).trim(), section: String(section).trim(), terminal: String(row.terminal).trim(), academicYear: String(row.academicYear).trim() },
        { subject: String(row.subject).trim(), studentClass: String(row.studentClass).trim(), section: String(section).trim(), terminal: String(row.terminal).trim(), academicYear: String(row.academicYear).trim(), fromDate, toDate },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )));
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error saving all locker rows:', error);
    return res.status(500).json({ success: false, message: 'Unable to save all locker settings.' });
  }
};

exports.checkEntryLocker = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'ADMIN') return next();
    const subject = String(req.query.subject || req.body.subject || '').trim();
    const studentClassValue = String(req.query.studentClass || req.body.studentClass || '').trim();
    const section = String(req.query.section || req.body.section || '').trim();
    const terminalValue = String(req.query.terminal || req.body.terminal || '').trim();
    const academicYear = String(req.query.academicYear || req.body.academicYear || '').trim();
    const today = normalizeLockerDate(bs.ADToBS(new Date()));
    const records = await Locker.find({ academicYear }).lean();
    const locker = records.find((record) =>
      normalizeText(record.subject) === normalizeText(subject)
      && normalizeText(record.studentClass) === normalizeText(studentClassValue)
      && normalizeText(record.section) === normalizeText(section)
      && normalizeText(record.terminal) === normalizeText(terminalValue)
    );
    const isOpen = locker
      && normalizeLockerDate(locker.fromDate) <= today
      && normalizeLockerDate(locker.toDate) >= today;
    if (!isOpen) {
      return res.status(403).render('locker-access-denied', {
        subject,
        studentClass: studentClassValue,
        section,
        terminal: terminalValue,
        academicYear,
        fromDate: locker && locker.fromDate,
        toDate: locker && locker.toDate
      });
    }
    return next();
  } catch (error) {
    console.error('Error checking entry locker:', error);
    return res.status(500).send('Unable to verify entry access.');
  }
};
