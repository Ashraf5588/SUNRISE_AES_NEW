const mongoose = require('mongoose');
const EmployeeAttendanceSchema = new mongoose.Schema({
  sn:         { type: String, required: true },
  pin:        { type: String, required: true },
  name:       { type: String },
  punchTime:  { type: Date, required: true },
  status:     { type: Number },   // 0=In, 1=Out, 2=BreakOut, 3=BreakIn, 4=OTIn, 5=OTOut
  verifyMode: { type: Number },   // 1=Finger, 4=Card, 15=Face, 25=Palm

  // --- Computed by YOUR ERP (not from device) ---
  shiftId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  isLate:     { type: Boolean, default: false },
  lateMinutes:{ type: Number, default: 0 },
  isEarly:    { type: Boolean, default: false },
  earlyMinutes:{ type: Number, default: 0 },
  isOvertime: { type: Boolean, default: false },
  otMinutes:  { type: Number, default: 0 },
  extraClass: { type: Boolean, default: false },  // stayed past last period
  finalStatus:{ type: String },  // "Present", "Late", "Half Day", "Absent", "Extra Class"
});   
module.exports = mongoose.models.EmployeeAttendance || mongoose.model('EmployeeAttendance', EmployeeAttendanceSchema);