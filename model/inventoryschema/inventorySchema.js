const mongoose = require('mongoose');

const inventoryCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const inventoryQuantityTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  abbreviation: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const inventoryProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, trim: true, default: undefined, unique: true, sparse: true },
  barcode: { type: String, trim: true, default: undefined, unique: true, sparse: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryCategory', default: undefined },
  categoryName: { type: String, trim: true, default: '' },
  quantityType: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryQuantityType', required: true },
  quantityTypeName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  price: { type: Number, required: true, min: 0, default: 0 },
  lowStockThreshold: { type: Number, required: true, min: 0, default: 5 },
  entryDateNepali: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  size: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });
inventoryProductSchema.index({ name: 1, sku: 1 });

const inventoryTransactionSchema = new mongoose.Schema({
  transactionNo: { type: String, required: true, unique: true, index: true },
  assignedAt: { type: Date, required: true, default: Date.now },
  assignedNepaliDate: { type: String, trim: true, default: '' },
  recipientType: { type: String, enum: ['staff', 'student'], required: true },
  recipientName: { type: String, required: true, trim: true },
  recipientId: { type: String, trim: true, default: '' },
  recipientClass: { type: String, trim: true, default: '' },
  reason: { type: String, required: true, trim: true },
  assignedBy: { type: String, required: true, trim: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryProduct', required: true },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    quantityTypeName: { type: String, required: true, trim: true }
  }]
}, { timestamps: true });
inventoryTransactionSchema.index({ assignedAt: -1 });

const inventoryProductRequestSchema = new mongoose.Schema({
  requesterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  requesterUsername: { type: String, required: true, trim: true },
  requestedAtNepali: { type: String, required: true, trim: true },
  requiredByNepali: { type: String, required: true, trim: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryProduct', default: undefined },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  quantityTypeName: { type: String, required: true, trim: true },
  availableQuantityAtRequest: { type: Number, min: 0, default: 0 },
  reason: { type: String, required: true, trim: true },
  color: { type: String, trim: true, default: '' },
  size: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  managerReason: { type: String, trim: true, default: '' },
  reviewedBy: { type: String, trim: true, default: '' },
  reviewedAt: { type: Date, default: null },
  stockDeducted: { type: Boolean, default: false }
}, { timestamps: true });
inventoryProductRequestSchema.index({ requesterId: 1, createdAt: -1 });
inventoryProductRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = {
  inventoryCategorySchema,
  inventoryQuantityTypeSchema,
  inventoryProductSchema,
  inventoryTransactionSchema,
  inventoryProductRequestSchema
};