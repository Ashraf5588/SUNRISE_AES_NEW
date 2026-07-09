const path = require("path");

const fs= require("fs");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema, studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema,terminalSchema } = require("../model/adminschema");
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
const {ThemeEvaluationSchema} = require("../model/themeformschema");
// Use the already created model from the schema file

const {themeSchemaFor1} = require("../model/themeschema")
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
// For theme configuration/format (uses themeSchemaFor1)
const getThemeFormat = (studentClass) => {
  // Collection name: themeFor{class}
  const collectionName = `themeFor${studentClass}`;
  console.log(`Getting theme format model for class ${studentClass} using collection ${collectionName}`);
  
  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  
  // Create model with themeSchemaFor1 for configuration
  return mongoose.model(collectionName, themeSchemaFor1, collectionName);
};

// For student evaluation data (uses ThemeEvaluationSchema)
const getStudentThemeData = async(studentClass) => {
  // Collection name: themeForStudent{class}
  const academicYear = await getAcademicYear();
  const collectionName = `themeForStudent-${studentClass}-${academicYear}`;
  console.log(`Getting student theme data model for class ${studentClass} using collection ${collectionName}`);
  
  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  
  // Create model with ThemeEvaluationSchema for student data
  return mongoose.model(collectionName, ThemeEvaluationSchema, collectionName);
};

// For backward compatibility with existing code
const getSubjectTheme = getThemeFormat;
const getThemeForClass = getStudentThemeData;


exports.themeopener = async (req, res) => {
  try{
    return res.render("theme/theme",{...await getSidenavData(req),editing: false});

  }catch(err){
    console.error("Error in theme controller:", err);
    res.status(500).send("Internal Server Error");
  }
  
};
exports.themeform = async (req, res) => {
  try{
    const {subject, studentClass, section,roll,terminal,themeName} = req.query;
    const studentData =await  studentRecord.find({studentClass:studentClass, section: section});
    const themeForstudentData =  await getStudentThemeData(studentClass);
    
const existingThemeData = await themeForstudentData.find(
  {
    studentClass,
    section,
    roll: `${roll}`,
    terminal: `${terminal}`,
    subjects: { $elemMatch: { name: subject, themes: { $elemMatch: { themeName } } } }
  },
  { name: 1, studentClass: 1, section: 1, roll: 1, "subjects.$": 1 }
);
   



    console.log(`Theme form requested for subject: ${subject}, class: ${studentClass}, section: ${section}`);
    
    // Get the theme format model (for theme configuration)
    const model = getThemeFormat(studentClass);
    
    // Find theme format data
    const themeData = await model.find({
      studentClass: studentClass, 
      subject: subject
    });
 

   
      const toolDoc = await ToolsModel.findOne({
      subject: subject,
      forClass: studentClass
    }).lean();
   

  
const existingData = await themeForstudentData.find({
  studentClass,
  section,
  subject,

}).lean();

if(subject.toLowerCase() === "maths" || subject.toLowerCase() === "mathematics") {
  const existingMap = {};

existingData.forEach(item => {
    const key =
        `${item.reg}|${item.themeName}|${item.learningOutcomeName}|${item.toolName}`;

    existingMap[key] = item;
});
  if(studentClass === "4" || studentClass === "5" || studentClass.toLowerCase() === "four" || studentClass.toLowerCase() === "five") {
    return res.render("theme/themeMathFourFive", { themeData, subject, studentClass, section, studentData, existingThemeData,
      existingMap,terminal,
        toolDoc,...await getSidenavData(req),editing: true });
  }
  else{
      return res.render("theme/themeMath", { themeData, subject, studentClass, section, studentData, existingThemeData,
      existingMap,terminal,
        toolDoc,...await getSidenavData(req),editing: true });
      }
    }
      
if(subject.toLowerCase() === "english") {

  const existingMap = {};

existingData.forEach(item => {
    const key =
        `${item.reg}|${item.themeName}|${item.learningOutcomeName}|${item.aspectName}|${item.toolName}`;

    existingMap[key] = item;
});

  return res.render("theme/themeEnglish", { themeData, subject, studentClass, section, studentData, existingThemeData,
  existingMap,terminal,
    toolDoc,...await getSidenavData(req),editing: true });
  }

if(subject.toLowerCase() === "nepali") {

  const existingMap = {};

existingData.forEach(item => {
    const key =
        `${item.reg}|${item.themeName}|${item.learningOutcomeName}|${item.aspectName}|${item.toolName}`;

    existingMap[key] = item;
});
const aspectcontainerData = await AspectContainer.findOne({ subject: subject, studentClass: studentClass }).lean();

 return res.render("theme/themeNepali", { themeData, subject, studentClass, section, studentData, existingThemeData,
  existingMap,aspectcontainerData,terminal,
    toolDoc,...await getSidenavData(req),editing: true });
  }

  if(subject.toLowerCase() === "hamro serofero" || subject.toLowerCase() === "hamro serophero") {
  const existingMap = {};

existingData.forEach(item => {
    const key =
        `${item.reg}|${item.themeName}|${item.learningOutcomeName}|${item.toolName}`;

    existingMap[key] = item;
});

      return res.render("theme/themeHamroSerofero", { themeData, subject, studentClass, section, studentData, existingThemeData,
      existingMap,terminal,
        toolDoc,...await getSidenavData(req),editing: true });
      }
else
{
   const existingMap = {};

existingData.forEach(item => {
    const key =
        `${item.reg}|${item.themeName}|${item.learningOutcomeName}|${item.toolName}`;

    existingMap[key] = item;
});

    return  res.render("theme/themeMath", { themeData, subject, studentClass, section, studentData, existingThemeData,
      existingMap,terminal,
        toolDoc,...await getSidenavData(req),editing: true });
}
  } catch (err) {
    console.error("Error in theme controller:", err);
   return res.status(500).send("Internal Server Error");
  }
};


// exports.themeformSave = async (req, res) => {
//   try {
//     console.log("Form data received:", JSON.stringify(req.body, null, 2));
//     console.log('Request headers accept:', req.headers.accept);
//     console.log('Is autosave flag:', req.body && req.body.autosave);
//     try {
//       console.log('Request body keys:', Object.keys(req.body || {}));
//       if (req.body.subjects) {
//         console.log('subjects payload:', JSON.stringify(req.body.subjects, null, 2));
//       }
//     } catch (e) {
//       console.warn('Error logging request body details', e);
//     }
    
//     // Debug: Check for evaluationDate in the request body
//     if (req.body.subjects && req.body.subjects[0] && req.body.subjects[0].themes && req.body.subjects[0].themes[0] && req.body.subjects[0].themes[0].learningOutcomes) {
//       console.log("Found learningOutcomes in request:", req.body.subjects[0].themes[0].learningOutcomes);
//       req.body.subjects[0].themes[0].learningOutcomes.forEach((outcome, index) => {
//         if (outcome.evaluationDate) {
//           console.log(`Learning Outcome ${index} has evaluationDate:`, outcome.evaluationDate);
//         } else {
//           console.log(`Learning Outcome ${index} missing evaluationDate`);
//         }
//       });
//     }
    
//     // Check if req.body exists
//     if (!req.body) {
//       console.error("Request body is undefined");
//       return res.status(400).json({
//         success: false,
//         message: "No form data received"
//       });
//     }
    
//     // Helper function to get first value if array
//     const getValue = (value) => {
//       if (!value) return '';
//       return Array.isArray(value) ? value[0] : value;
//     };
    
//     // Validate required fields
//     let roll = getValue(req.body.roll);
//     let name = getValue(req.body.name);
//     let studentClass = getValue(req.body.studentClass);
//     let section = getValue(req.body.section);
//     let subject = req.body.subjects && req.body.subjects[0] ? getValue(req.body.subjects[0].name || req.body.subjects[0].subject || req.body.subjects[0].subjectDisplay) : '';
//     let themeName = getValue(req.body.themeName) || '';

//     const allSubmittedThemes = req.body.subjects && req.body.subjects[0] && Array.isArray(req.body.subjects[0].themes)
//       ? req.body.subjects[0].themes
//       : [];

//     if (!themeName && allSubmittedThemes.length) {
//       const firstThemeWithName = allSubmittedThemes.find(th => getValue(th.themeName) || getValue(th.themeNameDisplay));
//       themeName = firstThemeWithName ? getValue(firstThemeWithName.themeName || firstThemeWithName.themeNameDisplay) : '';
//     }

//     if (!roll || !name || !studentClass || !section || !subject || !themeName) {
//       console.error("Missing required fields:", { roll, name, studentClass, section, subject, themeName });
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields: roll, name, class, section, subject, or themeName"
//       });
//     }

//     // Clean up the form data to handle arrays
//     const processFormData = (obj) => {
//       if (!obj || typeof obj !== 'object') return obj;

//       const arrayKeys = new Set(['subjects','themes','learningOutcomes','learningOutcome','assessmentAspects','tools','indicators','selectedIndicatorsBefore','selectedIndicatorsAfter']);

