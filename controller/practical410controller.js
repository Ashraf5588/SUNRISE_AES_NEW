const path = require("path");

const fs= require("fs");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema, studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema,terminalSchema } = require("../model/adminschema");
const {newsubjectSchema,marksheetsetupSchema } = require("../model/adminschema");
const {attendanceSchema} = require("../model/attendanceschema");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const bcrypt = require("bcrypt");
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const {ThemeEvaluationSchema,practicalSchema,scienceprojectSchema, practicalprojectSchema} = require("../model/themeformschema");
const {themeSchemaFor1,scienceSchema,FinalPracticalSlipSchema} = require("../model/themeschema");
const { get } = require("http");
const student = require("../routers/mainpage");
const {marksheetsetupschemaForAdmin} = require("../model/masrksheetschema");
const marksheetSetup = mongoose.models.marksheetSetup || mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");


// Create ScienceModel after importing scienceSchema
const ScienceModel = mongoose.model('sciencepractical', scienceSchema, 'sciencepracticals');
const scienceProjectModel = mongoose.model('scienceproject', scienceprojectSchema, 'scienceprojects');




const attendanceModel = (studentClass, section, year) => {
  // to Check if model already exists
  if (mongoose.models[`Attendance_${studentClass}_${section}_${year}`]) {
    return mongoose.models[`Attendance_${studentClass}_${section}_${year}`];
  }
  return mongoose.model(`Attendance_${studentClass}_${section}_${year}`, attendanceSchema, `Attendance_${studentClass}_${section}_${year}`);
};


const getSubjectSlipModelForPractical = (subject, studentClass, section, terminal, year) => {
  // to Check if model already exists
  if (mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`]) {
    return mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`];
  }
  return mongoose.model(`Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`, FinalPracticalSlipSchema, `Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`);
};
const getPracticalProjectModel = (subject, studentClass, section, year) => {
  // to Check if model already exists
  if (mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${year}`]) {
    return mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${year}`];
  }
  return mongoose.model(`Practicalproject_${subject}_${studentClass}_${section}_${year}`, practicalprojectSchema, `Practicalproject_${subject}_${studentClass}_${section}_${year}`);
};

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
    let newsubjectList = await newsubject.find({}).lean();
    
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
      newsubjectList = newaccessibleSubjects;
      
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

const getThemeFormat = (studentClass) => {
  // Collection name: themeFor{class}
  const collectionName = `themeFor${studentClass}`;
  console.log(`Getting theme format model for class ${studentClass} using collection ${collectionName}`);
  
  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  // Create model with practicalSchema for configuration
  return mongoose.model(collectionName, themeSchemaFor1, collectionName);
};
const getProjectThemeFormat = (studentClass) => {
  // Collection name: ProjectRubriksFor{class}
  const collectionName = `ProjectRubriksFor${studentClass}`;
  console.log(`Getting project theme format model for class ${studentClass} using collection ${collectionName}`);
  
  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  // Create model with practicalSchema for configuration
  return mongoose.model(collectionName, themeSchemaFor1, collectionName);
};
const getStudentThemeData = (studentClass) => {
  // Collection name: themeForStudent{class}
  const collectionName = `PracticalForStudent${studentClass}`;
  console.log(`Getting student theme data model for class ${studentClass} using collection ${collectionName}`);
  
  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  // Create model with practicalSchema for student data
  return mongoose.model(collectionName, practicalSchema, collectionName);
};

exports.chooseClass = async (req, res) => {
  
  res.render("theme/class", {...await getSidenavData(req),editing: false});
};
exports.choosesubject = async (req,res)=>
  {
   
    const setup = await marksheetSetup.find();

    res.render("theme/choosesubject",{...await getSidenavData(req),editing: false,setup})
  }
