const mongoose = require('mongoose');
const newsschema = new mongoose.Schema({
  headline: String,
  content: String,
  date: { type: Date, default: Date.now },
  image1Url: String,
  image2Url: String,
  gallery: [String]   // optional
});

module.exports = { newsschema };
