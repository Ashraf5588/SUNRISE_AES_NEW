const mongoose = require('mongoose');
const feeheadschema = new mongoose.Schema({
  feehead: { type: String, required: true },
  frequency: { type: String, required: true },
  group: { type: String, required: true },
  appliedmonth:[{ type: String, required: false }],
  reportname: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
    isTaxable: { type: Boolean, default: false }
});
const feeheadModel = mongoose.model('feehead', feeheadschema,'feehead');
module.exports = { feeheadschema, feeheadModel };