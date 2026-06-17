const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const IndicatorSchema = new Schema({
  indicatorName: { type: String, default: '' },
  maxMarks: { type: Number, default: 0 },
  // removed obtainedBefore/obtainedAfter per simplified model
}, { _id: false });

const ToolSchema = new Schema({
  toolName: { type: String, default: '' },
  indicators: { type: [IndicatorSchema], default: [] },
  // totalBefore/totalAfter removed; server will compute totalMax per tool
  totalMax: { type: Number, default: 0 }
}, { _id: false });

const AspectSchema = new Schema({
  aspectName: { type: String, default: '' },
  tools: { type: [ToolSchema], default: [] },
  totalMarks: { type: Number, default: 0 }
}, { _id: false });

const AspectContainerSchema = new Schema({
  studentClass: { type: String, default: '' },
  subject: { type: String, default: '' },
  credit: { type: Number, default: 0 },
  // section removed per simplified model (upsert by class+subject)
  aspects: { type: [AspectSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AspectContainerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AspectContainer', AspectContainerSchema, 'aspectcontainer');
