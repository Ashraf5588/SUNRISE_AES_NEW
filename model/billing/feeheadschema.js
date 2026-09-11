const mongoose = require('mongoose');
const feeheadschema = new mongoose.Schema({
  feehead: { type: String, required: true },
  appliedmonth:[{ type: String, required: false }],
  reportname: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = { feeheadschema };