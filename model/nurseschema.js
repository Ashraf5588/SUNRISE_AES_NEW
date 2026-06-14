const mongoose = require('mongoose')
const { create } = require('./cirriculumSchema')
const healthrecordschema = new mongoose.Schema({
    reg: { type: String, required: true },
    name: { type: String, required: true },
    studentClass: { type: String, required: false },
    section: { type: String, required: false },
    roll: { type: String, required: false },
    fatherName: { type: String, required: false },
    address: { type: String, required: false },
    contactNumber: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
    nepaliDate: { type: String, default: '' },
    diagnosis: { type: String, required: true },
    treatment: { type: String, required: true },
    remarks: { type: String },
    referred: { type: Boolean, default: false },
    referNote: { type: String, default: '' },
})

module.exports = mongoose.models.HealthRecord || mongoose.model('HealthRecord', healthrecordschema, 'healthrecords')