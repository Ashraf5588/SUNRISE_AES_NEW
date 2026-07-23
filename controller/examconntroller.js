const path = require("path");
const multer = require('multer')
const fs= require("fs");
const csv = require("csv-parser");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema } = require("../model/schema");
const { studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema,terminalSchema,newsubjectSchema } = require("../model/adminschema");
const {examSchema}= require("../model/examschema");
const { onlineAttendanceSchema } = require("../model/onlineattendanceschema");
const { holidaySchema } = require("../model/holidayschema");
const bs = require("bikram-sambat-js");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentClassModel = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");
const bcrypt = require("bcrypt");
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const terminalModel = mongoose.model("terminal", terminalSchema, "terminal");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const { marksheetsetupschemaForAdmin } = require("../model/marksheetschema");

const upload = multer({ dest: "uploads/" });
const onlineAttendance = mongoose.model("onlineAttendance", onlineAttendanceSchema, "onlineAttendance");
const holiday = mongoose.model("holiday", holidaySchema, "holiday");

const { addChapterSchema } = require("../model/addchapterschema");
const addChapter = mongoose.model("addChapter", addChapterSchema, "addChapter");



const {ThemeEvaluationSchema,practicalSchema,scienceprojectSchema, practicalprojectSchema} = require("../model/themeformschema");
const {themeSchemaFor1,scienceSchema,FinalPracticalSlipSchema} = require("../model/themeschema");
const { get } = require("http");
const student = require("../routers/mainpage");

const marksheetSetup = mongoose.models.marksheetSetup || mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");

const { BlobServiceClient } = require("@azure/storage-blob");
const sharp = require("sharp");
require("dotenv").config();



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

const getSubjectSlipModelForPractical = (subject, studentClass, section, terminal, year) => {
  // to Check if model already exists
  if (mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`]) {
    return mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`];
  }
  return mongoose.model(`Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`, FinalPracticalSlipSchema, `Practicalproject_${subject}_${studentClass}_${section}_${terminal}_${year}`);
};

const BS_MONTH_NAMES = {
  1: "Baisakh",
  2: "Jestha",
  3: "Asar",
  4: "Shrawan",
  5: "Bhadra",
  6: "Ashwin",
  7: "Kartik",
  8: "Mangsir",
  9: "Poush",
  10: "Magh",
  11: "Falgun",
  12: "Chaitra"
};

const BS_MONTH_LENGTHS = {
  Baisakh: 30,
  Jestha: 31,
  Asar: 31,
  Shrawan: 31,
  Bhadra: 30,
  Ashwin: 30,
  Kartik: 29,
  Mangsir: 29,
  Poush: 30,
  Magh: 29,
  Falgun: 30,
  Chaitra: 30
};