//       // Create a new object to store processed data
//       const result = Array.isArray(obj) ? [] : {};

//       Object.keys(obj).forEach(key => {
//         const value = obj[key];

//         // Treat evaluation date variants as plain strings
//         if (/^evaluationDate/i.test(key) || key === 'evaluationDate') {
//           if (Array.isArray(value)) result[key] = String(value[0] || '');
//           else result[key] = String(value || '');
//           return;
//         }

//         // If value is an array and should be preserved as an array, process each element
//         if (Array.isArray(value)) {
//           // If key is in known array keys or array elements are objects, preserve as array
//           const elemsAreObjects = value.length > 0 && value.every(v => v && typeof v === 'object');
//           if (arrayKeys.has(key) || elemsAreObjects) {
//             result[key] = value.map(v => (v && typeof v === 'object') ? processFormData(v) : v);
//           } else if (value.length === 1) {
//             // collapse single-element arrays for scalar fields
//             result[key] = value[0];
//           } else {
//             result[key] = value.map(v => (v && typeof v === 'object') ? processFormData(v) : v);
//           }
//           return;
//         }

//         // Recursively process objects
//         if (value && typeof value === 'object') {
//           result[key] = processFormData(value);
//           return;
//         }

//         // Scalars
//         result[key] = value;
//       });

//       return result;
//     };

//     // Process the new theme data
//     const submittedThemes = Array.isArray(req.body.subjects[0].themes)
//       ? req.body.subjects[0].themes.filter(t => t && typeof t === 'object' && Object.keys(t).length > 0)
//       : [];
//     let submittedTheme = submittedThemes[0] || null;
//     if (submittedThemes.length && themeName) {
//       const matching = submittedThemes.find(t => {
//         const tn = getValue(t.themeName) || getValue(t.themeNameDisplay) || '';
//         return tn.toString().trim() === themeName.toString().trim();
//       });
//       if (matching) submittedTheme = matching;
//     }
//     if (!submittedTheme) {
//       // Fall back to the first non-empty theme object if theme selection is missing
//       submittedTheme = submittedThemes[0] || req.body.subjects[0].themes[0];
//     }
//     const newThemeData = processFormData(submittedTheme);
    
//     console.log("Processed new theme data:", JSON.stringify(newThemeData, null, 2));

//     // Defensive normalization for student-submitted theme: remove empty placeholders
//     const normalizeStudentTheme = (theme) => {
//       if (!theme || typeof theme !== 'object') return theme;
//       const t = { ...theme };

//       const loKey = t.learningOutcomes || t.learningOutcome || [];
//       t.learningOutcomes = Array.isArray(loKey) ? loKey.map(lo => {
//         const newLo = { ...lo };

//         // Ensure indicators array exists at LO level (fallback)
//         if (!Array.isArray(newLo.indicators)) newLo.indicators = Array.isArray(newLo.indicators) ? newLo.indicators : [];

//         // Normalize assessmentAspects into an array
//         if (!Array.isArray(newLo.assessmentAspects) && newLo.assessmentAspects && typeof newLo.assessmentAspects === 'object') {
//           newLo.assessmentAspects = [newLo.assessmentAspects];
//         }

//         if (Array.isArray(newLo.assessmentAspects)) {
//           newLo.assessmentAspects = newLo.assessmentAspects.map(asp => {
//             const newAsp = { ...asp };

//             // Normalize tools into an array
//             if (!Array.isArray(newAsp.tools) && newAsp.tools && typeof newAsp.tools === 'object') {
//               newAsp.tools = [newAsp.tools];
//             }

//             if (Array.isArray(newAsp.tools)) {
//               newAsp.tools = newAsp.tools.map(tool => {
//                 const newTool = { ...tool };

//                 // Ensure indicators is an array
//                 if (!Array.isArray(newTool.indicators) && newTool.indicators && typeof newTool.indicators === 'object') {
//                   newTool.indicators = [newTool.indicators];
//                 }

//                 if (Array.isArray(newTool.indicators)) {
//                   newTool.indicators = newTool.indicators.map(ind => {
//                     const newInd = { ...ind };

//                     // Normalize indicator name and marks
//                     newInd.indicatorName = (newInd.indicatorName || newInd.name || '').toString();
//                     newInd.maxMarks = Number(newInd.maxMarks || newInd.indicatorsMarks || 0);
//                     newInd.obtainedBefore = Number(newInd.obtainedBefore || newInd.marksBeforeIntervention || 0);
//                     newInd.obtainedAfter = Number(newInd.obtainedAfter || newInd.marksAfterIntervention || 0);

//                     // remove legacy fields
//                     if (newInd.indicatorsMarks !== undefined) delete newInd.indicatorsMarks;
//                     if (newInd.name !== undefined) delete newInd.name;

//                     return newInd;
//                   }).filter(ind => {
//                     // keep indicators that have a name or non-zero maxMarks
//                     const hasName = (ind.indicatorName || '').toString().trim().length > 0;
//                     const hasMax = typeof ind.maxMarks === 'number' && ind.maxMarks >= 0;
//                     return hasName || hasMax;
//                   });
//                 } else {
//                   newTool.indicators = [];
//                 }

//                 // Ensure tool-level dates and totals
//                 // If the form provided LO-level dates but not tool-level, inherit from LO
//                 newTool.evaluationDateBefore = newTool.evaluationDateBefore || newLo.evaluationDateBefore || '';
//                 newTool.evaluationDateAfter = newTool.evaluationDateAfter || newLo.evaluationDateAfter || '';
//                 newTool.totalBefore = Number(newTool.totalBefore || 0);
//                 newTool.totalAfter = Number(newTool.totalAfter || 0);

//                 // remove legacy name alias if present
//                 if (newTool.name !== undefined) delete newTool.name;

//                 return newTool;
//               }).filter(tool => {
//                 const hasName = (tool.toolName || '').toString().trim().length > 0;
//                 const hasIndicators = Array.isArray(tool.indicators) && tool.indicators.length > 0;
//                 return hasName || hasIndicators;
//               });
//             } else {
//               newAsp.tools = [];
//             }

//             // ensure aspectName exists
//             newAsp.aspectName = newAsp.aspectName || newAsp.name || '';
//             if (newAsp.name !== undefined) delete newAsp.name;

//             return newAsp;
//           }).filter(asp => {
//             const hasName = (asp.aspectName || '').toString().trim().length > 0;
//             const hasTools = Array.isArray(asp.tools) && asp.tools.length > 0;
//             return hasName || hasTools;
//           });
//         } else {
//           newLo.assessmentAspects = [];
//         }

//         // LO-level defaults
//         newLo.name = newLo.name || newLo.learningOutcomeName || '';
//         newLo.totalMarksBeforeIntervention = Number(newLo.totalMarksBeforeIntervention || 0);
//         newLo.totalMarksAfterIntervention = Number(newLo.totalMarksAfterIntervention || 0);

//         // Clean up legacy fields
//         if (newLo.learningOutcomeName !== undefined) delete newLo.learningOutcomeName;

//         return newLo;
//       }).filter(lo => {
//         const hasName = (lo.name || '').toString().trim().length > 0;
//         const hasAspects = Array.isArray(lo.assessmentAspects) && lo.assessmentAspects.length > 0;
//         return hasName || hasAspects;
//       }) : [];

//       t.learningOutcome = t.learningOutcomes;
//       // Ensure theme-level defaults
//       t.overallTotalBefore = Number(t.overallTotalBefore || 0);
//       t.overallTotalAfter = Number(t.overallTotalAfter || 0);

//       return t;
//     };

//     const normalizedTheme = normalizeStudentTheme(newThemeData);
//     console.log('Normalized theme for save:', JSON.stringify(normalizedTheme, null, 2));

//     // Fallback: if LO names or tool names are missing, populate from quick-selection fields
//     try {
//       const fallbackLOName = getValue(req.body.selectedLO) || '';
//       const fallbackAspect = getValue(req.body.selectedAspect) || '';
//       const fallbackTool = getValue(req.body.selectedTool) || '';
//       if (normalizedTheme && Array.isArray(normalizedTheme.learningOutcomes)) {
//         normalizedTheme.learningOutcomes.forEach((lo, idx) => {
//           if (!lo.name || !lo.name.toString().trim()) {
//             if (fallbackLOName) lo.name = fallbackLOName;
//             else lo.name = `Learning Outcome ${idx+1}`;
//           }
//           if (Array.isArray(lo.assessmentAspects)) {
//             lo.assessmentAspects.forEach((asp) => {
//               if (!asp.aspectName || !asp.aspectName.toString().trim()) {
//                 if (fallbackAspect) asp.aspectName = fallbackAspect;
//                 else asp.aspectName = '';
//               }
//               if (Array.isArray(asp.tools)) {
//                 asp.tools.forEach((tool) => {
//                   if (!tool.toolName || !tool.toolName.toString().trim()) {
//                     if (fallbackTool) tool.toolName = fallbackTool;
//                     else tool.toolName = '';
//                   }
//                 });
//               }
//             });
//           }
//         });
//       }
//     } catch (e) { console.warn('Fallback LO/tool population failed', e); }

