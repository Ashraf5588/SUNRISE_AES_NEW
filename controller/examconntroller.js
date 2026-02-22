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
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const upload = multer({ dest: "uploads/" });
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
console.log("Theory Data:", theoryData);

  const studentData = await studentRecord.find({studentClass:studentClass,section:section})
     const marksheetSetups = await marksheetSetup.find({}).lean();
     console.log("studentData",studentData);
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
  if(studentClass>3)
  {

  res.render("./exam/entryform",{studentData,studentClass,section,subject,academicYear,terminal,subjectData,subjects:accessibleSubject,studentClassdata:accessibleClass,terminals, marksheetSetups,theoryData});
  }
  else if (studentClass<=3)
  {
    res.render("./exam/entryformprimary",{studentData,studentClass:studentClass,section,subject,academicYear,terminal,subjectData,subjects:accessibleSubject,studentClassdata:accessibleClass,terminals, marksheetSetups,user});
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

    const model = getSlipModel();
await model.updateOne(
      {
        reg: req.body.reg,
        subject: subject,
        terminal: terminal,
        academicYear: academicYear,
        studentClass: studentClass,
        section: section,
      },
      {
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
          gender: req.body.gender || "",
          totalWorksheet: Number(req.body.totalWorksheet) || 0,
          worksheetGrades: req.body.worksheetGrades || [],
          terminalmarks: Number(req.body.terminalmarks) || 0,
        },
      },
      { upsert: true }
    );
     res.json({ success: true });

  } 
  catch (err) {
    console.error("Error saving entry form:", err);
    res.status(500).send("Internal Server Error");
  }
};

exports.getPreviousmarks= async (req,res,next)=>
{
  try{
    const {subject,studentClass,section,academicYear,terminal}= req.query;
    const model = getSlipModel();
    const previousMarks = await model.find({subject:subject,terminal:terminal,studentClass:studentClass,section:section,academicYear:academicYear}).lean();

    res.json(previousMarks);
  }
  catch(err)
  {
    console.error("Error fetching previous marks:", err);
    res.status(500).json({error:"Internal Server Error"});
  }
}
exports.getAttendanceData= async (req,res,next)=>
{
  try{
    const {studentClass,section,academicYear,terminal}= req.query;
    const attendanceModel = getSlipModel();
    const attendanceData = await attendanceModel.find({terminal:terminal,studentClass:studentClass,section:section,academicYear:academicYear}).lean();
    res.json(attendanceData);
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

  console.log("Row Data:", row); // Debug logging
  result.push(
    {

      reg: row.reg?.trim() || row['reg ']?.trim(),
      roll: row.roll?.trim(),
      name: row.name?.trim(),
      studentClass: row.studentClass?.trim(),
      section: row.section?.trim(),
      academicYear: row.academicYear?.trim(),
      terminal: row.terminal?.trim(),
      subject: row.subject?.trim(),
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