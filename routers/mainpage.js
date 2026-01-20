const express = require('express');
const student = express.Router();
const controller = require('../controller/controller')
const newscontroller = require('../controller/newscontroller')
const examcontroller = require('../controller/examconntroller')
const multer  = require('multer')
const examdashboardcontroller = require('../controller/examdashboardcontroller')
const practical410controller = require('../controller/practical410controller')
const themecontroller = require('../controller/themecontroller')

const {verifytoken,authorized,isAdmin,isnewsAdmin}=require('../middleware/auth')

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/') 
    // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    
    cb(null, Date.now() + '-' + file.originalname)
     // Use original name or modify as needed

  }
 //exports filename to controller.js
})

const upload = multer({ storage: storage })


const {authenticateToken} = require('../middleware/loginmiddleware')

const {authenticateTokenStudent} = require('../middleware/loginmiddleware')
const admincontrol = require('../controller/admincontroller');
const { verify } = require('jsonwebtoken');




// Secure password reset route
student.post('/reset-password', verifytoken, authorized, isAdmin, admincontrol.resetPassword);

student.get('/admin/login',admincontrol.adminlogin)
student.post('/admin/login',admincontrol.adminloginpost)

student.get('/',verifytoken,authorized,controller.homePage)

student.get('/admin/term/:terminal',verifytoken,authorized,isAdmin,admincontrol.admin)
student.get('/report',verifytoken,authorized,isAdmin,admincontrol.report)
student.get('/reportprint',verifytoken,authorized,isAdmin,admincontrol.reportprint)
student.get('/newform',verifytoken,authorized,controller.newform)

student.get('/admin/marksheetsetup',verifytoken,authorized,isAdmin,admincontrol.marksheetSetupForm)
student.post('/admin/marksheetsetup',verifytoken,authorized,isAdmin,admincontrol.marksheetSetupSave)

student.get('/admin/subject/:subId?',verifytoken,authorized,admincontrol.showSubject)

student.post('/admin/subjectadd/:subId?',verifytoken,authorized,upload.single('questionPaperOfClass'),admincontrol.addSubject)
student.get('/admin/get_subject_data',verifytoken,admincontrol.subjectData)

student.get('/admin/class/:classId?',verifytoken,authorized,isAdmin,admincontrol.showClass)
student.post('/admin/class/:classId?',verifytoken,authorized,isAdmin,admincontrol.addClass)
student.get('/admin/terminal',verifytoken,authorized,isAdmin,admincontrol.addTerminal)
student.post('/admin/terminal/:terminalId?',verifytoken,authorized,isAdmin,admincontrol.addTerminalpost)
student.get('/admin/terminal/:terminalId/:editing?',verifytoken,authorized,isAdmin,admincontrol.editTerminal)
student.get('/delete/terminal/:terminalId',verifytoken,authorized,isAdmin,admincontrol.deleteTerminal)
student.get('/admin/new/subject',verifytoken,authorized,isAdmin,admincontrol.addNewSubject)
student.post('/admin/new/subject/:subjectId?',verifytoken,authorized,isAdmin,admincontrol.addNewSubjectPost)
student.get('/admin/new/subject/:subjectId/:editing?',verifytoken,authorized,isAdmin,admincontrol.editNewSubject)
student.get('/delete/new/subject/:subjectId',verifytoken,authorized,isAdmin,admincontrol.deleteNewSubject)

student.get('/delete/subject/:subjectId/:subjectname?',verifytoken,authorized,admincontrol.deleteSubject)
student.get('/delete/class/:classId',verifytoken,authorized,isAdmin,admincontrol.deleteStudentClass)
student.get('/admin/editsub/:subId/:editing?',verifytoken,authorized,admincontrol.editSub)
student.get('/admin/editclass/:classId/:editing?',verifytoken,authorized,admincontrol.editClass)
// Route for editing a student
student.get('/edit-student/:studentId/:subjectinput?/:studentClass?/:section?/:terminal?',verifytoken,authorized, controller.editStudent);

// Route for updating a student
student.post('/update-student/:studentId/:subjectinput/:studentClass/:section/:terminal',verifytoken,authorized,controller.updateStudent);

// Route for deleting a student
student.get('/delete-student/:studentId/:subjectinput?/:studentClass?/:section?/:terminal?',verifytoken,authorized,controller.deleteStudent);
student.get('/crossheet',verifytoken,authorized,isAdmin,admincontrol.cross_sheet)
student.get('/teacher/:subject/:controller',verifytoken,authorized,controller.studentclass)

