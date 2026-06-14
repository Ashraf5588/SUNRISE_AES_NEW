const mongoose = require('mongoose');
const marksheetSchema = new mongoose.Schema({
  "subject": { type: String, required: false },
  "studentClass": { type: String, required: false },
  "section": { type: String, required: false },
  "terminal": { type: String, required: false },
  "roll": { type: String, required: false },
  "name": { type: String, required: false },
  "theory": { type: Number, required: false },
  "practical": { type: Number, required: false },
  "totalmarks": { type: Number, required: false }
});
const terminalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  workingDays: { type: Number, required: true }
});
const marksheetsetupschemaForAdmin = new mongoose.Schema({
  schoolName: { type: String, required: true },
  address: { type: String },
  phone: { type: String },
  email: { type: String },
  website: { type: String },
  academicYear: { type: String },
  totalTerminals: { type: Number, required: false },
  
  terminals: [terminalSchema],
});
module.exports = { marksheetSchema, marksheetsetupschemaForAdmin };