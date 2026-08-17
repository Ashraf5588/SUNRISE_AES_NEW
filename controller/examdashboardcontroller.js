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

async function getAttendanceDataFromApi(studentClass, section, academicYear) {
  const normalizedAcademicYear = String(academicYear || '').trim();
  const bsDate = getCurrentBSDate();
  const currentDay = 14
  const currentMonthNumber = Number.isFinite(bsDate.month) ? bsDate.month : 0;

  const holidayDoc = await holiday.findOne({ academicYear: normalizedAcademicYear }).lean();
  const holidayMonthMap = new Map(
    Array.isArray(holidayDoc?.month)
      ? holidayDoc.month.map((monthItem) => [
          getCanonicalMonthName(monthItem?.monthName),
          Array.isArray(monthItem?.holidayDays)
            ? monthItem.holidayDays.map((dayValue) => Number(dayValue))
            : []
        ])
      : []
  );

  let totalWorkingDaysUptoToday = 0;
  for (let monthIndex = 1; monthIndex <= currentMonthNumber; monthIndex += 1) {
    const monthName = BS_MONTH_NAMES[monthIndex];
    const monthLength = getBsMonthLength(monthName);
    const monthDayLimit = monthIndex === currentMonthNumber ? currentDay : monthLength;
    const holidayDaysForMonth = holidayMonthMap.get(getCanonicalMonthName(monthName)) || [];
    const holidayDaysUntilLimit = holidayDaysForMonth.filter(
      (dayValue) => Number.isFinite(dayValue) && dayValue <= monthDayLimit
    );
    totalWorkingDaysUptoToday += Math.max(monthDayLimit - holidayDaysUntilLimit.length, 0);
  }

  const onlineAttendanceDocs = await onlineAttendance
    .find({
      studentClass: String(studentClass).trim(),
      section: String(section).trim(),
      academicYear: normalizedAcademicYear
    })
    .lean();

  return onlineAttendanceDocs.map((onlineDoc) => {
    const reg = String(onlineDoc?.reg || '').trim();
    const attendanceEntries = Array.isArray(onlineDoc?.attendance) ? onlineDoc.attendance : [];
    const absentDayKeys = new Set();

    attendanceEntries.forEach((entry) => {
      const entryAcademicYear = String(entry?.academicYear || '').trim();
      if (entryAcademicYear !== normalizedAcademicYear) return;

      const entryMonthName = String(entry?.month || '').trim();
      const entryMonthNumber = getBsMonthNumber(entryMonthName);
      if (!entryMonthNumber || entryMonthNumber > currentMonthNumber) return;

      const entryDay = Number.parseInt(entry?.day, 10);
      if (!Number.isFinite(entryDay) || entryDay <= 0) return;

      const monthDayLimit =
        entryMonthNumber === currentMonthNumber
          ? Math.min(currentDay, getBsMonthLength(BS_MONTH_NAMES[entryMonthNumber]))
          : getBsMonthLength(BS_MONTH_NAMES[entryMonthNumber]);
      if (entryDay > monthDayLimit) return;

      const holidayDaysForMonth = holidayMonthMap.get(getCanonicalMonthName(entryMonthName)) || [];
      if (holidayDaysForMonth.includes(entryDay)) return;

      if (getStatusIsAbsent(entry?.status)) {
        const canonicalMonthName = getCanonicalMonthName(entryMonthName);
        absentDayKeys.add(`${canonicalMonthName}-${entryDay}`);
      }
    });

    const absentDays = absentDayKeys.size;
    const presentDays = Math.max(totalWorkingDaysUptoToday - absentDays, 0);

    return {
      reg,
      roll: onlineDoc?.roll || '',
      name: onlineDoc?.name || '',
      gender: onlineDoc?.gender || '',
      attendance: presentDays,
      totalWorkingDaysUptoToday,
      holidayDaysInAcademicYear: (holidayDoc?.month || []).reduce(
        (count, monthItem) => count + (Array.isArray(monthItem?.holidayDays) ? monthItem.holidayDays.length : 0),
        0
      ),
      absentDays,
      currentMonth: BS_MONTH_NAMES[bsDate.month] || '',
      currentDay,
      currentAcademicYear: normalizedAcademicYear
    };
  });
}


