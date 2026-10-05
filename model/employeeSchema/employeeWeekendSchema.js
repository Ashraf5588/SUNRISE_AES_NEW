const mongoose = require('mongoose');

const employeeWeekendSchema = new mongoose.Schema({
  dateBs: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 100 }
}, { timestamps: true });

employeeWeekendSchema.index({ dateBs: 1 }, { unique: true });

module.exports = mongoose.models.EmployeeWeekend
  || mongoose.model('EmployeeWeekend', employeeWeekendSchema, 'employeeWeekends');
