const mongoose = require('mongoose');

// MongoDB has no built-in auto-increment. IRD audits specifically check
// that invoice/receipt numbers are sequential with no gaps and never
// reused - so this uses findOneAndUpdate with $inc, which is atomic even
// if two staff members generate a bill/receipt at the exact same moment.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "invoice_2082_083"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

module.exports = { Counter, getNextSequence };
