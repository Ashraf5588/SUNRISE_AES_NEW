const path = require("path");
const multer  = require('multer')
const fs= require("fs");
const express = require("express");
const bs = require("bikram-sambat-js");
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
const {holiday} = require('../model/holidayschema')
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const terminalModel = mongoose.model("terminal", terminalSchema, "terminal");
const { marksheetsetupschemaForAdmin ,routineSchema} = require("../model/marksheetschema");
const teacherSchema = require("../model/admin").teacherSchema;
const { onlineAttendanceSchema } = require("../model/onlineattendanceschema");
const { fail } = require("assert");
const routineModel = mongoose.model("routine", routineSchema, "routine");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const Portfolio = require("../model/portfolio");
const HealthRecord = require("../model/nurseschema");
const onlineAttendance = mongoose.model("onlineAttendance", onlineAttendanceSchema, "onlineAttendance");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const usermodel = mongoose.model("users", teacherSchema, "users");

const {feeheadschema} = require("../model/billing/feeheadschema");
const feeheadmodel = mongoose.model("FeeHead", feeheadschema, "feehead");

exports.billingDashboard = async (req, res) => {
  try {
   return res.render("./billing/feedashboard", {
    title: "Billing Dashboard"
   });
  }
  catch (error) {
    console.error("Error fetching billing data:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.feeHead = async (req, res) => {
  try {
    const feeheads = await feeheadmodel.find().sort({ createdAt: -1 }).lean();
    return res.render("./billing/feehead", {
      title: "Fee Head",
      feeheads,
      editFeeHead: null
    });
  } 
  catch (error) {
    console.error("Error fetching fee head data:", error);
    res.status(500).send("Internal Server Error");
  }
}

exports.editFeeHead = async (req, res) => {
  try {
    const [feeheads, editFeeHead] = await Promise.all([
      feeheadmodel.find().sort({ createdAt: -1 }).lean(),
      feeheadmodel.findById(req.params.id).lean()
    ]);

    if (!editFeeHead) {
      return res.status(404).send("Fee head not found");
    }

    return res.render("./billing/feehead", {
      title: "Edit Fee Head",
      feeheads,
      editFeeHead
    });
  } catch (error) {
    console.error("Error loading fee head for editing:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.addFeeHead = async (req, res) => {
  try {
    const { feehead, reportname } = req.body;
    const appliedmonth = Array.isArray(req.body.appliedmonth)
      ? req.body.appliedmonth
      : req.body.appliedmonth
        ? [req.body.appliedmonth]
        : [];
    console.log("Received data:", { feehead, appliedmonth, reportname });
    console.log("body data", req.body);

await feeheadmodel.create({
  feehead: feehead,
  appliedmonth: appliedmonth,
  reportname: reportname
});
    res.redirect('/feehead');
  } catch (error) {
    console.error("Error adding fee head:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.updateFeeHead = async (req, res) => {
  try {
    const { feehead, reportname } = req.body;
    const appliedmonth = Array.isArray(req.body.appliedmonth)
      ? req.body.appliedmonth
      : req.body.appliedmonth
        ? [req.body.appliedmonth]
        : [];

    await feeheadmodel.findByIdAndUpdate(req.params.id, {
      feehead,
      appliedmonth,
      reportname
    }, { runValidators: true });

    res.redirect('/feehead');
  } catch (error) {
    console.error("Error updating fee head:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.deleteFeeHead = async (req, res) => {
  try {
    await feeheadmodel.findByIdAndDelete(req.params.id);
    res.redirect('/feehead');
  } catch (error) {
    console.error("Error deleting fee head:", error);
    res.status(500).send("Internal Server Error");
  }
};
