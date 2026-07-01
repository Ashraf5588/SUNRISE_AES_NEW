const path = require("path");
const fs= require("fs");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema, studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema,terminalSchema } = require("../model/adminschema");
const {newThemeFormSchema} = require("../model/newthemeformschema");

const {newsubjectSchema } = require("../model/adminschema");
const {addToolsSchema} = require("../model/addtoolsSchema");
const ToolsModel = mongoose.model("tools", addToolsSchema, "tools");
const {addAspectSchema} = require("../model/addaspectSchema");
const AspectsModel = mongoose.model("assessmentaspect", addAspectSchema, "assessmentaspect");
const AspectContainer = require('../model/aspectcontainerschema');

const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const bcrypt = require("bcrypt");
const terminal = mongoose.model("terminal", terminalSchema, "terminal");

// Use the already created model from the schema file

const {marksheetsetupSchema} = require("../model/adminschema");
const {marksheetsetupschemaForAdmin} = require("../model/masrksheetschema");
const marksheetSetup = mongoose.models.marksheetSetup || mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");



app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const getSidenavData = async (req) => {
  try {
    const subjects = await subjectlist.find({}).lean();
    const studentClassdata = await studentClass.find({}).lean();
    const terminals = await terminal.find({}).lean();
    
    let accessibleSubject = [];
    let accessibleClass = [];
      let newaccessibleSubjects = [];
    const newsubjectList = await newsubject.find({}).lean();
    
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
        newaccessibleSubjects = newsubjectList;
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
         newaccessibleSubjects = newsubjectList.filter(subj =>
  user.allowedSubjects.some(allowed =>
    allowed.subject === subj.newsubject
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
      // expose the full newsubject list when no user filtering is needed
      newaccessibleSubjects = newsubjectList;
    }
    
    return {
      subjects: accessibleSubject,
      studentClassdata: accessibleClass,
      terminals,
      newsubjectList: newaccessibleSubjects

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
const getStudentThemeData = async(studentClass) => {
  // Collection name: themeForStudent{class}
  const academicYear = await getAcademicYear();
  const collectionName = `themeForStudent-${studentClass}-${academicYear}`;
  console.log(`Getting student theme data model for class ${studentClass} using collection ${collectionName}`);
  
  // Check if model already exists
  if (mongoose.models[collectionName]) {
    
    
    delete mongoose.models[collectionName]; // Remove existing model to avoid OverwriteModelError
  }
  
  // Create model with newThemeFormSchema for student data
  return mongoose.model(collectionName, newThemeFormSchema, collectionName);
};
async function getAcademicYear()
{
  const data =  await marksheetSetup.find();
  if (data && data.length > 0) {
      return data[0].academicYear;
  }
  // Default fallback if no setup data exists
  console.warn("No marksheetSetup found, using default academicYear 2083");
  return "2083";
}
exports.themeformSavenew = async (req, res) =>{
try{
const {studentClass,section,subject,terminal}= req.query;
const model = await getStudentThemeData(studentClass);

const data = req.body;
const isHamroSerofero =
    data.subject.toLowerCase() === "hamro serofero" || data.subject.toLowerCase() === "hamro serophero";

const records = data.reg.map((reg, index) => ({
    reg,
    name: data.name[index],
    roll: data.roll[index],
    studentClass: data.studentClass,
    section: data.section,
    subject: data.subject,
    themeName: data.themeName,
    learningOutcomeName: data.learningOutcomeName,
    aspectName: data.aspectName || "",
    toolName: data.toolName,

    obtainedMarksBefore: isHamroSerofero
        ? Number(data.students[reg]?.obtainedMarksBefore || 0)
        : Number(data.students[reg]?.obtainedMarksBefore || 0),

    obtainedMarksAfter: isHamroSerofero
        ? Number(data.students[reg]?.obtainedMarksAfter || 0)
        : Number(data.students[reg]?.obtainedMarksAfter || 0),

    indicatorBefore: isHamroSerofero
        ? JSON.parse(data.students[reg]?.indicatorBefore || "[]")
        : [],

    indicatorAfter: isHamroSerofero
        ? JSON.parse(data.students[reg]?.indicatorAfter || "[]")
        : [],

    evalDateBefore:
        data.evalDateBefore[index] || "select date",

    evalDateAfter:
        data.evalDateAfter[index] || "select date"
}));

const operations = records.map(record => ({
    updateOne: {
        filter: {
            reg: record.reg,
            roll: record.roll,
            name: record.name,
            studentClass: record.studentClass,
            section: record.section,
            subject: record.subject,
            themeName: record.themeName,
            learningOutcomeName: record.learningOutcomeName,
            toolName: record.toolName,
            aspectName:  record.aspectName || "",
         
        },
        update: {
            $set: {
                obtainedMarksBefore: record.obtainedMarksBefore,
                obtainedMarksAfter: record.obtainedMarksAfter,
                evalDateBefore: record.evalDateBefore,
                evalDateAfter: record.evalDateAfter,
                indicatorBefore: record.indicatorBefore,
                indicatorAfter: record.indicatorAfter,
             
                updatedAt: new Date()
            }
        },
        upsert: true
    }
}));

await model.bulkWrite(operations);
res.json({ message: "Theme form data saved successfully with data " });
}catch(e)
{
  console.log(e)
  return res.status(500).json({ error: "An error occurred while saving the theme form." });
}
}