const MONTH_KEY_ALIASES = {
  asar: "Asar",
  ashar: "Asar",
  ashadh: "Asar",
  baisakh: "Baisakh",
  jestha: "Jestha",
  shrawan: "Shrawan",
  bhadra: "Bhadra",
  ashwin: "Ashwin",
  ashoj: "Ashwin",
  kartik: "Kartik",
  mangsir: "Mangsir",
  poush: "Poush",
  magh: "Magh",
  falgun: "Falgun",
  chaitra: "Chaitra"
};
const getPracticalProjectModel = (subject, studentClass, section, year) => {
  // to Check if model already exists
  if (mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${year}`]) {
    return mongoose.models[`Practicalproject_${subject}_${studentClass}_${section}_${year}`];
  }
  return mongoose.model(`Practicalproject_${subject}_${studentClass}_${section}_${year}`, practicalprojectSchema, `Practicalproject_${subject}_${studentClass}_${section}_${year}`);
};
const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getStatusIsAbsent = (status) => {
  const normalizedStatus = normalizeText(status);
  return ["absent", "a", "false", "0"].includes(normalizedStatus);
};

const getCanonicalMonthName = (monthName) => {
  return MONTH_KEY_ALIASES[normalizeText(monthName)] || String(monthName || "").trim();
};

const getBsMonthNumber = (monthName) => {
  const canonicalMonthName = getCanonicalMonthName(monthName);
  const monthEntry = Object.entries(BS_MONTH_NAMES).find(([, value]) => normalizeText(value) === normalizeText(canonicalMonthName));
  return Number.parseInt(monthEntry?.[0], 10) || 0;
};

const getBsMonthLength = (monthName) => {
  return BS_MONTH_LENGTHS[String(monthName || "").trim()] || 30;
};

const getSlipModel = () => {
  // to Check if model already exists
  if (mongoose.models[`exam_marks`]) {
    return mongoose.models[`exam_marks`];
  }
  return mongoose.model(`exam_marks`, examSchema, `exam_marks`);
};
const getSubjectModel = (subjectinput, studentClass, section, terminal) => {
  // to Check if model already exists
  if (mongoose.models[`${subjectinput}_${studentClass}_${section}_${terminal}`]) {
    return mongoose.models[`${subjectinput}_${studentClass}_${section}_${terminal}`];
  }
  return mongoose.model(`${subjectinput}_${studentClass}_${section}_${terminal}`, studentSchema, `${subjectinput}_${studentClass}_${section}_${terminal}`);
};

exports.loadForm = async (req,res,next)=>
{
    const subject = await newsubject.find({}).lean();
    const studentClassdata = await studentClass.find({}).lean();
 
    const user = req.user;
    
    // Debug logging
 

    let accessibleSubject =[];
    let accessibleClass=[];
    if(user.role==="ADMIN")
    {
      accessibleSubject = subject;
      accessibleClass = studentClassdata;
    }
    else
    {
     accessibleSubject = subject.filter(subject =>
        user.allowedSubjects.some(allowed => {
          const allowedName = allowed.subject.trim().toUpperCase();
          const dbName = subject.newsubject.trim().toUpperCase();
          
          // Handle exact match
          if (allowedName === dbName) return true;
          
          // Handle specific typo (MATHEMATICES -> MATHEMATICS)
          if (allowedName === 'MATHEMATICES' && dbName === 'MATHEMATICS') return true;
          
          return false;
        })
      );
      accessibleClass = studentClassdata.filter(studentclass =>
        user.allowedSubjects.some(allowed =>
          allowed.studentClass === studentclass.studentClass &  allowed.section === studentclass.section
        )
      );
    }
    console.log("Accessible Subjects:", accessibleSubject);
   const marksheetSetups = await marksheetSetup.find({}).lean();
    res.render("./exam/formloader", { 
      currentPage: "home",
      subjects: accessibleSubject, 
      studentClassdata:accessibleClass,
  
      marksheetSetups,
      user,
    });

}
exports.entryform = async (req,res,next)=>

{


   const studentClassdata = await studentClassModel.find({}).lean();
   
  const {studentClass,section,subject,academicYear,terminal}= req.query;
  const model = getSubjectModel(subject, studentClass, section, terminal);
const theoryData = await model.find({}).lean();


  const studentData = await studentRecord.find({studentClass:studentClass,section:section})
     const marksheetSetups = await marksheetSetup.find({}).lean();
     
  const subjectData = await newsubject.find({forClass:studentClass,newsubject:subject}).lean();
 
  const subjects = await newsubject.find({}).lean();
  const terminals = await terminalModel.find({}).lean();
   const user = req.user;
    let accessibleSubject =[];
    let accessibleClass=[];
    if(user.role==="ADMIN")
    {
      accessibleSubject = subjects;
      accessibleClass = studentClassdata;
    }
    else
    {
     accessibleSubject = subjects.filter(subject =>
        user.allowedSubjects.some(allowed =>
          allowed.subject === subject.newsubject
        )
      );
      accessibleClass = studentClassdata.filter(studentclass =>
        user.allowedSubjects.some(allowed =>
          allowed.studentClass === studentclass.studentClass &  allowed.section === studentclass.section
        )
      );
    }
  if(studentClass>3|| studentClass=="SIX" || studentClass=="Six" || studentClass=="six" || studentClass=="6" || studentClass=="SEVEN" || studentClass=="Seven" || studentClass=="seven" || studentClass=="7" || studentClass=="EIGHT" || studentClass=="Eight" || studentClass=="eight" || studentClass=="8" || studentClass=="NINE" || studentClass=="Nine" || studentClass=="nine" || studentClass=="9" || studentClass=="TEN" || studentClass=="Ten" || studentClass=="ten" || studentClass=="10")
  {

  res.render("./exam/entryform",{studentData,studentClass,section,subject,academicYear,terminal,subjectData,subjects:accessibleSubject,studentClassdata:accessibleClass,terminals, marksheetSetups,theoryData});
  }
  if(studentClass=="FOUR" || studentClass=="Four" || studentClass=="four" || studentClass=="4" || studentClass=="FIVE" || studentClass=="Five" || studentClass=="five" || studentClass=="5")
  {
    res.render("./exam/entryformfourfive",{studentData,studentClass:studentClass,section,subject,academicYear,terminal,subjectData,subjects:accessibleSubject,studentClassdata:accessibleClass,terminals, marksheetSetups,user,theoryData});
  }
  else if (studentClass<=3 || studentClass=="THREE" || studentClass=="Three" || studentClass=="three" || studentClass=="3" || studentClass=="TWO" || studentClass=="Two" || studentClass=="two" || studentClass=="2" || studentClass=="ONE" || studentClass=="One" || studentClass=="one" || studentClass=="1")
  {
    res.render("./exam/entryformprimary",{studentData,studentClass:studentClass,section,subject,academicYear,terminal,subjectData,subjects:accessibleSubject,studentClassdata:accessibleClass,terminals, marksheetSetups,user,theoryData});
  }
  else if(studentClass.toLowerCase() === "nursery" || studentClass.toLowerCase() === "playgroup" || studentClass.toLowerCase() === "lkg" || studentClass.toLowerCase() === "ukg")
  {
    res.render("./exam/entryformpreprimary",{studentData,studentClass:studentClass,section,subject,academicYear,terminal,subjectData,subjects:accessibleSubject,studentClassdata:accessibleClass,terminals, marksheetSetups,user,theoryData});
  }
 
}
exports.saveEntryform = async (req, res, next) => {
  try {
    let { studentClass, section, subject, academicYear, terminal } = req.query;

    // Fallback to body if query params are missing
    if (!studentClass) studentClass = req.body.studentClass;
    if (!section) section = req.body.section;
    if (!subject) subject = req.body.subject;
    if (!academicYear) academicYear = req.body.academicYear;
    if (!terminal) terminal = req.body.terminal;

    console.log("[Backend] ====== SAVE ENTRYFORM ======");
    console.log("[Backend] Query params:", { studentClass, section, subject, academicYear, terminal });
    console.log("[Backend] Body - reg:", req.body.reg, "totalWorksheet:", req.body.totalWorksheet);

    const model = getSlipModel();
    
    const updateQuery = {
      reg: req.body.reg,
      subject: subject,
      terminal: terminal,
      academicYear: academicYear,
      studentClass: studentClass,
      section: section,
    };
    
    const updateData = {
      $set: {
        reg: req.body.reg,
        roll:  req.body.roll,
        name: req.body.name,
        theorymarks: Number(req.body.theorymarks) || 0,
        practicalmarks: Number(req.body.practicalmarks) || 0,
        totalpracticalmarks: Number(req.body.totalpracticalmarks) || 0,
        attendance: Number(req.body.attendance) || 0,
        terminal: terminal,
        subject: subject,
        theoryfullmarks: Number(req.body.theoryfullmarks) || 0,
        passMarks: Number(req.body.passMarks) || 0,
        practicalfullmarks: Number(req.body.practicalfullmarks) || 0,
        studentClass: studentClass,
        section: section,
        academicYear: academicYear,
        participationMarks: Number(req.body.participationMarks) || 0,
        gender: req.body.gender || "",
        totalWorksheet: Number(req.body.totalWorksheet) || 0,
        worksheetGrades: req.body.worksheetGrades || [],
        terminalmarks: Number(req.body.terminalmarks) || 0,
      },
    };
    
    console.log("[Backend] Updating doc with query:", JSON.stringify(updateQuery));
    console.log("[Backend] Setting totalWorksheet to:", updateData.$set.totalWorksheet);

    const result = await model.updateOne(updateQuery, updateData, { upsert: true });
    
    console.log("[Backend] Update result:", result);
    console.log("[Backend] ✓ Data saved successfully (matched:", result.matchedCount, ", upserted:", result.upsertedCount, ")");
    console.log("[Backend] ====== END SAVE ======");
    
    res.json({ success: true, result: result });

  } 
  catch (err) {
    console.error("[Backend] ✗ Error saving entry form:", err);
    res.status(500).json({success: false, error: err.message});
  }
};

exports.getPreviousmarks= async (req,res,next)=>
{
  try{
    const {subject,studentClass,section,academicYear,terminal}= req.query;
    
    console.log("\n[Backend] ====== GET PREVIOUSMARKS ======");
    console.log("[Backend] Query params received:");
    console.log(`  - subject: "${subject}"`);
    console.log(`  - studentClass: "${studentClass}"`);
    console.log(`  - section: "${section}"`);
    console.log(`  - academicYear: "${academicYear}"`);
    console.log(`  - terminal: "${terminal}"`);
    
    // Query exam_marks collection
    const model = getSlipModel();
    console.log(`[Backend] Using collection: exam_marks`);
    
    const findQuery = {
      subject: subject,
      terminal: terminal,
      studentClass: studentClass,
      section: section,
      academicYear: academicYear
    };
    
    console.log(`[Backend] Find query: ${JSON.stringify(findQuery)}`);
    
    const previousMarks = await model.find(findQuery).lean();
    
    console.log(`[Backend] ✓ Found ${previousMarks.length} records`);
    if (previousMarks.length > 0) {
      console.log("[Backend] 📊 First record data:");
      console.log(`  - reg: ${previousMarks[0].reg}`);
      console.log(`  - totalWorksheet: ${previousMarks[0].totalWorksheet}`);
      console.log(`  - worksheetGrades: ${JSON.stringify(previousMarks[0].worksheetGrades)}`);
      console.log("[Backend] Full first record:", JSON.stringify(previousMarks[0], null, 2));
    } else {
      console.warn("[Backend] ⚠️ No records found in exam_marks collection");
    }
    console.log("[Backend] ====== END GET PREVIOUSMARKS ======\n");

    res.json(previousMarks);
  }
  catch(err)
  {
    console.error("[Backend] ✗ Error fetching previous marks:", err);
    res.status(500).json({error:"Internal Server Error"});
  }
}
exports.getAttendanceData= async (req,res,next)=>
{
  try{
    const {studentClass,section,academicYear} = req.query;

    if (!studentClass || !section || !academicYear) {
      return res.json([]);
    }

    const normalizedAcademicYear = String(academicYear).trim();
    const currentBsDate = String(bs.ADToBS(new Date()) || "").trim();
    const [currentNepaliYear, currentNepaliMonthNumber, currentNepaliDayNumber] = currentBsDate.split("-");
    const currentNepaliMonth = BS_MONTH_NAMES[Number.parseInt(currentNepaliMonthNumber, 10)] || "";
    const currentDay = Number.parseInt(currentNepaliDayNumber, 10) || 0;
    const currentMonthNumber = Number.parseInt(currentNepaliMonthNumber, 10) || 0;

    const holidayDoc = await holiday.findOne({ academicYear: normalizedAcademicYear }).lean();
    const holidayMonthMap = new Map(
      Array.isArray(holidayDoc?.month)
        ? holidayDoc.month.map((monthItem) => [getCanonicalMonthName(monthItem?.monthName), Array.isArray(monthItem?.holidayDays) ? monthItem.holidayDays.map((dayValue) => Number(dayValue)) : []])
        : []
    );

    let totalWorkingDaysUptoToday = 0;
    for (let monthIndex = 1; monthIndex <= currentMonthNumber; monthIndex += 1) {
      const monthName = BS_MONTH_NAMES[monthIndex];
      const monthLength = getBsMonthLength(monthName);
      const monthDayLimit = monthIndex === currentMonthNumber ? currentDay : monthLength;
      const holidayDaysForMonth = holidayMonthMap.get(getCanonicalMonthName(monthName)) || [];
      const holidayDaysUntilLimit = holidayDaysForMonth.filter((dayValue) => Number.isFinite(dayValue) && dayValue <= monthDayLimit);

      totalWorkingDaysUptoToday += Math.max(monthDayLimit - holidayDaysUntilLimit.length, 0);
    }

    const onlineAttendanceDocs = await onlineAttendance
      .find({ studentClass: String(studentClass).trim(), section: String(section).trim(), academicYear: normalizedAcademicYear })
      .lean();

    const calculatedAttendance = onlineAttendanceDocs.map((onlineDoc) => {
      const reg = String(onlineDoc?.reg || "").trim();
      const attendanceEntries = Array.isArray(onlineDoc?.attendance) ? onlineDoc.attendance : [];

      let absentDays = 0;
      attendanceEntries.forEach((entry) => {
        const entryAcademicYear = String(entry?.academicYear || "").trim();
        if (entryAcademicYear !== normalizedAcademicYear) {
          return;
        }

        const entryMonthName = String(entry?.month || "").trim();
        const entryMonthNumber = getBsMonthNumber(entryMonthName);
        if (!entryMonthNumber || entryMonthNumber > currentMonthNumber) {
          return;
        }

        const entryDay = Number.parseInt(entry?.day, 10);
        if (!Number.isFinite(entryDay)) {
          return;
        }

        const monthDayLimit = entryMonthNumber === currentMonthNumber ? currentDay : getBsMonthLength(BS_MONTH_NAMES[entryMonthNumber]);
        if (entryDay > monthDayLimit) {
          return;
        }

        const holidayDaysForMonth = holidayMonthMap.get(getCanonicalMonthName(entryMonthName)) || [];
        if (holidayDaysForMonth.includes(entryDay)) {
          return;
        }

        if (getStatusIsAbsent(entry?.status)) {
          absentDays += 1;
        }
      });

      const presentDays = Math.max(totalWorkingDaysUptoToday - absentDays, 0);

      return {
        reg,
        roll: onlineDoc?.roll || "",
        name: onlineDoc?.name || "",
        gender: onlineDoc?.gender || "",
        attendance: presentDays,
        totalWorkingDaysUptoToday,
        holidayDaysInAcademicYear: (holidayDoc?.month || []).reduce((count, monthItem) => count + (Array.isArray(monthItem?.holidayDays) ? monthItem.holidayDays.length : 0), 0),
        absentDays,
        currentMonth: currentNepaliMonth,
        currentDay,
        currentAcademicYear: normalizedAcademicYear,
      };
    });

    res.json(calculatedAttendance);
  }
  catch(err)
  {
    console.error("Error fetching attendance data:", err);
    res.status(500).json({error:"Internal Server Error"});
  }
}
exports.uploadOldDataPost = async (req, res, next) => {
  try {

if(!req.file)
{
  return res.status(400).send("No file uploaded");
}
const result = [];
fs.createReadStream(req.file.path) //it read the content of file chunk by chunk
.pipe(csv( { separator: ",",mapHeaders: ({ header }) => header.trim()  }))//it convert line itno comma separated value
.on("data",(row)=>{ // for every uunique data it will call function

 
  result.push(
    {

      reg: row.reg ? row.reg.trim() : (row['reg '] ? row['reg '].trim() : ''),
      roll: row.roll ? row.roll.trim() : '',
      name: row.name ? row.name.trim() : '',
      studentClass: row.studentClass ? row.studentClass.trim() : '',
      section: row.section ? row.section.trim() : '',
      academicYear: row.academicYear ? row.academicYear.trim() : '',
      terminal: row.terminal ? row.terminal.trim() : '',
      subject: row.subject ? row.subject.trim() : '',
      theorymarks: Number(row.theorymarks) || 0,
      practicalmarks: Number(row.practicalmarks) || 0,
      attendance: Number(row.attendance) || 0,
      gender: row.gender || "",
      passMarks: Number(row.passMarks) || 0,
      theoryfullmarks: Number(row.theoryfullmarks) || 0,
      practicalfullmarks: Number(row.practicalfullmarks) || 0,
    }
  )

}).on("end",async()=>{
  try{
const model = getSlipModel();
await model.insertMany(result);
fs.unlinkSync(req.file.path);
res.redirect("/uploadolddata?success=true");

  }catch(err){
    console.error("Error processing CSV data:", err);
    return res.status(500).send("Internal Server Error");
  }

})

  } catch (error) {
    console.error("Error uploading old data:", error);
    res.status(500).send("Internal Server Error");
  }
};

// Show parent analysis form
exports.parentsDataForm = async (req, res, next) => {
  try {
    const studentClassdata = await studentClass.find({}).lean();
    const user = req.user;
    
    let accessibleClass = [];
    if(user.role === "ADMIN") {
      accessibleClass = studentClassdata;
    } else {
      accessibleClass = studentClassdata.filter(studentclass =>
        user.allowedSubjects.some(allowed =>
          allowed.studentClass === studentclass.studentClass && allowed.section === studentclass.section
        )
      );
    }
    
    res.render("./exam/parentsdatae", { 
      currentPage: "parents-analysis",
      studentClassdata: accessibleClass,
      user,
    });
  } catch (error) {
    console.error("Error loading parents data form:", error);
    res.status(500).send("Internal Server Error");
  }
};

// Helper function to count set bits
const countSetBits = (n) => {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
};

// Analyze parents with children in multiple groups
exports.analyzeParentsData = async (req, res, next) => {
  try {
    const { groups } = req.body;
    
    // groups should be an array of arrays: [[class1, class2...], [class3, class4...], ...]
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ error: "Invalid groups data" });
    }

    // Get all students with their parent info
    const allStudents = await studentRecord.find({}).lean();

    // Create a map of parents -> their children by group
    const parentGroupMap = new Map();

    allStudents.forEach(student => {
      // Use fatherName and address as unique parent identifier
      const parentId = `${student.fatherName || student.motherName || 'Unknown'}-${student.address || 'Unknown'}`;
      
      if (!parentGroupMap.has(parentId)) {
        parentGroupMap.set(parentId, {
          parentName: student.fatherName || student.motherName || 'Unknown',
          address: student.address || '',
          groups: new Array(groups.length).fill(null).map(() => []),
          allData: student
        });
      }

      const parentData = parentGroupMap.get(parentId);
      
      // Check which group this student belongs to
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].includes(student.studentClass)) {
          parentData.groups[i].push({
            name: student.name,
            class: student.studentClass,
            section: student.section,
            roll: student.roll,
            reg: student.reg
          });
        }
      }
    });

    // Analyze combinations
    const results = [];
    const totalGroups = groups.length;

    // Generate all possible combinations
    for (let mask = 1; mask < (1 << totalGroups); mask++) {
      if (countSetBits(mask) < 2) continue; // Skip single groups
      
      const activeGroups = [];
      for (let i = 0; i < totalGroups; i++) {
        if (mask & (1 << i)) {
          activeGroups.push(i);
        }
      }

      const combination = {
        groupIndices: activeGroups,
        groupLabels: activeGroups.map(i => `Group ${i + 1} (${groups[i].join(', ')})`).join(' & '),
        parents: [],
        count: 0
      };

      // Find parents with children in all groups of this combination
      for (const [parentId, parentData] of parentGroupMap) {
        const hasAllGroups = activeGroups.every(groupIdx => parentData.groups[groupIdx].length > 0);
        
        if (hasAllGroups) {
          combination.parents.push({
            parentName: parentData.parentName,
            address: parentData.address,
            children: activeGroups.flatMap(groupIdx => parentData.groups[groupIdx])
          });
          combination.count++;
        }
      }

      if (combination.parents.length > 0) {
        results.push(combination);
      }
    }

    res.json({
      success: true,
      groups: groups,
      totalCombinations: results.length,
      results: results
    });

  } catch (error) {
    console.error("Error analyzing parents data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.analysisOfParents = async (req, res, next) => { 
  try {

    const aggregatedData = await studentRecord.aggregate([
      {
        $match:{
          
        }
      }
    ])
    res.json(aggregatedData);



  }catch (error) {
    console.error("Error in analysis of parents:", error);
    res.status(500).json({error:"Internal Server Error"});
  }
};

//api to get practical data from theme collections
exports.getPracticalSlipData = async (req, res, next) => {
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

              
 
       res.render("theme/projectpracticalslipfinal", {...await getSidenavData(req), editing: false, studentClass, section, subject, sciencepracticaldata, lessonData,terminal,marksheetSetting});
     }
     
     else
     { 
       const marksheetSetting = await marksheetSetup.find();
       const academicYear = marksheetSetting[0].academicYear;
        const model = getPracticalProjectModel(subject, studentClass, section,  academicYear);
         const sciencepracticaldata = await model.find({studentClass:studentClass,terminalName:terminal,subject:subject});
       
      const lessonData = await ScienceModel.find({studentClass:studentClass,terminal:terminal,subject:subject});
      const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
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
       const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
     
      
      
     
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
 
     
       const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
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
 
      const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
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
 
     
      const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
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
 
     
       const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
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
 
     const marksMap = {};
        sciencepracticaldata.forEach((student, index) => { 
       let totalGivenAllPractical = 0;
      let totalGivenAllProject = 0;
      let totalObtainedAllPractical = 0;
      let totalObtainedAllProject = 0;
      let totalDoneAllPractical = 0;
      let totalDoneAllProject = 0;
       let totalPractical =0;
       let totalPracticalproject = 0;
        
    

      lessonData.forEach((lesson) => { 
     lesson.units.forEach((unit, uIndex) => { 
          // Find corresponding unit in student data safely
          const studentUnit = student.unit?.find(u => u.unitName === unit.unitName) || { practicals: [], projectWorks: [] };

          // Practical counts & marks
          const totalPracticalGiven = unit.practicals?.length || 0;
          const totalPracticalDone = studentUnit.practicals?.length || 0;
          const obtainedPracticalMarks = studentUnit.practicals?.reduce((sum, p) => sum + (p.practicalMarks || 0), 0);

          // Project counts & marks
          const totalProjectGiven = unit.projectworks?.length || 0;
          const totalProjectDone = studentUnit.projectWorks?.length || 0;
          const obtainedProjectMarks = studentUnit.projectWorks?.reduce((sum, p) => sum + (p.projectMarks || 0), 0);

 totalGivenAllPractical += totalPracticalGiven; 
totalGivenAllProject += totalProjectGiven; 
 totalObtainedAllPractical += obtainedPracticalMarks; 
 totalObtainedAllProject += obtainedProjectMarks; 
 totalDoneAllPractical += totalPracticalDone; 
 totalDoneAllProject += totalProjectDone; 

         })
      }) 

if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
totalPracticalproject = (((((totalObtainedAllPractical/10)*10) + (((totalObtainedAllProject)/6)*6))) / lessonData[0].units.length) 
}else{
  totalPracticalproject = (((((totalObtainedAllPractical/10)*20) + (((totalObtainedAllProject)/8)*16))) / lessonData[0].units.length) 
}

          

  if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
           totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/25*100 
            }else{
                   totalPractical = (student.attendanceMarks+student.participationMarks+ totalPracticalproject
           +student.terminalMarks)/50*100
             }
               if(studentClass>8 || studentClass=="Nine" || studentClass=="Ten" || studentClass=="TEN" || studentClass=="9" || studentClass=="10" || studentClass=="nine" || studentClass=="ten" ){
               totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/25*100) 
               }else{
                totalPractical = ((student.attendanceMarks + student.participationMarks +
               totalPracticalproject + student.terminalMarks)/50*100) 
               }
               marksMap[student.reg] = {
        practicalMarks: totalPracticalproject, // This is the value to show in entry form
        attendanceMarks: student.attendanceMarks || 0,
        participationMarks: student.participationMarks || 0,
        terminalMarks: student.terminalMarks || 0,
        totalMarks: student.attendanceMarks + student.participationMarks + 
          totalPracticalproject + (student.terminalMarks || 0),
        totalPercentage: totalPractical,
        totalObtainedAllPractical: totalObtainedAllPractical,
        totalObtainedAllProject: totalObtainedAllProject,
        
      };

  });
   
    
     
    res.json({
      success: true,
      marks: marksMap,
      subject: subject,
      studentClass: studentClass,
      section: section,
      terminal: terminal,
      academicYear: academicYear
    });
 
     }
   
 }
 }catch(err)
 {
 console.log(err);
 res.status(500).json({error:"Internal server error",details: err.message});
 }
}