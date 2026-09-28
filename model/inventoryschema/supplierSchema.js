const mongoose = require('mongoose');

const inventorySupplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  normalizedName: { type: String, required: true, unique: true, select: false },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = { inventorySupplierSchema };