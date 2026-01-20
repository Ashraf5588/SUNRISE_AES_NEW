"use strict";

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var path = require("path");

var express = require("express");

var app = express();

var mongoose = require("mongoose");

var bodyParser = require("body-parser");

var _require = require("../utils/path"),
    rootDir = _require.rootDir;

var _require2 = require("../model/schema"),
    studentSchema = _require2.studentSchema;

var _require3 = require("../model/adminschema"),
    classSchema = _require3.classSchema,
    subjectSchema = _require3.subjectSchema;

var subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
var studentClass = mongoose.model("studentClass", classSchema, "classlist");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));

var getSubjectModel = function getSubjectModel(subjectinput) {
  // to Check if model already exists
  if (mongoose.models[subjectinput]) {
    return mongoose.models[subjectinput];
  }

  return mongoose.model(subjectinput, studentSchema, subjectinput);
};

exports.homePage = function _callee(req, res, next) {
  var subject;
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.next = 2;
          return regeneratorRuntime.awrap(subjectlist.find({}).lean());

        case 2:
          subject = _context.sent;
          res.render("index", {
            currentPage: "home",
            subjects: subject
          });

        case 4:
        case "end":
          return _context.stop();
      }
    }
  });
}; // Edit student (get data for the form)


exports.editStudent = function _callee2(req, res, next) {
  var _req$params, studentId, subjectinput, _model, studentToEdit;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _req$params = req.params, studentId = _req$params.studentId, subjectinput = _req$params.subjectinput;
          _context2.prev = 1;
          // Find student by ID
          _model = getSubjectModel(subjectinput);
          _context2.next = 5;
          return regeneratorRuntime.awrap(_model.findById(studentId));

        case 5:
          studentToEdit = _context2.sent;
          res.render("admin/edit-student", {
            student: studentToEdit
          });
          _context2.next = 13;
          break;

        case 9:
          _context2.prev = 9;
          _context2.t0 = _context2["catch"](1);
          console.error(_context2.t0);
          next(_context2.t0);

        case 13:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[1, 9]]);
}; // Update student (save the modified data)


exports.updateStudent = function _callee3(req, res, next) {
  var studentId, updatedData;
  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          studentId = req.params.studentId;
          updatedData = req.body; // The updated data comes from the form

          _context3.prev = 2;
          _context3.next = 5;
          return regeneratorRuntime.awrap(student.findByIdAndUpdate(studentId, updatedData, {
            "new": true
          }));

        case 5:
          res.redirect('/admin'); // Redirect to admin dashboard or any page you prefer

          _context3.next = 12;
          break;

        case 8:
          _context3.prev = 8;
          _context3.t0 = _context3["catch"](2);
          console.error(_context3.t0);
          next(_context3.t0);

        case 12:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[2, 8]]);
}; // Delete student


exports.deleteStudent = function _callee4(req, res, next) {
  var _req$params2, studentId, subjectinput, studentClass, section, terminal, model;

  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _req$params2 = req.params, studentId = _req$params2.studentId, subjectinput = _req$params2.subjectinput, studentClass = _req$params2.studentClass, section = _req$params2.section, terminal = _req$params2.terminal;
          model = getSubjectModel(subjectinput);
          _context4.prev = 2;
          _context4.next = 5;
          return regeneratorRuntime.awrap(model.findByIdAndDelete(studentId));

        case 5:
          res.redirect("/totalStudent/".concat(subjectinput, "/").concat(studentClass, "/").concat(section, "/").concat(terminal)); // Redirect to admin dashboard or any page you prefer

          _context4.next = 12;
          break;

        case 8:
          _context4.prev = 8;
          _context4.t0 = _context4["catch"](2);
          console.error(_context4.t0);
          next(_context4.t0);

        case 12:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[2, 8]]);
};

exports.teacherPage = function _callee5(req, res, next) {
  var subjects, controller;
  return regeneratorRuntime.async(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.next = 2;
          return regeneratorRuntime.awrap(subjectlist.find({}));

        case 2:
          subjects = _context5.sent;
          controller = req.params.controller;
          res.render("teacher", {
            controller: controller,
            currentPage: "teacher",
            subjects: subjects
          });

        case 5:
        case "end":
          return _context5.stop();
      }
    }
  });
};