//     // If the incoming payload contains selected indicator ids, compute LO totals from
//     // the master theme format so student docs don't duplicate indicator definitions.
//     try {
//       const ThemeFormatModel = getThemeFormat(studentClass);
//       const masterDocs = await ThemeFormatModel.find({ studentClass: studentClass, subject: subject }).lean();
//       const indicatorMap = new Map();
//       if (Array.isArray(masterDocs) && masterDocs.length) {
//         masterDocs.forEach(md => {
//           if (Array.isArray(md.themes)) {
//             md.themes.forEach(theme => {
//               if (!theme || !theme.learningOutcome) return;
//               theme.learningOutcome.forEach(lo => {
//                 if (!lo || !Array.isArray(lo.assessmentAspects)) return;
//                 lo.assessmentAspects.forEach(asp => {
//                   if (!asp || !Array.isArray(asp.tools)) return;
//                   asp.tools.forEach(tool => {
//                     if (!tool || !Array.isArray(tool.indicators)) return;
//                     tool.indicators.forEach(ind => {
//                       if (!ind) return;
//                       try {
//                         if (ind._id) indicatorMap.set(String(ind._id), Number(ind.indicatorsMarks || ind.maxMarks || 0));
//                       } catch (e) { /* ignore */ }
//                     });
//                   });
//                 });
//               });
//             });
//           }
//         });
//       }

//       // For each LO in normalizedTheme, if selectedIndicatorsBefore/After arrays present,
//       // compute totals by summing indicator marks from master indicatorMap.
//       if (Array.isArray(normalizedTheme.learningOutcomes)) {
//         normalizedTheme.learningOutcomes.forEach(lo => {
//           try {
//             if (Array.isArray(lo.selectedIndicatorsBefore) && lo.selectedIndicatorsBefore.length) {
//               let s = 0;
//               lo.selectedIndicatorsBefore.forEach(id => { if (id) s += Number(indicatorMap.get(String(id)) || 0); });
//               lo.totalMarksBeforeIntervention = Number(s);
//             }
//             if (Array.isArray(lo.selectedIndicatorsAfter) && lo.selectedIndicatorsAfter.length) {
//               let s2 = 0;
//               lo.selectedIndicatorsAfter.forEach(id => { if (id) s2 += Number(indicatorMap.get(String(id)) || 0); });
//               lo.totalMarksAfterIntervention = Number(s2);
//             }
//           } catch(e) { /* ignore per-LO errors */ }
//         });
//       }
//     } catch (errMap) {
//       console.warn('Could not compute totals from master indicators:', errMap);
//     }

//     // Compute aggregated totals and add legacy/alternate field names expected by UI
//     const computeTotalsAndAliases = (theme) => {
//       if (!theme || typeof theme !== 'object') return theme;

//       const num = v => Number(v) || 0;

//       const los = theme.learningOutcomes || theme.learningOutcome || [];

//       let themeTotalBefore = 0;
//       let themeTotalAfter = 0;

//       theme.learningOutcomes = Array.isArray(los) ? los.map(lo => {
//         const newLo = { ...lo };
//         let loTotalBefore = 0;
//         let loTotalAfter = 0;

//         if (Array.isArray(newLo.assessmentAspects)) {
//           newLo.assessmentAspects = newLo.assessmentAspects.map(asp => {
//             const newAsp = { ...asp };
//             let aspTotalBefore = 0;
//             let aspTotalAfter = 0;

//             if (Array.isArray(newAsp.tools)) {
//               newAsp.tools = newAsp.tools.map(tool => {
//                 const newTool = { ...tool };
//                 let toolTotalBefore = 0;
//                 let toolTotalAfter = 0;

//                 if (Array.isArray(newTool.indicators)) {
//                   newTool.indicators = newTool.indicators.map(ind => {
//                     const newInd = { ...ind };
//                     // Support legacy names too
//                     const obtainedBefore = num(newInd.obtainedBefore || newInd.marksBeforeIntervention || newInd.marksBefore || newInd.marksBeforeIntervention);
//                     const obtainedAfter = num(newInd.obtainedAfter || newInd.marksAfterIntervention || newInd.marksAfter || newInd.marksAfterIntervention);
//                     // store normalized fields
//                     newInd.obtainedBefore = obtainedBefore;
//                     newInd.obtainedAfter = obtainedAfter;
//                     newInd.maxMarks = num(newInd.maxMarks || newInd.indicatorsMarks || newInd.maxMarks);

//                     toolTotalBefore += obtainedBefore;
//                     toolTotalAfter += obtainedAfter;
//                     return newInd;
//                   });
//                 }

//                 // Set tool totals
//                 newTool.totalBefore = toolTotalBefore;
//                 newTool.totalAfter = toolTotalAfter;

//                 aspTotalBefore += toolTotalBefore;
//                 aspTotalAfter += toolTotalAfter;

//                 return newTool;
//               });
//             }

//             // set aspect totals
//             newAsp.assessmentAspectTotalBefore = aspTotalBefore;
//             newAsp.assessmentAspectTotalAfter = aspTotalAfter;

//             loTotalBefore += aspTotalBefore;
//             loTotalAfter += aspTotalAfter;

//             return newAsp;
//           });
//         }

//         // compute LO totals only if selectedIndicators were not provided (preserve computed totals)
//         if (!Array.isArray(newLo.selectedIndicatorsBefore) || newLo.selectedIndicatorsBefore.length === 0) {
//           newLo.totalMarksBeforeIntervention = loTotalBefore;
//         }
//         if (!Array.isArray(newLo.selectedIndicatorsAfter) || newLo.selectedIndicatorsAfter.length === 0) {
//           newLo.totalMarksAfterIntervention = loTotalAfter;
//         }

//         themeTotalBefore += loTotalBefore;
//         themeTotalAfter += loTotalAfter;

//         return newLo;
//       }) : [];

//       theme.overallTotalBefore = themeTotalBefore;
//       theme.overallTotalAfter = themeTotalAfter;
//       theme.learningOutcome = theme.learningOutcomes;

//       return theme;
//     };

//     const { computeThemeTotals } = require('../utils/computeThemeTotals');
//     const enrichedTheme = computeThemeTotals(normalizedTheme);
//     console.log('Enriched theme for save (with totals/aliases):', JSON.stringify(enrichedTheme, null, 2));
//     // Debug: show tool dates for inspection
//     try {
//       enrichedTheme.learningOutcomes && enrichedTheme.learningOutcomes.forEach((lo, li) => {
//         lo.assessmentAspects && lo.assessmentAspects.forEach((asp, ai) => {
//           asp.tools && asp.tools.forEach((tool, ti) => {
//             console.log(`Tool date check LO[${li}] ASP[${ai}] TOOL[${ti}]:`, {
//               toolName: tool.toolName,
//               evaluationDateBefore: tool.evaluationDateBefore,
//               evaluationDateAfter: tool.evaluationDateAfter
//             });
//           });
//         });
//       });
//     } catch (dbgErr) {
//       console.warn('Error while logging tool dates:', dbgErr);
//     }
    
//     // Get data from the appropriate collection based on class
//     const ThemeModel = await getStudentThemeData(studentClass);
    
//     // First, check if student record exists for this student (same roll, class, section)
//     const existingStudentRecord = await ThemeModel.findOne({
//       roll,
//       studentClass,
//       section
//     });
    
//     let result;
    
//     // Calculate overall totals for all themes before saving
//     function updateOverallTotals(subjects) {
//       if (!Array.isArray(subjects)) return;
//       subjects.forEach(subject => {
//         if (Array.isArray(subject.themes)) {
//           subject.themes.forEach(theme => {
//             let overallBefore = 0;
//             let overallAfter = 0;
//             if (Array.isArray(theme.learningOutcomes)) {
//               theme.learningOutcomes.forEach(outcome => {
//                 overallBefore += Number(outcome.totalMarksBeforeIntervention || 0);
//                 overallAfter += Number(outcome.totalMarksAfterIntervention || 0);
//               });
//             }
//             theme.overallTotalBefore = overallBefore;
//             theme.overallTotalAfter = overallAfter;
//           });
//         }
//       });
//     }

//     // Merge helper functions for existing themes and learning outcomes
//     const mergeIndicators = (existingIndicators = [], incomingIndicators = []) => {
//       const merged = Array.isArray(existingIndicators) ? [...existingIndicators] : [];
//       if (!Array.isArray(incomingIndicators)) return merged;
//       incomingIndicators.forEach((incoming) => {
//         if (!incoming || typeof incoming !== 'object') return;
//         const incomingName = String(incoming.indicatorName || incoming.name || '').trim();
//         const existingIndex = merged.findIndex((old) => String(old.indicatorName || old.name || '').trim() === incomingName);
//         if (existingIndex !== -1) {
//           merged[existingIndex] = { ...merged[existingIndex], ...incoming };
//         } else {
//           merged.push(incoming);
//         }
//       });
//       return merged;
//     };

