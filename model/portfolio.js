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
      nepaliDate: { type: String, required: false },
      reason: { type: String, required: false },
      imageUrls: [{ type: String, required: false }]
    }
  ],
  parentMeetings: [
    {
      nepaliDate: { type: String, required: false },
      visitingReason: { type: String, required: false },
      parentComplaint: { type: String, required: false },
      schoolResponse: { type: String, required: false },
      by: { type: String, required: false },
      createdAt: { type: Date, required: false }
    }
  ],
  participations: [
    {
      date: {type:"date", required: false},
      nepaliDate: {type:"String", required: false},
      event: {type:"String", required: false},
      position: {type:"String", required: false},
    }
  ],
  awards: [
    {
      date: {type:"date", required: false},
      nepaliDate: {type:"String", required: false},
      event: {type:"String", required: false},
      position: {type:"String", required: false},
    }
  ],
  scholarships: [
    {
      date: {type:"date", required: false},
      nepaliDate: {type:"String", required: false},
      amount: {type:"String", required: false},
      reason: {type:"String", required: false},
      year: {type:"String", required: false},
    }
  ],  
    }

);

const Portfolio = mongoose.model('Portfolio', portfolioSchema);
module.exports = Portfolio;