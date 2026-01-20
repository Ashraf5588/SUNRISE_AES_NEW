const mongoose = require('mongoose');

const addChapterSchema = new mongoose.Schema({
  forClass: [{ type: String, required: true }],
  subject: { type: String, required: true },
  totalchapters: { type: Number, required: true },
  chapters: [{ type: String }]
});
module.exports = { addChapterSchema };