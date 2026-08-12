const mongoose = require('mongoose');
const holidaySchema = new mongoose.Schema({
    academicYear: { type: String, required: true },
    month:[
      {
        monthName: { type: String, required: true },
        holidayDays: [{ type: Number, required: true }]
      }
    ]
   
});
const holiday = mongoose.model("holiday",holidaySchema,"holiday")
module.exports = { holidaySchema,holiday};