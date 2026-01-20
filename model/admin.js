const mongoose = require('mongoose');
const adminSchema = new mongoose.Schema({
 "username":String,
 "password":String,
 "role":String

  
});
const superadminSchema = new mongoose.Schema({
 "username":String,
 "password":String,
 "role":String

});

const teacherSchema = new mongoose.Schema({
  "teacherName": String,
  "teacherId": String,
  "role": String,
  "allowedSubjects": [{
    "subject": String,
    "studentClass": String,
    "section": String,
  }],

  "username": String,
  "password": String,
  tokenVersion: { type: Number, default: "1" },

}, { strict: false });

module.exports = {adminSchema, superadminSchema, teacherSchema};