exports.studentclass = function _callee6(req, res, next) {
  var studentClassdata, _req$params3, subject, controller;

  return regeneratorRuntime.async(function _callee6$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.next = 2;
          return regeneratorRuntime.awrap(studentClass.find({}));

        case 2:
          studentClassdata = _context6.sent;
          _req$params3 = req.params, subject = _req$params3.subject, controller = _req$params3.controller;
          res.render("class", {
            subject: subject,
            controller: controller,
            studentClassdata: studentClassdata
          });

        case 5:
        case "end":
          return _context6.stop();
      }
    }
  });
};

exports.terminal = function (req, res, next) {
  var _req$params4 = req.params,
      controller = _req$params4.controller,
      subject = _req$params4.subject,
      studentClass = _req$params4.studentClass,
      section = _req$params4.section;
  res.render("terminal", {
    subject: subject,
    controller: controller,
    studentClass: studentClass,
    section: section
  });
};

exports.showForm = function _callee7(req, res, next) {
  var subjects, _req$params5, subjectinput, studentClass, section, terminal;

  return regeneratorRuntime.async(function _callee7$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          _context7.next = 2;
          return regeneratorRuntime.awrap(subjectlist.find({}));

        case 2:
          subjects = _context7.sent;
          global.availablesubject = subjects.map(function (sub) {
            return sub.subject;
          });
          _req$params5 = req.params, subjectinput = _req$params5.subjectinput, studentClass = _req$params5.studentClass, section = _req$params5.section, terminal = _req$params5.terminal;

          if (!terminal || terminal === "''" || terminal === '"') {
            terminal = '';
          }

          if (availablesubject.includes(subjectinput)) {
            _context7.next = 10;
            break;
          }

          return _context7.abrupt("return", res.render("404"));

        case 10:
          res.render("form", {
            subjectname: subjectinput,
            section: section,
            studentClass: studentClass,
            terminal: terminal,
            subjects: subjects
          });

        case 11:
        case "end":
          return _context7.stop();
      }
    }
  });
};

exports.saveForm = function _callee8(req, res, next) {
  var subjectinput, _req$params6, studentclass, section, terminal, _model2;

  return regeneratorRuntime.async(function _callee8$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          subjectinput = req.params.subjectinput;
          _req$params6 = req.params, studentclass = _req$params6.studentclass, section = _req$params6.section, terminal = _req$params6.terminal;

          if (availablesubject.includes(subjectinput)) {
            _context8.next = 6;
            break;
          }

          return _context8.abrupt("return", res.render("404"));

        case 6:
          _context8.prev = 6;
          _model2 = getSubjectModel(subjectinput);
          _context8.next = 10;
          return regeneratorRuntime.awrap(_model2.create(req.body));

        case 10:
          res.render("FormPostMessage", {
            subjectinput: subjectinput,
            studentclass: studentclass,
            section: section,
            terminal: terminal
          });
          _context8.next = 16;
          break;

        case 13:
          _context8.prev = 13;
          _context8.t0 = _context8["catch"](6);
          console.log(_context8.t0);

        case 16:
        case "end":
          return _context8.stop();
      }
    }
  }, null, null, [[6, 13]]);
};

