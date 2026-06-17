const mongoose = require('mongoose');

const addAspectSchema = new mongoose.Schema({
  forClass: [{ type: String, required: true }],
  subject: { type: String, required: true },
  totalaspect: { type: Number, required: true },
  aspect: [{ type: String }]
});
module.exports = { addAspectSchema };
