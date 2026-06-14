const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: false },
    description: { type: String, required: false },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    location: { type: String, required: false },
    material: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
   teacherName: { type: String, required: true },
    forClass: { type: [String], required: true },
    nepaliDate: { type: String, default: '' },
    // 7-day reminder tracking (old fields for backward compatibility)
    reminder7Sent: { type: Boolean, default: false },
    reminder7SentDate: { type: String, default: '' },
    reminder7SentHour: { type: Number, default: -1 }, // Hour in Kathmandu time (0-23)
    // 1-day reminder tracking (old fields for backward compatibility)
    reminder1Sent: { type: Boolean, default: false },
    reminder1SentDate: { type: String, default: '' },
    reminder1SentHour: { type: Number, default: -1 }, // Hour in Kathmandu time (0-23)
    // Same-day reminder tracking
    reminder0SentHour: { type: Number, default: -1 } // Hour for same-day reminder
});

const EventModel = mongoose.model('Event', eventSchema, 'Events');
module.exports = EventModel;