"use strict";

var path = require("path");

var express = require("express");

var app = express();

var jwt = require("jsonwebtoken");

var mongoose = require("mongoose");

var bodyParser = require("body-parser");

var _require = require("../utils/path"),
    rootDir = _require.rootDir;

var _require2 = require("../model/adminschema"),
    classSchema = _require2.classSchema,
    subjectSchema = _require2.subjectSchema;

var _require3 = require("../model/admin"),
    adminSchema = _require3.adminSchema;

var _require4 = require("../model/schema"),
    studentSchema = _require4.studentSchema;

var student = require("../routers/mainpage");

var _require5 = require("./controller"),
    terminal = _require5.terminal;

app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
var subject = mongoose.model("subject", subjectSchema, "subjectlist");
var studentClass = mongoose.model("studentClass", classSchema, "classlist");
var admin = mongoose.model("admin", adminSchema, "admin");

exports.adminlogin = function _callee(req, res, next) {
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          try {
            res.render("admin/login");
          } catch (err) {
            console.log(err);
          }

        case 1:
        case "end":
          return _context.stop();
      }
    }
  });
};

exports.adminloginpost = function _callee2(req, res, next) {
  var _req$body, username, password, user, token;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          _req$body = req.body, username = _req$body.username, password = _req$body.password;
          _context2.next = 4;
          return regeneratorRuntime.awrap(admin.findOne({
            username: "".concat(username),
            password: "".concat(password)
          }));

        case 4:
          user = _context2.sent;

          if (!user) {
            res.send("invalid credentials");
          } else {
            token = jwt.sign({
              user: user.username,
              role: user.role
            }, "mynameisashraf!23_9&", {
              expiresIn: "24h"
            });
            console.log("Generated Token:", token); // Log the generated token

            res.cookie("token", token, {
              httpOnly: true,
              secure: false
            });
            res.redirect("/admin");
          }

          _context2.next = 11;
          break;

        case 8:
          _context2.prev = 8;
          _context2.t0 = _context2["catch"](0);
          console.log(_context2.t0);

        case 11:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 8]]);
};

exports.addSubject = function _callee3(req, res, next) {
  var subId, updateSubject, subjects, studentClasslist;
  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          subId = req.params.subId;
          updateSubject = req.body.subject;

          if (!(subId && !undefined)) {
            _context3.next = 14;
            break;
          }

          _context3.next = 5;
          return regeneratorRuntime.awrap(subject.findByIdAndUpdate(subId, {
            subject: "".concat(updateSubject)
          }, {
            "new": true,
            runValidators: true
          }));

        case 5:
          _context3.next = 7;
          return regeneratorRuntime.awrap(subject.find({}));

        case 7:
          subjects = _context3.sent;
          _context3.next = 10;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 10:
          studentClasslist = _context3.sent;
          res.render("admin/adminpannel", {
            editing: false,
            subjects: subjects,
            studentClasslist: studentClasslist
          });
          _context3.next = 17;
          break;

        case 14:
          _context3.next = 16;
          return regeneratorRuntime.awrap(subject.create(req.body));

        case 16:
          res.render("admin/adminpannel", {
            editing: false
          });

        case 17:
        case "end":
          return _context3.stop();
      }
    }
  });
};

exports.addClass = function _callee4(req, res, next) {
  var classId, updateClass, studentclass, studentClasslist;
  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          classId = req.params.classId;
          updateClass = req.body.studentClass;

          if (!(classId && !undefined)) {
            _context4.next = 12;
            break;
          }

          _context4.next = 5;
          return regeneratorRuntime.awrap(studentClass.findByIdAndUpdate(classId, {
            studentClass: "".concat(updateClass)
          }, {
            "new": true,
            runValidators: true
          }));

        case 5:
          _context4.next = 7;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 7:
          studentclass = _context4.sent;
          _context4.next = 10;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 10:
          studentClasslist = _context4.sent;
          res.render("admin/adminpannel", {
            editing: false,
            studentclass: studentclass,
            studentClasslist: studentClasslist
          });

        case 12:
          _context4.next = 14;
          return regeneratorRuntime.awrap(studentClass.create(req.body));

        case 14:
          res.render("FormPostMessage");

        case 15:
        case "end":
          return _context4.stop();
      }
    }
  });
};

exports.deleteSubject = function _callee5(req, res, next) {
  var subjectId;
  return regeneratorRuntime.async(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          subjectId = req.params.subjectId;
          _context5.next = 3;
          return regeneratorRuntime.awrap(subject.findByIdAndDelete(subjectId));

        case 3:
          res.redirect("/admin");

        case 4:
        case "end":
          return _context5.stop();
      }
    }
  });
};

exports.deleteStudentClass = function _callee6(req, res, next) {
  var classId;
  return regeneratorRuntime.async(function _callee6$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          classId = req.params.classId;
          _context6.next = 3;
          return regeneratorRuntime.awrap(studentClass.findByIdAndDelete(classId));

        case 3:
          res.redirect("/admin");

        case 4:
        case "end":
          return _context6.stop();
      }
    }
  });
};

exports.editSub = function _callee7(req, res, next) {
  var subId, editing, subjectedit, subjects, studentClasslist;
  return regeneratorRuntime.async(function _callee7$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          subId = req.params.subId;
          editing = req.query.editing === "true";
          _context7.next = 4;
          return regeneratorRuntime.awrap(subject.findOne({
            _id: "".concat(subId)
          }));

        case 4:
          subjectedit = _context7.sent;
          _context7.next = 7;
          return regeneratorRuntime.awrap(subject.find({}));

        case 7:
          subjects = _context7.sent;
          _context7.next = 10;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 10:
          studentClasslist = _context7.sent;
          res.render("admin/adminpannel", {
            editing: editing,
            subId: subId,
            subjectedit: subjectedit,
            subjects: subjects,
            studentClasslist: studentClasslist
          });

        case 12:
        case "end":
          return _context7.stop();
      }
    }
  });
};

exports.editClass = function _callee8(req, res, next) {
  var classId, editing, classedit, subjects, studentClasslist;
  return regeneratorRuntime.async(function _callee8$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          classId = req.params.classId;
          editing = req.query.editing === "true";
          _context8.next = 4;
          return regeneratorRuntime.awrap(studentClass.findOne({
            _id: "".concat(classId)
          }));

        case 4:
          classedit = _context8.sent;
          _context8.next = 7;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 7:
          subjects = _context8.sent;
          _context8.next = 10;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 10:
          studentClasslist = _context8.sent;
          res.render("admin/adminpannel", {
            editing: editing,
            classedit: classedit,
            classId: classId,
            subjects: subjects,
            studentClasslist: studentClasslist
          });

        case 12:
        case "end":
          return _context8.stop();
      }
    }
  });
};