exports.findData = function _callee9(req, res) {
  var _req$params7, subjectinput, _studentClass, section, terminal, _model3, totalstudent, totalStudent, result, currentSubject, max, i, n, analysis;

  return regeneratorRuntime.async(function _callee9$(_context9) {
    while (1) {
      switch (_context9.prev = _context9.next) {
        case 0:
          _context9.prev = 0;
          _req$params7 = req.params, subjectinput = _req$params7.subjectinput, _studentClass = _req$params7.studentClass, section = _req$params7.section, terminal = _req$params7.terminal;
          _model3 = getSubjectModel(subjectinput);
          _context9.next = 5;
          return regeneratorRuntime.awrap(_model3.aggregate([{
            $match: {
              $and: [{
                section: "".concat(section)
              }, {
                terminal: "".concat(terminal)
              }, {
                studentClass: "".concat(_studentClass)
              }]
            }
          }, {
            $count: "count"
          }]));

        case 5:
          totalstudent = _context9.sent;
          totalStudent = totalstudent.length > 0 && totalstudent[0].count ? totalstudent[0].count : 0;
          result = [];
          _context9.next = 10;
          return regeneratorRuntime.awrap(subjectlist.find({
            'subject': "".concat(subjectinput)
          }));

        case 10:
          currentSubject = _context9.sent;
          max = parseInt(currentSubject[0].max);
          i = 1;

        case 13:
          if (!(i <= max)) {
            _context9.next = 28;
            break;
          }

          n = currentSubject[0][i];

          if (currentSubject[0][i] === 0) {
            n = 1;
          }

          j = 0;

        case 17:
          if (!(j <= n)) {
            _context9.next = 25;
            break;
          }

          _context9.next = 20;
          return regeneratorRuntime.awrap(_model3.aggregate([{
            $facet: {
              correct: [{
                $match: {
                  $and: [_defineProperty({}, "q".concat(i).concat(String.fromCharCode(97 + j)), "correct"), {
                    section: "".concat(section)
                  }, {
                    terminal: "".concat(terminal)
                  }]
                }
              }, {
                $count: "count"
              }],
              incorrect: [{
                $match: {
                  $and: [_defineProperty({}, "q".concat(i).concat(String.fromCharCode(97 + j)), "incorrect"), {
                    section: "".concat(section)
                  }, {
                    terminal: "".concat(terminal)
                  }]
                }
              }, {
                $count: "count"
              }],
              notattempt: [{
                $match: {
                  $and: [_defineProperty({}, "q".concat(i).concat(String.fromCharCode(97 + j)), "notattempt"), {
                    section: section
                  }, {
                    terminal: "".concat(terminal)
                  }]
                }
              }, {
                $count: "count"
              }],
              correctabove50: [{
                $match: {
                  $and: [_defineProperty({}, "q".concat(i).concat(String.fromCharCode(97 + j)), "correctabove50"), {
                    section: section
                  }, {
                    terminal: "".concat(terminal)
                  }]
                }
              }, {
                $count: "count"
              }],
              correctbelow50: [{
                $match: {
                  $and: [_defineProperty({}, "q".concat(i).concat(String.fromCharCode(97 + j)), "correctbelow50"), {
                    section: section
                  }, {
                    terminal: "".concat(terminal)
                  }]
                }
              }, {
                $count: "count"
              }]
            }
          }, {
            $project: {
              correct: {
                $ifNull: [{
                  $arrayElemAt: ["$correct.count", 0]
                }, 0]
              },
              incorrect: {
                $ifNull: [{
                  $arrayElemAt: ["$incorrect.count", 0]
                }, 0]
              },
              notattempt: {
                $ifNull: [{
                  $arrayElemAt: ["$notattempt.count", 0]
                }, 0]
              },
              correctabove50: {
                $ifNull: [{
                  $arrayElemAt: ["$correctabove50.count", 0]
                }, 0]
              },
              correctbelow50: {
                $ifNull: [{
                  $arrayElemAt: ["$correctbelow50.count", 0]
                }, 0]
              }
            }
          }]));

        case 20:
          analysis = _context9.sent;
          result.push({
            questionNo: "q".concat(i).concat(String.fromCharCode(97 + j)),
            correct: analysis[0].correct,
            wrong: analysis[0].incorrect,
            notattempt: analysis[0].notattempt,
            correctabove50: analysis[0].correctabove50,
            correctbelow50: analysis[0].correctbelow50
          });

        case 22:
          j++;
          _context9.next = 17;
          break;

        case 25:
          i++;
          _context9.next = 13;
          break;

        case 28:
          result.sort(function (a, b) {
            return b.wrong - a.wrong;
          });
          res.render("analysis", {
            results: result,
            subjectname: subjectinput,
            studentClass: _studentClass,
            section: section,
            totalStudent: totalStudent,
            terminal: terminal
          });
          _context9.next = 35;
          break;

        case 32:
          _context9.prev = 32;
          _context9.t0 = _context9["catch"](0);
          console.log(_context9.t0);

        case 35:
        case "end":
          return _context9.stop();
      }
    }
  }, null, null, [[0, 32]]);
};