exports.examManagement = async (req, res, next) => {
  try {
    res.render("./exam/examdashboard", { 
      currentPage: "exammanagement",
      user: req.user
    });
  }catch (error) {
    console.error("Error loading exam management page:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.formatChoose = async (req, res, next) => {
  try {
    res.render("./exam/formatchoose", {
      currentPage: "exammanagement",
      user: req.user
    });
  } catch (error) {
    console.error("Error loading format choose page:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.generateMarksheet = async (req, res, next) => {
  try {
    const { studentClass, section, terminal, academicYear, format } = req.query;
    const studentClassdata = await studentClassModel.find({}).lean();
    const terminals = await terminalModel.find({}).lean();
    const user = req.user;
    creditHourData = await newsubject.find({ forClass: studentClass }).lean();
    const marksheetSetups = await marksheetSetup.find({}).lean();
    console.log("credit hour data", creditHourData);

    const model = getSlipModel();

    const studentWisedata = await model.aggregate([
      {
        $match: {
          terminal: terminal,
          academicYear: academicYear,
          studentClass: studentClass,
          section: section
        },
      },
      {
        $setWindowFields: {
          partitionBy: "$subject",
          output: {
            highestMarks: { $max: "$theorymarks" }
          }
        }
      },
      {
        $group: {
          _id: "$reg",
          name: { $max: "$name" },
          roll: { $max: "$roll" },
          terminal: { $first: "$terminal" },
          subjects: {
            $push: {
              subject: "$subject",
              attendance: "$attendance",
              theorymarks: "$theorymarks",
              practicalmarks: "$practicalmarks",
              theoryfullmarks: "$theoryfullmarks",
              passMarks: "$passMarks",
              practicalfullmarks: "$practicalfullmarks",
              creditHour: "$creditHour",
              totalpracticalmarks: "$totalpracticalmarks",
              worksheetGrades: "$worksheetGrades",
              highestmarks: "$highestMarks",
              terminalmarks: "$terminalmarks"
            }
          }
        }
      },
      {
        $sort: { roll: 1 }
      },
    ]);

   
    const attendanceData = await getAttendanceDataFromApi(studentClass, section, academicYear);
    const attendanceMap = new Map(attendanceData.map(item => [String(item.reg).trim(), item]));
    const attendanceWorkingDays = attendanceData?.[0]?.totalWorkingDaysUptoToday || marksheetSetups?.[0]?.terminals?.[0]?.workingDays || 0;

    studentWisedata.forEach((student) => {
      const reg = String(student._id || '').trim();
      const record = attendanceMap.get(reg);
      const attendanceValue = record?.attendance ?? (student.subjects?.[0]?.attendance ?? 0);
      student.subjects = student.subjects.map((sub) => ({ ...sub, attendance:sub.attendance}));
    });
    if(studentClass >3 || studentClass.toLowerCase() === "four" || studentClass.toLowerCase() === "five" || studentClass.toLowerCase() === "six" || studentClass.toLowerCase() === "seven" || studentClass.toLowerCase() === "eight" || studentClass.toLowerCase() === "nine" || studentClass.toLowerCase() === "ten")
    {
      studentWisedata.forEach((student) => {
      const reg = String(student._id || '').trim();
      const record = attendanceMap.get(reg);
      const attendanceValue = record?.attendance ?? (student.subjects?.[0]?.attendance ?? 0);
      student.subjects = student.subjects.map((sub) => ({ ...sub, attendance:attendanceValue }));
    });
    }

    if (Array.isArray(marksheetSetups)) {
      marksheetSetups.forEach((setup) => {
        if (Array.isArray(setup.terminals)) {
          setup.terminals.forEach((term) => {
            term.workingDays = attendanceWorkingDays;
          });
        }
      });
    }

    // Use if-else if-else structure to prevent multiple renders
    if (format == "practicalonly") {
      if (studentClass < 1 || studentClass.toLowerCase() === "nursery" || studentClass.toLowerCase() === "playgroup" || studentClass.toLowerCase() === "lkg" || studentClass.toLowerCase() === "ukg") {
        return res.render("./exam/preprimarypr", {
          currentPage: "exammanagement",
          studentClassdata: studentClassdata,
          terminals,
          format,
          studentWisedata,
          studentClass,
          section,
          terminal,
          academicYear,
          creditHourData,
          marksheetSetups,
          user: req.user
        });
      } else {
        return res.render("./exam/generatemarksheetpronly", {
          currentPage: "exammanagement",
          studentClassdata: studentClassdata,
          terminals,
          format,
          studentWisedata,
          studentClass,
          section,
          terminal,
          academicYear,
          creditHourData,
          marksheetSetups,
        });
      }
    } else if (format == "internalexternal") {
      return res.render("./exam/generatemarksheetinternalexternal", {
        currentPage: "exammanagement",
        studentClassdata: studentClassdata,
        terminals,
        format,
        user: req.user,
        marksheetSetups,
        studentClass,
        section,
        academicYear,
        terminal,
        studentWisedata,
        creditHourData,
        attendanceWorkingDays,
      });
    } else if (format == "theoryonly") {
      return res.render("./exam/generatemarksheettheoryonly", {
        currentPage: "exammanagement",
        studentClassdata: studentClassdata,
        terminals,
        format,
        studentWisedata,
        studentClass,
        section,
        terminal,
        academicYear,
        creditHourData,
        marksheetSetups,
        issuedNepaliDate,
        user: req.user
      });
    } else if (format == "cdcterminal") {
      if (studentClass < 1 || studentClass.toLowerCase() === "nursery" || studentClass.toLowerCase() === "playgroup" || studentClass.toLowerCase() === "lkg" || studentClass.toLowerCase() === "ukg" || studentClass.toLowerCase() === "one" || studentClass.toLowerCase() === "two" || studentClass.toLowerCase() === "three") {
        return res.render("./exam/generatemarksheetcdcterminalprimary", {
          currentPage: "exammanagement",
          studentClassdata: studentClassdata,
          terminals,
          format,
          studentWisedata,
          studentClass,
          section,
          terminal,
          academicYear,
          creditHourData,
          marksheetSetups,
          user: req.user
        });
      } else {
        return res.render("./exam/generatemarksheetcdcterminal", {
          currentPage: "exammanagement",
          studentClassdata: studentClassdata,
          terminals,
          format,
          studentWisedata,
          studentClass,
          section,
          terminal,
          academicYear,
          creditHourData,
          marksheetSetups,
          user: req.user
        });
      }
    } else {
      // Default case - theory practical
      if(studentClass<=3 || studentClass.toLowerCase() === "one" || studentClass.toLowerCase() === "two" || studentClass.toLowerCase() === "three")
      {
        return res.render("./exam/primarytheorypr", {
          currentPage: "exammanagement",
          studentClassdata: studentClassdata,
        terminals,
        format,
        studentWisedata,
        studentClass: studentClass,
        section,
        terminal,
        academicYear,
        creditHourData,
        marksheetSetups,
        issuedNepaliDate,
        user: req.user
        });


      }
      return res.render("./exam/generatemarksheettheorypr", {
        currentPage: "exammanagement",
        studentClassdata: studentClassdata,
        terminals,
        format,
        studentWisedata,
        studentClass: studentClass,
        section,
        terminal,
        academicYear,
        creditHourData,
        marksheetSetups,
        issuedNepaliDate,
        user: req.user
      });
    }
  } catch (error) {
    console.error("Error loading generate marksheet page:", error);
    return res.status(500).send("Internal Server Error");
  }
}
exports.generateMarksheetStudent = async (req, res, next) => {
  try {
   const {section,terminal,academicYear,format,reg} = req.query;
   const studentClass = req.query.studentClass || 'nursery';

   if(!reg)
   {
    return res.send("<center><h2>Please Provide Registration Number.</h2></center> <br> <center><a href='/myresult?studentClass="+studentClass+"&section="+section+"&terminal="+terminal+"&academicYear="+academicYear+"' style=\"border:2px solid gray;text-decoration:none;padding:10px 20px;background-color:orange;\">Go Back</a></center>");
   }
  
    const studentClassdata = await studentClassModel.find({}).lean();
    const terminals = await terminalModel.find({}).lean();
    const creditHourData = await newsubject.find({ forClass: studentClass }).lean();
       const marksheetSetups = await marksheetSetup.find({}).lean();
    console.log("credit hour data",creditHourData);
   
    const user = req.user;

    const model = getSlipModel();

  
  const studentWisedata = await model.aggregate([
  {
    $match: {
      terminal: terminal, academicYear:academicYear, studentClass: studentClass, section: section,reg:reg  // ← filter by terminal
    },
  },
  {
    $setWindowFields:{
      partitionBy: "$subject",
      output:{
        highestMarks: {$max:"$theorymarks"}
      }
    }
  },
  
  {
    $group: {
      _id: "$reg",
      name: { $first: "$name" },
      roll: { $first: "$roll" },
      terminal: { $first: "$terminal" }, 
       attendance: {
        $max: {
          $cond: [
            { $eq: ["$subject", "NEPALI"] },
            "$attendance",
            null
          ]
        }
      },// optional
      subjects: {
        $push: {
          subject: "$subject",
          attendance: "$attendance",
          theorymarks: "$theorymarks",
          practicalmarks: "$totalpracticalmarks",
          theoryfullmarks: "$theoryfullmarks",
          passMarks: "$passMarks",
          practicalfullmarks: "$practicalfullmarks",
          creditHour: "$creditHour",
          worksheetGrades: "$worksheetGrades",
          highestmarks: "$highestMarks"
         
        }
      }
    }
  },
  {
    $sort: { roll: 1 }  // optional: sort students by roll
  },

])



   if(format=="theorypractical")
   {
  
    if(studentClass<=3 || studentClass.toLowerCase() === "one" || studentClass.toLowerCase() === "two" || studentClass.toLowerCase() === "three")
    {
res.render("./exam/primarytheorypr", {
        currentPage: "exammanagement",

            studentClassdata:studentClassdata,
            terminals,
            format,
            studentWisedata,
            studentClass,
            section,
            terminal,
            academicYear,
            creditHourData,
            marksheetSetups,
           
      user: req.user
    });
    }
    if(studentClass.toLowerCase() === "nursery" || studentClass.toLowerCase() === "playgroup" || studentClass.toLowerCase() === "lkg" || studentClass.toLowerCase() === "ukg")
    {
      res.render("./exam/preprimarypr", {
        currentPage: "exammanagement",

            studentClassdata:studentClassdata,
            terminals,
            format,
            studentWisedata,
            studentClass,
            section,
            terminal,
            academicYear,
            creditHourData,
            marksheetSetups,
           
      user: req.user
    });
  
    }
    else

    { 
      if(studentClass.toLowerCase() === "four" || studentClass.toLowerCase() === "five" || studentClass=="4" || studentClass=="5")
      {
        res.render("./exam/marksheetfourfive", {
          currentPage: "exammanagement",
           studentClassdata:studentClassdata,
            terminals,
            format,
            studentWisedata,
            studentClass,
            section,
            terminal,
            academicYear,
            creditHourData,
            marksheetSetups,
           
      user: req.user
      });
    }
      else{
      res.render("./exam/generatemarksheettheorypr", {
        currentPage: "exammanagement",

            studentClassdata:studentClassdata,
            terminals,
            format,
            studentWisedata,
            studentClass,
            section,
            terminal,
            academicYear,
            creditHourData,
            marksheetSetups,
           
      user: req.user
    });
  }
  }
  }
  

  else if(format=="practicalonly")
  {
    res.render("./exam/generatemarksheetpronly", {
      currentPage: "exammanagement",
           studentClassdata:studentClassdata,
            terminals,
            format,
            studentWisedata,
            studentClass,
            section,
            terminal,
            academicYear,
            creditHourData,
            marksheetSetups,
    });
  } 
  else if(format=="internalexternal")
  {
    res.render("./exam/generatemarksheetinternalexternal", {
      currentPage: "exammanagement",
      studentClassdata:studentClassdata,
      terminals,
      format,
      user: req.user
    });
  }
  else if(format=="theoryonly")
   {
    res.render("./exam/generatemarksheettheoryonly", {
      currentPage: "exammanagement",

            studentClassdata:studentClassdata,
            terminals,
            format,
            studentWisedata,
            studentClass,
            section,
            terminal,
            academicYear,
            creditHourData,
            marksheetSetups,
            issuedNepaliDate,
           
      user: req.user
    });
  }
  }
  catch (error) {
    console.error("Error loading generate marksheet page:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.marksheetSetup = async (req, res, next) => {
  try {
    res.render("./exam/marksheetsetup", {
      currentPage: "exammanagement",
      user: req.user
    });
  }
    catch (error) {
    console.error("Error loading marksheet setup page:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.saveMarksheetSetup = async (req, res) => {
  try {
    const total = req.body.totalTerminals;
    const terminals = [];

    for (let i = 1; i <= total; i++) {
      const name = req.body[`name${i}`];
      const workingDays = req.body[`workingDays${i}`];

      if (name && workingDays) {
        terminals.push({ name, workingDays });
      }
    }

    // Check if we're updating an existing setup
    if (req.query.edit === 'true' && req.query.id) {
      // Update existing setup
      await marksheetSetup.findByIdAndUpdate(req.query.id, {
        schoolName: req.body.schoolName,
        address: req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        website: req.body.website,
        academicYear: req.body.academicYear,
        totalTerminals: total,
        terminals
      });
    } else {
      // Create new setup
      await marksheetSetup.create({
        schoolName: req.body.schoolName,
        address: req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        website: req.body.website,
        academicYear: req.body.academicYear,
        totalTerminals: total,
        terminals
      });
    }

    res.redirect('/marksheetsetup');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving marksheet setup");
  }
};
exports.deletemarksheetSetup = async (req, res) => {
  try {
    const { id } = req.params;
    await marksheetSetup.findByIdAndDelete(id);
    res.redirect('/marksheetsetup');
  } catch (err) {
    console.error("Error deleting marksheet setup:", err);
    res.status(500).send("Error deleting marksheet setup: " + err.message);
  }
};

exports.admitCard = async (req, res, next) => {
  try {
    const {studentClass,section,terminal,academicYear} = req.query;

    const studentClassdata = await studentClassModel.find({}).lean();
       const marksheetSetups = await marksheetSetup.find({}).lean();
       const studentRecords = await studentRecord.find({ studentClass: studentClass}).lean();
       const examRoutines = await routineModel.find({ studentClass: studentClass, terminal: terminal}).lean();
       console.log("Exam Routines:", examRoutines);
    res.render("./exam/admitcard", {
      currentPage: "exammanagement",
      studentClassdata:studentClassdata,
      marksheetSetups,
      studentRecords,
      user: req.user,
      examRoutines,
      terminal,academicYear,studentClass,section
    });
  
  } catch (error) {
    console.error("Error loading admit card page:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.examRoutine = async (req, res, next) => {
  try {
    const {studentClass,section,academicYear,terminal} = req.query;
    const studentClassdata = await studentClassModel.find({}).lean();
    const subjectData = await newsubject.find({}).lean();
       const marksheetSetups = await marksheetSetup.find({}).lean();
       const examRoutines = await routineModel.find();
         res.render("./exam/examroutine", {
      currentPage: "exammanagement",
      studentClassdata,
      marksheetSetups,
      user: req.user,
      academicYear,studentClass,section,
      subjectData,
      terminal,
      examRoutines,
      editing:false,
    });
       
  } catch (error) {
    console.error("Error loading exam routine page:", error);
    res.status(500).send("Internal Server Error");
  } 

}
exports.routineTerminalChoose = async (req, res, next) => {
  try {
    const marksheetSetups = await marksheetSetup.find({}).lean();
    res.render("./exam/routineterminalchoose", {  
      currentPage: "exammanagement",
      user: req.user,
      marksheetSetups
    });
  } catch (error) {
    console.error("Error loading routine terminal choose page:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.saveExamRoutine = async (req, res, next) => {
  try {
    const { studentClass, section, academicYear, terminal,routineId,editing } = req.query;
    if(routineId && editing==="true")
    {
      await routineModel.findByIdAndUpdate(routineId, req.body);
      return res.redirect(`/examroutine?studentClass=${studentClass}&academicYear=${academicYear}&terminal=${terminal}`);
    }
    else
    {

    
    await routineModel.create(req.body);
    res.redirect(`/examroutine?studentClass=${req.body.studentClass}&academicYear=${req.body.academicYear}&terminal=${req.body.terminal}`);
    }
  } catch (error) {
    console.error("Error saving exam routine:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.analytics = async (req, res, next) => {
  try{

    const {terminal,studentClass,section,academicYear,subject} = req.query;
    const studentClassdata = await studentClassModel.find({}).lean();
    const marksheetSetups = await marksheetSetup.find({}).lean();
      const subjects = await newsubject.find({}).lean();
    const model = getSlipModel();
    const matchStage = {};
    if (academicYear) {
      matchStage.academicYear = academicYear;
    }
    if (terminal) {
      matchStage.terminal = terminal;
    }
    if (studentClass) {
      matchStage.studentClass = studentClass;
    }
    if (section) {
      matchStage.section = section;
    }
    if(subject)
    {
      matchStage.subject= subject;
    }
    
    // 1. Class-wise Subject Analysis
    const classSubjectAnalysis = await model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { studentClass: "$studentClass", subject: "$subject", terminal: "$terminal" },
          totalStudents: { $sum: 1 },
          pass: {
            $sum: {$cond:[{$gte:["$theorymarks","$passMarks"]},1,0]}},
          fail: {
            $sum: {$cond:[{$lt:["$theorymarks","$passMarks"]},1,0]}},
          avgMarks: { $avg: "$theorymarks" },
        },
        
      },
      { $sort: { "_id.studentClass": 1, "_id.subject": 1 } }
    ]);

    // 2. Section-wise Analysis
    const sectionAnalysis = await model.aggregate([

      { $match: matchStage },
      {
        $group: {
          _id: { studentClass: "$studentClass", section: "$section", subject: "$subject", terminal: "$terminal" , academicYear: "$academicYear"},
          totalStudents: { $sum: 1 },
          pass: { $sum: { $cond: [{ $gte: [{ $add: ["$theorymarks", "$practicalmarks"] }, "$passMarks"] }, 1, 0] } },
          fail: { $sum: { $cond: [{ $lt: [{ $add: ["$theorymarks", "$practicalmarks"] }, "$passMarks"] }, 1, 0] } },
          avgMarks: { $avg: { $add: ["$theorymarks", "$practicalmarks"] } },
          highestMarks: {$max: "$theorymarks"},
          lowestMarks: {$min: "$theorymarks"},
          medianMarks : {$median:{input:"$theorymarks",method:"approximate"}},

        },

      },
  
      { $sort: { "_id.studentClass": 1, "_id.section": 1 ,fail: -1} },
      
    ]);
const finalStructureSectionAnalysis = {};
 for (const item of sectionAnalysis) {
  const studentClass= item._id.studentClass;
  const section = item._id.section;
  const subject = item._id.subject;
  const studentClassSection = `${studentClass}-${section}`;
  const terminal = item._id.terminal;
  const academicYear = item._id.academicYear;
  if (!finalStructureSectionAnalysis[academicYear]) {
    finalStructureSectionAnalysis[academicYear] = {};
  }
  if (!finalStructureSectionAnalysis[academicYear][terminal]) {
    finalStructureSectionAnalysis[academicYear][terminal] = {};
  }
   if (!finalStructureSectionAnalysis[academicYear][terminal][studentClassSection]) finalStructureSectionAnalysis[academicYear][terminal][studentClassSection] = [];

    finalStructureSectionAnalysis[academicYear][terminal][studentClassSection].push(item);
 
 }

//  count fail no per section
const failcountpersection =await  model.aggregate([
  { $match: matchStage },
  {
    $group: {
      _id: { studentClass: "$studentClass", section: "$section", terminal: "$terminal", academicYear: "$academicYear",reg:"$reg"},
      section:{ $first:"$section" },
      studentClass:{ $first:"$studentClass" },
      name:{ $first:"$name" },
      subjects: { 
      $push:{
      subject:"$subject",
      theorymarks:"$theorymarks",
      practicalmarks:"$practicalmarks",
      passMarks:"$passMarks",

    },
   

     }
      
    },
  },
  {
     $addFields:
    {
      failedSubjects: {
        $filter: {
          input: "$subjects",
          as: "sub",
          cond: { $lt: ["$$sub.theorymarks", "$$sub.passMarks"] }
        }
      },
      failCount:{
        $size:{
          $filter:
          {
          input:"$subjects",
          as:"sub",
          cond:{$lt:["$$sub.theorymarks","$$sub.passMarks"]}
        }
      }
      },
    }
  },
  { $match: { failCount: { $gt: 0 } } },
    {
      $group:{
        _id:{failCount:"$failCount", studentClass:"$studentClass",section:"$section",terminal:"$terminal",academicYear:"$academicYear"},

     
        
        section:{$first:"$section"},
        studentClass:{$first:"$studentClass"},
       name: { $push:{name:"$name",failedSubjects:"$failedSubjects"} },
        totalFailCount:{$sum:1}
    },
    
    
  },
  { $sort: { "_id.studentClass": 1, "_id.section": 1 ,"_id.failCount": 1} }
]);
console.log("Fail Count per Section Raw Data:", failcountpersection);
failpersectionlookup={};
failcountpersection.forEach((item)=>{
  const key = `${item._id.studentClass}-${item._id.section}`
   if (!failpersectionlookup[key]) {
    failpersectionlookup[key] = [];
  }

  failpersectionlookup[key].push(item);

});

 const compareTerminalWiseFailName = await model.aggregate([
  { $match: matchStage },
  {
    $group: {
      _id: { reg: "$reg", name: "$name", terminal: "$terminal",academicYear:"$academicYear" },
      failedSubjects: {
        $push: {
          $cond: [
            { $lt: ["$theorymarks", "$passMarks"] },
            { subject: "$subject", theorymarks: "$theorymarks", passMarks: "$passMarks" },
            "$$REMOVE"
          ]
        }
      },
    },
  },
  { $match: { "failedSubjects.0": { $exists: true } } },
    

 ]);
console.log("Compare Terminal Wise Fail Name:", compareTerminalWiseFailName);
console.log("Fail Count per Section:", failpersectionlookup);
 
    // 3. Subject-wise Average across all classes
    const subjectAnalysis = await model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { subject: "$subject", terminal: "$terminal", academicYear: "$academicYear",studentClass: "$studentClass" ,section: "$section" },
          totalStudents: { $sum: 1 },
          avgTheory: { $avg: "$theorymarks" },
          avgPractical: { $avg: "$practicalmarks" },
          avgTotal: { $avg: { $add: ["$theorymarks", "$practicalmarks"] } },
          pass: { $sum: { $cond: [{ $gte: [{ $add: ["$theorymarks", "$practicalmarks"] }, "$passMarks"] }, 1, 0] } },
          fail: { $sum: { $cond: [{ $lt: [{ $add: ["$theorymarks", "$practicalmarks"] }, "$passMarks"] }, 1, 0] } },
          highestMarkstheory: {$max:"$theorymarks"},
          lowestMarkstheory: {$min:"$theorymarks"},
          medianMarkstheory : {$median:{input:"$theorymarks",method:"approximate"}},
          highestMarkspractical: {$max:"$practicalmarks"},
          lowestMarkspractical: {$min:"$practicalmarks"},
          medianMarkspractical : {$median:{input:"$practicalmarks",method:"approximate"}},
          highestMarkstotal: {$max: { $add: ["$theorymarks", "$practicalmarks"] }},
          lowestMarkstotal: {$min: { $add: ["$theorymarks", "$practicalmarks"] }},
          medianMarkstotal : {$median:{input: { $add: ["$theorymarks", "$practicalmarks"] },method:"approximate"}},
          theroryFullMarks: {$first:"$theoryfullmarks"},
          practicalFullMarks: {$first:"$practicalfullmarks"},
          range1theory: { $sum:{
            $cond: [{$and: [{$gte: ["$theorymarks",0]}, {$lte: ["$theorymarks", { $multiply: [0.2, "$theoryfullmarks"] }]}]}, 1, 0],
          
          }},
          range2theory:{ $sum:{
            $cond: [{$and: [{$gte: ["$theorymarks", { $add: [ { $multiply: [0.2, "$theoryfullmarks"] }, 1 ] }]}, {$lte: ["$theorymarks", { $multiply: [0.4, "$theoryfullmarks"] }]}]}, 1, 0],
          }},
          range3theory: {$sum:{
            $cond: [{$and: [{$gte: ["$theorymarks", { $add: [ { $multiply: [0.4, "$theoryfullmarks"] }, 1 ] }]}, {$lte: ["$theorymarks", { $multiply: [0.6, "$theoryfullmarks"] }]}]}, 1, 0],
          }},
          range4theory: {$sum:{
            $cond: [{$and: [{$gte: ["$theorymarks", { $add: [ { $multiply: [0.6, "$theoryfullmarks"] }, 1 ] }]}, {$lte: ["$theorymarks", { $multiply: [0.8, "$theoryfullmarks"] }]}]}, 1, 0],
          }},
          range5theory: {$sum:{
            $cond: [{$and: [{$gte: ["$theorymarks", { $add: [ { $multiply: [0.8, "$theoryfullmarks"] }, 1 ] }]}, {$lte: ["$theorymarks", "$theoryfullmarks"]}]}, 1, 0],
          }},

        }
      },
      { $sort: { "_id.subject": 1 } }
    ]);
const subjectAnalysisFinalStructure = {};
  for (const item of subjectAnalysis) {
    const subject = item._id.subject;
    const terminal = item._id.terminal;
    const academicYear = item._id.academicYear;
    const studentClass = item._id.studentClass;
    const section = item._id.section;
    if (!subjectAnalysisFinalStructure[academicYear]) {
      subjectAnalysisFinalStructure[academicYear] = {};
    }
    if (!subjectAnalysisFinalStructure[academicYear][terminal]) {
      subjectAnalysisFinalStructure[academicYear][terminal] = {};
    }
    if (!subjectAnalysisFinalStructure[academicYear][terminal][subject]) {
      subjectAnalysisFinalStructure[academicYear][terminal][subject] = [];
    }
    subjectAnalysisFinalStructure[academicYear][terminal][subject].push(item);
  }

    // 4. Whole School Overview
    const schoolOverview = await model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { terminal: "$terminal" ,academicYear:"$academicYear",studentClass:"$studentClass",subject:"$subject"},
          totalStudents: { $sum: 1 },
          passtheory: { $sum: { $cond: [{ $gte: ["$theorymarks", "$passMarks"] }, 1, 0] } },
          failtheory: { $sum: { $cond: [{ $lt: ["$theorymarks", "$passMarks"] }, 1, 0] } },
          passpractical: { $sum: { $cond: [{ $gte: ["$practicalmarks", "$passMarks"] }, 1, 0] } },
          failpractical: { $sum: { $cond: [{ $lt: ["$practicalmarks", "$passMarks"] }, 1, 0] } },
         
        }
      },
      { $sort: { "_id.terminal": 1 } }
    ]);

const schoolOverviewFinalStructure = {};
  for (const item of schoolOverview) {
    const terminal = item._id.terminal;
    const academicYear = item._id.academicYear;
    const studentClass = item._id.studentClass;
    const subject = item._id.subject;
    if (!schoolOverviewFinalStructure[academicYear]) {
      schoolOverviewFinalStructure[academicYear] = {};
    }
    if (!schoolOverviewFinalStructure[academicYear][terminal]) {
      schoolOverviewFinalStructure[academicYear][terminal] = {};
    }
   if (!schoolOverviewFinalStructure[academicYear][terminal][studentClass]) {
      schoolOverviewFinalStructure[academicYear][terminal][studentClass] = [];
    }
    schoolOverviewFinalStructure[academicYear][terminal][studentClass].push(item) ;
  }

    // 5. Terminal Comparison
    const terminalComparison = await model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { subject: "$subject", terminal: "$terminal", academicYear: "$academicYear", studentClass: "$studentClass" , section: "$section" },
          totalStudents: { $sum: 1 },
          passtheory: { $sum: { $cond: [{ $gte: ["$theorymarks", "$passMarks"] }, 1, 0] } },
          failtheory: { $sum: { $cond: [{ $lt: ["$theorymarks", "$passMarks"] }, 1, 0] } },
          passpractical: { $sum: { $cond: [{ $gte: ["$practicalmarks", "$passMarks"] }, 1, 0] } },
          failpractical: { $sum: { $cond: [{ $lt: ["$practicalmarks", "$passMarks"] }, 1, 0] } },
          avgMarks: { $avg: "$theorymarks" },
        }
      },
      { $sort: { "_id.subject": 1, "_id.terminal": 1,"_id.academicYear": 1 } }
    ]);
   const terminalComparisonFinalStructure = {};

 for (const item of terminalComparison) {
  const studentClass= item._id.studentClass;
  const section = item._id.section;
  const subject = item._id.subject;
  const classSection = `${studentClass}-${section}`;
  const terminal = item._id.terminal;
  const academicYear = item._id.academicYear;
  if (!terminalComparisonFinalStructure[academicYear]) {
    terminalComparisonFinalStructure[academicYear] = {};
  }
  if (!terminalComparisonFinalStructure[academicYear][subject]) {
    terminalComparisonFinalStructure[academicYear][subject] = {};
  }
  if (!terminalComparisonFinalStructure[academicYear][subject][classSection]) {
    terminalComparisonFinalStructure[academicYear][subject][classSection] = {};
  }
    if (!terminalComparisonFinalStructure[academicYear][subject][classSection][terminal]) terminalComparisonFinalStructure[academicYear][subject][classSection][terminal] = [];
    terminalComparisonFinalStructure[academicYear][subject][classSection][terminal].push(item);
 
 }
 console.log("Terminal Comparison:", terminalComparisonFinalStructure);
 
    // 6. Year-wise Trend (for multiple years)
    const yearTrend = await model.aggregate([
      {
        $group: {
          _id: { subject: "$subject", academicYear: "$academicYear", terminal: "$terminal" },
          totalStudents: { $sum: 1 },
          pass: { $sum: { $cond: [{ $gte: [{ $add: ["$theorymarks", "$practicalmarks"] }, "$passMarks"] }, 1, 0] } },
          fail: { $sum: { $cond: [{ $lt: [{ $add: ["$theorymarks", "$practicalmarks"] }, "$passMarks"] }, 1, 0] } },
          avgMarks: { $avg: { $add: ["$theorymarks", "$practicalmarks"] } }
        }
      },
      { $sort: { "_id.academicYear": 1, "_id.subject": 1, "_id.terminal": 1 } }
    ]);

 
    console.log("School Overview:", schoolOverview);

