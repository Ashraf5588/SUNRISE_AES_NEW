const mongoose = require('mongoose');

// This is the master list of "kinds" of fees: Tuition, Admission, Transport,
// Exam, Library, etc. The `frequency` field is the single switch the
// billing engine reads to decide whether an item belongs on THIS month's
// invoice:
//   MONTHLY   -> included on every bill while the student is active
//   ONE_TIME  -> included only on the invoice for the student's admission month
//   ANNUAL    -> included once per academic session (e.g. exam fee in one term)
//   QUARTERLY -> included every 3 months
const feeCategorySchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Tuition Fee"
  frequency: {
    type: String,
    enum: ['MONTHLY', 'ONE_TIME', 'ANNUAL', 'QUARTERLY'],
    required: true,
  },
  isTaxable: { type: Boolean, default: false }, // in case a VAT/equity-fee category applies later
});

module.exports = mongoose.model('FeeCategory', feeCategorySchema);