exports.termwisestatus = function _callee10(req, res, next) {
  return regeneratorRuntime.async(function _callee10$(_context10) {
    while (1) {
      switch (_context10.prev = _context10.next) {
        case 0:
          res.render('termstatus');

        case 1:
        case "end":
          return _context10.stop();
      }
    }
  });
};

exports.termwisedata = function _callee11(req, res, next) {
  var term, _req$params8, subjectinput, studentClass, section, status, model, currentSubject, max, i, n, _loop;

  return regeneratorRuntime.async(function _callee11$(_context12) {
    while (1) {
      switch (_context12.prev = _context12.next) {
        case 0:
          term = [];
          _req$params8 = req.params, subjectinput = _req$params8.subjectinput, studentClass = _req$params8.studentClass, section = _req$params8.section, status = _req$params8.status;
          model = getSubjectModel(subjectinput);
          _context12.next = 5;
          return regeneratorRuntime.awrap(subjectlist.find({
            'subject': "".concat(subjectinput)
          }));

        case 5:
          currentSubject = _context12.sent;
          max = parseInt(currentSubject[0].max);
          _context12.prev = 7;
          i = 1;

        case 9:
          if (!(i <= max)) {
            _context12.next = 23;
            break;
          }

          n = currentSubject[0][i];

          if (currentSubject[0][i] === 0) {
            n = 1;
          }

          _loop = function _loop() {
            var _model$find, _model$find3, _model$find5;

            var term1data, term2data, term3data, incorrect2roll, incorrect3roll, common12, count12, common13, count13, common23, count23, common123, count123;
            return regeneratorRuntime.async(function _loop$(_context11) {
              while (1) {
                switch (_context11.prev = _context11.next) {
                  case 0:
                    _context11.next = 2;
                    return regeneratorRuntime.awrap(model.find((_model$find = {}, _defineProperty(_model$find, "q".concat(i).concat(String.fromCharCode(97 + j)), "".concat(status)), _defineProperty(_model$find, "terminal", "first"), _defineProperty(_model$find, "studentClass", "".concat(studentClass)), _defineProperty(_model$find, "section", "".concat(section)), _model$find), _defineProperty({
                      roll: 1,
                      name: 1,
                      _id: 0
                    }, "q".concat(i).concat(String.fromCharCode(97 + j)), 1)));

                  case 2:
                    term1data = _context11.sent;
                    _context11.next = 5;
                    return regeneratorRuntime.awrap(model.find((_model$find3 = {}, _defineProperty(_model$find3, "q".concat(i).concat(String.fromCharCode(97 + j)), "".concat(status)), _defineProperty(_model$find3, "terminal", "second"), _defineProperty(_model$find3, "studentClass", "".concat(studentClass)), _defineProperty(_model$find3, "section", "".concat(section)), _model$find3), _defineProperty({
                      roll: 1,
                      name: 1,
                      _id: 0
                    }, "q".concat(i).concat(String.fromCharCode(97 + j)), 1)));

                  case 5:
                    term2data = _context11.sent;
                    _context11.next = 8;
                    return regeneratorRuntime.awrap(model.find((_model$find5 = {}, _defineProperty(_model$find5, "q".concat(i).concat(String.fromCharCode(97 + j)), "".concat(status)), _defineProperty(_model$find5, "terminal", "third"), _defineProperty(_model$find5, "studentClass", "".concat(studentClass)), _defineProperty(_model$find5, "section", "".concat(section)), _model$find5), _defineProperty({
                      roll: 1,
                      name: 1,
                      _id: 0
                    }, "q".concat(i).concat(String.fromCharCode(97 + j)), 1)));

                  case 8:
                    term3data = _context11.sent;
                    incorrect2roll = new Set(term2data.map(function (item) {
                      return item.roll;
                    }));
                    incorrect3roll = new Set(term3data.map(function (item) {
                      return item.roll;
                    }));
                    common12 = term1data.filter(function (student) {
                      return incorrect2roll.has(student.roll);
                    });
                    count12 = common12.length;
                    common13 = term1data.filter(function (student) {
                      return incorrect3roll.has(student.roll);
                    });
                    count13 = common13.length;
                    common23 = term2data.filter(function (student) {
                      return incorrect3roll.has(student.roll);
                    });
                    count23 = common23.length;
                    common123 = term1data.filter(function (student) {
                      return incorrect2roll.has(student.roll) && incorrect3roll.has(student.roll);
                    });
                    count123 = common123.length;
                    term.push({
                      questionNo: "q".concat(i).concat(String.fromCharCode(97 + j)),
                      data12: count12,
                      data13: count13,
                      data23: count23,
                      data123: count123,
                      namedata12: common12,
                      namedata13: common13,
                      namedata23: common23,
                      namedata123: common123
                    });

                  case 20:
                  case "end":
                    return _context11.stop();
                }
              }
            });
          };

          j = 0;

        case 14:
          if (!(j < n)) {
            _context12.next = 20;
            break;
          }

          _context12.next = 17;
          return regeneratorRuntime.awrap(_loop());

        case 17:
          j++;
          _context12.next = 14;
          break;

        case 20:
          i++;
          _context12.next = 9;
          break;

        case 23:
          res.render('termwiseanalysis', {
            term: term,
            status: status
          });
          _context12.next = 29;
          break;

        case 26:
          _context12.prev = 26;
          _context12.t0 = _context12["catch"](7);
          console.log(_context12.t0);

        case 29:
        case "end":
          return _context12.stop();
      }
    }
  }, null, null, [[7, 26]]);
};