student.get('/findData/:subjectinput/:studentClass/:section/:terminal',verifytoken,authorized,controller.findData)
student.get('/findData/:subjectinput/:studentClass/:section/:termwise/:status',verifytoken,authorized,controller.termwisestatus)
// student.get('/findData/:subjectinput/:studentClass/:section/:termwise/:termwisereport/:status',verifytoken,authorized,controller.termwisedata)
student.get('/findData/:subjectinput/:studentClass/:section/:termwise/:termwisereport/:status/:qno/:terminal',verifytoken,authorized,controller.termdetail)

student.get('/student_data/:subjectinput/:studentClass/:section/:terminal', verifytoken,authorized,controller.studentrecord)
student.post('/search/:subject/:studentClass/:section/:terminal',verifytoken,authorized,controller.search)



// Temporary debug route
student.get('/debug/:subjectinput/:studentClass/:section/:terminal',verifytoken,authorized, (req, res) => {
  const { subjectinput, studentClass, section, terminal } = req.params;
  
  // Get subject data similar to the showForm controller
  const Model = require('../model/schema');
  Model.find({ subject: subjectinput })
    .then(subjects => {
      if (!subjects) {
        return res.status(404).render('404');
      }
      res.render('debug', {
        subjects,
        subjectname: subjectinput,
        studentClass,
        section,
        terminal,
        totalEntries: 0
      });
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Server Error');
    });
});

student.get('/studentData/:subjectinput/:studentClass/:section/:qno/:status/:terminal',verifytoken,authorized,controller.studentData)
// student.get('/totalStudent/:subjectinput/:studentClass/:section/:terminal',verifytoken,authorized,controller.totalStudent)
student.get('/checkroll/:subjectinput/:studentClass/:section/:terminal',verifytoken,authorized,controller.checkroll)
student.get('/checksubjectexist',verifytoken,authorized,admincontrol.subjectlistcheck)
// Debug route to check available subjects
student.get('/debug/subjects', verifytoken,authorized,async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { subjectSchema } = require('../model/adminschema');
    const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
    
    // Get all subjects
    const subjects = await subjectlist.find({}).lean();
    
    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    res.json({
      totalSubjects: subjects.length,
      subjects: subjects.map(s => ({
        name: s.subject,
        max: s.max,
        existsAsCollection: collectionNames.includes(s.subject)
      })),
      availableCollections: collectionNames
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});
student.get('/studentrecord',verifytoken,authorized,isAdmin,upload.single('studentRecords'),admincontrol.studentrecord)
student.post('/studentrecord',verifytoken,authorized,isAdmin,upload.single('studentRecords'),admincontrol.studentrecordpost)
student.post('/studentrecord/add',verifytoken,authorized,isAdmin,admincontrol.studentrecordadd)
student.get('/studentrecord/edit/:studentId/:editing?',verifytoken,authorized,isAdmin,admincontrol.studentrecordedit)
student.post('/studentrecord/delete/:studentId',verifytoken,authorized,isAdmin,admincontrol.studentrecorddelete)
student.get('/user',verifytoken,authorized,isAdmin,admincontrol.showuser)
student.post('/user/:userId?',verifytoken,authorized,isAdmin,admincontrol.saveuser)
// Route to view/display uploaded files in browser
student.get('/view-file/:filename',verifytoken,authorized, admincontrol.viewFile)
student.get('/marksheet',verifytoken,authorized,isAdmin, admincontrol.marksheet);
student.get('/marksheetprint',verifytoken,authorized,isAdmin, admincontrol.marksheetprint);
student.get('/copytheory',verifytoken,authorized,isAdmin, admincontrol.copytheory);
student.get('/user/delete-teacher/:teacherId', verifytoken, authorized, isAdmin, admincontrol.deleteTeacher);

student.get('/practical',verifytoken,authorized, admincontrol.practicalMarks);
student.post('/practicalMarks/autoSave',verifytoken,authorized, admincontrol.autoSavePracticalMarks);
// Enhanced file viewer routes for better VM compatibility
student.get('/file-viewer/:filename', (req, res) => {
  const filename = req.params.filename;
  const path = require('path');
  const fs = require('fs');
  const rootDir = require('../utils/path').rootDir;
  const filePath = path.join(rootDir, 'uploads', filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('404', { message: 'File not found' });
  }
  
  res.render('file-viewer', { filename: filename });
});

student.get('/view-pdf/:filename', (req, res) => {
  const filename = req.params.filename;
  const path = require('path');
  const fs = require('fs');
  const rootDir = require('../utils/path').rootDir;
  const filePath = path.join(rootDir, 'uploads', filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  
  // Serve PDF with explicit headers for VM compatibility
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // Send the file
  res.sendFile(filePath);
});

// Diagnostic route for VM deployment issues
student.get('/admin/diagnostics', admincontrol.diagnostics)
student.get('/user/edit-teacher/:userId/:editing?', verifytoken, authorized, isAdmin, admincontrol.editTeacher);

student.get('/newsadmin',verifytoken,authorized,isnewsAdmin,newscontroller.newsadmin);
student.post(
  '/newsadmin',
  verifytoken,
  authorized,
  isnewsAdmin,
  upload.fields([
    { name: 'image1', maxCount: 1 },     // matches form name
    { name: 'image2', maxCount: 1 }      // matches form name
  ]),
  newscontroller.savenewspost
);

student.get('/news', newscontroller.getNewsJson);
student.get('/newsdescription', newscontroller.getNewsPage);

// Support both POST and DELETE for news deletion (AJAX prefers DELETE)
student.delete('/newsadmin/delete/:id', verifytoken, authorized, isnewsAdmin, newscontroller.deleteNews);
student.post('/newsadmin/delete/:id', verifytoken, authorized, isnewsAdmin, newscontroller.deleteNews);

student.get('/newsadmin/edit', verifytoken, authorized, isnewsAdmin, newscontroller.editNewsPage);
student.post('/newsadmin/update', verifytoken, authorized, isnewsAdmin, upload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 }
]), newscontroller.updateNews);

