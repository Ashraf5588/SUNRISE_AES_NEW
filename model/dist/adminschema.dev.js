"use strict";

var _require = require("mongoose"),
    mongoose = _require["default"];

var subjectSchema = new mongoose.Schema({
  "subject": {
    type: String,
    required: false
  },
  1: {
    type: Number,
    required: false
  },
  2: {
    type: Number,
    required: false
  },
  3: {
    type: Number,
    required: false
  },
  4: {
    type: Number,
    required: false
  },
  5: {
    type: Number,
    required: false
  },
  6: {
    type: Number,
    required: false
  },
  7: {
    type: Number,
    required: false
  },
  8: {
    type: Number,
    required: false
  },
  9: {
    type: Number,
    required: false
  },
  10: {
    type: Number,
    required: false
  },
  11: {
    type: Number,
    required: false
  },
  12: {
    type: Number,
    required: false
  },
  13: {
    type: Number,
    required: false
  },
  14: {
    type: Number,
    required: false
  },
  15: {
    type: Number,
    required: false
  },
  16: {
    type: Number,
    required: false
  },
  17: {
    type: Number,
    required: false
  },
  18: {
    type: Number,
    required: false
  },
  19: {
    type: Number,
    required: false
  },
  20: {
    type: Number,
    required: false
  },
  21: {
    type: Number,
    required: false
  },
  22: {
    type: Number,
    required: false
  },
  23: {
    type: Number,
    required: false
  },
  24: {
    type: Number,
    required: false
  },
  25: {
    type: Number,
    required: false
  }
}, {
  strict: false
});
var classSchema = new mongoose.Schema({
  "studentClass": {
    type: String,
    required: false
  },
  "section": {
    type: String,
    required: false
  }
});
module.exports = {
  subjectSchema: subjectSchema,
  classSchema: classSchema
};