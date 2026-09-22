const mongoose = require('mongoose');

const bookIssueSchema = new mongoose.Schema({
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  bookTitle: {
    type: String,
    required: true
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LibraryMember',
    required: true
  },
  memberName: {
    type: String,
    required: true
  },
  memberType: {
    type: String,
    enum: ['student', 'staff'],
    default: 'student'
  },
  quantity: {
    type: Number,
    default: 1
  },
  bookCodes: [{ type: String, default: [] }],
  issuedAt: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    default: null
  },
  returnedAt: {
    type: Date,
    default: null
  },
  returnQuantity: {
    type: Number,
    default: 0
  },
  returnedBookCodes: [{ type: String, default: [] }],
  conditionOnReturn: {
    type: String,
    default: 'good'
  },
  notes: {
    type: String,
    default: ''
  },
  isLate: {
    type: Boolean,
    default: false
  },
  daysLate: {
    type: Number,
    default: 0
  },
  fineAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['issued', 'returned'],
    default: 'issued'
  }
}, { timestamps: true });

module.exports = mongoose.model('BookIssue', bookIssueSchema, 'bookissues');