//exam part started here
student.get('/examform',verifytoken,authorized,examcontroller.loadForm)
student.get('/entryform',verifytoken,authorized,examcontroller.entryform)
student.post('/entryform',verifytoken,authorized,examcontroller.saveEntryform)
student.get('/getPreviousmarks',verifytoken,authorized,examcontroller.getPreviousmarks)
student.get('/getAttendanceData',verifytoken,authorized,examcontroller.getAttendanceData)
student.get('/exammanagement',verifytoken,authorized,isAdmin,examdashboardcontroller.examManagement)
student.get('/formatchoose',verifytoken,authorized,isAdmin,examdashboardcontroller.formatChoose)
student.get('/generatemarksheet',verifytoken,authorized,isAdmin,examdashboardcontroller.generateMarksheet)

student.get('/admitcard',verifytoken,authorized,isAdmin,examdashboardcontroller.admitCard)
student.get('/routineterminalchoose'  ,verifytoken,authorized,isAdmin,examdashboardcontroller.routineTerminalChoose)
student.get('/examroutine',verifytoken,authorized,isAdmin,examdashboardcontroller.examRoutine)
student.post('/saveexamroutine',verifytoken,authorized,isAdmin,examdashboardcontroller.saveExamRoutine)
student.get('/analytics',verifytoken,authorized,isAdmin,examdashboardcontroller.analytics)
student.get('/editroutine',verifytoken,authorized,isAdmin,examdashboardcontroller.editRoutine)
student.get('/deleteroutine',verifytoken,authorized,isAdmin,examdashboardcontroller.deleteRoutine)
student.get('/ledger',verifytoken,authorized,isAdmin,examdashboardcontroller.ledger)
student.get('/myresult',examdashboardcontroller.myResult)

student.get('/formatchoosestudent',examdashboardcontroller.formatChooseStudent)
student.get('/student/generatemarksheet',examdashboardcontroller.generateMarksheetStudent)
student.get('/studentportfolio',verifytoken,authorized,examdashboardcontroller.studentPortfolio)

  



// Theme Routes Start Here
student.get('/theme', verifytoken, authorized, themecontroller.themeopener);
student.get('/themeform', verifytoken, authorized, themecontroller.themeform);
student.get('/themefillupform', verifytoken, authorized, themecontroller.themefillupform);
student.post('/themefillupform', verifytoken, authorized, themecontroller.themefillupformsave);
student.post('/themeform', verifytoken, authorized, themecontroller.themeformSave);
student.get('/thememarks', verifytoken, authorized, themecontroller.themeformMarks);
student.post('/autosave-themefillup', verifytoken, authorized, themecontroller.autoSaveThemeFillup);
student.post('/autosave-projectrubrik', verifytoken, authorized, practical410controller.autoSaveRubrik);
student.get('/thememarksofstudent', verifytoken, authorized, themecontroller.thememarksOfStudent);
student.get('/themewisemarks', verifytoken, authorized, themecontroller.themewisemarks);
student.get('/themeMarksheet', verifytoken, authorized, themecontroller.themeMarksheet);

student.get('/themeslip', verifytoken, authorized, themecontroller.themeslip);

student.get('/theme/previous-data', verifytoken, authorized, themecontroller.getPreviousThemeData);
student.get('/theme/student-themes', verifytoken, authorized, themecontroller.getStudentThemes);
student.get('/marksheetsetup',verifytoken,authorized,isAdmin,admincontrol.showmarksheetSetupForm);
student.post('/marksheetsetup',verifytoken,authorized,isAdmin,admincontrol.savemarksheetSetupForm);
student.get('/marksheetsetup/delete/:id',verifytoken,authorized,isAdmin,admincontrol.deletemarksheetSetup);