exports.termdetail = function _callee12(req, res, next) {
  var _req$params9, subjectinput, studentClass, section, status, qno, terminal, term, model, _model$find7, _model$find9, _model$find11, term1data, term2data, term3data, incorrect2roll, incorrect3roll, common12, common13, common23, common123;

  return regeneratorRuntime.async(function _callee12$(_context13) {
    while (1) {
      switch (_context13.prev = _context13.next) {
        case 0:
          _req$params9 = req.params, subjectinput = _req$params9.subjectinput, studentClass = _req$params9.studentClass, section = _req$params9.section, status = _req$params9.status, qno = _req$params9.qno, terminal = _req$params9.terminal;
          term = [];
          model = getSubjectModel(subjectinput);
          _context13.prev = 3;
          _context13.next = 6;
          return regeneratorRuntime.awrap(model.find((_model$find7 = {}, _defineProperty(_model$find7, "".concat(qno), "".concat(status)), _defineProperty(_model$find7, "terminal", "first"), _defineProperty(_model$find7, "studentClass", "".concat(studentClass)), _defineProperty(_model$find7, "section", "".concat(section)), _model$find7), _defineProperty({
            roll: 1,
            name: 1,
            _id: 0
          }, "".concat(qno), 1)));

        case 6:
          term1data = _context13.sent;
          _context13.next = 9;
          return regeneratorRuntime.awrap(model.find((_model$find9 = {}, _defineProperty(_model$find9, "".concat(qno), "".concat(status)), _defineProperty(_model$find9, "terminal", "second"), _defineProperty(_model$find9, "studentClass", "".concat(studentClass)), _defineProperty(_model$find9, "section", "".concat(section)), _model$find9), _defineProperty({
            roll: 1,
            name: 1,
            _id: 0
          }, "".concat(qno), 1)));

        case 9:
          term2data = _context13.sent;
          _context13.next = 12;
          return regeneratorRuntime.awrap(model.find((_model$find11 = {}, _defineProperty(_model$find11, "".concat(qno), "".concat(status)), _defineProperty(_model$find11, "terminal", "third"), _defineProperty(_model$find11, "studentClass", "".concat(studentClass)), _defineProperty(_model$find11, "section", "".concat(section)), _model$find11), _defineProperty({
            roll: 1,
            name: 1,
            _id: 0
          }, "".concat(qno), 1)));

        case 12:
          term3data = _context13.sent;
          incorrect2roll = new Set(term2data.map(function (item) {
            return item.roll;
          }));
          incorrect3roll = new Set(term3data.map(function (item) {
            return item.roll;
          }));
          common12 = term1data.filter(function (student) {
            return incorrect2roll.has(student.roll);
          });
          common13 = term1data.filter(function (student) {
            return incorrect3roll.has(student.roll);
          });
          common23 = term2data.filter(function (student) {
            return incorrect3roll.has(student.roll);
          });
          common123 = term1data.filter(function (student) {
            return incorrect2roll.has(student.roll) && incorrect3roll.has(student.roll);
          });
          term.push({
            questionNo: qno,
            namedata12: common12,
            namedata13: common13,
            namedata23: common23,
            namedata123: common123
          });
          res.render('termdetail', {
            term: term,
            subjectinput: subjectinput,
            studentClass: studentClass,
            section: section,
            status: status,
            qno: qno,
            terminal: terminal
          });
          _context13.next = 26;
          break;

        case 23:
          _context13.prev = 23;
          _context13.t0 = _context13["catch"](3);
          console.log(_context13.t0);

        case 26:
        case "end":
          return _context13.stop();
      }
    }
  }, null, null, [[3, 23]]);
};

