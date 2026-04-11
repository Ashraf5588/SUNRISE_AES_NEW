const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  reg: { type: String, required: true },
  name: { type: String, required: true },
  studentClass: { type: String, required: true },
  section: { type: String, required: true },
  attendance: { type: Number, required: false },

  complaints: [
    {
      by: { type: String, required: false },   // teacher name or id
      date: { type: Date, required: false },
      reason: { type: String, required: false }
    }
  ]
});

const Portfolio = mongoose.model('Portfolio', portfolioSchema);
module.exports = Portfolio;