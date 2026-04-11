const mongoose = require('mongoose');

const cirriculumSchema = new mongoose.Schema({
  forClass: { type: String, required: true },
  subject: { type: String, required: true },
  units:[
    {
      unitName: { type: String, required: false },
      content:[],
      period: { type: String, required: false },
   
      remarks: { type: String, required:false },
      objectives:[],
      instructionalMethod:[],
     
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cirriculum', cirriculumSchema, 'curriculum');

