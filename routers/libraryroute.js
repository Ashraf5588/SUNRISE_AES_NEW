const express = require("express");
const library = express .Router();
const controller = require('../controller/controller')
const dailydashboardcontroller = require('../controller/dailydashboardcontroller')
const newscontroller = require('../controller/newscontroller')
const examcontroller = require('../controller/examconntroller')
const lockcontroller = require('../controller/lockcontroller')
const nursecontroller = require('../controller/nursecontroller')
const multer  = require('multer')
const newthemecontroller = require('../controller/newthemecontroller')
const examdashboardcontroller = require('../controller/examdashboardcontroller')
const attendancecontroller = require('../controller/attendancecontroller')
const practical410controller = require('../controller/practical410controller')
const themecontroller = require('../controller/themecontroller')
const eventcontroller = require('../controller/eventcontroller')
const ecdcontroller = require('../controller/ecdgradecontroller')
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

const marksheetImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/');
  },
  filename: function (req, file, cb) {
    if (file.fieldname === 'schoolImage') {
      cb(null, 'school.jpg');
      return;
    }
    if (file.fieldname === 'schoolLogo') {
      cb(null, 'image.png');
      return;
    }
    cb(null, file.originalname);
  }
});

const uploadMarksheetImages = multer({ storage: marksheetImageStorage });
const uploadBookCsv = multer({ storage: multer.memoryStorage() });


const {authenticateToken} = require('../middleware/loginmiddleware')

const {authenticateTokenStudent} = require('../middleware/loginmiddleware')
const admincontrol = require('../controller/admincontroller');
const { verify } = require('jsonwebtoken');
const librarycontroller = require('../controller/librarycontroller');



library.get("/library/dashboard", librarycontroller.libraryDashboard);
library.get("/library/analytics", librarycontroller.libraryAnalytics);
library.get("/library/books", librarycontroller.listBooks);
library.post("/library/books", librarycontroller.addBooks);
library.get("/library/books/import-template", librarycontroller.downloadBookCsvTemplate);
library.get("/library/books/export-excel", librarycontroller.exportBooksExcel);
library.post("/library/books/import-csv", uploadBookCsv.single('bookCsv'), librarycontroller.importBooksCsv);
library.get("/library/books/:id", librarycontroller.getBook);
library.put("/library/books/:id", librarycontroller.updateBook);
library.delete("/library/books/:id", librarycontroller.deleteBook);
library.get("/library/inventory", librarycontroller.inventoryPage);
library.get("/library/shelf-assignment", librarycontroller.shelfAssignmentPage);
library.put("/library/shelf-assignment", librarycontroller.assignShelfToBooks);
library.get("/library/categories", librarycontroller.listCategories);
library.post("/library/categories", librarycontroller.addCategory);
library.put("/library/categories/:id", librarycontroller.updateCategory);
library.delete("/library/categories/:id", librarycontroller.deleteCategory);
library.get("/library/members", librarycontroller.listMembers);
library.post("/library/member/search", librarycontroller.searchMembers);
library.get("/library/member/search", librarycontroller.searchMembers);
library.post("/library/member/create", librarycontroller.createMember);
library.get("/library/member/student-contact", librarycontroller.getStudentRecordContact);
library.put("/library/member/:id", librarycontroller.updateMember);
library.delete("/library/member/:id", librarycontroller.deleteMember);
library.get("/library/issues", librarycontroller.listIssues);
library.post("/library/issue-book", librarycontroller.assignBook);
library.post("/library/return-book/:id", librarycontroller.returnBook);
library.get("/library/lost-books", librarycontroller.listLostBooks);
library.post("/library/lost-books", librarycontroller.reportLostBook);
library.put("/library/lost-books/:id", librarycontroller.updateLostBook);

library.get("/addbook", librarycontroller.listBooks);
library.post("/addbook", librarycontroller.addBooks);
library.get("/bookcategories", librarycontroller.listCategories);
library.post("/bookcategories", librarycontroller.addCategory);
library.get("/bookinventory", librarycontroller.inventoryPage);

module.exports = library;