//     const mergeTools = (existingTools = [], incomingTools = []) => {
//       const merged = Array.isArray(existingTools) ? [...existingTools] : [];
//       if (!Array.isArray(incomingTools)) return merged;
//       incomingTools.forEach((incoming) => {
//         if (!incoming || typeof incoming !== 'object') return;
//         const incomingName = String(incoming.toolName || incoming.name || '').trim();
//         const existingIndex = merged.findIndex((old) => String(old.toolName || old.name || '').trim() === incomingName);
//         if (existingIndex !== -1) {
//           merged[existingIndex] = {
//             ...merged[existingIndex],
//             ...incoming,
//             indicators: mergeIndicators(merged[existingIndex].indicators, incoming.indicators)
//           };
//         } else {
//           merged.push(incoming);
//         }
//       });
//       return merged;
//     };

//     const getLearningOutcomes = (theme) => {
//       if (!theme || typeof theme !== 'object') return [];
//       return Array.isArray(theme.learningOutcomes) ? theme.learningOutcomes : (Array.isArray(theme.learningOutcome) ? theme.learningOutcome : []);
//     };

//     const mergeAspects = (existingAspects = [], incomingAspects = []) => {
//       const merged = Array.isArray(existingAspects) ? [...existingAspects] : [];
//       if (!Array.isArray(incomingAspects)) return merged;
//       incomingAspects.forEach((incoming) => {
//         if (!incoming || typeof incoming !== 'object') return;
//         const incomingName = String(incoming.aspectName || incoming.name || '').trim();
//         const existingIndex = merged.findIndex((old) => String(old.aspectName || old.name || '').trim() === incomingName);
//         if (existingIndex !== -1) {
//           merged[existingIndex] = {
//             ...merged[existingIndex],
//             ...incoming,
//             tools: mergeTools(merged[existingIndex].tools, incoming.tools)
//           };
//         } else {
//           merged.push(incoming);
//         }
//       });
//       return merged;
//     };

//     const mergeLearningOutcomes = (existingLOs = [], incomingLOs = []) => {
//       const merged = Array.isArray(existingLOs) ? [...existingLOs] : [];
//       if (!Array.isArray(incomingLOs)) return merged;
//       incomingLOs.forEach((incoming) => {
//         if (!incoming || typeof incoming !== 'object') return;
//         const incomingName = String(incoming.name || incoming.learningOutcomeName || '').trim();
//         const existingIndex = merged.findIndex((old) => String(old.name || old.learningOutcomeName || '').trim() === incomingName);
//         if (existingIndex !== -1) {
//           merged[existingIndex] = {
//             ...merged[existingIndex],
//             ...incoming,
//             assessmentAspects: mergeAspects(merged[existingIndex].assessmentAspects, incoming.assessmentAspects)
//           };
//         } else {
//           merged.push(incoming);
//         }
//       });
//       return merged;
//     };

//     // If updating existing record
//     if (existingStudentRecord) {
//       console.log("Found existing student record");
      
//       // Check if this subject already exists
//       const subjectIndex = existingStudentRecord.subjects.findIndex(subj => subj.name === subject);
      
//       if (subjectIndex !== -1) {
//         // Subject exists, check if this theme already exists
//         const themeIndex = existingStudentRecord.subjects[subjectIndex].themes.findIndex(
//           theme => theme.themeName === themeName
//         );
        
//         if (themeIndex !== -1) {
//           // Theme exists, merge incoming learning outcomes into the existing theme
//           const existingTheme = existingStudentRecord.subjects[subjectIndex].themes[themeIndex];
//           const mergedLearningOutcomes = mergeLearningOutcomes(getLearningOutcomes(existingTheme), getLearningOutcomes(enrichedTheme));
//           const mergedTheme = {
//             ...existingTheme,
//             ...enrichedTheme,
//             learningOutcomes: mergedLearningOutcomes,
//             learningOutcome: mergedLearningOutcomes
//           };

//           existingStudentRecord.subjects[subjectIndex].themes[themeIndex] = computeTotalsAndAliases(mergedTheme);
//           console.log("Merged incoming theme into existing theme");
//         } else {
//           // Theme doesn't exist, add new theme to existing subject
//           existingStudentRecord.subjects[subjectIndex].themes.push(enrichedTheme);
//           console.log("Added new theme to existing subject");
//         }
//       } else {
//         // Subject doesn't exist, add new subject with the theme
//         existingStudentRecord.subjects.push({
//           name: subject,
//           themes: [enrichedTheme]
//         });
//         console.log("Added new subject with theme");
//       }
      
//       updateOverallTotals(existingStudentRecord.subjects);
//       existingStudentRecord.updatedAt = new Date();
//       result = await existingStudentRecord.save();
//     } else {
//       // No existing record, create new one
//       const formData = {
//         roll: roll,
//         name: name,
//         studentClass: studentClass,
//         section: section,
//         subjects: [{
//           name: subject,
//           themes: [enrichedTheme]
//         }],
//         createdAt: new Date(),
//         updatedAt: new Date()
//       };
      
//       console.log("Creating new student record:", JSON.stringify(formData, null, 2));
//       updateOverallTotals(formData.subjects);
//       result = await ThemeModel.create(formData);
//       console.log("New theme form data saved successfully");
//     }
    
//     // Handle response based on request type
//     if (req.headers.accept && req.headers.accept.includes('application/json') || req.body.autosave === 'true' || req.body.ajax === 'true') {
//       // If it's an AJAX request, autosave, or explicitly requested JSON response
//       res.json({ 
//         success: true, 
//         id: result._id, 
//         message: 'Data saved successfully',
//         isAutosave: req.body.autosave === 'true',
//         redirect: `/themeform?subject=${subject}&studentClass=${studentClass}` 
//       });
//     } else {
//       const terminal = req.query.terminal || '';
//       // If it's a regular form submission, redirect
//       res.render("theme/success", {link:"themeform",studentClass,section,subject,editing:false,terminal});
//     }
//   } catch (err) {
//     console.error("Error saving theme form data:", err);
//     res.status(500).send("Error saving theme form: " + err.message);
//   }
// }

exports.themeformSave = async (req, res) => {

}
  

