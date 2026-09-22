const mongoose = require('mongoose');

// Plain lookup table. Kept separate so class names/order can be
// edited in one place and reused by both Student and FeeStructure.
const classSchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Nursery", "Class 5"
  order: { type: Number, required: true }, // for sorting in dropdowns/reports
});

module.exports = mongoose.models.Class || mongoose.model('Class', classSchema);
