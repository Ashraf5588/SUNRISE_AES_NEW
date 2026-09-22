const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  memberType: {
    type: String,
    enum: ['student', 'staff'],
    required: true,
    default: 'student'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  studentReg: {
    type: String,
    trim: true,
    default: ''
  },
  studentClass: {
    type: String,
    trim: true,
    default: ''
  },
  section: {
    type: String,
    trim: true,
    default: ''
  },
  staffUsername: {
    type: String,
    trim: true,
    default: ''
  },
  staffId: {
    type: String,
    trim: true,
    default: ''
  },
  contactNumber: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  membershipFee: {
    type: Number,
    default: 0
  },
  membershipCollected: {
    type: Number,
    default: 0
  },
  membershipDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('LibraryMember', memberSchema, 'librarymembers');
