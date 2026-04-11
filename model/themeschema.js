const mongoose = require('mongoose')

const themeSchemaFor1 = new mongoose.Schema(
  {
    studentClass: {type:String, required:false},
    subject:{ type:String, required:false},
    credit: {type:Number,required:false},
    themes: [
            {
                themeName: {type:String, required:false},
                learningOutcome: [

                  {
                    learningOutcomeName: {type:String, required:false},
                     indicators: [
                      {
                        indicatorName: {type:String, required:false},
                        indicatorsMarks: {type:Number, required:false},
                      

                     }],
                     totalMarks : {type:Number, required:false},
                  }
                ],
            }
        ],
    date: {type:Date, required:false},
    teacherName: {type:String, required:false},
    

  }
)


const scienceSchema = new mongoose.Schema(
  {
    studentClass: { type: String, required: true },
    section: { type: String, required: false },
    subject: { type: String, required: false},
    terminal: {type:String, required: false},
    units: [
      {
        unitName: { type: String, required: false },
        portion: { type: String, required: false },
        practicals: [{ type: String, required: false}],
        projectworks: [{ type: String, required: false}]
      }
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  } 
)

FinalPracticalSlipSchema = new mongoose.Schema
(
  {
    reg: {type:String, required:false},
    roll: { type: String, required: false},
    name: { type: String, required: false },
    studentClass: { type: String, required: false },
    section: { type: String, required: false },
    attendanceParticipation: { type: Number, required: false },
    practicalProject: { type: Number, required: false },
    terminal: { type: Number, required: false },
    total: { type: Number, required: false },
    grade: { type: String, required: false }
  }
)
module.exports = { themeSchemaFor1,scienceSchema,FinalPracticalSlipSchema }