const persubjectFailStudentName = await model.aggregate([
  { $match: matchStage },

  {
    $group: {
      _id: { subject: "$subject",terminal: "$terminal", academicYear: "$academicYear" },
      students: { 
        $push: {
          $cond: [
            { $lt: ["$theorymarks", "$passMarks"] },
            { name: "$name", reg: "$reg", studentClass: "$studentClass", section: "$section", theorymarks: "$theorymarks", passMarks: "$passMarks" },
            "$$REMOVE"
          ]
        }
       },
    },
  },
 

]);
const persubjectFailStudentNameStructure = {};
  for (const item of persubjectFailStudentName) {
    const subject = item._id.subject;
    const terminal = item._id.terminal;
    const academicYear = item._id.academicYear;
    if (!persubjectFailStudentNameStructure[academicYear]) {
      persubjectFailStudentNameStructure[academicYear] = {};
    }
    if (!persubjectFailStudentNameStructure[academicYear][terminal]) {
      persubjectFailStudentNameStructure[academicYear][terminal] = {};
    }
    if (!persubjectFailStudentNameStructure[academicYear][terminal][subject]) {
      persubjectFailStudentNameStructure[academicYear][terminal][subject] = [];
    }

    persubjectFailStudentNameStructure[academicYear][terminal][subject].push(...item.students);
  }

const combinationsofFailStudentAccrossTerminals = await model.aggregate([
  { $match: matchStage },
  {
    $group: {
      _id: { reg: "$reg", name: "$name", subject: "$subject" },
      terminalsFailed: {
        $push: {
          $cond: [
            { $lt: ["$theorymarks", "$passMarks"] },
            "$terminal",
            "$$REMOVE"
          ]
        }
      }
    },
  }
]);
console.log("Generated Combinations:", combinationsofFailStudentAccrossTerminals);

const studenttracking = await model.aggregate([
  { $match: matchStage },
  {
    $group: {
      _id: { reg: "$reg", name: "$name", subject: "$subject" },
      subjectsFailed: {
        $push: {
          $cond: [
            { $lt: ["$theorymarks", "$passMarks"] },
            { subject:"$subject", terminal: "$terminal", academicYear: "$academicYear",theorymarks: "$theorymarks", passMarks: "$passMarks",studentClass:"$studentClass",section:"$section"},

            "$$REMOVE"
          ]
        }
      }
    },
  },
  {$sort:{"_id.reg":1,"_id.subject":1} }
]);
console.log("Generated Student Tracking Data:", studenttracking);

    res.render("./exam/analytics", {
      currentPage: "exammanagement",
      user: req.user,
      classSubjectAnalysis,
      schoolOverview,
      terminalComparison,
      yearTrend,
      academicYear: academicYear || 'All Years',
      studentClassdata,
      marksheetSetups,
      subjects,
      finalStructureSectionAnalysis,
      subjectAnalysisFinalStructure,
      terminalComparisonFinalStructure,
      failpersectionlookup,
      persubjectFailStudentNameStructure,
      combinationsofFailStudentAccrossTerminals,
      studenttracking,
      
      combinationsofFailStudentAccrossTerminals
    });
  

}catch(err)
  {
    res.status(500).send("Internal Server Error");
    console.error("Error loading analytics page:", err);
  }

};
exports.editRoutine = async (req, res, next) => {

  try{
const {editing,routineId,terminal,academicYear,subject} = req.query;
  const routineData = await routineModel.findById(routineId).lean();
  console.log("Routine Data to Edit:", routineData);
  const studentClassdata = await studentClassModel.find({}).lean();
    const subjectData = await newsubject.find({}).lean();
       const marksheetSetups = await marksheetSetup.find({}).lean();
       const examRoutines = await routineModel.find();
    res.render("./exam/examroutine", {
      currentPage: "exammanagement",
      user: req.user,
      editing,
      routineData,
      terminal,
      academicYear,
      studentClassdata,
      marksheetSetups,
      subjectData,
      examRoutines,
      subject,

    });
  }catch(err)
  {
    res.status(500).send("Internal Server Error");
    console.error("Error loading edit routine page:", err);

  }
}
exports.deleteRoutine = async (req, res, next) => {

  try{
const {routineId,terminal,academicYear} = req.query;
  await routineModel.findByIdAndDelete(routineId);
  res.redirect(`/examroutine?studentClass=&academicYear=${academicYear}&terminal=${terminal}`);
  }catch(err)
  {
    res.status(500).send("Internal Server Error");
    console.error("Error deleting routine:", err);
  }
}

