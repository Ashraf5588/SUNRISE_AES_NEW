const mongoose = require('mongoose')
const onlineAttendanceSchema = new mongoose.Schema({
  reg: {type:String, required:false},
  roll: {type:String, required:false},
  name: {type:String, required:false},
  studentClass: {type:String, required:false},
  section: {type:String, required:false},
attendance:[
  {
    academicYear: {type:String, required:false},
    month: {type:String, required:false},
    day: {type:String, required:false},
    status: {type:String, required:false},
  }
]
 

},{strict:false})
module.exports = {onlineAttendanceSchema};