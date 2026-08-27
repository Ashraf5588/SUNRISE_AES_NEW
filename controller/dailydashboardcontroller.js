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

exports.dailydashboard = async (req, res) => {
  try{
    const currentDate = getCurrentBSDate();
    const selectedYear = Number.parseInt(req.query.year, 10) || currentDate.year;
    const selectedMonth = Number.parseInt(req.query.month, 10) || currentDate.month;
    const selectedDay = Number.parseInt(req.query.day, 10) || currentDate.day;
    const selectedDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

    const portfolios = await Portfolio.find({}).lean();
    const regs = portfolios.map((portfolio) => portfolio.reg).filter(Boolean);
    const students = regs.length ? await studentRecord.find({ reg: { $in: regs } }).lean() : [];
    const studentsByReg = students.reduce((acc, student) => {
      if (student && student.reg) acc[String(student.reg)] = student;
      return acc;
    }, {});

    const monthName = getCanonicalMonthName(BS_MONTH_NAMES[selectedMonth]);
    const rows = portfolios.map((portfolio) => {
      const reg = String(portfolio.reg || '');
      const student = studentsByReg[reg] || {};
      const complaints = Array.isArray(portfolio.complaints) ? portfolio.complaints : [];
      const normalizedComplaints = complaints.map((complaint) => ({
        ...complaint,
        nepaliDate: complaint.nepaliDate || (complaint.date ? String(bs.ADToBS(new Date(complaint.date)) || '') : '')
      }));
      const todayComplaints = normalizedComplaints.filter((complaint) => complaint.nepaliDate === selectedDate);

      return {
        reg,
        name: student.name || portfolio.name || '-',
        studentClass: student.studentClass || portfolio.studentClass || '-',
        section: student.section || portfolio.section || '-',
        todayComplaints,
        totalComplaints: normalizedComplaints.length,
        callLogs: []
      };
    });

    const attendanceDocs = await onlineAttendance.find({}).lean();
    const callsByReg = attendanceDocs.reduce((acc, doc) => {
      const reg = String(doc.reg || '');
      const entries = Array.isArray(doc.attendance) ? doc.attendance : [];
      acc[reg] = entries.filter((entry) => {
        const entryMonth = normalizeText(entry.month);
        const selectedMonthText = normalizeText(monthName);
        const timestampDate = entry.callLoggedAt ? String(bs.ADToBS(new Date(entry.callLoggedAt)) || '') : '';
        const matchesTimestamp = timestampDate === selectedDate;
        const matchesLegacyFields = String(entry.academicYear || '') === String(selectedYear)
          && (entryMonth === String(selectedMonth) || entryMonth === selectedMonthText)
          && String(entry.day || '') === String(selectedDay);
        return (matchesTimestamp || matchesLegacyFields)
          && (entry.callReason || entry.parentResponse || entry.callLoggedAt);
      });
      return acc;
    }, {});

    rows.forEach((row) => {
      row.callLogs = callsByReg[row.reg] || [];
    });
    const activeRows = rows.filter((row) => row.todayComplaints.length || row.callLogs.length);

    const healthRecords = await HealthRecord.find({}).lean().sort({ createdAt: -1 });
    const medicalRows = healthRecords
      .map((record) => ({
        ...record,
        displayDate: record.nepaliDate || (record.createdAt ? String(bs.ADToBS(new Date(record.createdAt)) || '') : '')
      }))
      .filter((record) => record.displayDate === selectedDate);
    const totalComplaintToday = rows.reduce((total, row) => total + row.todayComplaints.length, 0);
    const totalCallToday = Object.values(callsByReg).reduce((total, calls) => total + calls.length, 0);

    return res.render('./dailydashboard/dailydashboard', {
      currentDate,
      selectedYear,
      selectedMonth,
      selectedDay,
      selectedDate,
      monthName,
      bsMonthNames: BS_MONTH_NAMES,
      rows: activeRows,
      medicalRows,
      totalMedicalToday: medicalRows.length,
      totalComplaintToday,
      totalCallToday
    });

  }catch(err){
    console.error('Error in dailydashboard:', err);
    res.status(500).send('Internal Server Error');
  }
}