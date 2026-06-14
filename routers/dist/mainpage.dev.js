"use strict";

var express = require('express');

var student = express.Router();

var controller = require('../controller/controller');

var admincontrol = require('../controller/admincontroller');

var _require = require('../middleware/loginmiddleware'),
    authenticateToken = _require.authenticateToken;

var _require2 = require('../middleware/loginmiddleware'),
    authenticateTokenTeacher = _require2.authenticateTokenTeacher;

student.get('/', controller.homePage);
student.get('/admin/login', admincontrol.adminlogin);
student.post('/admin/login', admincontrol.adminloginpost);
student.get('/teacher/login', admincontrol.teacherlogin);
student.post('/teacher/logins', admincontrol.teacherloginpost);
student.get('/admin', authenticateToken, admincontrol.admin);
student.get('/admin/subject/:subId?', authenticateToken, admincontrol.showSubject);
student.post('/admin/subjectadd/:subId?', authenticateToken, admincontrol.addSubject);
student.get('/admin/class/:classId?', authenticateToken, admincontrol.showClass);
student.post('/admin/class/:classId?', authenticateToken, admincontrol.addClass);
student.get('/delete/subject/:subjectId/:subjectname?', authenticateToken, admincontrol.deleteSubject);
student.get('/delete/class/:classId', authenticateToken, admincontrol.deleteStudentClass);
student.get('/admin/editsub/:subId/:editing?', authenticateToken, admincontrol.editSub);
student.get('/admin/editclass/:classId/:editing?', authenticateToken, admincontrol.editClass); // Route for editing a student

student.get('/edit-student/:studentId/:subjectinput?', controller.editStudent); // Route for updating a student

student.post('/update-student/:studentId', controller.updateStudent); // Route for deleting a student

student.get('/delete-student/:studentId/:subjectinput?/:studentClass?/:section?/:terminal?', controller.deleteStudent);
student.get('/teacher/:controller?', authenticateTokenTeacher, controller.teacherPage);
student.get('/teacher/:subject/:controller', authenticateTokenTeacher, controller.studentclass);
student.get('/findData/:subjectinput/:studentClass/:section/:terminal', authenticateTokenTeacher, controller.findData);
student.get('/findData/:subjectinput/:studentClass/:section/:termwise/:status', authenticateTokenTeacher, controller.termwisestatus);
student.get('/findData/:subjectinput/:studentClass/:section/:termwise/:termwisereport/:status', authenticateTokenTeacher, controller.termwisedata);
student.get('/findData/:subjectinput/:studentClass/:section/:termwise/:termwisereport/:status/:qno/:terminal', authenticateTokenTeacher, controller.termdetail);
student.post('/search/:subject/:studentClass/:section/:terminal', controller.search);
student.get('/:controller/:subject', controller.studentclass);
student.get('/:controller/:subject/:studentClass/:section', controller.terminal);
student.get('/forms/:subjectinput/:studentClass/:section/:terminal?', controller.showForm);
student.post('/forms/:subjectinput/:studentclass?/:section?/:terminal?', controller.saveForm);
student.get('/studentData/:subjectinput/:studentClass/:section/:qno/:status/:terminal', authenticateTokenTeacher, controller.studentData);
student.get('/totalStudent/:subjectinput/:studentClass/:section/:terminal', authenticateTokenTeacher, controller.totalStudent);
module.exports = student;