exports.themefillupform = async (req, res) => {
  try {
    const { studentClass: classParam ,subject,terminal,section} = req.query;

    const practicalFormat = getThemeFormat(classParam);
    const practicalFormatData = await practicalFormat.find({
      studentClass: classParam,
      subject: subject
    }).lean();

    const existingPracticalData = await practicalFormat.find({studentClass: classParam, subject: subject}).lean();
    
   const subjectData = await newsubject.find({newsubject:subject,forClass:classParam}).lean();
   
    const sidenavData = await getSidenavData(req);
    // If studentClass is provided, render the form for that class
    if (classParam) {
      return res.render("theme/themefiller", { studentClass: classParam ,editing:false,
       section,
         subject,
         terminal,
         practicalFormatData,
          subjectData, 
          existingPracticalData,
         accessibleClasses: sidenavData.studentClassdata,
          accessibleSubjects: sidenavData.subjects,


      });
    } 
    
    // If no class provided, render the class selection page first
    // Use the model correctly - avoiding the naming conflict
    const studentClassdata = await studentClass.find({}).lean();
    return res.render("theme/themefillerclassselect", { 
      studentClassdata,
      ...await getSidenavData(req)
    });
  } catch(err) {
    console.error("Error in theme controller:", err);
    res.status(500).send("Internal Server Error");
  }
}
exports.themefillupformsave = async (req, res) => {
  try {
    // Get studentClass from query or body
    const studentClass = req.query.studentClass || req.body.studentClass;
    const {editing,subject,terminal,projectId}= req.query;
    if(editing==='true'){
      
      const ThemeModel = getThemeFormat(studentClass);
      // Update the existing record with new data
      // Normalize themes before updating
      if (req.body.themes) {
        const normalize = (themesInput) => {
          if (!Array.isArray(themesInput)) return themesInput;
          return themesInput.map(theme => {
            const t = { ...theme };
            const loKey = t.learningOutcome || t.learningOutcomes || [];
            t.learningOutcome = Array.isArray(loKey) ? loKey.map(lo => {
              const newLo = { ...lo };
              if (Array.isArray(newLo.assessmentAspects)) {
                newLo.assessmentAspects = newLo.assessmentAspects.map(asp => {
                  const newAsp = { ...asp };
                  if (Array.isArray(newAsp.tools)) {
                    newAsp.tools = newAsp.tools.map(tool => {
                      const newTool = { ...tool };
                      if (Array.isArray(newTool.indicators)) {
                        newTool.indicators = newTool.indicators.map(ind => {
                          const newInd = { ...ind };
                          if (newInd.indicatorsMarks !== undefined && (newInd.maxMarks === undefined)) {
                            newInd.maxMarks = Number(newInd.indicatorsMarks) || 0;
                            delete newInd.indicatorsMarks;
                          }
                          return newInd;
                        });
                      }
                      return newTool;
                    });
                  }
                  return newAsp;
                });
              }
              return newLo;
            }) : [];
            return t;
          });
        };

        req.body.themes = normalize(req.body.themes);
      }

      await ThemeModel.findByIdAndUpdate(projectId, req.body);

      return res.render("theme/success", {link:"themefillupform",studentClass,subject,section:"",terminal,editing:false});
     

    }
    else
    {
    if (!studentClass) {
      return res.status(400).json({
        success: false,
        message: "Student class is required"
      });
    }
    
    // Ensure the studentClass in the request body is set correctly
    req.body.studentClass = studentClass;

    // Normalize themes in req.body if present (same logic as autosave)
    const normalizeThemesOnce = (themesInput) => {
      if (!Array.isArray(themesInput)) return themesInput;
      return themesInput.map(theme => {
        const t = { ...theme };
        const loKey = t.learningOutcome || t.learningOutcomes || [];
        t.learningOutcome = Array.isArray(loKey) ? loKey.map(lo => {
          const newLo = { ...lo };
          if (Array.isArray(newLo.assessmentAspects)) {
            newLo.assessmentAspects = newLo.assessmentAspects.map(asp => {
              const newAsp = { ...asp };
              if (Array.isArray(newAsp.tools)) {
                newAsp.tools = newAsp.tools.map(tool => {
                  const newTool = { ...tool };
                  if (Array.isArray(newTool.indicators)) {
                    newTool.indicators = newTool.indicators.map(ind => {
                      const newInd = { ...ind };
                      if (newInd.indicatorsMarks !== undefined && (newInd.maxMarks === undefined)) {
                        newInd.maxMarks = Number(newInd.indicatorsMarks) || 0;
                        delete newInd.indicatorsMarks;
                      }
                      return newInd;
                    });
                  }
                  return newTool;
                });
              }
              return newAsp;
            });
          }
          return newLo;
        }) : [];
        return t;
      });
    };

    if (req.body.themes) req.body.themes = normalizeThemesOnce(req.body.themes);

    // This is for theme format, so use getThemeFormat
    const model = getThemeFormat(studentClass);
    const result = await model.create(req.body);
    console.log(`Theme filled successfully for class ${studentClass}`);
    
    // Send a more user-friendly response
    return res.render("theme/success", {link:"themefillupform",studentClass,section:"",subject,terminal,editing:false});
  } 
}catch(err) {
    console.error("Error in theme controller:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
}

// Success page after form submission
exports.success = async (req, res) => {
  const formId = req.query.id;
  const studentClass = req.query.studentClass || req.body.studentClass;
  
  try {
    // If we have a form ID, get the form data to display context
    let formData = {};
    if (formId) {
        const ThemeModel = getStudentThemeData(studentClass);
      const themeForm = await ThemeModel.findById(formId);
      if (themeForm) {
        // Get the most recently added theme (last one in the array)
        let latestSubject = '';
        let latestTheme = '';
        
        if (themeForm.subjects && themeForm.subjects.length > 0) {
          const lastSubject = themeForm.subjects[themeForm.subjects.length - 1];
          latestSubject = lastSubject.name;
          
          if (lastSubject.themes && lastSubject.themes.length > 0) {
            const lastTheme = lastSubject.themes[lastSubject.themes.length - 1];
            latestTheme = lastTheme.themeName;
          }
        }
        
        formData = {
          studentClass: themeForm.studentClass || '',
          section: themeForm.section || '',
          subject: latestSubject,
          roll: themeForm.roll || '',
          name: themeForm.name || '',
          themeName: latestTheme,
          totalSubjects: themeForm.subjects ? themeForm.subjects.length : 0,
          totalThemes: themeForm.subjects ? themeForm.subjects.reduce((total, subj) => total + (subj.themes ? subj.themes.length : 0), 0) : 0
        };
      }
    }
    
    res.render('theme/success', { 
      formId,
      ...formData
    });
  } catch (error) {
    console.error('Error rendering success page:', error);
    res.render('theme/success', { 
      formId,
      error: error.message 
    });
  }
}

// Function to view theme marks report
exports.themeMarks = async (req, res) => {
  try {
    const { studentClass, section, subject } = req.query;
    
    // Build query based on provided filters
    let query = {};
    if (studentClass) query.studentClass = studentClass;
    if (section) query.section = section;
    
    // If subject is specified, filter by subject in aggregation
    let pipeline = [
      { $match: query }
    ];
    
    if (subject) {
      pipeline.push({
        $addFields: {
          subjects: {
            $filter: {
              input: "$subjects",
              cond: { $eq: ["$$this.name", subject] }
            }
          }
        }
      });
    }
    
    // Get theme evaluation data
    const ThemeModel = await getStudentThemeData(studentClass);
    const themeData = await ThemeModel.aggregate(pipeline);

    console.log("Theme marks data fetched:", themeData.length, "records");
    
    // Get filter options for the form
    const filterOptions = await getSidenavData(req);
    
    res.render('theme/thememarks', { 
      themeData,
      selectedClass: studentClass || '',
      selectedSection: section || '',
      selectedSubject: subject || '',
      ...filterOptions
    });
  } catch (error) {
    console.error('Error fetching theme marks:', error);
    res.status(500).send('Error fetching theme marks: ' + error.message);
  }
}

// Function to get student progress data
exports.studentProgress = async (req, res) => {
  try {
    const { roll, studentClass, section } = req.query;
    
    if (!roll || !studentClass || !section) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: roll, studentClass, section'
      });
    }
     const ThemeModel = await getStudentThemeData(studentClass);
    const studentRecord = await ThemeModel.findOne({
      roll,
      studentClass,
      section
    });
    
    if (!studentRecord) {
      return res.json({
        success: true,
        message: 'No theme records found for this student',
        data: null
      });
    }
    
    // Format the data for easy viewing
    const progressData = {
      student: {
        name: studentRecord.name,
        roll: studentRecord.roll,
        class: studentRecord.studentClass,
        section: studentRecord.section
      },
      subjects: studentRecord.subjects.map(subject => ({
        name: subject.name,
        totalThemes: subject.themes.length,
        themes: subject.themes.map(theme => ({
          name: theme.themeName,
          totalLearningOutcomes: theme.learningOutcomes.length,
          overallProgress: {
            before: theme.overallTotalBefore,
            after: theme.overallTotalAfter
          }
        }))
      })),
      summary: {
        totalSubjects: studentRecord.subjects.length,
        totalThemes: studentRecord.subjects.reduce((total, subj) => total + subj.themes.length, 0),
        lastUpdated: studentRecord.updatedAt
      }
    };
    
    res.json({
      success: true,
      data: progressData
    });
    
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student progress',
      error: error.message
    });
  }
}

exports.themeformMarks = async (req, res) => {
  try {

    return res.render("theme/thememarkschoose",{...await getSidenavData(req),editing: false});
  }catch (error) {
    console.error('Error fetching theme for marks:', error);
    res.render('theme/success', {
      error: error.message
    });

  }
}  

