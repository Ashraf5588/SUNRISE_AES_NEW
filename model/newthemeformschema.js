const mongoose = require('mongoose');
const newThemeFormSchema = new mongoose.Schema(
  {
    reg: {type:String, required:false},
    roll: { type: String, required: false},
    name: { type: String, required: false },
    studentClass: { type: String, required: false },
    section: { type: String, required: false },
    subject: { type: String, required: false },
    themeName: { type: String, required: false },
    learningOutcomeName: { type: String, required: false },
    aspectName: { type: String, required: false },
    toolName:{type:String, required:false},
    indicatorBefore: [{type: String, required:false}],
    indicatorAfter: [{type: String, required:false}],
    evalDateBefore: { type: String, required: false },
    evalDateAfter: { type: String, required: false },
    obtainedMarksBefore: { type: Number, required: false },
    obtainedMarksAfter: { type: Number, required: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }
);
module.exports = { newThemeFormSchema}