exports.evaluationForm = async (req, res) => {
  const {studentClass,section,subject,terminal} = req.query;
  console.log(studentClass,section);
  if(studentClass==='1' || studentClass==='2' || studentClass==='3') {
    return res.render("theme/theme", {...await getSidenavData(req),editing: false, studentClass, section,subject,terminal});
  } else {
     return res.render("theme/practicalform410pannel", {...await getSidenavData(req),editing: false, studentClass, section,subject,terminal});
  }
};
exports.showpracticalDetailForm = async (req, res) => {
  console.log('=== FUNCTION CALLED: showpracticalDetailForm ===');
  console.log('Timestamp:', new Date().toISOString());
  
  try {


    
    const { studentClass, section, subject,terminal } = req.query;
  const result = await marksheetSetup.findOne(
  { "terminals.name": terminal },
  { "terminals.$": 1 } // project only the matched terminal
).lean();
const subjectMarksData = await newsubject.findOne({ newsubject: subject ,forClass: studentClass}).lean();
console.log("result variable=", result);
const marksheetSetting = await marksheetSetup.find();
const workingDays = result?.terminals?.[0]?.workingDays || 0;
console.log("year", marksheetSetting[0]?.academicYear);
const attendancemodel = attendanceModel(studentClass, section, marksheetSetting[0]?.academicYear);
const attendanceData = await attendancemodel.find({}).lean();


    const studentData = await studentRecord.find({studentClass:studentClass,section:section}).lean();
    const practicalFormat = getThemeFormat(studentClass);
    const practicalFormatData = await practicalFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    const projectFormat = getProjectThemeFormat(studentClass)
    const projectFormatData = await projectFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    
   
    

    console.log('Subject === "SCIENCE":', subject === "SCIENCE");
    console.log('Subject.toUpperCase() === "SCIENCE":', subject && subject.toUpperCase() === "SCIENCE");
    
    if (subject === "SCIENCE" ) {
      console.log('🔬 === SUBJECT DETECTED ===');      
      console.log('=== SEARCHING FOR SCIENCE DATA ===');
      console.log('ScienceModel:', typeof ScienceModel);
      
      const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      
      console.log('✅ Science data query completed');
      console.log('Science data found:', ScienceData.length, 'records');
      
      if (ScienceData.length > 0) {
        console.log('📊 Science data preview:');
        ScienceData.forEach((data, index) => {
          console.log(`Record ${index + 1}:`, {
            id: data._id,
            studentClass: data.studentClass,
            subject: data.subject,
            unitsCount: data.units ? data.units.length : 0
          });
        });
      } else {
        console.log('⚠️  NO SCIENCE DATA FOUND');
        console.log('Let me check what science data exists...');
        
          const allScienceData = await ScienceModel.find({studentClass:studentClass,terminal:terminal}).lean();
          console.log('Total science records in database:', allScienceData.length);
          console.log(allScienceData)
          if (allScienceData.length > 0) {
            console.log('Available science data:');
            allScienceData.forEach((data, index) => {
              console.log(`${index + 1}. Class: "${data.studentClass}", Subject: "${data.subject}"`);
            });
        } else {
          console.log('❌ NO SCIENCE DATA EXISTS IN DATABASE AT ALL');
        }
      }
      
      console.log('🎨 Rendering practicalprojectform...');
     
      return res.render("theme/practicalprojectform", {
        ...await getSidenavData(req), 
        editing: false, 
        studentClass, 
        section, 
        subject, 
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
        attendanceData,
        marksheetSetting,
        subjectMarksData,
      });

      
    } 
   else if (subject === "MATHEMATICS" ) {
      console.log('🔬 === SUBJECT DETECTED ===');      
      console.log('=== SEARCHING FOR SCIENCE DATA ===');
      console.log('ScienceModel:', typeof ScienceModel);
      
      const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      
      console.log('✅ Science data query completed');
      console.log('Science data found:', ScienceData.length, 'records');
      
      if (ScienceData.length > 0) {
        console.log('📊 Science data preview:');
        ScienceData.forEach((data, index) => {
          console.log(`Record ${index + 1}:`, {
            id: data._id,
            studentClass: data.studentClass,
            subject: data.subject,
            unitsCount: data.units ? data.units.length : 0
          });
        });
      } else {
        console.log('⚠️  NO SCIENCE DATA FOUND');
        console.log('Let me check what science data exists...');
        
          const allScienceData = await ScienceModel.find({studentClass:studentClass,terminal:terminal}).lean();
          console.log('Total science records in database:', allScienceData.length);
          console.log(allScienceData)
          if (allScienceData.length > 0) {
            console.log('Available science data:');
            allScienceData.forEach((data, index) => {
              console.log(`${index + 1}. Class: "${data.studentClass}", Subject: "${data.subject}"`);
            });
        } else {
          console.log('❌ NO SCIENCE DATA EXISTS IN DATABASE AT ALL');
        }
      }
      
      console.log('🎨 Rendering practicalprojectform...');

      return res.render("theme/mathProjectForm", {
        ...await getSidenavData(req),
        editing: false,
        studentClass,
        section,
        subject,
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
        attendanceData,
        marksheetSetting,
        subjectMarksData,
      });

      
    } 
     else if (subject === "NEPALI" ) {
      console.log('🔬 === SUBJECT DETECTED ===');      
      console.log('=== SEARCHING FOR SCIENCE DATA ===');
      console.log('ScienceModel:', typeof ScienceModel);
      
      const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      
      console.log('✅ Science data query completed');
      console.log('Science data found:', ScienceData.length, 'records');
      
      if (ScienceData.length > 0) {
        console.log('📊 Science data preview:');
        ScienceData.forEach((data, index) => {
          console.log(`Record ${index + 1}:`, {
            id: data._id,
            studentClass: data.studentClass,
            subject: data.subject,
            unitsCount: data.units ? data.units.length : 0
          });
        });
      } else {
        console.log('⚠️  NO SCIENCE DATA FOUND');
        console.log('Let me check what science data exists...');
        
          const allScienceData = await ScienceModel.find({studentClass:studentClass,terminal:terminal}).lean();
          console.log('Total science records in database:', allScienceData.length);
          console.log(allScienceData)
          if (allScienceData.length > 0) {
            console.log('Available science data:');
            allScienceData.forEach((data, index) => {
              console.log(`${index + 1}. Class: "${data.studentClass}", Subject: "${data.subject}"`);
            });
        } else {
          console.log('❌ NO SCIENCE DATA EXISTS IN DATABASE AT ALL');
        }
      }
      
      console.log('🎨 Rendering practicalprojectform...');

      return res.render("theme/nepaliProjectForm", {
        ...await getSidenavData(req),
        editing: false,
        studentClass,
        section,
        subject,
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
          attendanceData,
        marksheetSetting,
        subjectMarksData,
      });

      
    } 
    else if (subject === "ENGLISH" ) {
      console.log('🔬 === SUBJECT DETECTED ===');      
      console.log('=== SEARCHING FOR SCIENCE DATA ===');
      console.log('ScienceModel:', typeof ScienceModel);
      
      const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      
      console.log('✅ Science data query completed');
      console.log('Science data found:', ScienceData.length, 'records');
      
      if (ScienceData.length > 0) {
        console.log('📊 Science data preview:');
        ScienceData.forEach((data, index) => {
          console.log(`Record ${index + 1}:`, {
            id: data._id,
            studentClass: data.studentClass,
            subject: data.subject,
            unitsCount: data.units ? data.units.length : 0
          });
        });
      } else {
        console.log('⚠️  NO SCIENCE DATA FOUND');
        console.log('Let me check what science data exists...');
        
          const allScienceData = await ScienceModel.find({studentClass:studentClass,terminal:terminal}).lean();
          console.log('Total science records in database:', allScienceData.length);
          console.log(allScienceData)
          if (allScienceData.length > 0) {
            console.log('Available science data:');
            allScienceData.forEach((data, index) => {
              console.log(`${index + 1}. Class: "${data.studentClass}", Subject: "${data.subject}"`);
            });
        } else {
          console.log('❌ NO SCIENCE DATA EXISTS IN DATABASE AT ALL');
        }
      }
      
      console.log('🎨 Rendering practicalprojectform...');

      return res.render("theme/englishProjectForm", {
        ...await getSidenavData(req),
        editing: false,
        studentClass,
        section,
        subject,
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
          attendanceData,
        marksheetSetting,
        subjectMarksData,
      });

      
    } 
    else if (subject === "SOCIAL" ) {
      console.log('🔬 === SUBJECT DETECTED ===');      
      console.log('=== SEARCHING FOR SCIENCE DATA ===');
      console.log('ScienceModel:', typeof ScienceModel);
      
      const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      
      console.log('✅ Science data query completed');
      console.log('Science data found:', ScienceData.length, 'records');
      
      if (ScienceData.length > 0) {
        console.log('📊 Science data preview:');
        ScienceData.forEach((data, index) => {
          console.log(`Record ${index + 1}:`, {
            id: data._id,
            studentClass: data.studentClass,
            subject: data.subject,
            unitsCount: data.units ? data.units.length : 0
          });
        });
      } else {
        console.log('⚠️  NO SCIENCE DATA FOUND');
        console.log('Let me check what science data exists...');
        
          const allScienceData = await ScienceModel.find({studentClass:studentClass,terminal:terminal}).lean();
          console.log('Total science records in database:', allScienceData.length);
          console.log(allScienceData)
          if (allScienceData.length > 0) {
            console.log('Available science data:');
            allScienceData.forEach((data, index) => {
              console.log(`${index + 1}. Class: "${data.studentClass}", Subject: "${data.subject}"`);
            });
        } else {
          console.log('❌ NO SCIENCE DATA EXISTS IN DATABASE AT ALL');
        }
      }

      console.log('🎨 Rendering Social project form...');
      return res.render("theme/socialProjectForm", {
        ...await getSidenavData(req),
        editing: false,
        studentClass,
        section,
        subject,
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
          attendanceData,
        marksheetSetting,
        subjectMarksData,
      });

      
    } 
    else if (subject === "HEALTH" ) {
      console.log('🔬 === SUBJECT DETECTED ===');      
      console.log('=== SEARCHING FOR SCIENCE DATA ===');
      console.log('ScienceModel:', typeof ScienceModel);
      
      const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      
      console.log('✅ Science data query completed');
      console.log('Science data found:', ScienceData.length, 'records');
      
      if (ScienceData.length > 0) {
        console.log('📊 Science data preview:');
        ScienceData.forEach((data, index) => {
          console.log(`Record ${index + 1}:`, {
            id: data._id,
            studentClass: data.studentClass,
            subject: data.subject,
            unitsCount: data.units ? data.units.length : 0
          });
        });
      } else {
        console.log('⚠️  NO SCIENCE DATA FOUND');
        console.log('Let me check what science data exists...');
        
          const allScienceData = await ScienceModel.find({studentClass:studentClass,terminal:terminal}).lean();
          console.log('Total science records in database:', allScienceData.length);
          console.log(allScienceData)
          if (allScienceData.length > 0) {
            console.log('Available science data:');
            allScienceData.forEach((data, index) => {
              console.log(`${index + 1}. Class: "${data.studentClass}", Subject: "${data.subject}"`);
            });
        } else {
          console.log('❌ NO SCIENCE DATA EXISTS IN DATABASE AT ALL');
        }
      }
      
      console.log('🎨 Rendering practicalprojectform...');

      return res.render("theme/healthProjectForm", {
        ...await getSidenavData(req),
        editing: false,
        studentClass,
        section,
        subject,
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
          attendanceData,
        marksheetSetting,
        subjectMarksData,
      });

      
    } 
    else 
      {
         const ScienceData = await ScienceModel.find({
        studentClass: studentClass,
        terminal: terminal,
        subject: subject
      }).lean();
      console.log('📝 === NON-SCIENCE SUBJECT ===');
      console.log('Subject is not SCIENCE, rendering regular form');
      console.log('Subject value was:', `"${subject}"`);
      
      console.log('🎨 Rendering practicaldetailform...');
      return res.render("theme/practicaldetailform", {
        ...await getSidenavData(req), 
        ...await getSidenavData(req),
        editing: false,
        studentClass,
        section,
        subject,
        practicalFormatData, 
        ScienceData,
        terminal,
        projectFormatData,
        studentData,
        workingDays,
          attendanceData,
        marksheetSetting,
        subjectMarksData,
      });
    }
    
  } catch (err) {
    console.error('❌ === ERROR in showpracticalDetailForm ===');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Full error object:', err);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack
    });
  }
};
exports.savepracticalDetailForm = async (req, res) => { 

   try {
    const { subject,roll, name, studentClass, section, terminal } = req.body;
    const Practical = getStudentThemeData(studentClass);

    // Validate required fields
    if (!roll || !name || !studentClass || !section) {
      return res.status(400).json({ error: 'Roll, name, studentClass, and section are required' });
    }

    // Ensure terminal is an array
    const terminalData = Array.isArray(terminal) ? terminal : [terminal];

    // Find existing document for this roll, class, and section
    let existingPractical = await Practical.findOne({
      roll: roll,
      studentClass: studentClass,
      section: section
    });

    if (existingPractical) {
      // Update existing document - process all terminals
      for (const terminalItem of terminalData) {
        const terminalName = terminalItem.terminalName;

        // Find if this terminal already exists
        const terminalIndex = existingPractical.terminal.findIndex(
          t => t.terminalName === terminalName
        );

        if (terminalIndex !== -1) {
          // Terminal exists, process all subjects in this terminal
          const subjectData = Array.isArray(terminalItem.subject) ? terminalItem.subject : [terminalItem.subject];
          
          for (const subjectItem of subjectData) {
            const subjectName = subjectItem.subjectName;
            
            // Find if subject exists in this terminal
            const subjectIndex = existingPractical.terminal[terminalIndex].subject.findIndex(
              s => s.subjectName === subjectName
            );

            if (subjectIndex !== -1) {
              // Subject exists, update it
              existingPractical.terminal[terminalIndex].subject[subjectIndex] = {
                ...existingPractical.terminal[terminalIndex].subject[subjectIndex],
                ...subjectItem
              };
            } else {
              // Subject doesn't exist, add it
              existingPractical.terminal[terminalIndex].subject.push(subjectItem);
            }
          }

          // Update terminal-level data (attendance, etc.)
          existingPractical.terminal[terminalIndex].totalAttendance = terminalItem.totalAttendance;
          existingPractical.terminal[terminalIndex].attendanceMarks = terminalItem.attendanceMarks;

        } else {
          // Terminal doesn't exist, add new terminal
          existingPractical.terminal.push(terminalItem);
        }
      }

      // Save the updated document
      await existingPractical.save();

      res.status(200).json({
        message: 'Practical data updated successfully',
        data: existingPractical
      });

    } else {
      // Create new document
      const newPractical = new Practical({
        roll,
        name,
        studentClass,
        section,
        terminal: terminalData
      });

      await newPractical.save();

      res.render("/theme/success",{link:"practicaldetailform",studentClass,section,subject,terminal})
    }

  } catch (error) {
    console.error('Error saving practical data:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};


exports.showpracticalSlip = async (req,res,next)=>{
try
{
  const { studentClass, section, subject,terminal } = req.query;
  console.log(studentClass, section, subject,terminal);

  if(subject==="SCIENCE")
  {
    if(terminal==="FINAL")
    {
      const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);


     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/projectpracticalslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
      const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/projectpracticalslip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  }

   else if(subject==="MATHEMATICS")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/mathslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/mathslip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  }
  else if(subject==="NEPALI")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/nepalislipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/nepalislip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  }
  else if(subject==="ENGLISH")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/englishslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/englishslip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  }
   else if(subject==="SOCIAL")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/socialslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else 
    { 
    const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/socialslip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  }
  else if(subject==="HEALTH")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/healthslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else 
    { 
    const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/healthslip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  }
else
{
  if(terminal==="FINAL")
    {
      const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);


     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/projectpracticalslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
      const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});

    
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/projectpracticalslip", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});

    }
  
}
}catch(err)
{
console.log(err);
res.status(500).json({error:"Internal server error",details: err.message});
}



}