exports.thememarksheetOfStudent = async (req, res) => {
    try {

        const {
            studentClass,
            section
        } = req.query;

        // -------------------------------
        // Dynamic student marks model
        // -------------------------------

        const MarksModel =
            await getStudentThemeData(studentClass);

        // -------------------------------
        // Theme definition model
        // -------------------------------

        const ThemeModel =
            await getThemeFormat(studentClass);

        // -------------------------------
        // Students
        // -------------------------------

        const students =
            await studentRecord.find({
                studentClass,
                section
            }).lean();

        // -------------------------------
        // Theme definitions
        // -------------------------------

        const themeData =
            await ThemeModel.find({
                studentClass
            }).lean();

        // -------------------------------
        // Subjects of class
        // -------------------------------

        const subjects =
            await newsubject.find({
                forClass: studentClass
            }).lean();

        // -------------------------------
        // All assessment records
        // -------------------------------

        const marks =
            await MarksModel.find({
                studentClass,
                section
            }).lean();

        // ======================================
        // SUBJECT CREDIT MAP
        // ======================================

        const subjectInfo = {};

        themeData.forEach(subjectDoc => {

            subjectInfo[subjectDoc.subject] = {
                credit: Number(subjectDoc.credit || 0)
            };

        });

        console.log("Subject Info:", subjectInfo);

        // ======================================
        // MARKS MAP
        // ======================================

        const marksMap = {};

        marks.forEach(record => {

            const key =
                `${record.reg}|${record.subject}`;

            if (!marksMap[key]) {
                marksMap[key] = 0;
            }

            marksMap[key] +=
                Number(
                    record.obtainedMarksAfter || 0
                );

        });

        // ======================================
        // LEARNING OUTCOME COUNT MAP
        // ======================================

        const loCountMap = {};

        marks.forEach(record => {

            const key =
                `${record.reg}|${record.subject}`;

            if (!loCountMap[key]) {
                loCountMap[key] = new Set();
            }

            loCountMap[key].add(
                record.learningOutcomeName
            );

        });

        console.log("LO Count Map:", loCountMap);

        // ======================================
        // GRADE FUNCTION
        // ======================================

        function getGrade(percentage) {

            if (percentage >= 90)
                return {
                    grade: "A+",
                    gp: 4.0
                };

            if (percentage >= 80)
                return {
                    grade: "A",
                    gp: 3.6
                };

            if (percentage >= 70)
                return {
                    grade: "B+",
                    gp: 3.2
                };

            if (percentage >= 60)
                return {
                    grade: "B",
                    gp: 2.8
                };

            if (percentage >= 50)
                return {
                    grade: "C+",
                    gp: 2.4
                };

            if (percentage >= 40)
                return {
                    grade: "C",
                    gp: 2.0
                };

            if (percentage >= 35)
                return {
                    grade: "D",
                    gp: 1.6
                };

            return {
                grade: "NG",
                gp: 0
            };
        }

        // ======================================
        // BUILD MARKSHEET
        // ======================================
const marksheetDataTheme = [];

students.forEach(student => {

    const subjectResults = [];

    let totalCredit = 0;
    let totalWeightedGP = 0;

    subjects.forEach(sub => {

        const subjectName =
            sub.newsubject || sub.subject;

        // -----------------------------------
        // Total obtained marks of student
        // -----------------------------------

        const obtained =
            marksMap[
                `${student.reg}|${subjectName}`
            ] || 0;

        // -----------------------------------
        // Count unique learning outcomes
        // from SAVED DATA
        // Theme + LO combination is unique
        // -----------------------------------

        const studentSubjectRecords =
            marks.filter(record =>
                record.reg === student.reg &&
                record.subject === subjectName
            );

        const uniqueLO = new Set();

        studentSubjectRecords.forEach(record => {

            uniqueLO.add(
                `${record.themeName}|${record.learningOutcomeName}`
            );

        });

        const totalLO =
            uniqueLO.size;

        // -----------------------------------
        // Maximum marks
        // -----------------------------------

        const maxMarks =
            totalLO * 4;

        // -----------------------------------
        // Percentage
        // -----------------------------------

        const percentage =
            maxMarks > 0
            ? (obtained / maxMarks) * 100
            : 0;

        // -----------------------------------
        // Grade
        // -----------------------------------

        const gradeData =
            getGrade(percentage);

        // -----------------------------------
        // Credit
        // -----------------------------------

        const credit =
            Number(
                subjectInfo[subjectName]?.credit || 0
            );

        const weightedGP =
            credit *
            gradeData.gp;

        totalCredit += credit;
        totalWeightedGP += weightedGP;

        subjectResults.push({

            subject:
                subjectName,

            credit,

            obtained,

            totalLO,

            maxMarks,

            percentage:
                Number(
                    percentage.toFixed(2)
                ),

            grade:
                gradeData.grade,

            gp:
                gradeData.gp,

            weightedGP:
                Number(
                    weightedGP.toFixed(2)
                )
        });

    });

    const gpa =
        totalCredit > 0
        ? (
            totalWeightedGP /
            totalCredit
        ).toFixed(2)
        : 0;

    marksheetDataTheme.push({

        reg:
            student.reg,

        name:
            student.name,

        roll:
            student.roll,

        section:
            student.section,

        studentClass:
            student.studentClass,

        subjectResults,

        totalCredit,

        totalWeightedGP:
            Number(
                totalWeightedGP.toFixed(2)
            ),

        gpa
    });

});
        

        
        res.render(
            "theme/thememarksheet",
            {
                marksheetData:
                    marksheetDataTheme
            }
        );

    }
    catch (e) {
        console.log(e);
        res.status(500).send(e.message);
    }
};
exports.themewisemarks = async (req, res) => {
  try {
    const { studentClass, section, subject,terminal } = req.query;
      const ThemeModel = await getStudentThemeData(studentClass);
    const themewisemarks = await ThemeModel.find({
      studentClass: studentClass,
      section: section,
    }).lean();
    const ThemeDataModel = await getThemeFormat(studentClass);
    const themeData = await ThemeDataModel.find({
      studentClass: studentClass,
      subject: subject
    }).lean();

    const marksheetSetting = await marksheetSetup.find({}).lean();
    const studentData = await studentRecord.find({ studentClass: studentClass, section: section }).lean();
 const marksMap = {};

      console.log("Total DB Records:", themewisemarks.length);

themewisemarks.forEach(record => {
    const key =
        `${record.reg}|${record.themeName}|${record.learningOutcomeName}`;

    marksMap[key] = record;

    
});

    return res.render("theme/newthemewisemarks", {
      ...await getSidenavData(req),
      editing: false,
      studentClass,
      section,
      marksheetSetting,
      subject,
      terminal,
      themewisemarks,
      themeData,
      marksMap,
      studentData,
    });
  } catch (error) {
    console.error('Error fetching theme wise marks:', error); 
    res.status(500).send('Error fetching theme wise marks: ' + error.message);
  }
}
exports.themeslip =  async (req, res) => {
  try {
    const { studentClass, section, subject ,terminal} = req.query;
      const ThemeModel = await getStudentThemeData(studentClass);
    const themeslip = await ThemeModel.find({
      studentClass: studentClass,
      section: section,
      
    }).lean();
    const marksheetSetting = await marksheetSetup.find({}).lean();
    return res.render("theme/themeslip", {
      ...await getSidenavData(req),
      editing: false,
      studentClass,
      section,
      subject,
      themeslip,
      marksheetSetting,
      terminal,
    });
  } catch (error) {
    console.error('Error fetching theme slip:', error);
    res.status(500).send('Error fetching theme slip: ' + error.message);
  }
}
exports.themeMarksheet =  async (req, res) => {
  try {
    const { studentClass, section, subject } = req.query;
      const ThemeModel = await getStudentThemeData(studentClass);
    const themeslip = await ThemeModel.find({
      studentClass: studentClass,
      section: section,
      
    }).lean();


    return res.render("theme/themeMarksheet", {
      ...await getSidenavData(req),
      editing: false,
      studentClass,
      section,
      subject,
      themeslip,
    });
  } catch (error) {
    console.error('Error fetching theme slip:', error);
    res.status(500).send('Error fetching theme slip: ' + error.message);
  }
}

// Function to get previous theme data for a student by roll number
exports.getPreviousThemeData = async (req, res) => {
  try {
    const { roll, subject, themeName, studentClass, section } = req.query;
    
    if (!roll || !subject || !themeName || !studentClass || !section) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: roll, subject, themeName, studentClass, section'
      });
    }
    
    // Find the student record
    
      const ThemeModel = await getStudentThemeData(studentClass);
    const studentRecord = await ThemeModel.findOne({
      roll,
      studentClass,
      section
    }).lean();
    
    if (!studentRecord) {
      return res.json({
        success: true,
        found: false,
        message: 'No records found for this student'
      });
    }
    
    // Look for the specific subject and theme
    let themeData = null;
    let subjectData = null;
    
    // Find the subject
    for (const subj of studentRecord.subjects) {
      if (subj.name === subject) {
        subjectData = subj;
        
        // Find the theme
        for (const theme of subj.themes) {
          if (theme.themeName === themeName) {
            themeData = theme;
            break;
          }
        }
        
        break;
      }
    }
    
    if (!themeData) {
      return res.json({
        success: true,
        found: false,
        message: 'No data found for this theme',
        studentName: studentRecord.name // Return the student name at least
      });
    }
    
    return res.json({
      success: true,
      found: true,
      studentName: studentRecord.name,
      themeData
    });
    
  } catch (error) {
    console.error('Error fetching previous theme data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching previous theme data: ' + error.message
    });
  }
}

// Function to get all themes for a student (to show available options)
exports.getStudentThemes = async (req, res) => {
  try {
    const { roll, studentClass, section } = req.query;
    
    if (!roll || !studentClass || !section) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: roll, studentClass, section'
      });
    }
    
    // Find the student record
    const ThemeModel = await getStudentThemeData(studentClass);
    const studentRecord = await ThemeModel.findOne({
      roll,
      studentClass,
      section
    }).lean();
    
    if (!studentRecord) {
      return res.json({
        success: true,
        found: false,
        message: 'No theme data found for this student',
        themes: []
      });
    }
    
    // Extract all themes for this student across subjects
    const allThemes = [];
    
    // Process each subject
    studentRecord.subjects.forEach(subject => {
      if (subject.themes && subject.themes.length > 0) {
        // For each theme in this subject
        subject.themes.forEach(theme => {
          // Add to our theme list
          allThemes.push({
            subject: subject.name,
            name: theme.themeName,
            count: 1,  // Count one evaluation
            updatedAt: theme.updatedAt || studentRecord.updatedAt
          });
        });
      }
    });
    
    // Group themes by name to count multiple evaluations of the same theme
    const groupedThemes = allThemes.reduce((acc, theme) => {
      const existingTheme = acc.find(t => t.name === theme.name);
      if (existingTheme) {
        existingTheme.count += 1;
        // Keep the most recent updated date
        if (theme.updatedAt && (!existingTheme.updatedAt || new Date(theme.updatedAt) > new Date(existingTheme.updatedAt))) {
          existingTheme.updatedAt = theme.updatedAt;
        }
      } else {
        acc.push(theme);
      }
      return acc;
    }, []);
    
    // Sort by most recently updated
    groupedThemes.sort((a, b) => {
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    
    return res.json({
      success: true,
      found: groupedThemes.length > 0,
      studentName: studentRecord.name,
      themes: groupedThemes
    });
    
  } catch (error) {
    console.error('Error fetching student themes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching student themes: ' + error.message
    });
  }
}

