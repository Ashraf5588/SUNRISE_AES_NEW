const mongoose = require('mongoose');
const transportSchema = new mongoose.Schema({
  routeName: { type: String, required: true },
  transportFee: { type: Number, required: true },
  academicSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true,
  },
});

module.exports = mongoose.models.Transport || mongoose.model('Transport', transportSchema);
