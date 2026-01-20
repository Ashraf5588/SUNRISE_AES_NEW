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


exports.onlineAttendancePage = async (req, res) => {
    try {
        const {studentClass,section,academicYear,month}= req.query;
        const studentData = await studentRecord.find({ studentClass: studentClass, section: section });

     
        const sidenavData = await getSidenavData(req);
        const marksheetSetups = await marksheetSetup.find({}).lean();
        const HolidayData = await holiday.find({ academicYear: academicYear }).lean();
        console.log('Holiday Data:', HolidayData[0]);
        res.render('./attendance/attendance', { studentClass,section,academicYear, 
          studentData : studentData  || { students: [] }
          , marksheetSetups,studentClassdata:sidenavData.studentClassdata,month,
          HolidayData: HolidayData[0] || null });

    } catch (error) {
        console.error('Error fetching attendance page:', error);
        res.status(500).send('Internal Server Error');
    } 
}
exports.saveOnlineAttendance = async (req, res) => {
    try {   
        const {studentClass,section,academicYear}= req.query;
       const model = onlineAttendance ;
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
            res.json({ success: true });
       
         } 
        
     catch (error) {
        console.error('Error saving online attendance:', error);
        res.status(500).send('Internal Server Error');
    }
}

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

    