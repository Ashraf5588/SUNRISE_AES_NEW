const mongoose = require('mongoose');
const { buildBookCodePrefix, generateBookCopyCodes, normalizeBookIsbn } = require('./libraryBookUtils');

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: false },
  isbn: { type: String, required: false, unique: false, sparse: true, default: undefined },
  category: { type: String, required: true },
  categoryColor: { type: String, default: '#2563eb' },
  shelvesNo: { type: String, default: '' },
  publisherName: { type: String, default: '' },
  publishedYear: { type: String, default: '' },
  date: { type: String, default: '' },
  edition: { type: String, default: '' },
  page: { type: String, default: '' },
  source: { type: String, default: '' },
  remarks: { type: String, default: '' },
  price: { type: Number, default: 0 },
  availableQuantity: { type: Number, required: true },
  totalQuantity: { type: Number, required: true },
  bookCodePrefix: { type: String, default: '' },
  stockBatches: [{
    batchNumber: { type: Number, required: true },
    quantity: { type: Number, required: true },
    codes: [{ type: String, default: [] }],
    createdAt: { type: Date, default: Date.now }
  }],
  bookCodes: [{
    code: { type: String, required: true },
    status: {
      type: String,
      enum: ['available', 'issued', 'returned', 'damaged', 'lost'],
      default: 'available'
    },
    issuedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', default: null },
    issuedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    condition: { type: String, default: 'good' },
    issueId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookIssue', default: null }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

bookSchema.pre('save', async function(next) {
  try {
    this.updatedAt = new Date();
    this.isbn = normalizeBookIsbn(this.isbn);

    const existingBooks = await mongoose.model('Book').find({
      _id: { $ne: this._id },
      bookCodePrefix: { $exists: true, $ne: '' }
    }).select('bookCodePrefix bookCodes').lean();

    const usedPrefixes = existingBooks.map((book) => book.bookCodePrefix).filter(Boolean);
    const usedCopyCodes = new Set(
      existingBooks
        .flatMap((book) => (book.bookCodes || []).map((copy) => String(copy.code || '').trim().toUpperCase()))
        .filter(Boolean)
    );

    if (!this.bookCodePrefix) {
      this.bookCodePrefix = buildBookCodePrefix({
        title: this.title,
        author: this.author,
        publisherName: this.publisherName,
        existingPrefixes: usedPrefixes
      });
    } else {
      const withSuffix = buildBookCodePrefix({
        title: this.title,
        author: this.author,
        publisherName: this.publisherName,
        existingPrefixes: usedPrefixes
      });
      this.bookCodePrefix = withSuffix;
    }

    if (this.totalQuantity > 0 && (!this.bookCodes || this.bookCodes.length < this.totalQuantity)) {
      const existingCodes = (this.bookCodes || []).map((copy) => copy.code);
      const missingCount = Math.max(0, this.totalQuantity - existingCodes.length);
      const generatedCodes = generateBookCopyCodes(this.bookCodePrefix, missingCount, existingCodes, [...usedCopyCodes]);

      const newCopies = generatedCodes.map((code) => ({
        code,
        status: 'available',
        condition: 'good',
        issuedTo: null,
        issuedAt: null,
        returnedAt: null,
        issueId: null
      }));

      this.bookCodes = [...(this.bookCodes || []), ...newCopies];

      if (generatedCodes.length > 0) {
        const nextBatchNumber = Number((this.stockBatches || []).length) + 1;
        this.stockBatches = [
          ...(this.stockBatches || []),
          {
            batchNumber: nextBatchNumber,
            quantity: generatedCodes.length,
            codes: generatedCodes,
            createdAt: new Date()
          }
        ];
      }
    }

    this.availableQuantity = Number(this.bookCodes?.filter((copy) => copy.status === 'available').length || this.availableQuantity || 0);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Book', bookSchema);