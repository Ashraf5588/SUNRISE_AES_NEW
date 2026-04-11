const mongoose = require('mongoose')
const attendanceSchema = new mongoose.Schema({
  reg: {type:String, required:false},
  roll: {type:String, required:false},
  name: {type:String, required:false},
  studentClass: {type:String, required:false},
  section: {type:String, required:false},
  firstTerm: {type:Number, required:false},
  secondTerm: {type:Number, required:false},
  thirdTerm: {type:Number, required:false},
  finalTerm: {type:Number, required:false},

},{strict:false})
module.exports = {attendanceSchema};