exports.sciencepracticalForm = async (req,res,next)=>
{
  try
  {
const { studentClass, section, subject,terminal,editing } = req.query;
if(subject==="HEALTH")
{

   const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

  return res.render("theme/healthpracticalform",
    {studentClass,section,subject,terminal,lessonData,editing:false});
}
else
{
 const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);


    console.log(studentClass,section,subject,terminal)
    console.log("lesson data=",lessonData)
    res.render("theme/sciencepracticalform",{studentClass,section,subject,terminal,lessonData,editing:false});
}

  }catch(err)
  {
    console.log(err);
    
  }

}
 exports.saveSciencePractical = async (req, res, next) => {
  try {
   
    console.log('Raw form data received:', JSON.stringify(req.body, null, 2));
    
    // Process and clean the form data
    let { studentClass, subject, terminal, units,section } = req.body;
    
    
    // Transform units data to handle different input formats
    if (units && Array.isArray(units)) {
      units = units.map(unit => {
        const processedUnit = {
          unitName: unit.unitName,
          portion: unit.portion || '',
          practicals: unit.practicals || [],
          projectworks: unit.projectworks || []
        };
        
        // Ensure practicals and projectworks are always arrays
        if (!Array.isArray(processedUnit.practicals)) {
          processedUnit.practicals = [];
        }
        if (!Array.isArray(processedUnit.projectworks)) {
          processedUnit.projectworks = [];
        }
        
        // Handle legacy format where projectWork might be an object with title/description
        if (unit.projectWork && typeof unit.projectWork === 'object') {
          Object.values(unit.projectWork).forEach(project => {
            if (typeof project === 'object' && project.title) {
              processedUnit.projectworks.push(project.title);
            } else if (typeof project === 'string') {
              processedUnit.projectworks.push(project);
            }
          });
        }
        
        return processedUnit;
      });
    } else {
      units = [];
    }
    
    console.log('Received science practical data:', {
      studentClass,
      section,
      subject,
      terminal,
      units: units ? units.length : 0,
      unitsDetail: units ? units.map((unit, index) => ({
        unitIndex: index,
        unitName: unit.unitName,
        portion: unit.portion || '',
        practicals: unit.practicals ? unit.practicals.length : 0,
        projectworks: unit.projectworks ? unit.projectworks.length : 0,
        practicalsData: unit.practicals,
        projectworksData: unit.projectworks
      })) : []
    });

    // Validate required fields
    if (!studentClass || !subject || !terminal) {
      return res.status(400).json({ 
        error: 'Student class, subject, and terminal are required' 
      });
    }

    if (!units || !Array.isArray(units) || units.length === 0) {
      return res.status(400).json({ 
        error: 'At least one unit with practicals or project works is required' 
      });
    }

    // Validate units, practicals, and project works
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.unitName || !unit.unitName.trim()) {
        return res.status(400).json({ 
          error: `Unit ${i + 1} name is required` 
        });
      }
      
      // Validate practicals - only if they exist
      if (unit.practicals && Array.isArray(unit.practicals) && unit.practicals.length > 0) {
        for (let j = 0; j < unit.practicals.length; j++) {
          if (!unit.practicals[j] || !unit.practicals[j].trim()) {
            return res.status(400).json({ 
              error: `Unit ${i + 1}, Practical ${j + 1} name is required` 
            });
          }
        }
      }

      // Validate project works - only if they exist
      if (unit.projectworks && Array.isArray(unit.projectworks) && unit.projectworks.length > 0) {
        for (let k = 0; k < unit.projectworks.length; k++) {
          if (!unit.projectworks[k] || !unit.projectworks[k].trim()) {
            return res.status(400).json({ 
              error: `Unit ${i + 1}, Project Work ${k + 1} name is required` 
            });
          }
        }
      }

      // Ensure at least one practical or project work exists
      const hasPracticals = unit.practicals && Array.isArray(unit.practicals) && unit.practicals.length > 0;
      const hasProjectWorks = unit.projectworks && Array.isArray(unit.projectworks) && unit.projectworks.length > 0;
      
      if (!hasPracticals && !hasProjectWorks) {
        return res.status(400).json({ 
          error: `Unit ${i + 1} must have at least one practical or project work` 
        });
      }
    }

    // Check if a configuration already exists for this class/subject/year
    const existingConfig = await ScienceModel.findOne({
      studentClass,
      subject,
      terminal,
      ...(section && { section })
    });

    if (existingConfig) {
      // Update existing configuration
      existingConfig.units = units;
      existingConfig.updatedAt = new Date();
      
      await existingConfig.save();
      
      res.redirect(`/practicalform?studentClass=${studentClass}&section=${section}&subject=${subject}&terminal=${terminal}`);
    } else {
      // Create new configuration
      const newSciencePractical = new ScienceModel({
        studentClass,
        section: section || '',
        subject,
        terminal,
        units,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newSciencePractical.save();
      
      console.log('Created new science practical configuration');
      res.redirect(`/practicalform?studentClass=${studentClass}&section=${section || ''}&subject=${subject}&terminal=${terminal}`);
    }

  } catch (err) {
    console.error('Error saving science practical:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}
exports.saveScienceData = async (req,res,next)=>
{
  try
  {
    const { roll, name, studentClass, section, subject, terminal, units } = req.body;

    // Validate required fields
    if (!roll || !name || !studentClass || !subject || !terminal) {
      return res.status(400).json({ 
        error: 'Roll, name, studentClass, subject, and academic year are required' 
      });
    }

    // Transform units data to handle different input formats
    let processedUnits = [];
    if (units && Array.isArray(units)) {
      processedUnits = units.map(unit => {
        const processedUnit = {
          unitName: unit.unitName,
          practicals: unit.practicals || [],
          projectworks: unit.projectworks || []
        };
        
        // Ensure practicals and projectworks are always arrays
        if (!Array.isArray(processedUnit.practicals)) {
          processedUnit.practicals = [];
        }
        if (!Array.isArray(processedUnit.projectworks)) {
          processedUnit.projectworks = [];
        }
        
        return processedUnit;
      });
    }

    console.log('Received science student data:', {
      roll,
      name,
      studentClass,
      section,
      subject,
      terminal,
      units: processedUnits.length,
      unitsDetail: processedUnits.map((unit, index) => ({
        unitIndex: index,
        unitName: unit.unitName,
        practicals: unit.practicals.length,
        projectworks: unit.projectworks.length,
        practicalsData: unit.practicals,
        projectworksData: unit.projectworks
      }))
    });

    // Check if a record already exists for this student/class/subject/year
    const existingRecord = await scienceProjectModel.findOne({
      roll,
      studentClass,
      section: section || '',
      subject,
      terminal
    });

    if (existingRecord) {
      // Update existing record
      existingRecord.name = name; // Update name in case it changed
      existingRecord.units = processedUnits;
      existingRecord.updatedAt = new Date();
      
      await existingRecord.save();
      
      console.log('Updated existing science student record');
      res.redirect(`/practicalform?studentClass=${studentClass}&section=${section || ''}&subject=${subject}&terminal=${terminal}`);
    } else {
      // Create new record
      const newScienceStudentRecord = new scienceProjectModel({
        roll,
        name,
        studentClass,
        section,
        subject,
        terminal,
        units: processedUnits,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newScienceStudentRecord.save();

      console.log('Created new science student record');
     res.redirect(`/practicalform?studentClass=${studentClass}&section=${section || ''}&subject=${subject}&terminal=${terminal}`); 
    }
  } catch (err) {
    console.error('Error saving science practical data:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

exports.savepracticalprojectform = async (req, res, next) => {
  try {
    const { studentClass, section, subject, terminal } = req.query;
    const { reg, roll } = req.body; // important for unique identification

    console.log('Received practical project form data:', {
      studentClass,
      section,
      subject,
      terminal,
      roll,
      reg
    });

    // Add debugging for raw data
    console.log('Raw req.body.unit:', JSON.stringify(req.body.unit, null, 2));

    // Process and consolidate criteria for practicals and projects
    req.body.unit.forEach((unit, unitIndex) => {
      console.log(`\n--- Processing Unit ${unitIndex}: ${unit.unitName} ---`);
      
      unit.practicals = unit.practicals || [];
      unit.projectWorks = unit.projectWorks || [];

      // Create a map to consolidate activities with same names
      const consolidatedActivities = new Map();

      // --- PROCESS PRACTICALS ---
      unit.practicals.forEach((practical, practicalIndex) => {
        console.log(`\nProcessing Practical ${practicalIndex}:`, practical.practicalName);
        console.log('Raw practical.criteria:', practical.criteria);
        
        const activityName = practical.practicalName;
        
        if (!consolidatedActivities.has(activityName)) {
          consolidatedActivities.set(activityName, {
            activityName: activityName,
            practicalCriteria: [],
            projectCriteria: [],
            practicalMarks: practical.practicalMarks || 0,
            projectMarks: 0
          });
        }

        const activity = consolidatedActivities.get(activityName);
        
        if (practical.criteria) {
          // Process practical criteria - handle simplified array format
          const criteriaArray = [];
          
          // Check if criteria is an array (new simplified format)
          if (Array.isArray(practical.criteria)) {
            practical.criteria.forEach((criteriaValue, index) => {
              console.log(`Processing practical criteria array item ${index}:`, criteriaValue);
              
              if (criteriaValue && typeof criteriaValue === 'string') {
                const parts = criteriaValue.split('||');
                console.log('Split parts:', parts);
                
                if (parts.length >= 3) {
                  const criteriaItem = {
                    practicalIndicatorMarks: parts[0].trim(),
                    practicalIndicator: parts[1].trim(),
                    practicalAdhar: parts[2].trim(),
                    practicalOutcome: parts[3] ? parts[3].trim() : ''
                  };
                  console.log('Created practical criteria item:', criteriaItem);
                  criteriaArray.push(criteriaItem);
                }
              }
            });
          } else {
            // Handle old object format for backward compatibility
            Object.keys(practical.criteria).forEach(key => {
              const value = practical.criteria[key];
              console.log(`Processing practical criteria key: ${key}, value: ${value}`);
              
              if (value && typeof value === 'string') {
                const parts = value.split('||');
                console.log('Split parts:', parts);
                
                if (parts.length >= 3) {
                  const criteriaItem = {
                    practicalIndicatorMarks: parts[0].trim(),
                    practicalIndicator: parts[1].trim(),
                    practicalAdhar: parts[2].trim(),
                    practicalOutcome: parts[3] ? parts[3].trim() : ''
                  };
                  console.log('Created practical criteria item:', criteriaItem);
                  criteriaArray.push(criteriaItem);
                } else if (parts.length === 1) {
                  // Fallback for old format (just marks)
                  const criteriaItem = {
                    practicalIndicatorMarks: parts[0].trim()
                  };
                  console.log('Created fallback practical criteria item:', criteriaItem);
                  criteriaArray.push(criteriaItem);
                }
              } else {
                console.log('Practical value is not a string or is empty:', typeof value, value);
              }
            });
          }
          
          activity.practicalCriteria = criteriaArray;
          console.log('Final practical criteria for', activityName, ':', activity.practicalCriteria);
        }
      });

      // --- PROCESS PROJECTS ---
      unit.projectWorks.forEach((project, projectIndex) => {
        console.log(`\nProcessing Project ${projectIndex}:`, project.projectName);
        console.log('Raw project.criteria:', project.criteria);
        
        const activityName = project.projectName;
        
        if (!consolidatedActivities.has(activityName)) {
          consolidatedActivities.set(activityName, {
            activityName: activityName,
            practicalCriteria: [],
            projectCriteria: [],
            practicalMarks: 0,
            projectMarks: project.projectMarks || 0
          });
        }

        const activity = consolidatedActivities.get(activityName);
        activity.projectMarks = project.projectMarks || 0;
        
        if (project.criteria) {
          // Process project criteria - handle simplified array format
          const criteriaArray = [];
          
          // Check if criteria is an array (new simplified format)
          if (Array.isArray(project.criteria)) {
            project.criteria.forEach((criteriaValue, index) => {
              console.log(`Processing project criteria array item ${index}:`, criteriaValue);
              
              if (criteriaValue && typeof criteriaValue === 'string') {
                const parts = criteriaValue.split('||');
                console.log('Project split parts:', parts);
                
                if (parts.length >= 3) {
                  const criteriaItem = {
                    projectIndicatorMarks: parts[0].trim(),
                    projectIndicator: parts[1].trim(),
                    projectAdhar: parts[2].trim(),
                    projectOutcome: parts[3] ? parts[3].trim() : ''
                  };
                  console.log('Created project criteria item:', criteriaItem);
                  criteriaArray.push(criteriaItem);
                }
              }
            });
          } else {
            // Handle old object format for backward compatibility
            Object.keys(project.criteria).forEach(key => {
              const value = project.criteria[key];
              console.log(`Processing project criteria key: ${key}, value: ${value}`);
              
              if (value && typeof value === 'string') {
                const parts = value.split('||');
                console.log('Project split parts:', parts);
                
                if (parts.length >= 3) {
                  const criteriaItem = {
                    projectIndicatorMarks: parts[0].trim(),
                    projectIndicator: parts[1].trim(),
                    projectAdhar: parts[2].trim(),
                    projectOutcome: parts[3] ? parts[3].trim() : ''
                  };
                  console.log('Created project criteria item:', criteriaItem);
                  criteriaArray.push(criteriaItem);
                }
              } else {
                console.log('Project value is not a string or is empty:', typeof value, value);
              }
            });
          }
          
          activity.projectCriteria = criteriaArray;
          console.log('Final project criteria for', activityName, ':', activity.projectCriteria);
        }
      });

      // Convert consolidated activities back to the expected format
      // But now combine activities with same names
      const newPracticals = [];
      const newProjectWorks = [];

      consolidatedActivities.forEach((activity, activityName) => {
        // Only create practical entry if there are practical criteria
        if (activity.practicalCriteria.length > 0) {
          newPracticals.push({
            practicalName: activityName,
            practicalMarks: activity.practicalMarks,
            criteria: activity.practicalCriteria
          });
        }

        // Only create project entry if there are project criteria
        if (activity.projectCriteria.length > 0) {
          newProjectWorks.push({
            projectName: activityName,
            projectMarks: activity.projectMarks,
            criteria: activity.projectCriteria
          });
        }
      });

      // Update the unit with consolidated data
      unit.practicals = newPracticals;
      unit.projectWorks = newProjectWorks;

      console.log('\n--- CONSOLIDATED ACTIVITIES ---');
      console.log('Practicals:', unit.practicals.length);
      console.log('Projects:', unit.projectWorks.length);
    });

    console.log('\n--- FINAL PROCESSED DATA ---');
    console.log('Final req.body.unit:', JSON.stringify(req.body.unit, null, 2));

    // Get the model for this subject/class/section/year
    const marksheetSetting = await marksheetSetup.find();
    const academicYear = marksheetSetting[0].academicYear;
    const model = getPracticalProjectModel(subject, studentClass, section, academicYear);

    // --- UPSERT: update if exists, otherwise insert ---
    const filter = { reg, roll, studentClass, section, subject, terminalName: terminal };
    const update = req.body;
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };

    const doc = await model.findOneAndUpdate(filter, update, options);

   res.render("theme/success",{link:"practicaldetailform",studentClass,section,subject,terminal});
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

exports.savepracticalslip = async (req,res,next)=>
{
   try {
    const slips = req.body.slip; // this will be an array of student slips
const {studentClass,section,subject,terminal,academicYear} = req.query;
    // Example schema
    // slipModel = mongoose.model("Slip", new mongoose.Schema({
    //   roll: String, name: String, studentClass: String, section: String,
    //   attendanceParticipation: Number, practicalProject: Number,
    //   terminal: Number, total: Number, grade: String
    // }));
const model = getSubjectSlipModelForPractical(subject, studentClass, section, terminal, academicYear);
    await model.insertMany(slips);

    res.send("Slip saved successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving slip");
  }
}
exports.internalReport = async (req, res) => {
  const {studentClass, section, subject, terminal} = req.query;

  if(subject==="SCIENCE")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/scienceinternalReportFinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});
      res.render("theme/scienceinternalReport", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
  }


  else if(subject==="MATHEMATICS")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/mathinternalReportFinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});
      res.render("theme/MathinternalReport", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
  }
  else if(subject==="SOCIAL")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/socialinternalReportFinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});
      res.render("theme/socialinternalReport", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
  }
  else if(subject==="HEALTH")
  {
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/healthinternalReportFinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});
      res.render("theme/healthInternalReport", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
  }
  else
  {
   
  
    if(terminal==="FINAL")
    {
const marksheetSetting = await marksheetSetup.find();
     const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);

     const sciencepracticaldata = await model.aggregate([
       {
         $match: {
           studentClass: studentClass,
           section: section,
           subject: subject,
         }
       },
       {
         $group: {
           _id: { roll: "$roll", name: "$name", studentClass: "$studentClass" ,section: "$section"}, terminals: { $push: "$$ROOT" }, attendanceTotalmarks: { $sum: "$attendanceMarks" }, participationTotalmarks: { $sum: "$participationMarks" },
           
         }
       }
     ]);


     const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);

console.log(marksheetSetting)
     console.log("projectdata",sciencepracticaldata);
     console.log("lesson Data", lessonData)
      res.render("theme/elseinternalReportFinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
    
    else
    { 
    const marksheetSetting = await marksheetSetup.find();
      const academicYear = marksheetSetting[0].academicYear;
       const model = getPracticalProjectModel(subject, studentClass, section, academicYear);
        const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
     const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});
      res.render("theme/elseInternalReport", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
    }
  }

  }

  

exports.getPracticalData = async (req, res, next) => 
{
  try
  {

const { studentClass, section, subject, terminal,roll,reg } = req.query;
console.log(studentClass, section, subject, terminal,roll,reg,subject);
const marksheetSetting= await marksheetSetup.find();
const academicYear= marksheetSetting[0].academicYear;

if(roll && reg)
{
  const model = getPracticalProjectModel(subject, studentClass, section, academicYear);

  console.log("searching in model:", model);
  const response = await model.findOne({ studentClass:studentClass, section:section, subject:subject, terminalName:terminal, roll:roll, reg:reg });


 
  if (response) {
  
     res.json(response);
  }
  else
  {
    res.json(null)
  }
}

  }catch(err)
  {
    res.status(500).json({error:"Internal server error",details: err.message});
  }



}

exports.projectrubrikscreate = async (req, res, next) => {
  try {
  try {
    const { studentClass: classParam ,subject,terminal,section} = req.query;
     const {studentClass} = req.query;
      const projectFormat = getProjectThemeFormat(studentClass)
    const projectFormatData = await projectFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    const existingprojectData =await projectFormat.find({ subject: subject , studentClass: studentClass });
    console.log("Existing Project Data:", existingprojectData);
    const subjectData = await newsubject.findOne({ newsubject: subject, forClass: classParam }).lean();
    // If studentClass is provided, render the form for that class
    if (classParam) {
      const subjects = await newsubject.find({});
      
      const sidenavData = await getSidenavData(req);
      // Don't load any specific subject data by default
      // Let the frontend handle loading data when subject is selected
      return res.render("theme/projectrubrik", { 
        studentClass: classParam,
        subjects,
        subject,
        projectFormatData,
        editing: false,
        terminal,
        section,
        subjectData,
        existingprojectData,
      
        accessibleClasses: sidenavData.studentClassdata,
        existingData: null // Always start with null, let frontend load per subject
      });
    }

    // If no class provided, render the class selection page first
    const studentClassdata = await studentClass.find({}).lean();
    return res.render("theme/themefillerclassselect", { 
      studentClassdata,
      ...await getSidenavData(req)
    });
  } catch(err) {
    console.error("Error in theme controller:", err);
    res.status(500).send("Internal Server Error");
  }
  } catch (err) {
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
exports.projectrubrikscreatesave = async (req, res) => {
  try {
    // Get studentClass from query or body
    const studentClass = req.query.studentClass || req.body.studentClass;
    const {subject,section,terminal,editing,projectId} = req.query;
    if(editing==='true'){

      const projectModel = getProjectThemeFormat(studentClass);
      // Update the existing record with new data
      await projectModel.findByIdAndUpdate(projectId, req.body);
      return res.render("./theme/success", {link:"projectrubrikscreate",studentClass,subject,terminal,section,...await getSidenavData(req),section:"",});

    }
    else
    {

    
    if (!studentClass) {
      return res.status(400).json({
        success: false,
        message: "Student class is required"
      });
    }
    
    // Log the incoming data for debugging
    console.log(`Theme data received for class ${studentClass}:`, JSON.stringify(req.body, null, 2));
    console.log(`Request headers:`, req.headers['content-type']);
    console.log(`Form data keys:`, Object.keys(req.body));
    
    // Validate required fields exist
    if (!req.body.subject || !req.body.credit) {
      console.error("Missing required fields - subject or credit");
      console.error("Available fields:", Object.keys(req.body));
      return res.status(400).json({
        success: false,
        message: "Subject and credit are required"
      });
    }
    
    // Check if themes data exists and is in the right format
    if (!req.body.themes) {
      console.error("No themes data found in request body");
      return res.status(400).json({
        success: false,
        message: "No themes data provided"
      });
    }
    
    console.log("Themes data type:", typeof req.body.themes);
    console.log("Themes data structure:", JSON.stringify(req.body.themes, null, 2));
    
    // Prepare data for saving - extract the required fields
    const themeData = {
      studentClass: studentClass,
      subject: req.body.subject,
      credit: parseInt(req.body.credit) || req.body.credit,
      themes: req.body.themes || []
    };
    
    console.log(`Processed theme data for saving:`, JSON.stringify(themeData, null, 2));

    // This is for project theme format, so use getProjectThemeFormat
    const model = getProjectThemeFormat(studentClass);
    console.log(`Using model for collection: ProjectRubriksFor${studentClass}`);

    const result = await model.create(themeData);
    console.log(`Theme filled successfully for class ${studentClass}. Document ID: ${result._id}`);
    console.log(`Saved document structure:`, Object.keys(result.toObject()));
    const subjects = await newsubject.find({})
    // Send a more user-friendly response
    return res.render("theme/success", {
     link:"projectrubrikscreate",studentClass,subject,terminal,...await getSidenavData(req),section:"",
    });
  }
  } catch(err) {
    console.error("Error in theme controller:", err);
    console.error("Error details:", err.message);
    console.error("Stack trace:", err.stack);
    res.status(500).send("Internal Server Error: " + err.message);
  }
}







exports.showrubriksforadmin = async (req, res, next) => {
  try {
    const subjectList = await newsubject.find().lean();
    const studentClassdata = await studentClass.find({}).lean();
    const setup = await marksheetSetup.find({}).lean();
    res.render("theme/showrubriksforadmin", { subjectList, editing:false,studentClassdata, setup, ...await getSidenavData(req) });

  } catch (err) {
    console.error("Error fetching rubriks:", err);
    res.status(500).send("Internal Server Error");
  }
};
exports.seerubriks = async (req, res, next) => {
  try {
    const {  subject ,section,terminal} = req.query;
    if (!subject) {
      return res.status(400).send("Subject is required");
    }
    const practicalFormat = getThemeFormat(studentClass);
    const practicalFormatData = await practicalFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    const projectFormat = getProjectThemeFormat(studentClass)
    const projectFormatData = await projectFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    
   const lessonData = await ScienceModel.aggregate([
       {
         $match: {
           studentClass: studentClass,
           subject: subject
         }
       },
       {
         $group: {
           _id: { studentClass: "$studentClass", subject: "$subject" },
            totalLessons: { $push: "$$ROOT" }
         }
       }
     ]);



const subjectList = await newsubject.find()
const uniqueSub = new Set(subjectList.map(s=>s.newsubject));
const classList = await studentClass.find();
const uniqueClass = new Set(classList.map(c=>c.studentClass)); 
    res.render("theme/seerubriks", { projectFormatData, practicalFormatData, lessonData,studentClass,section,subject,terminal, ...await getSidenavData(req) });
  } 
  catch (err) {
    console.error("Error fetching rubrik:", err);
    res.status(500).send("Internal Server Error");
  }
};

exports.editprojectrubriks = async (req, res, next) => {
  try {
    const { studentClass: classParam ,subject} = req.query;
    if (!classParam || !subject) {
      return res.status(400).send("Student class and subject are required");
    }
      const {studentClass,section} = req.query;
      const projectFormat = getProjectThemeFormat(studentClass)
    const projectFormatData = await projectFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    const subjectData = await newsubject.findOne({ newsubject: subject, forClass: classParam }).lean();

    const model = getProjectThemeFormat(classParam);
    const existingData = await model.findOne({ studentClass: classParam, subject: subject }).lean();
    const sidenavData = await getSidenavData(req);
    if (!existingData) {
      return res.status(404).send("Rubrik not found for the specified class and subject");
    }
    res.render("theme/projectrubrik", { 
      studentClass: classParam,
      projectFormatData,
      accessibleClasses: sidenavData.studentClassdata,
      subject,
      subjectData,
      editing: true,
      existingData,
      section,
      
    });
  }catch (err) {
    console.error("Error fetching rubrik for editing:", err);
    res.status(500).send("Internal Server Error");
  }
}
exports.deleteprojectrubriks = async (req, res, next) => {
  try {
    const { studentClass: classParam ,subject,projectId,section,terminal} = req.query; 
    if (!classParam || !subject || !projectId) {
      return res.status(400).send("Student class, subject and project ID are required");
    }
    const model = getProjectThemeFormat(classParam);
    const deleteResult = await model.findByIdAndDelete(projectId);
    if (!deleteResult) {
      return res.status(404).send("Rubrik not found for the specified ID");
    }
    res.redirect(`projectrubrikscreate?studentClass=${classParam}&subject=${subject}&section=${section}&terminal=${terminal}`);
  } catch (err) {
    console.error("Error deleting rubrik:", err);
    res.status(500).send("Internal Server Error");
  }
};    


exports.editlessondata = async (req, res, next) => {

  try {
    const { studentClass: classParam ,subject,terminal,editing,lessonId,section} = req.query;
    if(lessonId)
    {
      const lessonData = await ScienceModel.findById(lessonId).lean();
      console.log("lesson data for editing=",lessonData)
      if (!lessonData) {
      return res.status(404).send("Lesson data not found for the specified ID");
      }
      res.render("theme/sciencepracticalform", {
        lessonData,
        studentClass: classParam,
        subject,
        terminal,
        section,
        editing: true,
        ...await getSidenavData(req)
      });


  } }
  catch (err) {
    console.error("Error fetching rubrik for editing:", err);
    res.status(500).send("Internal Server Error");
  }
}
exports.deletelessondata = async (req, res, next) => {
  const {lessonId,studentClass,section,subject,terminal} = req.query;
  try {
    if(!lessonId)
    {
      return res.status(400).send("Lesson ID is required");
    }
    const lessonData = await ScienceModel.findByIdAndDelete(lessonId);
    if(!lessonData)
    {
      return res.status(404).send("Lesson data not found");
    }
    res.redirect(`/practicalform?studentClass=${studentClass}&section=${section}&subject=${subject}&terminal=${terminal}`);

  } catch (err) {
    console.error("Error deleting lesson data:", err);
    res.status(500).send("Internal Server Error");
  }
}

exports.attendance = async (req,res,next)=>
{

  const { studentClass, section, subject, terminal } = req.query;
const studentData = await studentRecord.find({studentClass:studentClass,section:section}).lean();
const marksheetSetting = await marksheetSetup.find({});
const academicYear = marksheetSetting[0].academicYear;
const attendance = attendanceModel(studentClass,section,academicYear);
const attendanceData = await attendance.find({academicYear:academicYear}).lean();

  res.render("theme/attendance",{...await getSidenavData(req), studentClass, section, subject, terminal, studentData,academicYear, attendanceData});
}
exports.saveAttendance = async (req,res,next)=>
{
  try
  {
    const { studentClass, section, subject, terminal ,acadamicYear} = req.query;
    const marksheetSetting = await marksheetSetup.find({});
    const academicYear = marksheetSetting[0].academicYear;
    const model = attendanceModel(studentClass,section,academicYear);
    const students = req.body.students; // Array of { roll, attendance, participation }
    await model.bulkWrite(
  students.map(s => ({
    updateOne: {
      filter: { reg: s.reg, academicYear }, // or _id if you pass it
      update: { $set: s },
      upsert: true // create new if not exists
    }
  }))
);

    res.redirect(`/attendance?studentClass=${studentClass}&section=${section}&subject=${subject}&terminal=${terminal}`);
  }catch(err)
  {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
}
async function getAcademicYear()
{
  const data = await marksheetSetup.find();
  return data[0].academicYear;

}
exports.indicatorwiserecord = async (req,res,next)=>
{
  try
  {
    const { studentClass, section, subject, terminal } = req.query;
    const indicatorwiseReport = await getPracticalProjectModel(subject, studentClass, section, await getAcademicYear()).find({studentClass:studentClass,section:section,subject:subject}).lean();
    console.log("report data=",indicatorwiseReport);
const practicalFormat = getThemeFormat(studentClass);
    const practicalFormatData = await practicalFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    const projectFormat = getProjectThemeFormat(studentClass)
    const projectFormatData = await projectFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
    
   


    res.render("theme/mathInternal2report",{...await getSidenavData(req), studentClass, section, subject, terminal, indicatorwiseReport, practicalFormatData, projectFormatData});


  }catch(err)
  {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
}
exports.autoSaveRubrik = async (req, res, next) => {
  try {
    const { studentClass, subject, terminal, themes, credit } = req.body;
    const ProjectModel =  getProjectThemeFormat(studentClass);
    await ProjectModel.updateOne(
        { studentClass, subject},
        {
        $set: {
          studentClass,
          subject,
       
          credit,
          themes,
          updatedAt: new Date()
         
        }
      },
      { upsert: true }
    );

    res.sendStatus(200);
    
  }catch (err) {
    console.error("Error in autosave:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

exports.datafromanotherclass = async (req, res, next) => {
  try {
    const { studentClass, subject } = req.query;
    if (!studentClass || !subject) {
      throw new Error("Student class and subject are required");
    }
    const model = getProjectThemeFormat(studentClass);
   const existingThemeDataInDB = await model.findOne({
  studentClass,
  subject
}).lean();
  res.json(existingThemeDataInDB);
  } catch (err) {
    console.error("Error fetching theme data from another class:", err);
    throw err;
  }
};