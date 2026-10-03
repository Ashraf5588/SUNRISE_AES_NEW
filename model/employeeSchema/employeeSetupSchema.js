const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  parentBranchName: { type: String, trim: true, default: '' },
  branchHead: { type: String, trim: true, default: '' },
  branchAssistantHead: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  contactNumber: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' }
}, { timestamps: true });
branchSchema.index({ code: 1 }, { unique: true });

const departmentSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  nameNp: { type: String, trim: true, default: '' }
}, { timestamps: true });
departmentSchema.index({ code: 1 }, { unique: true });

const departmentSectionSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  nameNp: { type: String, trim: true, default: '' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  departmentName: { type: String, required: true, trim: true }
}, { timestamps: true });
departmentSectionSchema.index({ code: 1 }, { unique: true });

const designationSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  nameNp: { type: String, trim: true, default: '' },
  designationLevel: { type: String, trim: true, default: '' },
  maxSalary: { type: Number, min: 0, default: null },
  minSalary: { type: Number, min: 0, default: null },
  salaryBasis: { type: String, enum: ['Monthly', 'Daily', 'Hourly', 'Yearly'], default: 'Monthly' }
}, { timestamps: true });
designationSchema.index({ code: 1 }, { unique: true });

const shiftSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  nameNp: { type: String, trim: true, default: '' },
  shiftStart: { type: String, required: true, trim: true },
  shiftEnd: { type: String, required: true, trim: true },
  lunchStart: { type: String, trim: true, default: '' },
  lunchEnd: { type: String, trim: true, default: '' },
  shiftType: { type: String, enum: ['Fixed', 'Rotational', 'Flexible'], default: 'Fixed' }
}, { timestamps: true });
shiftSchema.index({ code: 1 }, { unique: true });

const getModel = (name, schema, collection) => mongoose.models[name] || mongoose.model(name, schema, collection);

module.exports = {
  Branch: getModel('Branch', branchSchema, 'branches'),
  Department: getModel('Department', departmentSchema, 'departments'),
  DepartmentSection: getModel('DepartmentSection', departmentSectionSchema, 'departmentSections'),
  Designation: getModel('Designation', designationSchema, 'designations'),
  Shift: getModel('Shift', shiftSchema, 'shifts')
};