student.get('/class',verifytoken,authorized,practical410controller.chooseClass);
student.get('/evaluationform',verifytoken,authorized,practical410controller.evaluationForm);
student.get('/practicaldetailform',verifytoken,authorized,practical410controller.showpracticalDetailForm);
student.post('/practicaldetailform',verifytoken,authorized,practical410controller.savepracticalDetailForm);

student.get('/practicalslip',verifytoken,authorized,practical410controller.showpracticalSlip);

// Science Practical Form Routes
student.get('/practicalform', verifytoken, authorized, practical410controller.sciencepracticalForm)

student.post('/sciencepractical', verifytoken, authorized, practical410controller.saveSciencePractical);

// Temporary test route to debug form data
student.post('/test-form-data', (req, res) => {
  console.log('=== TEST FORM DATA ===');
  console.log('Raw body:', JSON.stringify(req.body, null, 2));
  console.log('=== END TEST ===');
  res.json({ received: req.body });
});
student.post('/scienceData', verifytoken, authorized, practical410controller.saveScienceData);
student.post('/practicalprojectform', verifytoken, authorized, practical410controller.savepracticalprojectform);
student.get('sciencepractical',verifytoken,authorized,practical410controller.sciencepracticalForm)
student.post('/practicalslipsave', verifytoken, authorized, practical410controller.savepracticalslip);

student.get('/choosesubject',verifytoken,authorized,practical410controller.choosesubject)

student.get('/internalreport',verifytoken,authorized,practical410controller.internalReport)

student.get('/getPracticalData', verifytoken, authorized, practical410controller.getPracticalData);

student.get('/projectrubrikscreate', verifytoken, authorized, practical410controller.projectrubrikscreate);
student.post('/projectrubrikscreatesave',verifytoken,authorized,practical410controller.projectrubrikscreatesave)

student.get('/editprojectrubriks',verifytoken,authorized,practical410controller.editprojectrubriks)
student.get('/deleteprojectrubriks',verifytoken,authorized,practical410controller.deleteprojectrubriks)
student.get('/editpracticalrubriks',verifytoken,authorized,themecontroller.editpracticalrubriks)

student.get('/deletepracticalrubriks',verifytoken,authorized,themecontroller.deletepracticalrubriks)
student.get('/getThemeDataFromDB', verifytoken, authorized, themecontroller.getThemeDataFromDB);

student.get('/editlessondata', verifytoken, authorized, practical410controller.editlessondata);
student.get('/deletelessondata', verifytoken, authorized, practical410controller.deletelessondata);
student.get('/attendance', verifytoken, authorized, practical410controller.attendance);
student.post('/attendance', verifytoken, authorized, practical410controller.saveAttendance);

student.get('/showrubriksforadmin', verifytoken, authorized,isAdmin, practical410controller.showrubriksforadmin);
student.get('/seerubriks',verifytoken,authorized,isAdmin,practical410controller.seerubriks)
student.get('/indicatorwisereport',verifytoken,authorized,practical410controller.indicatorwiserecord)

student.get('/datafromanotherclass',verifytoken,authorized,themecontroller.datafromanotherclass)
student.get('/projectdatafromanotherclass',verifytoken,authorized,practical410controller.datafromanotherclass)
// end Theme Routes
student.get('/uploadolddata',verifytoken,authorized,isAdmin,examdashboardcontroller.uploadOldData)
student.post('/uploadCSV',verifytoken,authorized,isAdmin,upload.single('marksFile'),examcontroller.uploadOldDataPost)
// attendance system routes

student.get('/addchapterselect', verifytoken, authorized, controller.addChapterSelect);
student.get('/addchapter', verifytoken, authorized, controller.addChapterForm);
student.post('/addchapter/single', verifytoken, authorized, controller.addSingleChapter);
student.post('/addchapter', verifytoken, authorized, controller.saveaddChapterForm);
student.delete('/addchapter/group', verifytoken, authorized, controller.deleteChapterGroup);
student.put('/addchapter/classes', verifytoken, authorized, controller.updateChapterClasses);
student.put('/addchapter', verifytoken, authorized, controller.editChapter);
student.delete('/addchapter', verifytoken, authorized, controller.deleteChapter);


student.get('/forms/:subjectinput/:studentClass/:section/:terminal',verifytoken,authorized,controller.showForm)
student.post('/forms/:subjectinput/:studentClass?/:section?/:terminal?',verifytoken,authorized,controller.saveForm)

student.get('/:controller/:subject',verifytoken,authorized,controller.studentclass)
student.get('/:controller/:subject/:studentClass/:section',verifytoken,authorized,controller.terminal)
module.exports = student;
