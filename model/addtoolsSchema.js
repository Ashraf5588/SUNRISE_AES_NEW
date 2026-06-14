const mongoose = require('mongoose');

const addToolsSchema = new mongoose.Schema({
  forClass: [{ type: String, required: true }],
  subject: { type: String, required: true },
  totaltools: { type: Number, required: true },
  tools: [{ type: String }]
});
module.exports = { addToolsSchema };