exports.search = function _callee13(req, res, next) {
  var _req$params10, subject, studentClass, section, terminal, roll, model, individualData;

  return regeneratorRuntime.async(function _callee13$(_context14) {
    while (1) {
      switch (_context14.prev = _context14.next) {
        case 0:
          _req$params10 = req.params, subject = _req$params10.subject, studentClass = _req$params10.studentClass, section = _req$params10.section, terminal = _req$params10.terminal;
          roll = req.body.roll;
          model = getSubjectModel(subject);
          _context14.next = 5;
          return regeneratorRuntime.awrap(model.find({
            subject: "".concat(subject),
            section: "".concat(section),
            terminal: "".concat(terminal),
            roll: roll,
            studentClass: "".concat(studentClass)
          }, {
            _id: 0,
            __v: 0
          }).lean());

        case 5:
          individualData = _context14.sent;
          res.render("search", {
            individualData: individualData,
            subject: subject,
            studentClass: studentClass,
            section: section,
            terminal: terminal
          });

        case 7:
        case "end":
          return _context14.stop();
      }
    }
  });
};

exports.studentData = function _callee14(req, res, next) {
  var _req$params11, subjectinput, studentClass, section, qno, status, terminal, StudentData;

  return regeneratorRuntime.async(function _callee14$(_context15) {
    while (1) {
      switch (_context15.prev = _context15.next) {
        case 0:
          _req$params11 = req.params, subjectinput = _req$params11.subjectinput, studentClass = _req$params11.studentClass, section = _req$params11.section, qno = _req$params11.qno, status = _req$params11.status, terminal = _req$params11.terminal;
          model = getSubjectModel(subjectinput);
          _context15.next = 4;
          return regeneratorRuntime.awrap(model.find({
            $and: [_defineProperty({}, "".concat(qno), "".concat(status)), {
              section: "".concat(section)
            }, {
              terminal: "".concat(terminal)
            }]
          }));

        case 4:
          StudentData = _context15.sent;
          res.render("studentdata", {
            subjectinput: subjectinput,
            qno: qno,
            status: status,
            StudentData: StudentData,
            studentClass: studentClass,
            section: section,
            terminal: terminal
          });

        case 6:
        case "end":
          return _context15.stop();
      }
    }
  });
};

