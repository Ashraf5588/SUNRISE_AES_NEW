const mongoose = require("mongoose");
const lessonTextSchema = {
  type: [String],
  default: []
};

const annualLessonPlanSchema = new mongoose.Schema({
  forClass: { type: String, required: true },
  subject: { type: String, required: true },
  teacherName: { type: String, required: false },
  curriculumId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "cirriculum"
  },
  units: [
    {
      unitId: { type: mongoose.Schema.Types.ObjectId, required: false },
      unitName: { type: String, default: "" },
      content: lessonTextSchema,
      period: { type: String, default: "" },
      instructionalMaterial: lessonTextSchema,
      month: { type: String, default: "" }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

const unitPlanSchema = new mongoose.Schema({
  curriculumId: { type: mongoose.Schema.Types.ObjectId, ref: 'cirriculum', required: false },
  forClass: { type: String, required: true },
  teacherName: { type: String, required: false },
  subject: { type: String, required: true },
  units: [
    {
      unitId: { type: mongoose.Schema.Types.ObjectId, required: false },
      unitName: { type: String, default: "" },
      content: lessonTextSchema,
      period: { type: String, default: "" },
      objectives: lessonTextSchema,
      instructionalMaterial: lessonTextSchema,
      instructionalMethod: lessonTextSchema,
      evaluationProcess: lessonTextSchema,
      remarks: lessonTextSchema
    }
  ]
});

const dailyLessonSchema = new mongoose.Schema({
  date: { type: String, default: "" },
  nepaliDate: { type: String, default: "" },
  teacherName: { type: String, required: false },
  objective: { type: [String], default: [] },
  instructionalMaterial: { type: [String], default: [] },
  engage: { type: String, default: "" },
  explore: { type: String, default: "" },
  explain: { type: String, default: "" },
  elaborate: { type: String, default: "" },
  evaluate: { type: String, default: "" },
  assessment: { type: String, default: "" },
  assignment: { type: String, default: "" }
}, { _id: false });

const dailyPlanSchema = new mongoose.Schema({
  curriculumId: { type: mongoose.Schema.Types.ObjectId, ref: 'cirriculum', required: false },
  forClass: { type: String, required: true },
  subject: { type: String, required: true },
  teacherName: { type: String, required: false },
  units: [
    {
      unitId: { type: mongoose.Schema.Types.ObjectId, required: false },
      unitName: { type: String, default: "" },
      period: { type: String, default: "" },
      dailyLessons: { type: [dailyLessonSchema], default: [] }
    }
  ]
});
module.exports = {
  AnnualLessonPlan: mongoose.model('AnnualLessonPlan', annualLessonPlanSchema, 'annualLessonPlan'),
  UnitPlan: mongoose.model('UnitPlan', unitPlanSchema, 'unitPlans'),
  DailyPlan: mongoose.model('DailyPlan', dailyPlanSchema, 'dailyPlans')
};