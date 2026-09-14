const mongoose = require('mongoose');
const feestructureschema = new mongoose.Schema({
  feehead: { type: String, required: true },
  feeheadId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeHead', required: true },
forClasses: [{ type: String, required: true }],
  frequency: { type: String, required: true },
  description: { type: String, required: false },
  amount: { type: Number, required: true },
  group: { type: String, required: true },


  createdAt: { type: Date, default: Date.now }
});

module.exports = { feestructureschema };