exports.ledger = async (req, res, next) => {
  try {
    const { studentClass, section, academicYear, terminal } = req.query;
    const studentClassdata = await studentClassModel.find({}).lean();
    const marksheetSetups = await marksheetSetup.find({}).lean();

    const model = getSlipModel();
    
    // Check if data exists
    const dataExists = await model.findOne({
      terminal: terminal,
      academicYear: academicYear,
      studentClass: studentClass,
      section: section
    }).lean();

    if (!dataExists) {
      return res.render("./exam/ledger", {
        fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
        currentPage: "exammanagement",
        studentClassdata,
        user: req.user,
        academicYear,
        studentClass,
        section,
        terminal,
        marksheetSetups,
        ledgerData: [],
        ledgerAnalysisLookup: {},
        noData: true,
        isPrePrimary: ['UKG', 'LKG', 'NURSERY'].includes(studentClass)
      });
    }

    // Normalize student class for comparison
    const normalizedClass = studentClass ? studentClass.toString().toUpperCase().trim() : '';
    
    // Check if it's pre-primary class
    const isPrePrimary = ['UKG', 'LKG', 'NURSERY'].includes(normalizedClass);
    
    // Check if it's primary (classes 1-3)
    const primaryClasses = ['1', 'ONE', 'I', '2', 'TWO', 'II', '3', 'THREE', 'III'];
    const isPrimary = primaryClasses.includes(normalizedClass);

    // Subjects that should NOT have worksheets
    const NO_WORKSHEET_SUBJECTS = ['HYGIENE', 'ORAL', 'ECA'];
    if (studentClass && studentClass.toUpperCase() === 'LKG') {
      NO_WORKSHEET_SUBJECTS.push('THEME');
    }
    let ledgerData = [];

    // Helper function to get GP from percentage
    function getGP(percent) {
      let gp = 0;
      if (percent >= 90) gp = 4.0;
      else if (percent >= 80) gp = 3.6;
      else if (percent >= 70) gp = 3.2;
      else if (percent >= 60) gp = 2.8;
      else if (percent >= 50) gp = 2.4;
      else if (percent >= 40) gp = 2.0;
      else if (percent >= 35) gp = 1.6;
      else gp = 0.0;
      return gp;
    }

    // Helper function to get GP from worksheet grade
    function getWorksheetGP(grade) {
      if (!grade) return 0;
      if (grade === 'Ab' || grade === '0.000001') return 0;
      const gradeMap = {
        'A+': 4.0,
        'A': 3.6,
        'B+': 3.2,
        'B': 2.8,
        'C+': 2.4,
        'C': 2.0,
        'D': 1.6,
        'NG': 0.0
      };
      return gradeMap[grade] || 0;
    }

    // Helper function to get grade from GP
    function getGrade(gp) {
      if (gp === 4.0) return "A+";
      if (gp >= 3.6) return "A";
      if (gp >= 3.2) return "B+";
      if (gp >= 2.8) return "B";
      if (gp >= 2.4) return "C+";
      if (gp >= 2.0) return "C";
      if (gp >= 1.6) return "D";
      return "NG";
    }

    // Helper function to check if subject should have worksheets
    function shouldHaveWorksheets(subjectName) {
      return !NO_WORKSHEET_SUBJECTS.includes(subjectName.toUpperCase());
    }

    // Helper function to check if value is Ab (sentinel 0.000001)
    function isAbValue(value) {
      if (value === null || value === undefined) return false;
      if (value === 0.000001 || value === '0.000001') return true;
      if (typeof value === 'number') {
        const epsilon = 0.0000001;
        if (Math.abs(value - 0.000001) < epsilon) return true;
      }
      if (typeof value === 'string') {
        const cleanValue = value.trim().toLowerCase();
        if (cleanValue === '0.000001' || cleanValue === 'ab' || cleanValue === 'absent') {
          return true;
        }
      }
      return false;
    }

    // ============================================
    // PRE-PRIMARY LEDGER (UKG, LKG, NURSERY)
    // ============================================
    if (isPrePrimary) {
      console.log("=== Processing PRE-PRIMARY LEDGER ===");
      
      const subjectCreditHours = {};
      if (marksheetSetups && marksheetSetups.length > 0 && marksheetSetups[0].subjects) {
        marksheetSetups[0].subjects.forEach(sub => {
          subjectCreditHours[sub.name] = sub.creditHour || 1;
        });
      }

      const rawData = await model.find({
        terminal: terminal,
        academicYear: academicYear,
        studentClass: studentClass,
        section: section
      }).lean();

      console.log(`Found ${rawData.length} raw records`);

      const studentMap = new Map();
      
      rawData.forEach(record => {
        const reg = record.reg;
        if (!studentMap.has(reg)) {
          studentMap.set(reg, {
            _id: reg,
            reg: reg,
            name: record.name,
            roll: record.roll,
            rollNumber: parseInt(record.roll) || 0,
            gender: record.gender,
            attendance: 0,
            subjects: [],
            rawSubjects: {}
          });
        }
        
        const student = studentMap.get(reg);
        student.subjects.push({
          subject: record.subject,
          theorymarks: record.theorymarks,
          practicalmarks: record.practicalmarks,
          theoryfullmarks: record.theoryfullmarks,
          practicalfullmarks: record.practicalfullmarks,
          passMarks: record.passMarks,
          worksheetGrades: record.worksheetGrades || [],
          totalWorksheet: record.totalWorksheet || 0,
          attendance: record.attendance || 0
        });
        
        student.rawSubjects[record.subject] = {
          theorymarks: record.theorymarks,
          worksheetGrades: record.worksheetGrades || [],
          totalWorksheet: record.totalWorksheet || 0,
          attendance: record.attendance || 0
        };
      });

      ledgerData = Array.from(studentMap.values()).map(student => {
        const subjectMap = {};
        let totalWeightedGP = 0;
        let totalCredits = 0;

        // Get attendance from NEPALI subject
        let attendanceFromNepali = 0;
        const nepaliSubject = student.subjects.find(sub => sub.subject.toUpperCase() === 'NEPALI');
        if (nepaliSubject && nepaliSubject.attendance !== undefined && nepaliSubject.attendance !== null) {
          attendanceFromNepali = nepaliSubject.attendance;
        } else {
          const anySubject = student.subjects.find(sub => sub.attendance !== undefined && sub.attendance !== null);
          if (anySubject) {
            attendanceFromNepali = anySubject.attendance;
          }
        }

        student.subjects.forEach(subject => {
          const subjectName = subject.subject;
          const rawTheoryMarks = subject.theorymarks;
          const worksheetGrades = subject.worksheetGrades || [];
          const totalWorksheet = subject.totalWorksheet || worksheetGrades.length;
          
          const hasWorksheets = shouldHaveWorksheets(subjectName);
          const isAb = isAbValue(rawTheoryMarks);
          
          let theoryGP = 0;
          let finalGP = 0;
          let practicalGP = 0;
          let totalWorksheetGP = 0;
          let worksheetCount = 0;
          
          if (!hasWorksheets) {
            if (isAb) {
              finalGP = 0;
              theoryGP = 0;
            } else {
              theoryGP = Number(rawTheoryMarks) || 0;
              finalGP = theoryGP;
            }
          } else {
            if (isAb) {
              theoryGP = 0;
            } else {
              theoryGP = Number(rawTheoryMarks) || 0;
            }
            
            if (worksheetGrades && worksheetGrades.length > 0) {
              worksheetGrades.forEach(grade => {
                const gp = getWorksheetGP(grade);
                totalWorksheetGP += gp;
                worksheetCount++;
              });
            }
            
            if (worksheetCount > 0) {
              finalGP = (theoryGP + totalWorksheetGP) / (worksheetCount + 1);
            } else {
              finalGP = theoryGP;
            }
            
            practicalGP = worksheetCount > 0 ? (totalWorksheetGP / worksheetCount) : 0;
          }
          
          const roundedFinalGP = Math.round(finalGP * 100) / 100;
          
          let theoryDisplay = '-';
          if (isAb) {
            theoryDisplay = 'Ab';
          } else {
            const gp = theoryGP;
            if (gp === 4.0) theoryDisplay = 'A+';
            else if (gp >= 3.6) theoryDisplay = 'A';
            else if (gp >= 3.2) theoryDisplay = 'B+';
            else if (gp >= 2.8) theoryDisplay = 'B';
            else if (gp >= 2.4) theoryDisplay = 'C+';
            else if (gp >= 2.0) theoryDisplay = 'C';
            else if (gp >= 1.6) theoryDisplay = 'D';
            else theoryDisplay = 'NG';
          }

          subjectMap[subjectName] = {
            theoryGP: rawTheoryMarks,
            theoryGPDisplay: isAb ? 'Ab' : theoryDisplay,
            theoryGPValue: theoryGP,
            practicalGP: practicalGP,
            finalGP: roundedFinalGP,
            worksheetGrades: hasWorksheets ? worksheetGrades : [],
            totalWorksheet: hasWorksheets ? totalWorksheet : 0,
            hasWorksheets: hasWorksheets,
            isAb: isAb,
            worksheetCount: worksheetCount,
            totalWorksheetGP: totalWorksheetGP || 0,
            theoryDisplay: theoryDisplay,
            attendance: subject.attendance || 0
          };

          const creditHour = subjectCreditHours[subjectName] || 1;
          totalWeightedGP += roundedFinalGP * creditHour;
          totalCredits += creditHour;
        });

        let gpa = 0;
        if (totalCredits > 0) {
          gpa = totalWeightedGP / totalCredits;
        }
        gpa = Math.round(gpa * 100) / 100;

        return {
          _id: student._id,
          name: student.name,
          roll: student.roll,
          rollNumber: student.rollNumber,
          gender: student.gender,
          attendance: attendanceFromNepali,
          subjects: student.subjects,
          subjectMap: subjectMap,
          rawSubjects: student.rawSubjects,
          gpa: gpa,
          rank: 0
        };
      });

      // Calculate ranks based on GPA
      const sortedStudents = [...ledgerData].sort((a, b) => b.gpa - a.gpa);
      let currentRank = 1;
      let previousGPA = null;
      let rankCounter = 1;

      sortedStudents.forEach((student) => {
        if (previousGPA !== null && student.gpa < previousGPA) {
          currentRank = rankCounter;
        }
        student.rank = currentRank;
        previousGPA = student.gpa;
        rankCounter++;
      });

      ledgerData.sort((a, b) => a.rollNumber - b.rollNumber);
    } 
    // ============================================
    // PRIMARY LEDGER (Classes 1-3)
    // ============================================
    else if (isPrimary) {
      console.log("=== Processing PRIMARY LEDGER (Classes 1-3) ===");
      
      const creditHourData = await newsubject.find({}).lean();
      const creditHourMap = {};
      creditHourData.forEach(item => {
        const key = `${item.newsubject}_${item.forClass}`;
        creditHourMap[key] = {
          theoryCredit: item.theoryCreditHour || 0,
          practicalCredit: item.practicalCreditHour || 0,
          forClass: item.forClass
        };
      });

      const rawData = await model.aggregate([
        {
          $match: {
            terminal: terminal,
            academicYear: academicYear,
            studentClass: studentClass,
            section: section
          },
        },
        {
          $addFields: {
            rollNumber: { $toInt: "$roll" }
          }
        },
        {
          $group: {
            _id: "$reg",
            name: { $first: "$name" },
            roll: { $first: "$roll" },
            rollNumber: { $first: "$rollNumber" },
            gender: { $first: "$gender" },
            attendance: {
              $first: {
                $cond: [
                  { $eq: ["$subject", "NEPALI"] },
                  "$attendance",
                  null
                ]
              }
            },
            subjects: {
              $push: {
                subject: "$subject",
                theorymarks: "$theorymarks",
                practicalmarks: "$practicalmarks",
                theoryfullmarks: "$theoryfullmarks",
                practicalfullmarks: "$practicalfullmarks",
                passMarks: "$passMarks",
                worksheetGrades: "$worksheetGrades",
                totalWorksheet: "$totalWorksheet",
                attendance: "$attendance"
              }
            }
          }
        },
        { $sort: { rollNumber: 1 } }
      ]);

      ledgerData = rawData.map((student) => {
        const subjectMap = {};
        let totalWeightedGP = 0;
        let totalCredits = 0;

        // Get attendance from NEPALI subject (fallback if aggregation didn't get it)
        let attendance = student.attendance || 0;
        if (!attendance) {
          const nepaliSubject = student.subjects.find(sub => sub.subject.toUpperCase() === 'NEPALI');
          if (nepaliSubject && nepaliSubject.attendance) {
            attendance = nepaliSubject.attendance;
          }
        }

        student.subjects.forEach((subject) => {
          const subjectName = subject.subject;
          const theoryMarks = subject.theorymarks || 0;
          const theoryFullMarks = subject.theoryfullmarks || 100;
          const practicalMarks = subject.practicalmarks || 0;
          const practicalFullMarks = subject.practicalfullmarks || 100;
          const worksheetGrades = subject.worksheetGrades || [];
          const totalWorksheet = subject.totalWorksheet || worksheetGrades.length;

          const hasWorksheets = shouldHaveWorksheets(subjectName);
          const isAb = isAbValue(theoryMarks);

          let theoryGP = 0;
          if (isAb) {
            theoryGP = 0;
          } else {
            const theoryPercentage = theoryFullMarks > 0 ? (theoryMarks / theoryFullMarks) * 100 : 0;
            theoryGP = getGP(theoryPercentage);
          }

          let finalGP = 0;
          let practicalGP = 0;
          let totalWorksheetGP = 0;
          let worksheetCount = 0;

          if (!hasWorksheets) {
            finalGP = theoryGP;
            practicalGP = theoryGP;
          } else {
            if (worksheetGrades && worksheetGrades.length > 0) {
              worksheetGrades.forEach((grade) => {
                const gp = getWorksheetGP(grade);
                totalWorksheetGP += gp;
                worksheetCount++;
              });
            }
            
            practicalGP = worksheetCount > 0 ? (totalWorksheetGP / worksheetCount) : 0;
            
            const compositeKey = `${subjectName}_${studentClass}`;
            const credits = creditHourMap[compositeKey] || { theoryCredit: 0, practicalCredit: 0 };
            const theoryCredit = credits.theoryCredit || 0;
            const practicalCredit = credits.practicalCredit || 0;
            const totalCredit = theoryCredit + practicalCredit;
            
            if (totalCredit > 0) {
              finalGP = ((theoryGP * theoryCredit) + (practicalGP * practicalCredit)) / totalCredit;
            } else {
              finalGP = (theoryGP + practicalGP) / 2;
            }
          }

          const roundedFinalGP = Math.round(finalGP * 100) / 100;

          let theoryDisplay = '-';
          if (isAb) {
            theoryDisplay = 'Ab';
          } else {
            const gp = theoryGP;
            if (gp === 4.0) theoryDisplay = 'A+';
            else if (gp >= 3.6) theoryDisplay = 'A';
            else if (gp >= 3.2) theoryDisplay = 'B+';
            else if (gp >= 2.8) theoryDisplay = 'B';
            else if (gp >= 2.4) theoryDisplay = 'C+';
            else if (gp >= 2.0) theoryDisplay = 'C';
            else if (gp >= 1.6) theoryDisplay = 'D';
            else theoryDisplay = 'NG';
          }

          const compositeKey = `${subjectName}_${studentClass}`;
          const credits = creditHourMap[compositeKey] || { theoryCredit: 0, practicalCredit: 0 };
          const theoryCredit = credits.theoryCredit || 0;
          const practicalCredit = credits.practicalCredit || 0;
          const totalCredit = theoryCredit + practicalCredit;

          subjectMap[subjectName] = {
            theoryGP: isAb ? 0.000001 : Math.round(theoryGP * 100) / 100,
            theoryGPDisplay: theoryDisplay,
            theoryGPValue: theoryGP,
            isAb: isAb,
            practicalGP: Math.round(practicalGP * 100) / 100,
            finalGP: roundedFinalGP,
            theoryMarks: theoryMarks,
            practicalMarks: practicalMarks,
            worksheetGrades: hasWorksheets ? worksheetGrades : [],
            totalWorksheet: hasWorksheets ? totalWorksheet : 0,
            theoryPercentage: Math.round((theoryFullMarks > 0 ? (theoryMarks / theoryFullMarks) * 100 : 0) * 100) / 100,
            practicalPercentage: Math.round(practicalGP * 25 * 100) / 100,
            hasWorksheets: hasWorksheets,
            worksheetCount: worksheetCount || 0,
            totalWorksheetGP: totalWorksheetGP || 0,
            theoryDisplay: theoryDisplay,
            theoryCredit: theoryCredit,
            practicalCredit: practicalCredit,
            totalCredit: totalCredit,
            attendance: subject.attendance || 0
          };

          if (totalCredit > 0) {
            totalWeightedGP += roundedFinalGP * totalCredit;
            totalCredits += totalCredit;
          } else {
            totalWeightedGP += roundedFinalGP * 1;
            totalCredits += 1;
          }
        });

        let gpa = 0;
        if (totalCredits > 0) {
          gpa = totalWeightedGP / totalCredits;
        }
        gpa = Math.round(gpa * 100) / 100;

        return {
          _id: student._id,
          name: student.name,
          roll: student.roll,
          rollNumber: student.rollNumber,
          gender: student.gender,
          attendance: attendance,
          subjects: student.subjects,
          subjectMap: subjectMap,
          gpa: gpa,
          rank: 0
        };
      });

      // Calculate ranks based on GPA
      const sortedStudents = [...ledgerData].sort((a, b) => b.gpa - a.gpa);
      let currentRank = 1;
      let previousGPA = null;
      let rankCounter = 1;

      sortedStudents.forEach((student) => {
        if (previousGPA !== null && student.gpa < previousGPA) {
          currentRank = rankCounter;
        }
        student.rank = currentRank;
        previousGPA = student.gpa;
        rankCounter++;
      });

      ledgerData.sort((a, b) => a.rollNumber - b.rollNumber);
    } 
    // ============================================
    // REGULAR LEDGER (Classes 4+)
    // ============================================
    else {
      console.log("=== Processing REGULAR LEDGER (Classes 4+) ===");
      
      ledgerData = await model.aggregate([
        {
          $match: {
            terminal: terminal,
            academicYear: academicYear,
            studentClass: studentClass,
            section: section
          },
        },
        {
          $addFields: {
            rollNumber: { $toInt: "$roll" }
          }
        },
        {
          $group: {
            _id: "$reg",
            name: { $first: "$name" },
            roll: { $first: "$roll" },
            rollNumber: { $first: "$rollNumber" },
            gender: { $first: "$gender" },
            attendance: { $first: "$attendance" },
            subjects: {
              $push: {
                subject: "$subject",
                theorymarks: "$theorymarks",
                practicalmarks: "$practicalmarks",
                theoryfullmarks: "$theoryfullmarks",
                practicalfullmarks: "$practicalfullmarks",
                totalpracticalmarks: "$totalpracticalmarks",
                passMarks: "$passMarks",
                terminalmarks: "$terminalmarks",
                totalmarks: { $add: ["$theorymarks", "$totalpracticalmarks"] },
              }
            }
          }
        },
        {
          $addFields: {
            failcount: {
              $size: {
                $filter: {
                  input: "$subjects",
                  as: "sub",
                  cond: { $lt: ["$$sub.theorymarks", "$$sub.passMarks"] }
                }
              }
            },
            totalTh: {
              $reduce: {
                input: "$subjects",
                initialValue: 0,
                in: { $add: ["$$value", "$$this.theorymarks"] }
              }
            },
            totalPr: {
              $reduce: {
                input: "$subjects",
                initialValue: 0,
                in: { $add: ["$$value", "$$this.totalpracticalmarks"] }
              }
            },
            totalTheoryFullMarks: {
              $reduce: {
                input: "$subjects",
                initialValue: 0,
                in: { $add: ["$$value", "$$this.theoryfullmarks"] }
              }
            },
            theorypercentage: {
              $cond: {
                if: {
                  $eq: [
                    {
                      $reduce: {
                        input: "$subjects",
                        initialValue: 0,
                        in: { $add: ["$$value", "$$this.theoryfullmarks"] }
                      }
                    },
                    0
                  ]
                },
                then: 0,
                else: {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $reduce: {
                            input: "$subjects",
                            initialValue: 0,
                            in: { $add: ["$$value", "$$this.theorymarks"] }
                          }
                        },
                        {
                          $reduce: {
                            input: "$subjects",
                            initialValue: 0,
                            in: { $add: ["$$value", "$$this.theoryfullmarks"] }
                          }
                        }
                      ]
                    },
                    100
                  ]
                }
              }
            }
          }
        },
        {
          $setWindowFields: {
            sortBy: { totalTh: -1 },
            output: {
              rank: {
                $rank: {}
              }
            }
          }
        },
        { $sort: { rollNumber: 1 } }
      ]);

      // Process regular data - set hasWorksheets flag and preserve Ab values
      ledgerData.forEach((student) => {
        let lookupmap = {};
        if (student.subjects) {
          student.subjects.forEach((sub) => {
            const hasWorksheets = shouldHaveWorksheets(sub.subject);
            const isAb = isAbValue(sub.theorymarks);
            lookupmap[sub.subject] = {
              ...sub,
              hasWorksheets: hasWorksheets,
              worksheetGrades: hasWorksheets ? (sub.worksheetGrades || []) : [],
              isAb: isAb,
              theoryGP: isAb ? 0.000001 : sub.theorymarks,
              theoryDisplay: isAb ? 'Ab' : sub.theorymarks
            };
          });
        }
        student.subjectMap = lookupmap;
      });
    }

    // ============================================
    // CALCULATE ANALYSIS DATA
    // ============================================
    console.log("\n=== Calculating Analysis Data ===");
    let ledgerAnalysis = [];
    if (ledgerData.length > 0) {
      const uniqueSubjects = new Set();
      ledgerData.forEach(student => {
        if (student.subjects) {
          student.subjects.forEach(sub => {
            uniqueSubjects.add(sub.subject);
          });
        }
      });

      const subjectAnalysisPromises = Array.from(uniqueSubjects).map(async (subject) => {
        const matchQuery = {
          terminal: terminal,
          academicYear: academicYear,
          studentClass: studentClass,
          section: section,
          subject: subject
        };

        const result = await model.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: null,
              highestMarks: { $max: "$theorymarks" },
              lowestMarks: { $min: "$theorymarks" },
              avgMarks: { $avg: "$theorymarks" },
              maleavg: {
                $avg: {
                  $cond: [
                    { $eq: ["$gender", "Male"] },
                    "$theorymarks",
                    null
                  ]
                }
              },
              femaleavg: {
                $avg: {
                  $cond: [
                    { $eq: ["$gender", "Female"] },
                    "$theorymarks",
                    null
                  ]
                }
              },
              failCount: {
                $sum: {
                  $cond: [{ $lt: ["$theorymarks", "$passMarks"] }, 1, 0]
                }
              },
              totalStudents: { $sum: 1 },
              passCount: {
                $sum: {
                  $cond: [{ $gte: ["$theorymarks", "$passMarks"] }, 1, 0]
                }
              }
            }
          },
          {
            $project: {
              _id: 0,
              subject: subject,
              highestMarks: { $ifNull: ["$highestMarks", 0] },
              lowestMarks: { $ifNull: ["$lowestMarks", 0] },
              avgMarks: { $ifNull: ["$avgMarks", 0] },
              maleavg: { $ifNull: ["$maleavg", 0] },
              femaleavg: { $ifNull: ["$femaleavg", 0] },
              failCount: { $ifNull: ["$failCount", 0] },
              totalStudents: { $ifNull: ["$totalStudents", 0] },
              passCount: { $ifNull: ["$passCount", 0] }
            }
          }
        ]);

        return result[0] || {
          subject: subject,
          highestMarks: 0,
          lowestMarks: 0,
          avgMarks: 0,
          maleavg: 0,
          femaleavg: 0,
          failCount: 0,
          totalStudents: 0,
          passCount: 0
        };
      });

      ledgerAnalysis = await Promise.all(subjectAnalysisPromises);
    }

    const ledgerAnalysisLookup = {};
    ledgerAnalysis.forEach((item) => {
      if (item && item.subject) {
        ledgerAnalysisLookup[item.subject] = item;
      }
    });

    // ============================================
    // RENDER BASED ON CLASS TYPE
    // ============================================
    if (isPrePrimary) {
      res.render("./exam/ledgerpreprimary", {
        fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
        currentPage: "exammanagement",
        studentClassdata,
        user: req.user,
        academicYear,
        studentClass,
        section,
        terminal,
        marksheetSetups,
        ledgerData,
        ledgerAnalysisLookup,
        noData: ledgerData.length === 0,
        isPrePrimary: isPrePrimary,
        NO_WORKSHEET_SUBJECTS: NO_WORKSHEET_SUBJECTS
      });
      return;
    } else if (isPrimary) {
      res.render("./exam/ledgerprimary", {
        fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
        currentPage: "exammanagement",
        studentClassdata,
        user: req.user,
        academicYear,
        studentClass,
        section,
        terminal,
        marksheetSetups,
        ledgerData,
        ledgerAnalysisLookup,
        noData: ledgerData.length === 0,
        isPrimary: isPrimary,
        getGP: getGP,
        getGrade: getGrade,
        NO_WORKSHEET_SUBJECTS: NO_WORKSHEET_SUBJECTS
      });
      return;
    } else {
      if (studentClass == "Four" || studentClass == "4" || studentClass == "FOUR" || studentClass == "four" || 
          studentClass == "Five" || studentClass == "5" || studentClass == "FIVE" || studentClass == "five") {
        res.render("./exam/ledgerfourfive", {
          fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
          currentPage: "exammanagement",
          studentClassdata,
          user: req.user,
          academicYear,
          studentClass,
          section,
          terminal,
          marksheetSetups,
          ledgerData,
          ledgerAnalysisLookup,
          noData: ledgerData.length === 0,
          isPrePrimary: isPrePrimary,
          NO_WORKSHEET_SUBJECTS: NO_WORKSHEET_SUBJECTS
        });
      } else {
        res.render("./exam/ledger", {
          fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
          currentPage: "exammanagement",
          studentClassdata,
          user: req.user,
          academicYear,
          studentClass,
          section,
          terminal,
          marksheetSetups,
          ledgerData,
          ledgerAnalysisLookup,
          noData: ledgerData.length === 0,
          isPrePrimary: isPrePrimary,
          NO_WORKSHEET_SUBJECTS: NO_WORKSHEET_SUBJECTS
        });
      }
    }
    
  } catch (err) {
    console.error("Error loading ledger page:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
};
exports.myResult = async (req, res, next) => {
 try
 {
  const studentClassdata = await studentClass.find({}).lean();
   const marksheetSetups = await marksheetSetup.find({}).lean();
  
  res.render("./exam/myresult",{studentClassdata,marksheetSetups})
 } catch(err)
 {
    res.status(500).send("Internal Server Error" + err);
    console.error("Error loading my result page:", err);
 }
}

exports.formatChooseStudent = async (req, res, next) => {
  try {
    const {studentClass,section,terminal,academicYear,reg} = req.query;
    res.render("./exam/formatchoosestudent", {
      currentPage: "exammanagement",
      user: req.user,
      studentClass,
      section,
      terminal,
      academicYear,
      reg,
    });
  } catch (error) {
    console.error("Error loading format choose page:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.studentPortfolio = async (req, res, next) => {
  try {
    const {studentClass,section,terminal,academicYear,reg} = req.query;
    const user = req.user;
    const allClassData = await studentClassModel.find({}).lean().sort({ studentClass: 1, section: 1 });

    const normalize = (value) => String(value || '').trim().toLowerCase();
    const studentClassdata = user && user.role !== 'ADMIN'
      ? allClassData.filter((item) =>
          (user.allowedSubjects || []).some((allowed) =>
            normalize(allowed.studentClass) === normalize(item.studentClass)
            && normalize(allowed.section) === normalize(item.section)
          )
        )
      : allClassData;
    
    
       const marksheetSetups = await marksheetSetup.find({}).lean();
       const model = getSlipModel();
       const rosterFilter = { studentClass, section };
       if (reg) {
         rosterFilter.reg = String(reg);
       }
       const roster = await studentRecord.find(rosterFilter).lean().sort({ roll: 1 });
       const rosterByReg = roster.reduce((acc, item) => {
         if (item && item.reg) {
           acc[item.reg] = item;
         }
         return acc;
       }, {});
       const studentWisedata = await model.aggregate([
          {
            $match: {
              studentClass: studentClass,
              section: section,
              ...(reg ? { reg: String(reg) } : {})
            }
          },
          { $sort: { roll: 1 } },
          {
            $group: {
              _id: { reg: "$reg", academicYear: "$academicYear", terminal: "$terminal", subject: "$subject" },
              reg: { $first: "$reg" },
              name: { $first: "$name" },
              roll: { $first: "$roll" },
              studentClass: { $first: "$studentClass" },
              section: { $first: "$section" },
              theorymarks: { $first: "$theorymarks" },
              practicalmarks: { $first: "$practicalmarks" },
              totalmarks: { $first: { $add: ["$theorymarks", "$practicalmarks"] } },
              passMarks: { $first: "$passMarks" },
              terminal: { $first: "$terminal" }
            }
          },
          { $sort: { "roll": 1, "_id.subject": 1, "_id.terminal": 1 } }
        ]);
const studentWisedatastructured = {};

for (const student of roster) {
  const reg = student.reg;
  if (!reg) continue;
  studentWisedatastructured[reg] = {
    reg,
    name: student.name || '- ',
    roll: student.roll || '',
    studentClass: student.studentClass || studentClass,
    section: student.section || section,
    records: {}
  };
}

for (const student of studentWisedata) {
  const reg = student.reg;
  const name = student.name;
  const roll = student.roll;
  const academicYear = student._id.academicYear;
  const studentClass = student.studentClass;
  const section = student.section;
  const subject = student._id.subject;
  const terminal = student._id.terminal;

  if (!studentWisedatastructured[reg]) {
    studentWisedatastructured[reg] = {
      reg,
      name,
      roll,
      studentClass,
      section,
      records: {}
    };
  }

  if (!studentWisedatastructured[reg].records[academicYear]) {
    studentWisedatastructured[reg].records[academicYear] = {};
  }

  if (!studentWisedatastructured[reg].records[academicYear][subject]) {
    studentWisedatastructured[reg].records[academicYear][subject] = {};
  }

  studentWisedatastructured[reg].records[academicYear][subject][terminal] = {
    theory: student.theorymarks,
    practical: student.practicalmarks,
    total: student.totalmarks,
    passMarks: student.passMarks
  };
}

       const portfolioRegs = Object.keys(studentWisedatastructured);
       const portfolioDocs = portfolioRegs.length
         ? await Portfolio.find({ reg: { $in: portfolioRegs } }).lean()
         : [];
       const portfolioByReg = portfolioDocs.reduce((acc, doc) => {
         if (doc && doc.reg) {
           acc[doc.reg] = doc;
         }
         return acc;
       }, {});

       const healthRecords = portfolioRegs.length
         ? await HealthRecord.find({ reg: { $in: portfolioRegs } }).lean().sort({ createdAt: -1 })
         : [];
       const healthRecordsByReg = healthRecords.reduce((acc, item) => {
         const key = item && item.reg ? String(item.reg) : '';
         if (!key) {
           return acc;
         }

         if (!acc[key]) {
           acc[key] = [];
         }

         acc[key].push(item);
         return acc;
       }, {});


      
       const attendanceDocs = portfolioRegs.length
         ? await onlineAttendance.find({ reg: { $in: portfolioRegs } }).lean()
         : [];
       const callLogsByReg = attendanceDocs.reduce((acc, doc) => {
         const regKey = doc && doc.reg ? String(doc.reg) : '';
         if (!regKey) {
           return acc;
         }

         const entries = Array.isArray(doc.attendance) ? doc.attendance : [];
         const logs = entries
           .filter((entry) => entry && (entry.callReason || entry.parentResponse || entry.callLoggedAt))
           .map((entry) => ({
             academicYear: String(entry.academicYear || ''),
             month: String(entry.month || ''),
             day: String(entry.day || ''),
             callReason: String(entry.callReason || ''),
             parentResponse: String(entry.parentResponse || ''),
             callBy: String(entry.callBy || ''),
             callLoggedAt: entry.callLoggedAt ? new Date(entry.callLoggedAt) : null
           }))
           .sort((a, b) => {
             const timeA = a.callLoggedAt ? a.callLoggedAt.getTime() : 0;
             const timeB = b.callLoggedAt ? b.callLoggedAt.getTime() : 0;
             return timeB - timeA;
           });

         if (logs.length > 0) {
           acc[regKey] = logs;
         }

         return acc;
       }, {});

       const isAbsentStatus = (value) => {
         const normalized = String(value || '').trim().toLowerCase();
         return normalized === 'absent' || normalized === 'a' || normalized === 'false';
       };

       const absentSummaryByReg = attendanceDocs.reduce((acc, doc) => {
         const regKey = doc && doc.reg ? String(doc.reg) : '';
         if (!regKey) {
           return acc;
         }

         const entries = Array.isArray(doc.attendance) ? doc.attendance : [];
         const monthCounts = {};
         const reasons = [];
         let totalAbsent = 0;

         entries.forEach((entry) => {
           if (!entry || !isAbsentStatus(entry.status)) {
             return;
           }

           totalAbsent += 1;
           const monthLabel = String(entry.month || 'Unknown');
           monthCounts[monthLabel] = (monthCounts[monthLabel] || 0) + 1;

           const reasonText = String(entry.reason || '').trim();
           if (reasonText) {
             const dateLabel = [entry.academicYear, entry.month, entry.day]
               .filter(Boolean)
               .join(' ');
             reasons.push({
               date: dateLabel || '-',
               reason: reasonText
             });
           }
         });

         acc[regKey] = {
           totalAbsent,
           monthCounts,
           reasons
         };
         return acc;
       }, {});

       res.render("./exam/studentportfolio", {
      currentPage: "exammanagement",
      studentClassdata,
      section,
      terminal,
      academicYear,
      reg,
      studentWisedatastructured,
      marksheetSetups,
        portfolioByReg,
        rosterByReg,
        healthRecordsByReg,
        callLogsByReg,
      absentSummaryByReg,
    });
  }
  catch (error) {
    console.error("Error loading student portfolio page:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.addComplaint = async (req, res) => {
  try {
    const reg = String(req.body && req.body.reg ? req.body.reg : '').trim();
    const reason = String(req.body && req.body.complaint ? req.body.complaint : '').trim();
    const rawImages = req.body && req.body.images;
    const imageUrls = (Array.isArray(rawImages) ? rawImages : [rawImages])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    const teacherName = req.user && req.user.teacherName ? String(req.user.teacherName).trim() : '';

    if (!reg || !reason) {
      return res.status(400).json({ success: false, message: 'Reg and complaint are required.' });
    }

    await Portfolio.updateOne(
      { reg },
      {
        $push: {
          complaints: {
            by: teacherName,
            date: new Date(),
            reason,
            imageUrls
          }
        }
      },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error saving complaint:', error);
    return res.status(500).json({ success: false, message: 'Failed to save complaint.' });
  }
};

exports.updateComplaint = async (req, res) => {
  try {
    const complaintId = String(req.params && req.params.id ? req.params.id : '').trim();
    const reg = String(req.body && req.body.reg ? req.body.reg : '').trim();
    const reason = String(req.body && req.body.complaint ? req.body.complaint : '').trim();
    const rawImages = req.body && req.body.images;
    const imageUrls = (Array.isArray(rawImages) ? rawImages : [rawImages])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!reg || !reason || !complaintId) {
      return res.status(400).json({ success: false, message: 'Reg, complaint, and complaint ID are required.' });
    }

    const result = await Portfolio.updateOne(
      { reg, 'complaints._id': complaintId },
      {
        $set: {
          'complaints.$.reason': reason,
          'complaints.$.imageUrls': imageUrls
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating complaint:', error);
    return res.status(500).json({ success: false, message: 'Failed to update complaint.' });
  }
};

exports.saveStudentRecordFromPortfolio = async (req, res) => {
  try {
    const reg = String(req.body && req.body.reg ? req.body.reg : '').trim();
    if (!reg) {
      return res.status(400).json({ success: false, message: 'Reg is required.' });
    }

    const allowedFields = [
      'name',
      'studentClass',
      'section',
      'gender',
      'age',
      'height',
      'weight',
      'mothersToungue',
      'previousSchool',
      'fatherName',
      'fatheroccupation',
      'fatherContact',
      'fatherqualification',
      'motherName',
      'motheroccupation',
      'motherContact',
      'motherqualification',
      'otherguardianName',
      'otherguardianOccupation',
      'otherguardianContact',
      'yearlyIncome',
      'bloodGroup',
      'otherbehaviouralCondition',
      'parentViewTowardsSchool',
      'parentVisitFrequency',
      'numberofmobile',
      'tvatHome',
      'internetAtHome',
      'feepaidduration'
    ];

    const update = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        update[field] = String(req.body[field] || '').trim();
      }
    });

    if (Object.prototype.hasOwnProperty.call(req.body, 'roll')) {
      const roll = Number(req.body.roll);
      update.roll = Number.isFinite(roll) ? roll : undefined;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'dob')) {
      update.dob = req.body.dob ? new Date(req.body.dob) : undefined;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'classStartedAt')) {
      update.classStartedAt = req.body.classStartedAt ? new Date(req.body.classStartedAt) : undefined;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'anyMedicalCondition')) {
      const raw = req.body.anyMedicalCondition;
      if (Array.isArray(raw)) {
        update.anyMedicalCondition = raw.filter(Boolean);
      } else if (typeof raw === 'string') {
        update.anyMedicalCondition = raw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    const booleanFields = [
      'eyeproblem',
      'earproblem',
      'hairproblem',
      'liveWithFather',
      'liveWithMother'
    ];

    booleanFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const value = String(req.body[field] || '').toLowerCase().trim();
        if (value === 'true' || value === 'yes' || value === '1') {
          update[field] = true;
        } else if (value === 'false' || value === 'no' || value === '0') {
          update[field] = false;
        }
      }
    });

    Object.keys(update).forEach((key) => {
      if (update[key] === undefined) {
        delete update[key];
      }
    });

    await studentRecord.updateOne(
      { reg },
      { $set: update, $setOnInsert: { reg } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error saving student record:', error);
    return res.status(500).json({ success: false, message: 'Failed to save student record.' });
  }
};
exports.uploadOldData = async (req, res, next) => {
  try {
    res.render("./exam/uploadolddata", {
      currentPage: "exammanagement",
      user: req.user,
      success:"false"
    });
  }
  catch (error) {
    console.error("Error loading upload old data page:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.schoolanalysis = async (req, res, next) => {
    try {
        const mongoose = require('mongoose');
        const ExamMark = await getSlipModel(); // Your exam marks model

        // Helper function to sort by roll number (handles string values)
        function sortByRoll(students) {
            return students.sort((a, b) => {
                const rollA = a.roll || '';
                const rollB = b.roll || '';
                
                // Try to parse as number first
                const numA = parseInt(rollA);
                const numB = parseInt(rollB);
                
                // If both are valid numbers, sort numerically
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                
                // If one is a number and the other is not, numbers come first
                if (!isNaN(numA) && isNaN(numB)) return -1;
                if (isNaN(numA) && !isNaN(numB)) return 1;
                
                // Otherwise sort as strings
                return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
            });
        }

        // Helper function to sort by section then roll
        function sortBySectionAndRoll(students) {
            // Group by section
            const sectionGroups = {};
            students.forEach(student => {
                const section = student.section || 'No Section';
                if (!sectionGroups[section]) {
                    sectionGroups[section] = [];
                }
                sectionGroups[section].push(student);
            });
            
            // Sort each section by roll
            const sortedSections = {};
            Object.keys(sectionGroups).sort().forEach(section => {
                sortedSections[section] = sortByRoll(sectionGroups[section]);
            });
            
            // Flatten back to array
            const result = [];
            Object.keys(sortedSections).sort().forEach(section => {
                result.push(...sortedSections[section]);
            });
            
            return result;
        }

        // Helper function to calculate GPA and grade
        function calculateGPA(theoryMarks, practicalMarks, passMarks, theoryFullMarks, practicalFullMarks, includePractical = true) {
            let totalMarks = theoryMarks || 0;
            let totalFullMarks = theoryFullMarks || 0;
            
            if (includePractical) {
                totalMarks += practicalMarks || 0;
                totalFullMarks += practicalFullMarks || 0;
            }
            
            const percentage = totalFullMarks > 0 ? (totalMarks / totalFullMarks) * 100 : 0;
            let gpa = 0;
            let grade = 'F';
            let isPassed = false;
            
            // Check if passed in theory and practical separately
            let theoryPassed = (theoryMarks || 0) >= (passMarks || 0);
            let practicalPassed = true;
            
            if (includePractical && practicalFullMarks > 0) {
                practicalPassed = (practicalMarks || 0) >= ((passMarks || 0) / 2);
            }
            
            // Check overall pass status
            if (includePractical) {
                isPassed = theoryPassed && practicalPassed;
            } else {
                isPassed = theoryPassed;
            }
            
            // Calculate GPA based on percentage
            if (percentage >= 90) {
                gpa = 4.0;
                grade = 'A+';
            } else if (percentage >= 80) {
                gpa = 3.6;
                grade = 'A';
            } else if (percentage >= 70) {
                gpa = 3.2;
                grade = 'B+';
            } else if (percentage >= 60) {
                gpa = 2.8;
                grade = 'B';
            } else if (percentage >= 50) {
                gpa = 2.4;
                grade = 'C+';
            } else if (percentage >= 40) {
                gpa = 2.0;
                grade = 'C';
            } else if (percentage >= 30) {
                gpa = 1.6;
                grade = 'D+';
            } else if (percentage >= 20) {
                gpa = 1.2;
                grade = 'D';
            } else {
                gpa = 0.0;
                grade = 'F';
            }
            
            return {
                totalMarks,
                totalFullMarks,
                percentage,
                gpa,
                grade,
                isPassed,
                theoryPassed,
                practicalPassed
            };
        }

        // Check if a value is empty/blank
        function isEmpty(value) {
            if (value === null || value === undefined) return true;
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed === '' || trimmed === '—' || trimmed === 'N/A' || trimmed === '-' || trimmed === 'null';
            }
            return false;
        }

        // Check if student has valid data (not blank name/reg)
        function hasValidStudentData(student) {
            return !isEmpty(student.name) && !isEmpty(student.reg);
        }

        // Get all students for a specific class, terminal, and academic year (ALL SECTIONS)
        async function getStudentsForClass(classNumber, terminal, academicYear) {
            // Convert class number to both formats for matching
            const classMap = {
                '1': ['1', 'One'],
                '2': ['2', 'Two'],
                '3': ['3', 'Three'],
                '4': ['4', 'Four'],
                '5': ['5', 'Five'],
                '6': ['6', 'Six'],
                '7': ['7', 'Seven'],
                '8': ['8', 'Eight'],
                '9': ['9', 'Nine'],
                '10': ['10', 'Ten']
            };
            
            const classValues = classMap[classNumber] || [classNumber];
            
            // First get all documents for this class
            const allDocs = await ExamMark.find({
                studentClass: { $in: classValues },
                terminal: terminal,
                academicYear: academicYear,
                name: { $nin: ['', null, 'N/A', '—', '-', 'null'] },
                reg: { $nin: ['', null, 'N/A', '—', '-', 'null'] }
            }).lean();
            
            // Group by reg and merge subjects
            const studentMap = new Map();
            
            allDocs.forEach(doc => {
                const reg = doc.reg;
                if (!reg) return;
                
                // Get or create student entry
                let studentEntry = studentMap.get(reg);
                if (!studentEntry) {
                    studentEntry = {
                        reg: doc.reg,
                        name: doc.name,
                        roll: doc.roll,
                        gender: doc.gender,
                        section: doc.section,
                        subjects: []
                    };
                    studentMap.set(reg, studentEntry);
                }
                
                // Check if subject already exists for this student
                const existingSubject = studentEntry.subjects.find(s => s.subject === doc.subject);
                if (existingSubject) {
                    // Update marks if existing subject has no marks but this one does
                    if ((!existingSubject.theoryMarks || existingSubject.theoryMarks === 0) && doc.theorymarks > 0) {
                        existingSubject.theoryMarks = doc.theorymarks;
                    }
                    if ((!existingSubject.practicalMarks || existingSubject.practicalMarks === 0) && doc.practicalmarks > 0) {
                        existingSubject.practicalMarks = doc.practicalmarks;
                    }
                    if ((!existingSubject.passMarks || existingSubject.passMarks === 0) && doc.passMarks > 0) {
                        existingSubject.passMarks = doc.passMarks;
                    }
                    if ((!existingSubject.theoryFullMarks || existingSubject.theoryFullMarks === 0) && doc.theoryfullmarks > 0) {
                        existingSubject.theoryFullMarks = doc.theoryfullmarks;
                    }
                    if ((!existingSubject.practicalFullMarks || existingSubject.practicalFullMarks === 0) && doc.practicalfullmarks > 0) {
                        existingSubject.practicalFullMarks = doc.practicalfullmarks;
                    }
                } else {
                    // Add new subject
                    studentEntry.subjects.push({
                        subject: doc.subject,
                        theoryMarks: doc.theorymarks || 0,
                        practicalMarks: doc.practicalmarks || 0,
                        passMarks: doc.passMarks || 0,
                        theoryFullMarks: doc.theoryfullmarks || 25,
                        practicalFullMarks: doc.practicalfullmarks || 25,
                        terminalMarks: doc.terminalmarks || 0
                    });
                }
            });
            
            // Convert map to array
            const results = Array.from(studentMap.values());
            
            // Additional filter for blank values in results
            return results.filter(student => hasValidStudentData(student));
        }

        // Remove duplicate students by reg, keep the one with most subjects
        function removeDuplicateStudents(students) {
            const studentMap = new Map();
            
            students.forEach(student => {
                const reg = student.reg;
                
                // Count ALL subjects (including those with 0 marks)
                const subjectCount = student.subjects.length;
                
                if (!studentMap.has(reg)) {
                    studentMap.set(reg, {
                        student: student,
                        subjectCount: subjectCount
                    });
                } else {
                    // If this student has more subjects, replace the existing one
                    const existing = studentMap.get(reg);
                    if (subjectCount > existing.subjectCount) {
                        studentMap.set(reg, {
                            student: student,
                            subjectCount: subjectCount
                        });
                    }
                }
            });
            
            // Return only the unique students
            return Array.from(studentMap.values()).map(item => item.student);
        }

        // Check if student is absent (all subjects have 0 marks or no valid subjects)
        function isStudentAbsent(student, includePractical = true) {
            let totalMarks = 0;
            let hasValidSubject = false;
            
            student.subjects.forEach(subject => {
                // Check if subject has valid data (not blank)
                const hasTheory = subject.theoryMarks !== undefined && subject.theoryMarks !== null && !isNaN(subject.theoryMarks);
                const hasPractical = subject.practicalMarks !== undefined && subject.practicalMarks !== null && !isNaN(subject.practicalMarks);
                
                if (hasTheory) {
                    totalMarks += subject.theoryMarks || 0;
                    hasValidSubject = true;
                }
                if (includePractical && hasPractical) {
                    totalMarks += subject.practicalMarks || 0;
                    hasValidSubject = true;
                }
            });
            
            // If no valid subjects, consider as absent
            if (!hasValidSubject) return true;
            
            return totalMarks === 0;
        }

        // Calculate student result with optional subject handling
        function calculateStudentResult(student, includePractical = true) {
            const subjectResults = [];
            let passedSubjects = 0;
            let failedSubjects = 0;
            let totalGPA = 0;
            let totalSubjects = 0;
            
            // Get all subjects for this student
            const allSubjects = student.subjects;
            
            // Check for optional subjects in class 9 and 10
            const studentClass = student.class || '';
            const isOptionalClass = studentClass === '9' || studentClass === '10' || 
                                   studentClass === 'Nine' || studentClass === 'Ten';
            
            // For optional classes, determine which optional subject the student actually took
            let selectedOptionalSubject = null;
            
            if (isOptionalClass) {
                // Find OPT.MATH and ENV.SCIENCE subjects
                const optMath = allSubjects.find(s => s.subject === 'OPT.MATH');
                const envScience = allSubjects.find(s => s.subject === 'ENV.SCIENCE');
                
                // Check which one has marks (theory or practical)
                const hasOptMathMarks = optMath && (
                    (optMath.theoryMarks && optMath.theoryMarks > 0) || 
                    (optMath.practicalMarks && optMath.practicalMarks > 0)
                );
                
                const hasEnvScienceMarks = envScience && (
                    (envScience.theoryMarks && envScience.theoryMarks > 0) || 
                    (envScience.practicalMarks && envScience.practicalMarks > 0)
                );
                
                // Select the one with marks
                if (hasOptMathMarks && hasEnvScienceMarks) {
                    // Both have marks - this shouldn't happen, but if it does, keep both
                    selectedOptionalSubject = 'both';
                } else if (hasOptMathMarks) {
                    selectedOptionalSubject = 'OPT.MATH';
                } else if (hasEnvScienceMarks) {
                    selectedOptionalSubject = 'ENV.SCIENCE';
                }
                // If neither has marks, the student has no optional subject
            }
            
            // Filter subjects for evaluation
            let subjectsToEvaluate = [];
            
            if (isOptionalClass) {
                // For class 9 & 10: Include all subjects but handle optional subjects
                subjectsToEvaluate = allSubjects.map(subject => {
                    const isOptional = subject.subject === 'OPT.MATH' || subject.subject === 'ENV.SCIENCE';
                    
                    // Check if subject has valid marks
                    const hasTheoryMarks = subject.theoryMarks !== undefined && subject.theoryMarks !== null && !isNaN(subject.theoryMarks);
                    const hasPracticalMarks = subject.practicalMarks !== undefined && subject.practicalMarks !== null && !isNaN(subject.practicalMarks);
                    const hasMarks = hasTheoryMarks || (includePractical && hasPracticalMarks);
                    
                    // If this is an optional subject
                    if (isOptional) {
                        // Check if this is the selected optional subject
                        const isSelected = selectedOptionalSubject === 'both' || selectedOptionalSubject === subject.subject;
                        
                        if (isSelected && hasMarks) {
                            // This is the student's actual optional subject with marks
                            return {
                                ...subject,
                                isOptional: true,
                                hasData: true,
                                isCounted: true,
                                theoryMarks: subject.theoryMarks || 0,
                                practicalMarks: subject.practicalMarks || 0
                            };
                        } else if (isSelected && !hasMarks) {
                            // This is the student's optional subject but no marks (shouldn't happen)
                            return {
                                ...subject,
                                isOptional: true,
                                hasData: false,
                                isCounted: false,
                                theoryMarks: 0,
                                practicalMarks: 0
                            };
                        } else {
                            // This is NOT the student's selected optional subject - ignore it
                            return {
                                ...subject,
                                isOptional: true,
                                hasData: false,
                                isCounted: false,
                                theoryMarks: 0,
                                practicalMarks: 0,
                                isIgnored: true
                            };
                        }
                    }
                    
                    // Regular subject (not optional)
                    if (!hasMarks) {
                        return {
                            ...subject,
                            isOptional: false,
                            hasData: false,
                            isCounted: false,
                            theoryMarks: 0,
                            practicalMarks: 0
                        };
                    }
                    
                    return {
                        ...subject,
                        isOptional: false,
                        hasData: true,
                        isCounted: true,
                        theoryMarks: subject.theoryMarks || 0,
                        practicalMarks: subject.practicalMarks || 0
                    };
                });
            } else {
                // For classes 1-8: Include ALL subjects
                subjectsToEvaluate = allSubjects.map(subject => {
                    const hasTheoryMarks = subject.theoryMarks !== undefined && subject.theoryMarks !== null && !isNaN(subject.theoryMarks);
                    const hasPracticalMarks = subject.practicalMarks !== undefined && subject.practicalMarks !== null && !isNaN(subject.practicalMarks);
                    const hasMarks = hasTheoryMarks || (includePractical && hasPracticalMarks);
                    
                    if (!hasMarks) {
                        return {
                            ...subject,
                            isOptional: false,
                            hasData: false,
                            isCounted: false,
                            theoryMarks: 0,
                            practicalMarks: 0
                        };
                    }
                    
                    return {
                        ...subject,
                        isOptional: false,
                        hasData: true,
                        isCounted: true,
                        theoryMarks: subject.theoryMarks || 0,
                        practicalMarks: subject.practicalMarks || 0
                    };
                });
            }
            
            // Evaluate subjects
            subjectsToEvaluate.forEach(subject => {
                // Skip ignored optional subjects
                if (subject.isIgnored) {
                    subjectResults.push({
                        subject: subject.subject,
                        isOptional: true,
                        hasData: false,
                        isCounted: false,
                        isPassed: true,
                        totalMarks: 0,
                        totalFullMarks: 0,
                        percentage: 0,
                        gpa: 0,
                        grade: 'IGNORED',
                        isIgnored: true
                    });
                    return;
                }
                
                // Skip subjects that are not counted
                if (!subject.isCounted) {
                    subjectResults.push({
                        subject: subject.subject,
                        isOptional: subject.isOptional || false,
                        hasData: false,
                        isCounted: false,
                        isPassed: true,
                        totalMarks: 0,
                        totalFullMarks: 0,
                        percentage: 0,
                        gpa: 0,
                        grade: 'N/A'
                    });
                    return;
                }
                
                const result = calculateGPA(
                    subject.theoryMarks || 0,
                    subject.practicalMarks || 0,
                    subject.passMarks || 0,
                    subject.theoryFullMarks || 25,
                    subject.practicalFullMarks || 25,
                    includePractical
                );
                
                // Check if subject has valid pass marks
                const hasValidPassMarks = subject.passMarks !== undefined && subject.passMarks !== null && !isNaN(subject.passMarks);
                const isPassed = hasValidPassMarks ? result.isPassed : true;
                
                subjectResults.push({
                    subject: subject.subject,
                    isOptional: subject.isOptional || false,
                    hasData: true,
                    isCounted: true,
                    ...result,
                    isPassed: isPassed
                });
                
                // Count only if subject is counted and has valid data
                if (subject.isCounted) {
                    totalSubjects++;
                    if (isPassed) {
                        passedSubjects++;
                        totalGPA += result.gpa;
                    } else {
                        failedSubjects++;
                    }
                }
            });
            
            const overallGPA = totalSubjects > 0 ? totalGPA / totalSubjects : 0;
            const isPassedAll = failedSubjects === 0 && totalSubjects > 0;
            const hasFailedAny = failedSubjects > 0;
            
            // Determine overall grade
            let overallGrade = 'F';
            if (overallGPA >= 3.6) overallGrade = 'A+';
            else if (overallGPA >= 3.2) overallGrade = 'A';
            else if (overallGPA >= 2.8) overallGrade = 'B+';
            else if (overallGPA >= 2.4) overallGrade = 'B';
            else if (overallGPA >= 2.0) overallGrade = 'C+';
            else if (overallGPA >= 1.6) overallGrade = 'C';
            else if (overallGPA >= 1.2) overallGrade = 'D+';
            else if (overallGPA >= 0.8) overallGrade = 'D';
            else overallGrade = 'F';
            
            return {
                reg: student.reg,
                name: student.name,
                roll: student.roll,
                gender: student.gender,
                section: student.section,
                class: student.class || '',
                subjectResults,
                passedSubjects,
                failedSubjects,
                totalSubjects,
                isPassedAll,
                hasFailedAny,
                isAbsent: false,
                overallGPA: overallGPA.toFixed(2),
                overallGrade
            };
        }

        // Helper function to get class name
        function getClassName(classNum) {
            const classNames = {
                '1': 'One',
                '2': 'Two',
                '3': 'Three',
                '4': 'Four',
                '5': 'Five',
                '6': 'Six',
                '7': 'Seven',
                '8': 'Eight',
                '9': 'Nine',
                '10': 'Ten'
            };
            return classNames[classNum] || classNum;
        }

        // Get query parameters with defaults
        const { terminal, academicYear, analysisType = 'both' } = req.query;
        
        // If no parameters provided, render empty state or show filters
        if (!terminal || !academicYear) {
            return res.render('./exam/schoolanalysis', {
                overallData: { totalStudents: 0, passedAll: 0, failedAny: 0, absent: 0, passPercentage: 0, failPercentage: 0 },
                groupAnalytics: [],
                classAnalytics: [],
                analysisType: 'both',
                terminal: terminal || '',
                academicYear: academicYear || '',
                hasData: false,
                error: null
            });
        }

        const includePractical = analysisType === 'both';
        
        // Get all classes from 1 to 10
        const classes = Array.from({ length: 10 }, (_, i) => (i + 1).toString());
        
        // Process each class
        const classAnalytics = [];
        const classGroups = {
            '1-3': { classes: ['1', '2', '3'], students: [], totalPassed: 0, totalFailed: 0, totalAbsent: 0, totalStudents: 0 },
            '4-7': { classes: ['4', '5', '6', '7'], students: [], totalPassed: 0, totalFailed: 0, totalAbsent: 0, totalStudents: 0 },
            '8-10': { classes: ['8', '9', '10'], students: [], totalPassed: 0, totalFailed: 0, totalAbsent: 0, totalStudents: 0 }
        };
        
        for (const classNum of classes) {
            const students = await getStudentsForClass(classNum, terminal, academicYear);
            
            if (students.length === 0) continue;
            
            // Remove duplicate students (keep the one with most subjects)
            const uniqueStudents = removeDuplicateStudents(students);
            
            if (uniqueStudents.length === 0) continue;
            
            // Add class info to each student
            const studentsWithClass = uniqueStudents.map(student => ({
                ...student,
                class: classNum
            }));
            
            // Filter out absent students (all subjects have 0 marks or no valid subjects)
            const activeStudents = studentsWithClass.filter(student => {
                return !isStudentAbsent(student, includePractical);
            });
            
            const absentStudents = studentsWithClass.length - activeStudents.length;
            
            if (activeStudents.length === 0) {
                // Only absent students, add to analytics with absent count
                const classData = {
                    class: classNum,
                    className: getClassName(classNum),
                    totalStudents: 0,
                    passedAll: 0,
                    failedAny: 0,
                    absent: absentStudents,
                    passPercentage: 0,
                    failPercentage: 0,
                    sections: [],
                    studentResults: []
                };
                classAnalytics.push(classData);
                
                // Add to group
                const groupKey = Object.keys(classGroups).find(key => 
                    classGroups[key].classes.includes(classNum)
                );
                if (groupKey) {
                    classGroups[groupKey].totalAbsent += absentStudents;
                    classGroups[groupKey].totalStudents += 0;
                }
                continue;
            }
            
            // Calculate results for each student (only active students)
            const studentResults = activeStudents.map(student => {
                const result = calculateStudentResult(student, includePractical);
                result.isAbsent = false;
                return result;
            });
            
            // Sort students by section and roll
            const sortedStudentResults = sortBySectionAndRoll(studentResults);
            
            const passedAll = sortedStudentResults.filter(s => s.isPassedAll).length;
            const failedAny = sortedStudentResults.filter(s => s.hasFailedAny).length;
            const totalStudents = sortedStudentResults.length;
            
            // Get unique sections for this class
            const sections = [...new Set(sortedStudentResults.map(s => s.section))].filter(s => s && !isEmpty(s));
            
            const classData = {
                class: classNum,
                className: getClassName(classNum),
                totalStudents,
                passedAll,
                failedAny,
                absent: absentStudents,
                passPercentage: totalStudents > 0 ? ((passedAll / totalStudents) * 100).toFixed(2) : 0,
                failPercentage: totalStudents > 0 ? ((failedAny / totalStudents) * 100).toFixed(2) : 0,
                sections: sections,
                studentResults: sortedStudentResults
            };
            
            classAnalytics.push(classData);
            
            // Add to group
            const groupKey = Object.keys(classGroups).find(key => 
                classGroups[key].classes.includes(classNum)
            );
            
            if (groupKey) {
                classGroups[groupKey].students = classGroups[groupKey].students.concat(sortedStudentResults);
                classGroups[groupKey].totalPassed += passedAll;
                classGroups[groupKey].totalFailed += failedAny;
                classGroups[groupKey].totalAbsent += absentStudents;
                classGroups[groupKey].totalStudents += totalStudents;
            }
        }
        
        // Calculate group analytics
        const groupAnalytics = Object.entries(classGroups).map(([groupName, groupData]) => {
            const totalStudents = groupData.totalStudents;
            return {
                groupName,
                totalStudents,
                passedAll: groupData.totalPassed,
                failedAny: groupData.totalFailed,
                absent: groupData.totalAbsent,
                passPercentage: totalStudents > 0 ? ((groupData.totalPassed / totalStudents) * 100).toFixed(2) : 0,
                failPercentage: totalStudents > 0 ? ((groupData.totalFailed / totalStudents) * 100).toFixed(2) : 0
            };
        });
        
        // Calculate overall totals
        const totalAllStudents = classAnalytics.reduce((sum, c) => sum + c.totalStudents, 0);
        const totalPassedAll = classAnalytics.reduce((sum, c) => sum + c.passedAll, 0);
        const totalFailedAny = classAnalytics.reduce((sum, c) => sum + c.failedAny, 0);
        const totalAbsent = classAnalytics.reduce((sum, c) => sum + c.absent, 0);
        
        const overallData = {
            totalStudents: totalAllStudents,
            passedAll: totalPassedAll,
            failedAny: totalFailedAny,
            absent: totalAbsent,
            passPercentage: totalAllStudents > 0 ? ((totalPassedAll / totalAllStudents) * 100).toFixed(2) : 0,
            failPercentage: totalAllStudents > 0 ? ((totalFailedAny / totalAllStudents) * 100).toFixed(2) : 0
        };
        
        return res.render('./exam/schoolanalysis', {
            overallData,
            groupAnalytics,
            classAnalytics,
            analysisType,
            terminal,
            academicYear,
            hasData: true,
            error: null
        });
        
    } catch (error) {
        console.error('Error generating analytics:', error);
        return res.status(500).render('./exam/schoolanalysis', {
            error: error.message || 'An error occurred while generating analytics',
            overallData: { totalStudents: 0, passedAll: 0, failedAny: 0, absent: 0, passPercentage: 0, failPercentage: 0 },
            groupAnalytics: [],
            classAnalytics: [],
            analysisType: req.query.analysisType || 'both',
            terminal: req.query.terminal || '',
            academicYear: req.query.academicYear || '',
            hasData: false
        });
    }
};

// analysisController.js


// analysisController.js


// analysisController.js
 // Adjust according to your project structure

// analysisController.js
// Adjust according to your project structure

// analysisController.js
 // Adjust according to your project structure

// analysisController.js


// Class name normalization map
// analysisController.js


// Class name normalization map
const CLASS_NORMALIZATION = {
    'nursery': 'Nursery',
    'lkg': 'LKG',
    'ukg': 'UKG',
    'one': 'One',
    'two': 'Two',
    'three': 'Three',
    'four': 'Four',
    'five': 'Five',
    'six': 'Six',
    'seven': 'Seven',
    'eight': 'Eight',
    'nine': 'Nine',
    'ten': 'Ten',
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
    '4': 'Four',
    '5': 'Five',
    '6': 'Six',
    '7': 'Seven',
    '8': 'Eight',
    '9': 'Nine',
    '10': 'Ten'
};

// Reverse map for display
const DISPLAY_CLASS_MAP = {
    'nursery': 'Nursery',
    'lkg': 'LKG',
    'ukg': 'UKG',
    'one': 'One',
    'two': 'Two',
    'three': 'Three',
    'four': 'Four',
    'five': 'Five',
    'six': 'Six',
    'seven': 'Seven',
    'eight': 'Eight',
    'nine': 'Nine',
    'ten': 'Ten',
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
    '4': 'Four',
    '5': 'Five',
    '6': 'Six',
    '7': 'Seven',
    '8': 'Eight',
    '9': 'Nine',
    '10': 'Ten'
};

// Class order for sorting
const CLASS_ORDER = {
    'Nursery': 0,
    'LKG': 1,
    'UKG': 2,
    'One': 3,
    'Two': 4,
    'Three': 5,
    'Four': 6,
    'Five': 7,
    'Six': 8,
    'Seven': 9,
    'Eight': 10,
    'Nine': 11,
    'Ten': 12
};

function normalizeClassName(cls) {
    if (!cls) return '';
    const key = String(cls).toLowerCase().trim();
    return CLASS_NORMALIZATION[key] || cls;
}

function getClassOrder(cls) {
    if (!cls) return 999;
    const normalized = normalizeClassName(cls);
    return CLASS_ORDER[normalized] !== undefined ? CLASS_ORDER[normalized] : 999;
}

function displayClassName(cls) {
    if (!cls) return '';
    const key = String(cls).toLowerCase().trim();
    return DISPLAY_CLASS_MAP[key] || cls;
}

function getIntervalSize(fullMarks) {
    if (fullMarks <= 25) return 5;
    if (fullMarks <= 50) return 10;
    if (fullMarks <= 75) return 15;
    if (fullMarks <= 100) return 20;
    return 25;
}

// ============================================================
// MAIN PROCESSING FUNCTION - ONLY ONE VERSION
// ============================================================
function processQuantumAnalysis(examMarks, subjectFullMarksMap) {
    // Group by class
    const classGroups = {};

    examMarks.forEach(record => {
        const cls = String(record.studentClass || '').trim();
        if (!cls) return;

        // Normalize class name for grouping
        const normalizedCls = normalizeClassName(cls);
        
        if (!classGroups[normalizedCls]) {
            classGroups[normalizedCls] = {
                subjects: {},
                totalStudents: new Set(),
                originalNames: new Set()
            };
        }
        
        // Store original class name for display
        classGroups[normalizedCls].originalNames.add(cls);

        // Track unique students by reg
        if (record.reg) {
            classGroups[normalizedCls].totalStudents.add(record.reg);
        }

        // Process subject data
        const subject = String(record.subject || '').trim();
        if (!subject) return;

        // Get full marks from subject config
        let fullMarks = 0;
        
        // Try with normalized class name first
        const key1 = (normalizedCls + '||' + subject).toUpperCase();
        if (subjectFullMarksMap && subjectFullMarksMap[key1]) {
            fullMarks = subjectFullMarksMap[key1].theory || 0;
        }
        
        // If not found, try with original class name
        if (fullMarks === 0) {
            const key2 = (cls + '||' + subject).toUpperCase();
            if (subjectFullMarksMap && subjectFullMarksMap[key2]) {
                fullMarks = subjectFullMarksMap[key2].theory || 0;
            }
        }
        
        // If still not found, use from record
        if (fullMarks === 0) {
            fullMarks = record.theoryfullmarks || 0;
        }

        if (!classGroups[normalizedCls].subjects[subject]) {
            classGroups[normalizedCls].subjects[subject] = {
                marks: [],
                passCount: 0,
                failCount: 0,
                passMarks: record.passMarks || 0,
                fullMarks: fullMarks
            };
        }

        // Get theory marks
        const theoryMarks = parseFloat(record.theorymarks) || 0;
        classGroups[normalizedCls].subjects[subject].marks.push(theoryMarks);

        // Check pass/fail
        const passMarks = parseFloat(record.passMarks) || 0;
        if (theoryMarks >= passMarks) {
            classGroups[normalizedCls].subjects[subject].passCount++;
        } else {
            classGroups[normalizedCls].subjects[subject].failCount++;
        }
    });

    // Process each class to build distribution tables
    const result = {};

    Object.keys(classGroups).forEach(cls => {
        const classData = classGroups[cls];
        const subjects = classData.subjects;
        const totalStudents = classData.totalStudents.size;

        // Group subjects by full marks
        const groupedSubjects = {};

        Object.keys(subjects).forEach(sub => {
            const data = subjects[sub];
            const fullMarks = data.fullMarks || 50;

            if (!groupedSubjects[fullMarks]) {
                groupedSubjects[fullMarks] = {
                    fullMarks: fullMarks,
                    subjects: [],
                    distributions: {}
                };
            }

            groupedSubjects[fullMarks].subjects.push(sub);

            // Build intervals based on full marks
            const intervalSize = getIntervalSize(fullMarks);
            const intervals = [];
            let start = 0;
            while (start < fullMarks) {
                const end = Math.min(start + intervalSize, fullMarks);
                intervals.push({
                    start: start,
                    end: end,
                    count: 0,
                    label: start + '-' + end
                });
                start = end;
            }

            // Count marks in each interval
            data.marks.forEach(mark => {
                for (let i = 0; i < intervals.length; i++) {
                    if (mark >= intervals[i].start && mark < intervals[i].end) {
                        intervals[i].count++;
                        break;
                    }
                    if (mark === fullMarks && i === intervals.length - 1) {
                        intervals[i].count++;
                        break;
                    }
                }
            });

            // Calculate percentages
            const total = data.marks.length || 1;
            const passPercent = ((data.passCount / total) * 100).toFixed(2);
            const failPercent = ((data.failCount / total) * 100).toFixed(2);

            groupedSubjects[fullMarks].distributions[sub] = {
                intervals: intervals,
                total: data.marks.length,
                passCount: data.passCount,
                failCount: data.failCount,
                passPercent: passPercent,
                failPercent: failPercent,
                fullMarks: fullMarks
            };
        });

        result[cls] = {
            groupedSubjects: groupedSubjects,
            totalStudents: totalStudents,
            displayName: displayClassName(cls)
        };
    });

    return result;
}

// ============================================================
// EXPORT CONTROLLER FUNCTION
// ============================================================
exports.quantamanalysis = async (req, res) => {
    try {
        const { terminal, academicYear, filterClass } = req.query;

        // Build filter
        let filter = {};
        if (terminal) filter.terminal = terminal;
        if (academicYear) filter.academicYear = academicYear;
        
        // Normalize filter class if provided
        if (filterClass) {
            filter.studentClass = filterClass;
        }

        console.log('Filter:', filter);

        // Get the exam model
        const Exammodel = await getSlipModel();
        
        // Fetch all exam marks
        const examMarks = await Exammodel.find(filter).lean();
        console.log('Exam Marks found:', examMarks.length);

        // Fetch all subjects from newsubject collection
        const subjectConfigs = await newsubject.find({}).lean();
        console.log('Subject Configs found:', subjectConfigs.length);

        // Build subject full marks map
        const subjectFullMarksMap = {};
        subjectConfigs.forEach(sub => {
            const forClass = String(sub.forClass || '').trim();
            const subjectName = String(sub.newsubject || '').trim();
            
            // Store with original class name
            const key = (forClass + '||' + subjectName).toUpperCase();
            subjectFullMarksMap[key] = {
                theory: sub.theory || 0,
                practical: sub.practical || 0,
                total: sub.total || 0,
                passingMarks: sub.passingMarks || 0,
                theoryCreditHour: sub.theoryCreditHour || 0,
                practicalCreditHour: sub.practicalCreditHour || 0
            };
            
            // Also store with normalized class name
            const normalizedClass = normalizeClassName(forClass);
            if (normalizedClass !== forClass) {
                const normalizedKey = (normalizedClass + '||' + subjectName).toUpperCase();
                subjectFullMarksMap[normalizedKey] = {
                    theory: sub.theory || 0,
                    practical: sub.practical || 0,
                    total: sub.total || 0,
                    passingMarks: sub.passingMarks || 0,
                    theoryCreditHour: sub.theoryCreditHour || 0,
                    practicalCreditHour: sub.practicalCreditHour || 0
                };
            }
        });

        // Get unique classes for filter
        const allClasses = await Exammodel.distinct('studentClass', filter);
        const terminals = await Exammodel.distinct('terminal', filter);
        const years = await Exammodel.distinct('academicYear', filter);

        // Process data
        const analysisData = processQuantumAnalysis(examMarks, subjectFullMarksMap);
        console.log('Analysis Data Classes:', Object.keys(analysisData));

        // Log first class structure for debugging
        if (Object.keys(analysisData).length > 0) {
            const firstClass = Object.keys(analysisData)[0];
            console.log('First class:', firstClass);
            console.log('First class groupedSubjects keys:', Object.keys(analysisData[firstClass].groupedSubjects || {}));
        }

        res.render('./exam/quantamanalysis', {
            title: 'Quantum Analysis - Marks Distribution',
            analysisData: analysisData,
            classList: allClasses.sort(),
            terminals: terminals.sort(),
            years: years.sort(),
            selectedTerminal: terminal || '',
            selectedYear: academicYear || '',
            filterClass: filterClass || ''
        });

    } catch (error) {
        console.error('Error in quantamanalysis:', error);
        res.status(500).send('Error loading analysis page: ' + error.message);
    }
};
// gradeCounterController.js


// Class name normalization map


function normalizeClassName(cls) {
    if (!cls) return '';
    const key = String(cls).toLowerCase().trim();
    return CLASS_NORMALIZATION[key] || cls;
}

function getClassOrder(cls) {
    if (!cls) return 999;
    const normalized = normalizeClassName(cls);
    return CLASS_ORDER[normalized] !== undefined ? CLASS_ORDER[normalized] : 999;
}

function displayClassName(cls) {
    if (!cls) return '';
    const key = String(cls).toLowerCase().trim();
    return CLASS_NORMALIZATION[key] || cls;
}

function getGradeFromPercentage(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C+';
    if (percentage >= 40) return 'C';
    if (percentage >= 35) return 'D';
    return 'NG';
}

function getGPFromPercentage(percentage) {
    if (percentage >= 90) return 4.0;
    if (percentage >= 80) return 3.6;
    if (percentage >= 70) return 3.2;
    if (percentage >= 60) return 2.8;
    if (percentage >= 50) return 2.4;
    if (percentage >= 40) return 2.0;
    if (percentage >= 35) return 1.6;
    return 0;
}

// Grade order for sorting
const GRADE_ORDER = {
    'A+': 0,
    'A': 1,
    'B+': 2,
    'B': 3,
    'C+': 4,
    'C': 5,
    'D': 6,
    'NG': 7
};



// Class name normalization map


function normalizeClassName(cls) {
    if (!cls) return '';
    const key = String(cls).toLowerCase().trim();
    return CLASS_NORMALIZATION[key] || cls;
}

function getClassOrder(cls) {
    if (!cls) return 999;
    const normalized = normalizeClassName(cls);
    return CLASS_ORDER[normalized] !== undefined ? CLASS_ORDER[normalized] : 999;
}

function displayClassName(cls) {
    if (!cls) return '';
    const key = String(cls).toLowerCase().trim();
    return CLASS_NORMALIZATION[key] || cls;
}

function getGradeFromGP(gp) {
    if (gp >= 3.61) return 'A+';
    if (gp >= 3.21) return 'A';
    if (gp >= 2.81) return 'B+';
    if (gp >= 2.41) return 'B';
    if (gp >= 2.01) return 'C+';
    if (gp >= 1.61) return 'C';
    if (gp >= 1.6) return 'D';
    return 'NG';
}

function getGPFromPercentage(percentage) {
    if (percentage >= 90) return 4.0;
    if (percentage >= 80) return 3.6;
    if (percentage >= 70) return 3.2;
    if (percentage >= 60) return 2.8;
    if (percentage >= 50) return 2.4;
    if (percentage >= 40) return 2.0;
    if (percentage >= 35) return 1.6;
    return 0;
}

function calculateGP(theoryMarks, theoryFull, practicalMarks, practicalFull, theoryCredit, practicalCredit, calcMode) {
    let theoryGP = 0;
    let practicalGP = 0;
    
    // Calculate theory GP
    if (theoryFull > 0) {
        const theoryPercentage = (theoryMarks / theoryFull) * 100;
        theoryGP = getGPFromPercentage(theoryPercentage);
    }
    
    // Calculate practical GP
    if (practicalFull > 0 && practicalMarks > 0) {
        const practicalPercentage = (practicalMarks / practicalFull) * 100;
        practicalGP = getGPFromPercentage(practicalPercentage);
    }
    
    // If no practical marks, use theory only
    if (practicalMarks === 0 || practicalFull === 0) {
        return theoryGP;
    }
    
    // If theory marks is 0, use practical only
    if (theoryMarks === 0 || theoryFull === 0) {
        return practicalGP;
    }
    
    // Calculate based on mode
    if (calcMode === 'theory') {
        return theoryGP;
    } else if (calcMode === 'practical') {
        return practicalGP;
    } else {
        // Combined: (theoryGP * theoryCredit + practicalGP * practicalCredit) / (theoryCredit + practicalCredit)
        const totalCredit = (theoryCredit || 1) + (practicalCredit || 1);
        if (totalCredit > 0) {
            const weightedGP = ((theoryGP * (theoryCredit || 1)) + (practicalGP * (practicalCredit || 1))) / totalCredit;
            return weightedGP;
        }
        return theoryGP;
    }
}

// Grade order for sorting


// Check if class is pre-primary (Nursery, LKG, UKG)
function isPrePrimary(cls) {
    const normalized = normalizeClassName(cls);
    return ['Nursery', 'LKG', 'UKG'].includes(normalized);
}

// Check if class is primary (1-3)
function isPrimary(cls) {
    const normalized = normalizeClassName(cls);
    return ['One', 'Two', 'Three'].includes(normalized);
}

// Check if class is middle (4-7)
function isMiddle(cls) {
    const normalized = normalizeClassName(cls);
    return ['Four', 'Five', 'Six', 'Seven'].includes(normalized);
}

// Check if class is secondary (8-10)
function isSecondary(cls) {
    const normalized = normalizeClassName(cls);
    return ['Eight', 'Nine', 'Ten'].includes(normalized);
}

exports.getGradeCounter = async (req, res) => {
    try {
        const { terminal, academicYear, filterSubject, calcMode } = req.query;

        // Build filter
        let filter = {};
        if (terminal) filter.terminal = terminal;
        if (academicYear) filter.academicYear = academicYear;

        // Get the exam model
        const Exammodel = await getSlipModel();

        // Fetch all exam marks
        const examMarks = await Exammodel.find(filter).lean();
        console.log('Exam Marks found:', examMarks.length);

        // Fetch subject configurations for credit hours
        const subjectConfigs = await newsubject.find({}).lean();
        console.log('Subject Configs found:', subjectConfigs.length);

        // Build subject config map
        const subjectConfigMap = {};
        subjectConfigs.forEach(config => {
            const forClass = String(config.forClass || '').trim();
            const subjectName = String(config.newsubject || '').trim();
            const key = (forClass + '||' + subjectName).toUpperCase();
            subjectConfigMap[key] = {
                theoryCredit: config.theoryCreditHour || 1,
                practicalCredit: config.practicalCreditHour || 1,
                theoryFull: config.theory || 0,
                practicalFull: config.practical || 0,
                totalFull: config.total || 0
            };
        });

        if (examMarks.length === 0) {
            return res.render('exam/gradeCounter', {
                title: 'Grade Counter - Subject Wise Analysis',
                gradeData: {},
                subjectList: [],
                classList: [],
                terminals: [],
                years: [],
                selectedTerminal: terminal || '',
                selectedYear: academicYear || '',
                filterSubject: filterSubject || '',
                calcMode: calcMode || 'combined'
            });
        }

        // Get all subjects for filter
        const subjectList = await Exammodel.distinct('subject', filter);
        const classList = await Exammodel.distinct('studentClass', filter);
        const terminals = await Exammodel.distinct('terminal', filter);
        const years = await Exammodel.distinct('academicYear', filter);

        // Process grade data
        const gradeData = processGradeCounter(examMarks, subjectConfigMap, calcMode);

        res.render('./exam/gradeCounter', {
            title: 'Grade Counter - Subject Wise Analysis',
            gradeData: gradeData,
            subjectList: subjectList.sort(),
            classList: classList.sort(),
            terminals: terminals.sort(),
            years: years.sort(),
            selectedTerminal: terminal || '',
            selectedYear: academicYear || '',
            filterSubject: filterSubject || '',
            calcMode: calcMode || 'combined'
        });

    } catch (error) {
        console.error('Error in getGradeCounter:', error);
        res.status(500).send('Error loading grade counter page: ' + error.message);
    }
};

function processGradeCounter(examMarks, subjectConfigMap, calcMode = 'combined') {
    // Group by subject, then by class
    const subjectClassData = {};

    examMarks.forEach(record => {
        const subject = String(record.subject || '').trim();
        if (!subject) return;

        const cls = String(record.studentClass || '').trim();
        if (!cls) return;

        const normalizedCls = normalizeClassName(cls);

        // Get marks
        const theoryMarks = parseFloat(record.theorymarks) || 0;
        const practicalMarks = parseFloat(record.practicalmarks) || 0;
        
        // Get full marks from record
        const theoryFull = parseFloat(record.theoryfullmarks) || 0;
        const practicalFull = parseFloat(record.practicalfullmarks) || 0;

        // Get credit hours from config
        const configKey = (cls + '||' + subject).toUpperCase();
        const config = subjectConfigMap[configKey] || {};
        
        // Also try normalized class name
        const normalizedKey = (normalizedCls + '||' + subject).toUpperCase();
        const normalizedConfig = subjectConfigMap[normalizedKey] || {};
        
        // Use config if available, otherwise fallback to record values
        const theoryCredit = config.theoryCredit || normalizedConfig.theoryCredit || 1;
        const practicalCredit = config.practicalCredit || normalizedConfig.practicalCredit || 1;
        
        let finalGP = 0;

        // Calculate based on class level
        if (isPrePrimary(cls)) {
            // Pre-Primary: Only practical marks
            if (practicalFull > 0) {
                const percentage = (practicalMarks / practicalFull) * 100;
                finalGP = getGPFromPercentage(percentage);
            }
        } else if (isPrimary(cls)) {
            // Primary (1-3): Theory only
            if (theoryFull > 0) {
                const percentage = (theoryMarks / theoryFull) * 100;
                finalGP = getGPFromPercentage(percentage);
            }
        } else {
            // Class 4-10: Use credit-based calculation
            finalGP = calculateGP(
                theoryMarks, theoryFull,
                practicalMarks, practicalFull,
                theoryCredit, practicalCredit,
                calcMode
            );
        }

        // Get grade from GP
        const grade = getGradeFromGP(finalGP);

        // Initialize structure
        if (!subjectClassData[subject]) {
            subjectClassData[subject] = {};
        }
        if (!subjectClassData[subject][normalizedCls]) {
            subjectClassData[subject][normalizedCls] = {
                grades: {
                    'A+': 0,
                    'A': 0,
                    'B+': 0,
                    'B': 0,
                    'C+': 0,
                    'C': 0,
                    'D': 0,
                    'NG': 0
                },
                total: 0,
                classNames: new Set()
            };
            subjectClassData[subject][normalizedCls].classNames.add(cls);
        }

        // Count grade
        subjectClassData[subject][normalizedCls].grades[grade]++;
        subjectClassData[subject][normalizedCls].total++;
        subjectClassData[subject][normalizedCls].classNames.add(cls);
    });

    return subjectClassData;
}

function processGradeCounter(examMarks) {
    // Group by subject, then by class
    const subjectClassData = {};

    examMarks.forEach(record => {
        const subject = String(record.subject || '').trim();
        if (!subject) return;

        const cls = String(record.studentClass || '').trim();
        if (!cls) return;

        const normalizedCls = normalizeClassName(cls);

        // Get marks
        const theoryMarks = parseFloat(record.theorymarks) || 0;
        const theoryFull = parseFloat(record.theoryfullmarks) || 0;
        
        // Calculate percentage
        const percentage = theoryFull > 0 ? (theoryMarks / theoryFull) * 100 : 0;
        
        // Get grade
        const grade = getGradeFromPercentage(percentage);

        // Initialize structure
        if (!subjectClassData[subject]) {
            subjectClassData[subject] = {};
        }
        if (!subjectClassData[subject][normalizedCls]) {
            subjectClassData[subject][normalizedCls] = {
                grades: {
                    'A+': 0,
                    'A': 0,
                    'B+': 0,
                    'B': 0,
                    'C+': 0,
                    'C': 0,
                    'D': 0,
                    'NG': 0
                },
                total: 0,
                classNames: new Set()
            };
            subjectClassData[subject][normalizedCls].classNames.add(cls);
        }

        // Count grade
        subjectClassData[subject][normalizedCls].grades[grade]++;
        subjectClassData[subject][normalizedCls].total++;
        subjectClassData[subject][normalizedCls].classNames.add(cls);
    });

    return subjectClassData;
}