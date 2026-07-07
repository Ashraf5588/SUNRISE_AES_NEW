const path = require("path");
const multer  = require('multer')
const fs= require("fs");
const express = require("express");
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
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const terminalModel = mongoose.model("terminal", terminalSchema, "terminal");
const { marksheetsetupschemaForAdmin ,routineSchema} = require("../model/marksheetschema");
const { fail } = require("assert");
const routineModel = mongoose.model("routine", routineSchema, "routine");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const {onlineAttendanceSchema} = require("../model/onlineattendanceschema");
const onlineAttendance = mongoose.model("onlineAttendance", onlineAttendanceSchema, "onlineAttendance");
const {holidaySchema} = require("../model/holidayschema");
const holiday = mongoose.model("holiday", holidaySchema, "holiday");
const bs = require('bikram-sambat-js');
const getSidenavData = async (req) => {
  try {
    const subjects = await subjectlist.find({}).lean();
    const studentClassdata = await studentClass.find({}).lean();
    const terminals = await terminal.find({}).lean();
    
    let accessibleSubject = [];
    let accessibleClass = [];
    
    // Check if req exists and has user property
    if (req && req.user) {
      const user = req.user;
      // Log user info for debugging
      if (user && user.role) {
        console.log('User role:', user.role);
        console.log('User allowed subjects:', user.allowedSubjects || []);
      } else {
        console.log('User object exists but missing role or allowedSubjects');
      }
      
      if (user.role === "ADMIN") {
        accessibleSubject = subjects;
        accessibleClass = studentClassdata;
      } else {
        // Filter subjects based on user's allowed subjects
        accessibleSubject = subjects.filter(subj =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.subject === subj.subject
          )
        );
        
        // Filter classes based on user's allowed classes/sections
        accessibleClass = studentClassdata.filter(classItem =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.studentClass === classItem.studentClass && 
            allowed.section === classItem.section
          )
        );
        
        console.log('Filtered subjects:', accessibleSubject.length);
        console.log('Filtered classes:', accessibleClass.length);
      }
    } else {
      // If no user is found, return all data (default admin view)
      console.log('No user found in request, returning all data');
      accessibleSubject = subjects;
      accessibleClass = studentClassdata;
    }
    
    return {
      subjects: accessibleSubject,
      studentClassdata: accessibleClass,
      terminals
    };
  } catch (error) {
    console.error('Error fetching sidenav data:', error);
    return {
      subjects: [],
      studentClassdata: [],
      terminals: []
    };
  }
};

// Helper function to convert UTC time to Kathmandu timezone (UTC+5:45) and format as HH:MM AM/PM
const formatKathmandTimeTime = (utcDate) => {
  if (!utcDate) return null;
  try {
    const date = new Date(utcDate);
    // Stored time is in UTC format (ISO string)
    // Kathmandu timezone: UTC+5:45 (add 5 hours 45 minutes)
    const kathmanduOffsetMs = (5 * 60 + 45) * 60 * 1000; // 5:45 in milliseconds
    const kathmandTime = new Date(date.getTime() + kathmanduOffsetMs);
    
    // Use UTC methods since we manually adjusted the time
    let hours = kathmandTime.getUTCHours();
    let minutes = kathmandTime.getUTCMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hours should be 12
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    
    return `${hours}:${minutesStr} ${period}`;
  } catch (err) {
    console.error('Error formatting Kathmandu time:', err);
    return null;
  }
};