exports.editpracticalrubriks = async (req, res, next) => {
  try {
    const { studentClass: classParam ,subject,terminal,section} = req.query;
    if (!classParam || !subject) {
      return res.status(400).send("Student class and subject are required");
    }
      const {studentClass} = req.query;
   
      const practicalFormat = getThemeFormat(studentClass)
    const practicalFormatData = await practicalFormat.find({
      studentClass: studentClass,
      subject: subject
    }).lean();
const subjectData = await newsubject.find({newsubject:subject,forClass:classParam}).lean();
    const model = getThemeFormat(classParam);
    const existingData = await model.findOne({ studentClass: classParam, subject: subject }).lean();
    if (!existingData) {
      return res.status(404).send("Rubrik not found for the specified class and subject");
    }
    const sidenavData = await getSidenavData(req);
    res.render("theme/themefiller", { 
      studentClass: classParam,
      practicalFormatData,
      terminal,
      subject,
      editing: true,
      existingData,
      subjectData,
      accessibleClasses: sidenavData.studentClassdata,
      accessibleSubjects: sidenavData.subjects,
      section

     
      
      
    });
  }catch (err) {
    console.error("Error fetching rubrik for editing:", err);
    res.status(500).send("Internal Server Error");
  }
}

exports.deletepracticalrubriks = async (req, res, next) => {
  const {studentClass, subject, projectId,terminal} = req.query;
  const model = getThemeFormat(studentClass);
  try {
  
    const deletionResult = await model.findByIdAndDelete(projectId);
    if (!deletionResult) {
      return res.status(404).send("Rubrik not found or already deleted");
    }
    console.log(`Rubrik with ID ${projectId} deleted successfully`);
    res.redirect(`/themefillupform?studentClass=${studentClass}&subject=${subject}&terminal=${terminal}`);
  } catch (err) {
    console.error("Error deleting rubrik:", err);
    res.status(500).send("Internal Server Error");
  }

}
exports.getThemeDataFromDB = async (req,res,next) => {
  try {
    const { roll, studentClass, section, subject } = req.query;
    if (!studentClass || !subject) {
      throw new Error("Student class and subject are required");
    }
    const model = await getStudentThemeData(studentClass);
   const existingThemeDataInDB = await model.findOne({
  studentClass,
  roll,
  section,
  "subjects.name": subject   // <---
},
 {
    "subjects": { $elemMatch: { name: subject } }, // only return matching subject
    studentClass: 1,
    roll: 1,
    section: 1,
    name: 1
  }
).lean();

if(!existingThemeDataInDB){
 res.json(null);
}
else
{
 res.json(existingThemeDataInDB);
}
   
  } catch (err) {
    console.error("Error fetching theme data:", err);
    throw err;
  }
};