exports.totalStudent = function _callee15(req, res, next) {
  var _req$params12, subjectinput, studentClass, section, terminal, model, incorrectdata, currentSubject, max, _loop2, _i, totalStudent;

  return regeneratorRuntime.async(function _callee15$(_context18) {
    while (1) {
      switch (_context18.prev = _context18.next) {
        case 0:
          _req$params12 = req.params, subjectinput = _req$params12.subjectinput, studentClass = _req$params12.studentClass, section = _req$params12.section, terminal = _req$params12.terminal;
          model = getSubjectModel(subjectinput);
          incorrectdata = [];
          _context18.prev = 3;
          _context18.next = 6;
          return regeneratorRuntime.awrap(subjectlist.find({
            subject: subjectinput
          }));

        case 6:
          currentSubject = _context18.sent;

          if (!(!currentSubject || currentSubject.length === 0)) {
            _context18.next = 9;
            break;
          }

          return _context18.abrupt("return", res.status(404).json({
            message: "Subject not found"
          }));

        case 9:
          max = parseInt(currentSubject[0].max);

          _loop2 = function _loop2(_i) {
            var n, _loop3, _j;

            return regeneratorRuntime.async(function _loop2$(_context17) {
              while (1) {
                switch (_context17.prev = _context17.next) {
                  case 0:
                    n = currentSubject[0][_i] || 1; // Ensure n is at least 1

                    _loop3 = function _loop3(_j) {
                      var incorrectname;
                      return regeneratorRuntime.async(function _loop3$(_context16) {
                        while (1) {
                          switch (_context16.prev = _context16.next) {
                            case 0:
                              _context16.next = 2;
                              return regeneratorRuntime.awrap(model.find(_defineProperty({
                                studentClass: studentClass,
                                section: section,
                                terminal: terminal
                              }, "q".concat(_i).concat(String.fromCharCode(97 + _j)), "incorrect")));

                            case 2:
                              incorrectname = _context16.sent;
                              incorrectname.forEach(function (student) {
                                incorrectdata.push({
                                  questionNo: "q".concat(_i).concat(String.fromCharCode(97 + _j)),
                                  studentname: student.name // Extract names correctly

                                });
                              });
                              console.log("Incorrect Students for", "q".concat(_i).concat(String.fromCharCode(97 + _j)), incorrectname);

                            case 5:
                            case "end":
                              return _context16.stop();
                          }
                        }
                      });
                    };

                    _j = 0;

                  case 3:
                    if (!(_j <= n)) {
                      _context17.next = 9;
                      break;
                    }

                    _context17.next = 6;
                    return regeneratorRuntime.awrap(_loop3(_j));

                  case 6:
                    _j++;
                    _context17.next = 3;
                    break;

                  case 9:
                  case "end":
                    return _context17.stop();
                }
              }
            });
          };

          _i = 1;

        case 12:
          if (!(_i <= max)) {
            _context18.next = 18;
            break;
          }

          _context18.next = 15;
          return regeneratorRuntime.awrap(_loop2(_i));

        case 15:
          _i++;
          _context18.next = 12;
          break;

        case 18:
          _context18.next = 20;
          return regeneratorRuntime.awrap(model.find({
            studentClass: studentClass,
            section: section,
            terminal: terminal
          }).lean());

        case 20:
          totalStudent = _context18.sent;
          res.render("totalstudent", {
            totalStudent: totalStudent,
            subjectinput: subjectinput,
            studentClass: studentClass,
            section: section,
            terminal: terminal,
            incorrectdata: incorrectdata // Pass incorrect answers list to the frontend

          });
          _context18.next = 28;
          break;

        case 24:
          _context18.prev = 24;
          _context18.t0 = _context18["catch"](3);
          console.error("Error fetching students:", _context18.t0);
          res.status(500).json({
            message: "Server error"
          });

        case 28:
        case "end":
          return _context18.stop();
      }
    }
  }, null, null, [[3, 24]]);
};

exports.updateQuestion = function _callee16(req, res, next) {
  var no;
  return regeneratorRuntime.async(function _callee16$(_context19) {
    while (1) {
      switch (_context19.prev = _context19.next) {
        case 0:
          no = req.params.no;
          console.log(no);

        case 2:
        case "end":
          return _context19.stop();
      }
    }
  });
};