const BS_MONTH_NAMES = {
  1: 'Baisakh',
  2: 'Jestha',
  3: 'Asar',
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

const MONTH_EQUIVALENTS = {
  Asar: ['Asar', 'Ashar', 'Ashadh'],
  Ashwin: ['Ashwin', 'Ashoj']
};

const BS_MONTH_ORDER = {
  baisakh: 1,
  jestha: 2,
  asar: 3,
  ashar: 3,
  ashadh: 3,
  shrawan: 4,
  bhadra: 5,
  ashwin: 6,
  ashoj: 6,
  kartik: 7,
  mangsir: 8,
  poush: 9,
  magh: 10,
  falgun: 11,
  chaitra: 12
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getUpdateMatchedCount = (result) => {
  if (!result) {
    return 0;
  }
  if (Number.isFinite(result.matchedCount)) {
    return result.matchedCount;
  }
  if (Number.isFinite(result.nMatched)) {
    return result.nMatched;
  }
  if (Number.isFinite(result.n)) {
    return result.n;
  }
  return 0;
};

const getBsMonthOrder = (monthName) => {
  return BS_MONTH_ORDER[normalizeText(monthName)] || 0;
};

const getMonthVariants = (monthName) => {
  if (!monthName) {
    return [];
  }

  const aliases = MONTH_EQUIVALENTS[monthName] || [monthName];
  return aliases.map((name) => normalizeText(name));
};

const getPreferredContact = (student) => {
  return (
    (student && student.numberofmobile) ||
    (student && student.fatherContact) ||
    (student && student.motherContact) ||
    (student && student.otherguardianContact) ||
    ''
  );
};

const toDialableNumber = (value) => String(value || '').replace(/[^\d+]/g, '');


exports.onlineAttendancePage = async (req, res) => {
    try {
        const {studentClass,section,academicYear,month,day}= req.query;
    const todayBs = String(bs.ADToBS(new Date()) || '');
    const [todayYearPart, todayMonthPart, todayDayPart] = todayBs.split('-');
    const todayYear = String(todayYearPart || '');
    const todayDay = Number.parseInt(todayDayPart, 10);
    const todayMonthNumber = Number.parseInt(todayMonthPart, 10);
    const todayMonthName = BS_MONTH_NAMES[todayMonthNumber] || '';
    const todayMonthVariants = getMonthVariants(todayMonthName);
        const studentData = await studentRecord.find({ studentClass: studentClass, section: section });

     
        const sidenavData = await getSidenavData(req);
        const marksheetSetups = await marksheetSetup.find({}).lean();
        const HolidayData = await holiday.find({ academicYear: academicYear }).lean();
        const selectedMonthVariants = getMonthVariants(month);
        const onlineAttendanceData = (studentClass && section && academicYear)
          ? await onlineAttendance.find({ studentClass, section, academicYear }).lean()
          : [];

        const absentHistory = [];
        onlineAttendanceData.forEach((student) => {
          const attendanceEntries = Array.isArray(student && student.attendance) ? student.attendance : [];
          attendanceEntries.forEach((entry) => {
            const entryYear = String(entry && entry.academicYear || '');
            const entryMonth = normalizeText(entry && entry.month);
            const entryDay = Number.parseInt(entry && entry.day, 10);
            const entryStatus = normalizeText(entry && entry.status);
            const isSameAcademicYear = entryYear === String(academicYear || '');
            const isSameSelectedMonth = selectedMonthVariants.length > 0
              ? selectedMonthVariants.includes(entryMonth)
              : true;
            const isAbsent = entryStatus === 'absent' || entryStatus === 'a' || entryStatus === 'false';

            if (!isSameAcademicYear || !isSameSelectedMonth || !isAbsent) {
              return;
            }

            const year = Number.parseInt(entryYear, 10) || 0;
            const monthOrder = getBsMonthOrder(entry && entry.month);
            const day = Number.parseInt(entryDay, 10) || 0;
            const sortValue = (year * 10000) + (monthOrder * 100) + day;

            absentHistory.push({
              studentName: String(student && student.name || ''),
              dateText: `${String(entry && entry.day || '')} ${String(entry && entry.month || '')}, ${String(entry && entry.academicYear || '')}`,
              reason: String(entry && entry.reason || '').trim(),
              sortValue
            });
          });
        });

        absentHistory.sort((a, b) => b.sortValue - a.sortValue);

        console.log('Holiday Data:', HolidayData[0]);
        res.render('./attendance/attendance', { studentClass,section,academicYear,day, 
          studentData : studentData  || { students: [] }
          , marksheetSetups,studentClassdata:sidenavData.studentClassdata,month,
          HolidayData: HolidayData[0] || null,
          absentHistory,
          todayBs,
          todayMonthName,
          todayDay });

    } catch (error) {
        console.error('Error fetching attendance page:', error);
        res.status(500).send('Internal Server Error');
    } 
}
exports.saveOnlineAttendance = async (req, res) => {
    try {   
        const {studentClass,section,academicYear}= req.query;
       const model = onlineAttendance ;
       const day = req.body.day;
       const month = req.body.month;
      const status = req.body.status;
      const reason = String(req.body.reason || '').trim();
      const informedRaw = req.body.informed;
      const informedProvided = informedRaw !== undefined;
      const informed = String(informedRaw || '').toLowerCase() === 'true';
       await model.updateOne(
             {
               reg: req.body.reg,
                 academicYear: academicYear,
               studentClass: studentClass,
               section: section,
             },
             {
               $set: {
                 reg: req.body.reg,
                 roll:  req.body.roll,
                 name: req.body.name,
                 studentClass: studentClass,
                 section: section,
                 academicYear: academicYear,
                 gender: req.body.gender || "",
               },
             },
             { upsert: true }
           );

       if (day && month && academicYear) {
         const existingDoc = await model.findOne(
           {
             reg: req.body.reg,
             academicYear: academicYear,
             studentClass: studentClass,
             section: section,
           },
           { attendance: 1 }
         ).lean();

         const previousEntry = (Array.isArray(existingDoc && existingDoc.attendance)
           ? existingDoc.attendance
           : []
         ).find((entry) => (
           String(entry && entry.academicYear) === String(academicYear) &&
           normalizeText(entry && entry.month) === normalizeText(month) &&
           String(entry && entry.day) === String(day)
         ));

         const preservedReason = String(previousEntry && previousEntry.reason || '').trim();
         let nextReason = '';
         if (status === 'absent') {
           if (informedProvided) {
             nextReason = informed ? (reason || preservedReason) : '';
           } else {
             nextReason = reason || preservedReason;
           }
         }

         await model.updateOne(
           {
             reg: req.body.reg,
             academicYear: academicYear,
             studentClass: studentClass,
             section: section,
           },
           {
             $pull: {
               attendance: {
                 academicYear: academicYear,
                 month: month,
                 day: String(day)
               }
             }
           }
         );

         await model.updateOne(
           {
             reg: req.body.reg,
             academicYear: academicYear,
             studentClass: studentClass,
             section: section,
           },
           {
             $push: {
               attendance: {
                 academicYear: academicYear,
                 month: month,
                 day: String(day),
                  status: status === 'absent' ? 'absent' : 'present',
                  reason: nextReason,
                  savedAt: new Date().toISOString()
               }
             }
           }
         );
       }
            res.json({ success: true });
       
         } 
        
     catch (error) {
        console.error('Error saving online attendance:', error);
        res.status(500).send('Internal Server Error');
    }
}

exports.updateStudentRoll = async (req, res) => {
  try {
    const { reg, roll, studentClass, section, academicYear } = req.body || {};

    if (!reg || roll === undefined || roll === null) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const parsedRoll = Number(roll);
    if (!Number.isFinite(parsedRoll) || parsedRoll <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid roll number' });
    }

    const baseFilter = { reg: String(reg) };
    const scopedFilter = { ...baseFilter };
    if (studentClass) {
      scopedFilter.studentClass = String(studentClass);
    }
    if (section) {
      scopedFilter.section = String(section);
    }

    let updateResult = await studentRecord.updateOne(
      scopedFilter,
      { $set: { roll: parsedRoll } }
    );

    if (getUpdateMatchedCount(updateResult) === 0) {
      updateResult = await studentRecord.updateOne(
        baseFilter,
        { $set: { roll: parsedRoll } }
      );
    }

    if (getUpdateMatchedCount(updateResult) === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (studentClass && section && academicYear) {
      await onlineAttendance.updateMany(
        {
          reg: String(reg),
          studentClass: String(studentClass),
          section: String(section),
          academicYear: String(academicYear)
        },
        { $set: { roll: parsedRoll } }
      );
    }

    return res.json({ success: true, roll: parsedRoll });
  } catch (error) {
    console.error('Error updating student roll:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

exports.updateStudentHouse = async (req, res) => {
  try {
    const { reg, house, studentClass, section } = req.body || {};

    if (!reg) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const normalizedHouse = String(house || '').trim();
    const baseFilter = { reg: String(reg) };
    const scopedFilter = { ...baseFilter };
    if (studentClass) {
      scopedFilter.studentClass = String(studentClass);
    }
    if (section) {
      scopedFilter.section = String(section);
    }

    let updateResult = await studentRecord.updateOne(
      scopedFilter,
      { $set: { house: normalizedHouse } }
    );

    if (getUpdateMatchedCount(updateResult) === 0) {
      updateResult = await studentRecord.updateOne(
        baseFilter,
        { $set: { house: normalizedHouse } }
      );
    }

    if (getUpdateMatchedCount(updateResult) === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    return res.json({ success: true, house: normalizedHouse });
  } catch (error) {
    console.error('Error updating student house:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

exports.getOnlineAttendanceData = async (req, res) => {
  try {
    const { studentClass, section, academicYear } = req.query;
    const attendanceData = await onlineAttendance
      .find({ studentClass, section, academicYear })
      .lean();

    res.json(attendanceData);
  } catch (error) {
    console.error('Error fetching online attendance data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

exports.saveFrontdeskReason = async (req, res) => {
  try {
    const { reg, studentClass, section, academicYear, month, day, reason } = req.body;

    if (!reg || !studentClass || !section || !academicYear || !month || !day) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const trimmedReason = String(reason || '').trim();
    const monthVariants = getMonthVariants(month);
    const monthRegex = monthVariants.length > 0
      ? new RegExp(`^(${monthVariants.map((variant) => escapeRegex(variant)).join('|')})$`, 'i')
      : new RegExp(`^${escapeRegex(month)}$`, 'i');

    const updateResult = await onlineAttendance.updateOne(
      {
        reg: String(reg),
        studentClass: String(studentClass),
        section: String(section),
        academicYear: String(academicYear)
      },
      {
        $set: {
          'attendance.$[entry].reason': trimmedReason
        }
      },
      {
        arrayFilters: [
          {
            'entry.academicYear': String(academicYear),
            'entry.day': String(day),
            'entry.month': { $regex: monthRegex },
            'entry.status': { $in: ['absent', 'a', 'false'] }
          }
        ]
      }
    );

    if (!updateResult || updateResult.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Attendance entry not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving frontdesk reason:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

exports.searchFrontdeskStudents = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.status(200).json([]);
    }

    const results = await studentRecord.find({
      name: { $regex: query, $options: 'i' }
    })
      .select('reg name studentClass section roll fatherName address numberofmobile fatherContact motherContact otherguardianContact')
      .limit(10)
      .lean();

    const responseData = (Array.isArray(results) ? results : []).map((student) => {
      const contact = getPreferredContact(student);
      return {
        reg: String(student.reg || ''),
        name: String(student.name || ''),
        studentClass: String(student.studentClass || ''),
        section: String(student.section || ''),
        roll: student.roll,
        fatherName: String(student.fatherName || ''),
        address: String(student.address || ''),
        contact: String(contact || ''),
        dialNumber: toDialableNumber(contact)
      };
    });

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error searching frontdesk students:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.saveFrontdeskCallLog = async (req, res) => {
  try {
    const { reg, studentClass, section, academicYear, month, day, callReason, parentResponse } = req.body;

    if (!reg || !studentClass || !section || !academicYear || !month || !day) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const normalizedReg = String(reg || '').trim();
    const normalizedClass = String(studentClass || '').trim();
    const normalizedSection = String(section || '').trim();
    const normalizedAcademicYear = String(academicYear || '').trim();
    const normalizedMonth = String(month || '').trim();
    const normalizedDay = String(day || '').trim();

    const studentInfo = await studentRecord.findOne({ reg: normalizedReg }).lean();
    const studentName = String(studentInfo && studentInfo.name || '');
    const studentRoll = studentInfo && studentInfo.roll !== undefined ? studentInfo.roll : undefined;

    const trimmedCallReason = String(callReason || '').trim();
    const trimmedParentResponse = String(parentResponse || '').trim();
    const callBy = req.user && req.user.teacherName ? String(req.user.teacherName).trim() : '';
    const monthVariants = getMonthVariants(month);
    const monthRegex = monthVariants.length > 0
      ? new RegExp(`^(${monthVariants.map((variant) => escapeRegex(variant)).join('|')})$`, 'i')
      : new RegExp(`^${escapeRegex(month)}$`, 'i');

    const updateResult = await onlineAttendance.updateOne(
      {
        reg: normalizedReg,
        studentClass: normalizedClass,
        section: normalizedSection,
        academicYear: normalizedAcademicYear
      },
      {
        $set: {
          ...(studentName ? { name: studentName } : {}),
          ...(studentRoll !== undefined ? { roll: studentRoll } : {}),
          'attendance.$[entry].callReason': trimmedCallReason,
          'attendance.$[entry].parentResponse': trimmedParentResponse,
          'attendance.$[entry].callLoggedAt': new Date().toISOString(),
          ...(callBy ? { 'attendance.$[entry].callBy': callBy } : {})
        }
      },
      {
        arrayFilters: [
          {
            'entry.academicYear': normalizedAcademicYear,
            'entry.day': normalizedDay,
            'entry.month': { $regex: monthRegex }
          }
        ]
      }
    );

    if (!updateResult || updateResult.modifiedCount === 0) {
      await onlineAttendance.updateOne(
        {
          reg: String(reg),
          studentClass: String(studentClass),
          section: String(section),
          academicYear: String(academicYear)
        },
        {
          $setOnInsert: {
            reg: normalizedReg,
            studentClass: normalizedClass,
            section: normalizedSection,
            academicYear: normalizedAcademicYear,
            ...(studentName ? { name: studentName } : {}),
            ...(studentRoll !== undefined ? { roll: studentRoll } : {})
          },
          $push: {
            attendance: {
              academicYear: normalizedAcademicYear,
              month: normalizedMonth,
              day: normalizedDay,
              status: 'present',
              callReason: trimmedCallReason,
              parentResponse: trimmedParentResponse,
              callLoggedAt: new Date().toISOString(),
              ...(callBy ? { callBy } : {}),
              savedAt: new Date().toISOString()
            }
          }
        },
        { upsert: true }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving frontdesk call log:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.getFrontdeskCallLogs = async (req, res) => {
  try {
    const academicYear = String(req.query.academicYear || '').trim();
    const month = String(req.query.month || '').trim();
    const day = String(req.query.day || '').trim();

    if (!academicYear || !month || !day) {
      return res.status(400).json({ message: 'Missing required filters' });
    }

    const monthVariants = getMonthVariants(month);
    const monthSet = new Set(monthVariants);

    const attendanceDocs = await onlineAttendance.find({
      academicYear: String(academicYear)
    }).lean();

    const normalizeReg = (value) => String(value || '').trim();
    const logs = [];
    const regSet = new Set();

    attendanceDocs.forEach((doc) => {
      const attendanceEntries = Array.isArray(doc && doc.attendance) ? doc.attendance : [];

      attendanceEntries.forEach((entry) => {
        const entryYear = String(entry && entry.academicYear || '');
        const entryMonth = normalizeText(entry && entry.month);
        const entryDay = String(entry && entry.day || '');
        const hasLog = Boolean(entry && (entry.callReason || entry.parentResponse || entry.callLoggedAt));

        if (!hasLog) {
          return;
        }

        if (entryYear !== String(academicYear)) {
          return;
        }

        if (!monthSet.has(entryMonth)) {
          return;
        }

        if (entryDay !== String(day)) {
          return;
        }

        const reg = normalizeReg(doc && doc.reg);
        if (reg) {
          regSet.add(reg);
        }

        logs.push({
          reg,
          name: String(doc && doc.name || ''),
          studentClass: String(doc && doc.studentClass || ''),
          section: String(doc && doc.section || ''),
          roll: doc && doc.roll,
          callReason: String(entry && entry.callReason || ''),
          parentResponse: String(entry && entry.parentResponse || ''),
          callLoggedAt: String(entry && entry.callLoggedAt || ''),
          day: entryDay,
          month: String(entry && entry.month || ''),
          academicYear: entryYear
        });
      });
    });

    const regs = Array.from(regSet);
    const studentRecords = regs.length > 0
      ? await studentRecord.find({ reg: { $in: regs } }).lean()
      : [];

    const contactByReg = new Map(
      studentRecords.map((student) => [normalizeReg(student.reg), getPreferredContact(student)])
    );
    const studentByReg = new Map(
      studentRecords.map((student) => [normalizeReg(student.reg), student])
    );

    const responseData = logs
      .map((log, index) => {
        const normalizedReg = normalizeReg(log.reg);
        const record = studentByReg.get(normalizedReg);
        const contact = contactByReg.get(normalizedReg) || '';
        return {
          sn: index + 1,
          ...log,
          name: log.name || String(record && record.name || ''),
          studentClass: log.studentClass || String(record && record.studentClass || ''),
          section: log.section || String(record && record.section || ''),
          roll: log.roll !== undefined ? log.roll : (record && record.roll),
          contact,
          dialNumber: toDialableNumber(contact)
        };
      })
      .sort((a, b) => {
        const classCompare = String(a.studentClass).localeCompare(String(b.studentClass), 'en', { numeric: true });
        if (classCompare !== 0) {
          return classCompare;
        }

        const sectionCompare = String(a.section).localeCompare(String(b.section));
        if (sectionCompare !== 0) {
          return sectionCompare;
        }

        return String(a.roll || '').localeCompare(String(b.roll || ''), 'en', { numeric: true });
      })
      .map((log, index) => ({ ...log, sn: index + 1 }));

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error loading frontdesk call logs:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.frontdeskPage = async (req, res) => {
  try {
    const todayBs = String(bs.ADToBS(new Date()) || '');
    const [yearPart, monthPart, dayPart] = todayBs.split('-');
    const requestedAcademicYear = String(req.query.academicYear || '').trim();
    const requestedMonth = String(req.query.month || '').trim();
    const requestedDayRaw = String(req.query.day || '').trim();
    const requestedDay = Number.parseInt(requestedDayRaw, 10);
    const currentBsYear = String(yearPart || '');
    let targetAcademicYear = requestedAcademicYear || currentBsYear;
    const todayDay = Number.parseInt(dayPart, 10);
    const monthNumber = Number.parseInt(monthPart, 10);
    const currentMonthName = BS_MONTH_NAMES[monthNumber] || '';
    const selectedMonthName = requestedMonth || currentMonthName;
    const selectedDay = Number.isFinite(requestedDay) ? requestedDay : todayDay;
    const monthVariants = getMonthVariants(selectedMonthName);

    let attendanceDocs = await onlineAttendance.find({
      academicYear: targetAcademicYear
    }).lean();

    // If there is no data in current BS year, fallback to latest available academic year.
    if (!requestedAcademicYear && attendanceDocs.length === 0) {
      const availableYears = await onlineAttendance.distinct('academicYear');
      const sortedYears = (Array.isArray(availableYears) ? availableYears : [])
        .map((year) => String(year || '').trim())
        .filter(Boolean)
        .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

      if (sortedYears.length > 0) {
        targetAcademicYear = sortedYears[0];
        attendanceDocs = await onlineAttendance.find({
          academicYear: targetAcademicYear
        }).lean();
      }
    }

    const absentCandidates = [];
    const attendanceIndexByReg = new Map();

    const isAbsentStatus = (value) => {
      const normalized = normalizeText(value);
      return normalized === 'absent' || normalized === 'a' || normalized === 'false';
    };

    const getEntryForDay = (monthMap, day) => {
      for (const monthKey of monthVariants) {
        const entry = monthMap.get(`${monthKey}-${day}`);
        if (entry) {
          return entry;
        }
      }
      return null;
    };

    // Do not auto-insert "present" entries when generating reports.
    // Previously we pushed a present entry for every student with no selected-day entry
    // which caused reports to show present counts and timestamps even when no one saved attendance.

    attendanceDocs.forEach((doc) => {
      const attendanceEntries = Array.isArray(doc && doc.attendance) ? doc.attendance : [];
      const monthMap = new Map();
      let hasSelectedEntry = false;

      attendanceEntries.forEach((entry) => {
        const entryYear = String(entry && entry.academicYear);
        const entryMonth = normalizeText(entry && entry.month);
        const entryDay = Number.parseInt(entry && entry.day, 10);
        const entryStatus = normalizeText(entry && entry.status);

        const isSameYear = entryYear === targetAcademicYear;
        const isSameMonth = monthVariants.includes(entryMonth);
        const isSameDay = Number.isFinite(selectedDay) && entryDay === selectedDay;
        const isAbsent = entryStatus === 'absent' || entryStatus === 'a' || entryStatus === 'false';

        if (isSameYear && isSameMonth && isSameDay && isAbsent) {
          absentCandidates.push({
            reg: String(doc && doc.reg || ''),
            name: String(doc && doc.name || ''),
            studentClass: String(doc && doc.studentClass || ''),
            section: String(doc && doc.section || ''),
            roll: doc && doc.roll,
            reason: String(entry && entry.reason || '')
          });
        }

        if (isSameYear && isSameMonth && Number.isFinite(entryDay)) {
          monthMap.set(`${entryMonth}-${entryDay}`, entry);
        }

        if (isSameYear && isSameMonth && isSameDay) {
          hasSelectedEntry = true;
        }
      });

      const regKey = String(doc && doc.reg || '');
      if (regKey) {
        attendanceIndexByReg.set(regKey, monthMap);
      }

      // Intentionally do nothing here if there is no selected-day entry.
      // Attendance should only be created when a user explicitly saves it (e.g. using the UI).
    });

    // No automatic bulk write performed. Keep data immutable unless user action occurs.

    const uniqueByReg = new Map();
    absentCandidates.forEach((student) => {
      if (student.reg && !uniqueByReg.has(student.reg)) {
        uniqueByReg.set(student.reg, student);
      }
    });

    const regs = Array.from(uniqueByReg.keys());
    const studentRecords = regs.length > 0
      ? await studentRecord.find({ reg: { $in: regs } }).lean()
      : [];

    const contactByReg = new Map(
      studentRecords.map((student) => [String(student.reg || ''), getPreferredContact(student)])
    );

    const absentStudents = Array.from(uniqueByReg.values())
      .map((student, index) => {
        const monthMap = attendanceIndexByReg.get(student.reg) || new Map();
        let continuousAbsentDays = 0;
        let lastCalledText = '-';

        if (Number.isFinite(selectedDay)) {
          let lastAbsentDay = null;
          let lastAbsentReason = '';

          for (let day = selectedDay; day >= 1; day -= 1) {
            const entry = getEntryForDay(monthMap, day);
            if (!entry || !isAbsentStatus(entry.status)) {
              break;
            }

            continuousAbsentDays += 1;
            if (day < selectedDay && lastAbsentDay === null) {
              lastAbsentDay = day;
              lastAbsentReason = String(entry.reason || '').trim();
            }
          }

          if (lastAbsentDay !== null) {
            const diff = selectedDay - lastAbsentDay;
            const diffLabel = diff === 1 ? 'yesterday' : `${diff} days ago`;
            const reasonText = lastAbsentReason ? `response: ${lastAbsentReason}` : 'response: -';
            lastCalledText = `${diffLabel} (${reasonText})`;
          }
        }

        const contact = contactByReg.get(student.reg) || '';
        const dialNumber = toDialableNumber(contact);
        return {
          sn: index + 1,
          ...student,
          contact,
          dialNumber,
          continuousAbsentDays,
          lastCalledText
        };
      })
      .sort((a, b) => {
        const classCompare = String(a.studentClass).localeCompare(String(b.studentClass), 'en', { numeric: true });
        if (classCompare !== 0) {
          return classCompare;
        }

        const sectionCompare = String(a.section).localeCompare(String(b.section));
        if (sectionCompare !== 0) {
          return sectionCompare;
        }

        return String(a.roll || '').localeCompare(String(b.roll || ''), 'en', { numeric: true });
      })
      .map((student, index) => ({ ...student, sn: index + 1 }));

    const academicYearOptionsRaw = await onlineAttendance.distinct('academicYear');
    const academicYearOptions = (Array.isArray(academicYearOptionsRaw) ? academicYearOptionsRaw : [])
      .map((year) => String(year || '').trim())
      .filter(Boolean)
      .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

    if (!academicYearOptions.includes(targetAcademicYear) && targetAcademicYear) {
      academicYearOptions.unshift(targetAcademicYear);
    }

    const monthOptions = Object.keys(BS_MONTH_NAMES).map((monthKey) => BS_MONTH_NAMES[monthKey]);
    const dayOptions = Array.from({ length: 32 }, (_, index) => index + 1);

    res.render('./frontdesk/frontdesk', {
      absentStudents,
      todayBs,
      todayDay: selectedDay,
      currentMonthName: selectedMonthName,
      academicYear: targetAcademicYear,
      academicYearOptions,
      monthOptions,
      dayOptions
    });
  } catch (error) {
    console.error('Error loading frontdesk page:', error);
    res.status(500).send('Internal Server Error');
  }
}

exports.absentRecordPage = async (req, res) => {
  try {
    const todayBs = String(bs.ADToBS(new Date()) || '');
    const [yearPart, monthPart, dayPart] = todayBs.split('-');
    const requestedAcademicYear = String(req.query.academicYear || '').trim();
    const requestedMonth = String(req.query.month || '').trim();
    const requestedDayRaw = String(req.query.day || '').trim();
    const requestedDay = Number.parseInt(requestedDayRaw, 10);
    const currentBsYear = String(yearPart || '');
    let targetAcademicYear = requestedAcademicYear || currentBsYear;
    const todayDay = Number.parseInt(dayPart, 10);
    const monthNumber = Number.parseInt(monthPart, 10);
    const currentMonthName = BS_MONTH_NAMES[monthNumber] || '';
    const selectedMonthName = requestedMonth || currentMonthName;
    const selectedDay = Number.isFinite(requestedDay) ? requestedDay : todayDay;
    
    // Fetch current class names from classlist to map old names to new names
    let classNameMap = new Map();
    try {
      const currentClasses = await studentClass.find({}).lean();
      if (Array.isArray(currentClasses)) {
        currentClasses.forEach(cls => {
          const className = String(cls.studentClass || '').trim();
          const section = String(cls.section || '').trim();
          if (className && section) {
            classNameMap.set(`${className}||${section}`, { className, section });
          }
        });
      }
      console.log(`[AbsentRecord] Loaded ${classNameMap.size} current class names from classlist`);
    } catch (err) {
      console.error('[AbsentRecord] Error loading class names:', err);
    }

    const monthVariants = getMonthVariants(selectedMonthName);

    let attendanceDocs = await onlineAttendance.find({
      academicYear: targetAcademicYear
    }).lean();

    if (!requestedAcademicYear && attendanceDocs.length === 0) {
      const availableYears = await onlineAttendance.distinct('academicYear');
      const sortedYears = (Array.isArray(availableYears) ? availableYears : [])
        .map((year) => String(year || '').trim())
        .filter(Boolean)
        .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

      if (sortedYears.length > 0) {
        targetAcademicYear = sortedYears[0];
        attendanceDocs = await onlineAttendance.find({
          academicYear: targetAcademicYear
        }).lean();
      }
    }

    const groupMap = new Map();
    const monthSummaryMap = new Map();

    const isAbsentStatus = (value) => {
      const normalized = normalizeText(value);
      return normalized === 'absent' || normalized === 'a' || normalized === 'false';
    };

    const monthDisplayMap = Object.values(BS_MONTH_NAMES).reduce((acc, name) => {
      acc[normalizeText(name)] = name;
      return acc;
    }, {});

    const CLASS_ORDER = {
      nursery: 1,
      lkg: 2,
      ukg: 3,
      one: 4,
      two: 5,
      three: 6,
      four: 7,
      five: 8,
      six: 9,
      seven: 10,
      eight: 11,
      nine: 12,
      ten: 13
    };

    const getClassSortKey = (value) => {
      const normalized = normalizeText(value);
      if (CLASS_ORDER[normalized]) {
        return CLASS_ORDER[normalized];
      }

      const numericValue = Number.parseInt(normalized, 10);
      if (Number.isFinite(numericValue)) {
        return 100 + numericValue;
      }

      return 1000;
    };

    attendanceDocs.forEach((doc) => {
      const attendanceEntries = Array.isArray(doc && doc.attendance) ? doc.attendance : [];
      const studentClassValue = String(doc && doc.studentClass || '').trim();
      const sectionValue = String(doc && doc.section || '').trim();
      const rollValue = doc && doc.roll;
      const nameValue = String(doc && doc.name || '').trim();

      attendanceEntries.forEach((entry) => {
        const entryYear = String(entry && entry.academicYear || '').trim();
        const entryMonth = normalizeText(entry && entry.month);
        const entryMonthLabelRaw = String(entry && entry.month || '').trim();
        const entryDay = Number.parseInt(entry && entry.day, 10);
        const entryStatus = normalizeText(entry && entry.status);

        if (!entryYear || entryYear !== targetAcademicYear) {
          return;
        }

        if (!Number.isFinite(entryDay) || entryDay !== selectedDay) {
          return;
        }

        if (monthVariants.length > 0 && !monthVariants.includes(entryMonth)) {
          return;
        }

        if (!isAbsentStatus(entryStatus)) {
          return;
        }

        if (entryMonth) {
          const monthLabel = monthDisplayMap[entryMonth] || entryMonthLabelRaw || entryMonth;
          if (!monthSummaryMap.has(entryMonth)) {
            monthSummaryMap.set(entryMonth, {
              month: monthLabel,
              groupMap: new Map()
            });
          }

          const summaryGroupKey = `${studentClassValue}||${sectionValue}`;
          const summaryGroupMap = monthSummaryMap.get(entryMonth).groupMap;
          if (!summaryGroupMap.has(summaryGroupKey)) {
            summaryGroupMap.set(summaryGroupKey, {
              studentClass: studentClassValue,
              section: sectionValue,
              absentCount: 0
            });
          }

          summaryGroupMap.get(summaryGroupKey).absentCount += 1;
        }

        const groupKey = `${studentClassValue}||${sectionValue}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            studentClass: studentClassValue,
            section: sectionValue,
            students: []
          });
        }

        groupMap.get(groupKey).students.push({
          roll: rollValue,
          name: nameValue,
          reason: String(entry && entry.reason || '').trim()
        });
      });
    });

    // Build student counts per class-section to compute present = total - absent
    const countsAgg = await studentRecord.aggregate([
      { $group: { _id: { studentClass: '$studentClass', section: '$section' }, count: { $sum: 1 } } }
    ]);
    const countsMap = new Map();
    (Array.isArray(countsAgg) ? countsAgg : []).forEach((it) => {
      const cls = String((it._id && it._id.studentClass) || '').trim();
      const sec = String((it._id && it._id.section) || '').trim();
      countsMap.set(`${cls}||${sec}`, Number(it.count) || 0);
    });

    // Determine earliest savedAt per class-section for the selected day
    const enteredTimeMap = new Map();
    attendanceDocs.forEach((doc) => {
      const attendanceEntries = Array.isArray(doc && doc.attendance) ? doc.attendance : [];
      const studentClassValue = String(doc && doc.studentClass || '').trim();
      const sectionValue = String(doc && doc.section || '').trim();
      const groupKey = `${studentClassValue}||${sectionValue}`;

      attendanceEntries.forEach((entry) => {
        const entryYear = String(entry && entry.academicYear || '').trim();
        const entryMonth = normalizeText(entry && entry.month);
        const entryDay = Number.parseInt(entry && entry.day, 10);

        if (!entryYear || entryYear !== targetAcademicYear) return;
        if (!Number.isFinite(entryDay) || entryDay !== selectedDay) return;
        if (monthVariants.length > 0 && !monthVariants.includes(entryMonth)) return;

        const savedAtRaw = entry && entry.savedAt;
        let ts = null;
        if (savedAtRaw) {
          try { ts = new Date(savedAtRaw); } catch (e) { ts = null; }
        }
        // Only consider explicit savedAt timestamps. Do not fall back to document _id timestamps
        // because those reflect document creation times and create misleading "entered time" values.
        if (!ts) return;

        const prev = enteredTimeMap.get(groupKey);
        if (!prev || ts < prev) {
          enteredTimeMap.set(groupKey, ts);
        }
      });
    });

    // Build full set of class-section keys from student counts and existing groupMap
    const allKeys = new Set([
      ...Array.from(countsMap.keys()),
      ...Array.from(groupMap.keys()),
      ...Array.from(enteredTimeMap.keys())
    ]);
    
    console.log(`[AbsentRecord] Total unique class-section combinations in attendance data: ${allKeys.size}`);
    console.log(`[AbsentRecord] Current classes in classlist: ${classNameMap.size}`);
    
    // Count how many old/deleted classes will be filtered out
    const oldClassKeys = Array.from(allKeys).filter(key => !classNameMap.has(key));
    if (oldClassKeys.length > 0) {
      console.log(`[AbsentRecord] ⚠️ Filtering out ${oldClassKeys.length} old/deleted class records:`, oldClassKeys);
    }

    const builtGroups = Array.from(allKeys)
      .filter(key => {
        // ONLY include classes that exist in the current classlist
        // This filters out deleted/old/renamed classes
        return classNameMap.has(key);
      })
      .map((key) => {
      const [studentClassValue, sectionValue] = key.split('||');
      const grp = groupMap.get(key) || { studentClass: studentClassValue, section: sectionValue, students: [] };
      
      // Get current class name from classlist
      const currentClassInfo = classNameMap.get(key);
      const displayClassName = currentClassInfo.className;
      const displaySection = currentClassInfo.section;
      
      const students = (Array.isArray(grp.students) ? grp.students : []).filter((s) => s.name || s.roll !== undefined)
        .sort((a, b) => String(a.roll || '').localeCompare(String(b.roll || ''), 'en', { numeric: true }))
        .map((student, idx) => ({ sn: idx + 1, ...student }));

      const absentCount = students.length || 0;
      const totalStudents = countsMap.get(key) || 0;
      const attendanceDone = enteredTimeMap.has(key) || absentCount > 0;
      const present = attendanceDone && Number.isFinite(totalStudents) ? (totalStudents - absentCount) : null;
      const timeTs = enteredTimeMap.get(key);
      const timeStr = timeTs ? formatKathmandTimeTime(timeTs) : (attendanceDone ? 'Recorded' : null);

      return {
        studentClass: displayClassName || '',
        section: displaySection || '',
        students,
        absentCount,
        totalStudents,
        present: present === null ? (attendanceDone && totalStudents === 0 ? 0 : present) : present,
        enteredTime: timeStr,
        attendanceDone
      };
    });

    const groups = builtGroups.sort((a, b) => {
      const classOrderA = getClassSortKey(a.studentClass);
      const classOrderB = getClassSortKey(b.studentClass);
      if (classOrderA !== classOrderB) return classOrderA - classOrderB;
      return String(a.section).localeCompare(String(b.section));
    });

    const academicYearOptionsRaw = await onlineAttendance.distinct('academicYear');
    const academicYearOptions = (Array.isArray(academicYearOptionsRaw) ? academicYearOptionsRaw : [])
      .map((year) => String(year || '').trim())
      .filter(Boolean)
      .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

    if (!academicYearOptions.includes(targetAcademicYear) && targetAcademicYear) {
      academicYearOptions.unshift(targetAcademicYear);
    }

    const monthOptions = Object.keys(BS_MONTH_NAMES).map((monthKey) => BS_MONTH_NAMES[monthKey]);
    const dayOptions = Array.from({ length: 32 }, (_, index) => index + 1);

    const monthSummaries = Array.from(monthSummaryMap.entries())
      .map(([monthKey, summary]) => {
        const groups = Array.from(summary.groupMap.values())
          .sort((a, b) => {
            const classOrderA = getClassSortKey(a.studentClass);
            const classOrderB = getClassSortKey(b.studentClass);
            if (classOrderA !== classOrderB) {
              return classOrderA - classOrderB;
            }

            return String(a.section).localeCompare(String(b.section));
          });

        return {
          month: summary.month,
          monthKey,
          totalAbsent: groups.reduce((sum, group) => sum + (group.absentCount || 0), 0),
          groups
        };
      })
      .sort((a, b) => (BS_MONTH_ORDER[a.monthKey] || 99) - (BS_MONTH_ORDER[b.monthKey] || 99));

    const totalAbsentCount = groups.reduce((sum, group) => sum + (group.absentCount || 0), 0);

    res.render('./attendance/absent-record', {
      groups,
      monthSummaries,
      totalAbsentCount,
      todayBs,
      todayDay: selectedDay,
      currentMonthName: selectedMonthName,
      academicYear: targetAcademicYear,
      academicYearOptions,
      monthOptions,
      dayOptions
    });
  } catch (error) {
    console.error('Error loading absent record page:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.setHoliday = async (req, res) => {
  try {
    const marksheetSetups = await marksheetSetup.find({}).lean();
    const oldHolidayData = await holiday.find({ academicYear: req.query.academicYear }).lean();
    console.log('Old Holiday Data:', oldHolidayData[0]);
    res.render('./attendance/setholiday', { marksheetSetups, oldHolidayData: oldHolidayData[0] || null });
    

  }
  catch (error) {
    console.error('Error setting holiday:', error);
    res.status(500).send('Internal Server Error');
  }
}
exports.savesetHoliday = async (req, res) => {
  try {
    const { academicYear } = req.body;
    await holiday.updateMany(
      {
        academicYear: academicYear,
      },
      {
        $set: {
          academicYear: academicYear,
          month: req.body.month,
          holidayDays: req.body.holidayDays

        },
      },
      { upsert: true }
    );
    res.redirect('/setholiday?academicYear=' + academicYear);

  
  }
  catch (error) {
    console.error('Error saving holiday:', error);
    res.status(500).send('Internal Server Error');
  }
}

    