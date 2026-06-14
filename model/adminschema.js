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
  "gender": {type: String, required:false},
  createdAt: { type: Date, default: Date.now },
  dob: { type: Date, required: false },
  classStartedAt: { type: Date, required: false },
  age: { type: String, required: false },
  height: { type: String, required: false },
  heightFeet: { type: Number, required: false },
  heightInch: { type: Number, required: false },
  weight: { type: String, required: false },
  bmi: { type: String, required: false },
  muaq: { type: String, required: false },
  mothersToungue: { type: String, required: false },
  previousSchool: { type: String, required: false },
  classGroup: { type: String, required: false },
  admissionStatus: { type: String, required: false },
  district: { type: String, required: false },
  fatherName: { type: String, required: false },
  address: { type: String, required: false },
  dobNepali: { type: String, required: false },
  religion: { type: String, required: false },
  ethnicity: { type: String, required: false },
  busStop: { type: String, required: false },
  house: { type: String, required: false },
  regdNo: { type: String, required: false },
  status: { type: String, required: false },
  registrationDate: { type: Date, required: false },
  fatheroccupation: { type: String, required: false },
  fatherMobile: { type: String, required: false },
  fatherContact: { type: String, required: false },
  fatherqualification: { type: String, required: false },
  motherName: { type: String, required: false },
  motheroccupation: { type: String, required: false },
  motherMobile: { type: String, required: false },
  motherContact: { type: String, required: false },
  motherqualification: { type: String, required: false },
  otherguardianName: { type: String, required: false },
  otherguardianOccupation: { type: String, required: false },
  otherguardianContact: { type: String, required: false },
  yearlyIncome: { type: String, required: false },
  bloodGroup: { type: String, required: false },
  anyMedicalCondition: [{ type: String, required: false }],
  otherbehaviouralCondition: { type: String, required: false },
  eyeproblem: { type: Boolean, required: false, default: false },
  earproblem: { type: Boolean, required: false, default: false },
  hairproblem: { type: Boolean, required: false, default: false },
  liveWithFather: { type: Boolean, required: false },
  liveWithMother: { type: Boolean, required: false },
  parentViewTowardsSchool: { type: String, required: false, default: 'positive' },
  parentVisitFrequency: { type: String, required: false },
  numberofmobile: { type: String, required: false },
  handicap: { type: String, required: false },
  iemisNo: { type: String, required: false },
  tvatHome: { type: String, required: false },
  internetAtHome: { type: String, required: false },
  feepaidduration: { type: String, required: false },
 
  
 

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
