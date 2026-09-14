const mongoose = require('mongoose');

const feeInvoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'studentRecord', required: true },
  reg: { type: String, required: true },
  studentName: { type: String, required: true },
  studentClass: { type: String, required: true },
  section: { type: String, default: '' },
  academicYear: { type: String, required: true },
  nepaliMonth: { type: String, required: true },
  items: [{
    feehead: { type: String, required: true },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
    amount: { type: Number, required: true, min: 0 }
  }],
  discount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID' },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = { feeInvoiceSchema };
