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

exports.locker = async (req, res) => {
  try{

const classlist = await studentClass.find({});
const subjectlist = await newsubject.find({}).sort({subject:1});
const terminalList = await terminal.find({}).sort({terminal:1});
const marksheetSetupList = await marksheetSetup.find({}).sort({marksheetName:1});
    res.render('./locker/locker', {
      classList: classlist,
      subjectList: subjectlist,
      terminalList: terminalList,
      marksheetSetupList: marksheetSetupList
    });

  }catch(err)
  {
    console.error('Error in locker controller:', err);
    res.status(500).send('Internal Server Error'+err);
  }
}
