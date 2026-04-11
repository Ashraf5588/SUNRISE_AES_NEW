const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: false },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    location: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
   teacherName: { type: String, required: true },
    forClass: { type: String, required: true },
    reminder7Sent: { type: Boolean, default: false },
reminder1Sent: { type: Boolean, default: false }


});

const EventModel = mongoose.model('Event', eventSchema, 'Events');
module.exports = EventModel;