exports.getTools = async (req, res) => {
  try {
    const { studentClass, subject } = req.query;
    if (!studentClass || !subject) {
      return res.json([]);
    }
    
    // Find document where subject matches and forClass array contains studentClass
    const toolDoc = await ToolsModel.findOne({
      subject: subject,
      forClass: studentClass
    }).lean();

    if (toolDoc && toolDoc.tools) {
      // Return tools sorted alphabetically
      res.json(toolDoc.tools.sort());
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error("Error fetching tools:", err);
    res.status(500).json({ error: "Failed to fetch tools" });
  }
};

exports.addTool = async (req, res) => {
  try {
    const { studentClass, subject, name } = req.body;
    
    if (!studentClass || !subject || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const toolName = name.trim();
    if(!toolName) return res.json({ success: false });

    // Find existing doc
    let toolDoc = await ToolsModel.findOne({
       subject: subject,
       forClass: studentClass 
    });

    if(toolDoc) {
       // Check if tool already exists
       if(!toolDoc.tools.includes(toolName)) {
           toolDoc.tools.push(toolName);
           toolDoc.totaltools = toolDoc.tools.length;
           await toolDoc.save();
           return res.json({ success: true, message: "Tool added to existing list" });
       } else {
           return res.json({ success: true, message: "Tool already exists" });
       }
    } else {
       // Create new
       const newTool = new ToolsModel({
           subject: subject,
           forClass: [studentClass],
           tools: [toolName],
           totaltools: 1
       });
       await newTool.save();
       return res.json({ success: true, message: "New tool list created" });
    }

  } catch (err) {
    console.error("Error saving tool:", err);
    res.status(500).json({ error: "Failed to save tool" });
  }
};

async function getAcademicYear()
{
  const data =  await marksheetSetup.find();
  if (data && data.length > 0) {
      return data[0].academicYear;
  }
  // Default fallback if no setup data exists
  console.warn("No marksheetSetup found, using default academicYear 2082");
  return "2082";
}

exports.autoSaveThemeFillup = async (req, res, next) => {
  try {
    const { studentClass, subject, terminal, themes, credit } = req.body;
    const Practicalmodel =  getThemeFormat(studentClass);
    // Normalize incoming themes structure and defensively remove empty placeholders
    const normalizeThemes = (themesInput) => {
      if (!Array.isArray(themesInput)) return themesInput;
      return themesInput.map(theme => {
        const t = { ...theme };
        const loKey = t.learningOutcome || t.learningOutcomes || [];

        t.learningOutcome = Array.isArray(loKey) ? loKey.map(lo => {
          const newLo = { ...lo };

          // Normalize assessmentAspects -> tools -> indicators and convert marks
          if (Array.isArray(newLo.assessmentAspects)) {
            newLo.assessmentAspects = newLo.assessmentAspects.map(asp => {
              const newAsp = { ...asp };
              if (Array.isArray(newAsp.tools)) {
                newAsp.tools = newAsp.tools.map(tool => {
                  const newTool = { ...tool };
                  if (Array.isArray(newTool.indicators)) {
                    newTool.indicators = newTool.indicators.map(ind => {
                      const newInd = { ...ind };
                      if (newInd.indicatorsMarks !== undefined && (newInd.maxMarks === undefined)) {
                        newInd.maxMarks = Number(newInd.indicatorsMarks) || 0;
                        delete newInd.indicatorsMarks;
                      }
                      // keep indicatorName if present; trim later in filtering
                      return newInd;
                    }).filter(ind => {
                      // remove indicators that have no meaningful name and zero marks
                      const name = (ind.indicatorName || ind.name || '').toString().trim();
                      const hasMarks = (typeof ind.maxMarks === 'number' && ind.maxMarks > 0);
                      return name.length > 0 || hasMarks;
                    });
                  }
                  return newTool;
                }).filter(tool => {
                  // remove tools with no name and no indicators
                  const hasName = (tool.toolName || tool.name || '').toString().trim().length > 0;
                  const hasIndicators = Array.isArray(tool.indicators) && tool.indicators.length > 0;
                  return hasName || hasIndicators;
                });
              }
              return newAsp;
            }).filter(asp => {
              // remove aspects with no name and no tools
              const hasName = (asp.aspectName || asp.name || '').toString().trim().length > 0;
              const hasTools = Array.isArray(asp.tools) && asp.tools.length > 0;
              return hasName || hasTools;
            });
          }

          return newLo;
        }).filter(lo => {
          // remove learning outcomes that are empty placeholders
          const hasName = (lo.learningOutcomeName || lo.name || '').toString().trim().length > 0;
          const hasAspects = Array.isArray(lo.assessmentAspects) && lo.assessmentAspects.length > 0;
          const hasTotal = (typeof lo.totalMarks === 'number' && lo.totalMarks > 0) || (typeof lo.totalMarksBeforeIntervention === 'number' && lo.totalMarksBeforeIntervention > 0);
          return hasName || hasAspects || hasTotal;
        }) : [];

        return t;
      });
    };

    const normalized = normalizeThemes(themes);

    await Practicalmodel.updateOne(
        { studentClass, subject},
        {
        $set: {
          studentClass,
          subject,
          credit,
          themes: normalized,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Autosaved successfully"
    });
    
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
    const model = getThemeFormat(studentClass);
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

exports.addtoolsForm = async (req,res,next) =>
{
  try{
  const {subject,studentClass} = req.query;
  const oldtoolsData = await ToolsModel.find({subject:subject}).lean();
  
  console.log("Subject:", subject, "Student Class:", studentClass);
  const sidenavData = await getSidenavData(req);
  
  res.render('./chapterwise/addtoolsform',{...sidenavData,subject,studentClass,oldtoolsData});
  }catch(err)
  {
    res.status(500).json({ error: err.message });
    console.log(err)
  }
};
exports.saveaddtoolsForm= async (req,res,next) =>
{
  try{
  const {subject,studentClass} = req.query;
 console.log("data",req.body)
await ToolsModel.create(req.body);
  res.redirect(`/addtools?subject=${subject}&studentClass=${studentClass}`);
  }catch(err)
  {
    res.status(500).json({ error: err.message });
    console.log(err)
  }
};
exports.deletetools= async (req,res,next) =>
{
  try{
  const {chapterId,subject,studentClass,index} = req.query;
  const toolToRemove = await ToolsModel.findById(chapterId);
  if (!toolToRemove) {
    return res.status(404).json({ error: 'Tool Group not found' });
  }
  toolToRemove.tools.splice(parseInt(index), 1);

  toolToRemove.totaltools = toolToRemove.tools.length;
  // toolToRemove.subject = subject; // Subject shouldn't change on delete
  await toolToRemove.save();
  res.redirect(`/addtools?subject=${subject}&studentClass=${studentClass}`);
 
  }
  catch(err)
  {
    res.status(500).json({ error: err.message });
    console.log(err)
  }
}

exports.edittools = async (req, res, next) => {
  try {
    const { chapterId, index, newName } = req.body;
    
    if (!newName || newName.trim() === "") {
        return res.status(400).json({ error: "Tool name cannot be empty" });
    }

    const toolDoc = await ToolsModel.findById(chapterId);
    if (!toolDoc) {
      return res.status(404).json({ error: 'Tool document not found' });
    }

    if (index >= 0 && index < toolDoc.tools.length) {
      toolDoc.tools[index] = newName;
      await toolDoc.save();
      return res.status(200).json({ message: 'Tool updated successfully' });
    } else {
      return res.status(400).json({ error: 'Invalid tool index' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err);
  }
};

exports.updatetoolsClasses = async (req, res, next) => {
  try {
    const { chapterId, newClasses } = req.body;

    if (!newClasses || !Array.isArray(newClasses) || newClasses.length === 0) {
      return res.status(400).json({ error: "At least one class must be selected." });
    }

    const toolDoc = await ToolsModel.findById(chapterId);
    if (!toolDoc) {
      return res.status(404).json({ error: 'Tool document not found' });
    }

    toolDoc.forClass = newClasses;
    await toolDoc.save();

    return res.status(200).json({ message: 'Classes updated successfully' });
  } catch (err) {
    console.log("Error in updatetoolsClasses:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.addSingletools = async (req, res, next) => {
  try {
    const { chapterId, toolName } = req.body;

    if (!toolName || toolName.trim() === "") {
        return res.status(400).json({ error: "Tool name cannot be empty" });
    }

    const toolDoc = await ToolsModel.findById(chapterId);
    if (!toolDoc) {
      return res.status(404).json({ error: 'Tool document not found' });
    }

    toolDoc.tools.push(toolName);
    toolDoc.totaltools = toolDoc.tools.length; 
    
    await toolDoc.save();
    return res.status(200).json({ message: 'Tool added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err);
  }
};

exports.deletetoolsGroup = async (req, res, next) => {
  try {
    const { chapterId } = req.body;
    if (!chapterId) {
        return res.status(400).json({ error: "Tool Group ID is required" });
    }
    await ToolsModel.findByIdAndDelete(chapterId);
    return res.status(200).json({ message: 'Tool group deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err);
  }
};

// ---- Assessment Aspect handlers (mirror of tools but different collection/field names) ----
exports.getAspects = async (req, res) => {
  try {
    const { studentClass, subject } = req.query;
    if (!studentClass || !subject) {
      return res.json([]);
    }
    // Prefer AspectContainer collection which stores full aspects/tools/indicators
    const acFilter = { studentClass: String(studentClass), subject: String(subject) };
    const acDoc = await AspectContainer.findOne(acFilter).lean();
    if (acDoc && Array.isArray(acDoc.aspects)) {
      // return array of aspect names for backward compatibility
      const names = acDoc.aspects.map(a => (a && (a.aspectName || a.name)) || '').filter(Boolean).sort();
      return res.json(names);
    }
    // Fallback to legacy AspectsModel if AspectContainer not present
    const aspectDoc = await AspectsModel.findOne({ subject: subject, forClass: studentClass }).lean();
    if (aspectDoc && aspectDoc.aspect) {
      res.json(aspectDoc.aspect.sort());
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error("Error fetching aspects:", err);
    res.status(500).json({ error: "Failed to fetch aspects" });
  }
};

exports.addAspect = async (req, res) => {
  try {
    const { studentClass, subject, name } = req.body;
    if (!studentClass || !subject || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const aspectName = name.trim();
    if(!aspectName) return res.json({ success: false });

    let aspectDoc = await AspectsModel.findOne({ subject: subject, forClass: studentClass });
    if(aspectDoc) {
       if(!aspectDoc.aspect.includes(aspectName)) {
           aspectDoc.aspect.push(aspectName);
           aspectDoc.totalaspect = aspectDoc.aspect.length;
           await aspectDoc.save();
           return res.json({ success: true, message: "Aspect added to existing list" });
       } else {
           return res.json({ success: true, message: "Aspect already exists" });
       }
    } else {
       const newAspect = new AspectsModel({ subject: subject, forClass: [studentClass], aspect: [aspectName], totalaspect: 1 });
       await newAspect.save();
       return res.json({ success: true, message: "New aspect list created" });
    }
  } catch (err) {
    console.error("Error saving aspect:", err);
    res.status(500).json({ error: "Failed to save aspect" });
  }
};
exports.addaspectForm = async (req,res,next) =>
{
  try{
    const {subject,studentClass} = req.query;
    const oldaspectsData = await AspectsModel.find({subject:subject}).lean();
    const sidenavData = await getSidenavData(req);
    res.render('./chapterwise/addaspectform',{...sidenavData,subject,studentClass,oldaspectsData});
  }catch(err)
  {
    res.status(500).json({ error: err.message });
    console.log(err)
  }
};
exports.saveaddaspectForm= async (req,res,next) =>
{
  try{
    const {subject,studentClass} = req.query;
    await AspectsModel.create(req.body);
    res.redirect(`/addaspect?subject=${subject}&studentClass=${studentClass}`);
  }catch(err)
  {
    res.status(500).json({ error: err.message });
    console.log(err)
  }
};
exports.deleteaspects= async (req,res,next) =>
{
  try{
    const {chapterId,subject,studentClass,index} = req.query;
    const doc = await AspectsModel.findById(chapterId);
    if (!doc) {
      return res.status(404).json({ error: 'Aspect Group not found' });
    }
    doc.aspect.splice(parseInt(index), 1);
    doc.totalaspect = doc.aspect.length;
    await doc.save();
    res.redirect(`/addaspect?subject=${subject}&studentClass=${studentClass}`);
  }
  catch(err)
  {
    res.status(500).json({ error: err.message });
    console.log(err)
  }
}

exports.editaspects = async (req, res, next) => {
  try {
    const { chapterId, index, newName } = req.body;
    if (!newName || newName.trim() === "") {
        return res.status(400).json({ error: "Aspect name cannot be empty" });
    }
    const doc = await AspectsModel.findById(chapterId);
    if (!doc) {
      return res.status(404).json({ error: 'Aspect document not found' });
    }
    if (index >= 0 && index < doc.aspect.length) {
      doc.aspect[index] = newName;
      await doc.save();
      return res.status(200).json({ message: 'Aspect updated successfully' });
    } else {
      return res.status(400).json({ error: 'Invalid aspect index' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err);
  }
};

exports.updateaspectsClasses = async (req, res, next) => {
  try {
    const { chapterId, newClasses } = req.body;
    if (!newClasses || !Array.isArray(newClasses) || newClasses.length === 0) {
      return res.status(400).json({ error: "At least one class must be selected." });
    }
    const doc = await AspectsModel.findById(chapterId);
    if (!doc) {
      return res.status(404).json({ error: 'Aspect document not found' });
    }
    doc.forClass = newClasses;
    await doc.save();
    return res.status(200).json({ message: 'Classes updated successfully' });
  } catch (err) {
    console.log("Error in updateaspectsClasses:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.addSingleaspect = async (req, res, next) => {
  try {
    const { chapterId, toolName } = req.body;
    if (!toolName || toolName.trim() === "") {
        return res.status(400).json({ error: "Aspect name cannot be empty" });
    }
    const doc = await AspectsModel.findById(chapterId);
    if (!doc) {
      return res.status(404).json({ error: 'Aspect document not found' });
    }
    doc.aspect.push(toolName);
    doc.totalaspect = doc.aspect.length; 
    await doc.save();
    return res.status(200).json({ message: 'Aspect added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err);
  }
};

exports.deleteaspectsGroup = async (req, res, next) => {
  try {
    const { chapterId } = req.body;
    if (!chapterId) {
        return res.status(400).json({ error: "Aspect Group ID is required" });
    }
    await AspectsModel.findByIdAndDelete(chapterId);
    return res.status(200).json({ message: 'Aspect group deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err);
  }
};