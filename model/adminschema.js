const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  "subject": { type: String, required: false },
  "forClass": { type: String, required: false },
  "forTerminal": { type: String, required: false },
  "max": { type: String, required: false },
  "questionPaperOfClass": { type: String, required: false },
  "chapter":[
    {
      "chapterName": { type: String, required: false },
      "questions": [{ type: String, required: false }],
    },
  ],
  
  // Chapter mapping for questions - stores which chapter each question belongs to
  "chapterMapping": {
    type: Object,
    default: {}
    // Example: { "q1": "Scientific Learning", "q1a": "Scientific Learning", "q1b": "Scientific Learning" }
  },
  
  // Example fields for question formats
  "q1a": { type: Number },
  "q1b": { type: Number },
  "q1a_i": { type: Number },
  "q1a_ii": { type: Number },
  "q1_subcount": { type: Number },
  "q1_marks_per_sub": { type: Number },
  "q1a_has_subparts": { type: Boolean },
  "q1a_subparts_count": { type: Number },
  "q1a_marks_per_subpart": { type: Number }
  
},{strict:false})

// Chapter Schema
const chapterSchema = new mongoose.Schema({
  "forClass": [{ type: String }],
  "subject": { type: String, required: true },
  "totalchapters": { type: Number },
  "chapters": [{ type: String }]
});




const classSchema = new mongoose.Schema({

  
"studentClass":{ type: String,required: false},
  "section":{ type: String,required: false},

})
const terminalSchema = new mongoose.Schema({

  "terminal":{ type: String,required: false},

})

const studentrecordschema = new mongoose.Schema({
  "reg": { type: String, required: false },
  "name":{ type: String,required: false},
  "studentClass":{ type: String,required: false},
  "section":{ type: String,required: false},
  "roll":{ type: Number,required: false},
  "gender": {type: String, required:false}
})
const newsubjectSchema = new mongoose.Schema({
  "subject":{ type: String,required: false},
  "forClass":{ type: String,required: false},
  "theory":{ type: Number,required: false},
  "practical":{ type: Number,required: false},
  "total":{ type: Number,required: false},
  "passingMarks":{ type: Number,required: false},
  "theoryCreditHour":{ type: Number,required: false},
  "practicalCreditHour":{ type: Number,required: false},

},{strict:false})
const marksheetsetupSchema = new mongoose.Schema({
  "schoolName": { type: String, required: false },
  "address": { type: String, required: false },
  "phone": { type: String, required: false },
  "website": { type: String, required: false },
  "academicYear": { type: String, required: false },
  "totalTerminals": { type: Number, required: false },
  terminals: [
    {
      name: { type: String, required: false },
      workingDays: { type: Number, required: false }
    }
  ],
})
module.exports = {subjectSchema,classSchema,terminalSchema,studentrecordschema,newsubjectSchema,marksheetsetupSchema};
