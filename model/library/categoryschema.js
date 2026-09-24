const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  requiredPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  displayOrder: {
    type: Number,
    default: 0,
    min: 0
  },
  colorName: {
    type: String,
    default: '',
    trim: true
  },
  colorHex: {
    type: String,
    default: '#2563eb',
    trim: true,
    validate: {
      validator: function(value) {
        return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value || '#2563eb');
      },
      message: 'Color must be a valid hex value.'
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('bookcategory', categorySchema, 'bookcategory');