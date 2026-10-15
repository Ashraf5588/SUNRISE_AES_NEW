
const mongoose = require("mongoose");

const attendanceTotalSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },

    terminal: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    studentClass: {
      type: String,
      required: true,
      trim: true,
    },

    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    reg: {
      type: String,
      required: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      default: "",
    },

    // Total instructional/exam days applicable
    totalDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Student's attendance count
    presentDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    absentDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Final attendance marks used by your marksheet
    attendanceMarks: {
      type: Number,
      default: 0,
      min: 0,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    updatedBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// One attendance record per student per terminal
attendanceTotalSchema.index(
  {
    academicYear: 1,
    terminal: 1,
    studentClass: 1,
    section: 1,
    reg: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "attendanceTotal",
  attendanceTotalSchema
);
