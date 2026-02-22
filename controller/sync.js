const path = require("path");

const fs= require("fs");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema } = require("../model/schema");
const { studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema, terminalSchema,newsubjectSchema} = require("../model/adminschema");
const { marksheetsetupschemaForAdmin } = require("../model/marksheetschema");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");
const bcrypt = require("bcrypt");
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const { addChapterSchema } = require("../model/addchapterschema");
const addChapter = mongoose.model("addChapter", addChapterSchema, "addChapter");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const {examSchema}= require("../model/examschema");
const getSlipModel = () => {
  // to Check if model already exists
  if (mongoose.models[`exam_marks`]) {
    return mongoose.models[`exam_marks`];
  }
  return mongoose.model(`exam_marks`, examSchema, `exam_marks`);
};


async function syncTheoryMarks() {
  const students = await QuestionWise.distinct("studentId");

  for (const studentId of students) {
    const questions = await QuestionWise.find({ studentId });

    const total = questions.reduce((sum, q) => sum + q.mark, 0);

    await TheoryMarks.findOneAndUpdate(
      { studentId },
      { totalMarks: total },
      { upsert: true }
    );

    console.log(`Synced student ${studentId}`);
  }

  console.log("All data synced ✅");
}

syncTheoryMarks();