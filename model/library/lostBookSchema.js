const mongoose = require('mongoose');

const lostBookSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  bookTitle: { type: String, required: true },
  bookCode: { type: String, required: true, trim: true },
  isbn: { type: String, default: '' },
  issueId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookIssue', default: null },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', default: null },
  memberName: { type: String, default: '' },
  lossDate: { type: Date, required: true },
  lossDateBS: { type: String, default: '' },
  reportedDate: { type: Date, required: true },
  reportedDateBS: { type: String, default: '' },
  reason: { type: String, required: true, trim: true },
  reportedBy: { type: String, default: '' },
  replacementCost: { type: Number, default: 0, min: 0 },
  fineAmount: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['reported', 'under-review', 'settled', 'recovered', 'written-off'],
    default: 'reported'
  },
  notes: { type: String, default: '' },
  recoveredAt: { type: Date, default: null },
  recoveryNotes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('LostBook', lostBookSchema, 'lostbooks');
