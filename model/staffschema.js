const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    staffName: {
      type: String,
      required: true,
      trim: true
    },
    bloodPressure: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = { staffSchema };
