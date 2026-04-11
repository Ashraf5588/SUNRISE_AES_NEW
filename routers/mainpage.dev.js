"use strict";

var express = require('express');

var student = express.Router();

var controller = require('../controller/controller');

var admincontrol = require('../controller/admincontroller');

student.get('/', controller.homePage);
student.get('/teacher/:controller', controller.teacherPage);
student.get('/teacher/:subject/:controller', controller.studentclass);
student.get('/findData/:subject/:studentClass/:section/:terminal/:terminal2?/:terminal3?', controller.findData);
student.get('/:controller/:subject', controller.studentclass);
student.get('/:controller/:subject/:studentClass/:section', controller.terminal);
student.get('/forms/:subject/:studentClass/:section/:terminal', controller.showForm);
student.post('/forms/:subjectinput', controller.saveForm);
student.get('/studentData/:subject/:studentClass/:section/:qno/:status/:terminal', controller.studentData);
student.get('/totalStudent/:subject/:studentClass/:section/:terminal', controller.totalStudent);
student.get('/admin', admincontrol.admin);
student.post('/subject', admincontrol.addSubject);
student.post('/class', admincontrol.addClass);
module.exports = student;