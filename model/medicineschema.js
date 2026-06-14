const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  medicineName: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Medicine', medicineSchema);