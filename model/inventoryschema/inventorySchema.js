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
  supplierName: { type: String, trim: true, maxlength: 120, default: '' },
  quantityType: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryQuantityType', required: true },
  quantityTypeName: { type: String, required: true, trim: true },
  buyQuantity: { type: Number, min: 0, default: undefined },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  baseUnit: { type: String, trim: true, default: '' },
  purchaseUnit: { type: String, trim: true, default: '' },
  conversionFactor: { type: Number, min: Number.EPSILON, default: 1 },
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
  submissionKey: { type: String, trim: true, default: undefined },
  status: { type: String, enum: ['pending', 'posted'], default: 'posted', index: true },
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
    quantity: { type: Number, required: true, min: Number.EPSILON },
    enteredQuantity: { type: Number, min: Number.EPSILON, default: undefined },
    unitName: { type: String, trim: true, default: '' },
    conversionFactor: { type: Number, min: Number.EPSILON, default: 1 },
    baseQuantity: { type: Number, min: Number.EPSILON, default: undefined },
    baseUnitName: { type: String, trim: true, default: '' },
    returnedQuantity: { type: Number, min: 0, default: 0 },
    quantityTypeName: { type: String, required: true, trim: true }
  }]
}, { timestamps: true });
inventoryTransactionSchema.index({ assignedAt: -1 });
inventoryTransactionSchema.index({ submissionKey: 1 }, { unique: true, sparse: true });

const inventoryReturnSchema = new mongoose.Schema({
  returnType: { type: String, enum: ['sales', 'purchase'], required: true, index: true },
  returnNo: { type: String, required: true, unique: true },
  returnedAt: { type: Date, required: true, default: Date.now },
  returnNepaliDate: { type: String, required: true, trim: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryProduct', required: true },
  productName: { type: String, required: true, trim: true },
  sku: { type: String, trim: true, default: '' },
  quantityTypeName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: Number.EPSILON },
  conversionFactor: { type: Number, min: Number.EPSILON, default: 1 },
  baseQuantity: { type: Number, min: Number.EPSILON, default: undefined },
  baseUnitName: { type: String, trim: true, default: '' },
  sourceQuantity: { type: Number, required: true, min: 0 },
  previouslyReturned: { type: Number, min: 0, default: 0 },
  sourceTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryTransaction', default: undefined },
  sourceItemId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  sourceTransactionNo: { type: String, trim: true, default: '' },
  sourceDateNepali: { type: String, trim: true, default: '' },
  counterpartyName: { type: String, required: true, trim: true },
  counterpartyType: { type: String, trim: true, default: '' },
  counterpartyClass: { type: String, trim: true, default: '' },
  referenceNo: { type: String, trim: true, default: '' },
  reason: { type: String, required: true, trim: true },
  returnedBy: { type: String, required: true, trim: true }
}, { timestamps: true });
inventoryReturnSchema.index({ returnType: 1, returnedAt: -1 });
inventoryReturnSchema.index({ sourceTransaction: 1, sourceItemId: 1 });

const inventoryPurchaseSchema = new mongoose.Schema({
  purchaseNo: { type: String, required: true, unique: true, index: true },
  submissionKey: { type: String, required: true, unique: true, index: true },
  purchasedAt: { type: Date, required: true, default: Date.now },
  purchaseNepaliDate: { type: String, required: true, trim: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryProduct', required: true },
  productName: { type: String, required: true, trim: true },
  sku: { type: String, trim: true, default: '' },
  enteredQuantity: { type: Number, required: true, min: Number.EPSILON },
  purchaseUnit: { type: String, required: true, trim: true },
  conversionFactor: { type: Number, required: true, min: Number.EPSILON },
  baseQuantity: { type: Number, required: true, min: Number.EPSILON },
  baseUnit: { type: String, required: true, trim: true },
  unitCost: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0 },
  supplierName: { type: String, trim: true, default: '' },
  referenceNo: { type: String, trim: true, default: '' },
  purchasedBy: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'posted'], default: 'pending', index: true }
}, { timestamps: true });
inventoryPurchaseSchema.index({ purchasedAt: -1 });

const inventoryProductRequestSchema = new mongoose.Schema({
  requesterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  requesterUsername: { type: String, required: true, trim: true },
  requestedById: { type: mongoose.Schema.Types.ObjectId, default: null },
  requestedByName: { type: String, required: true, trim: true },
  recommendedBy: { type: String, required: true, trim: true },
  requestedAtNepali: { type: String, required: true, trim: true },
  requiredByNepali: { type: String, required: true, trim: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'inventoryProduct', default: undefined },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: Number.EPSILON },
  quantityTypeName: { type: String, required: true, trim: true },
  availableQuantityAtRequest: { type: Number, min: 0, default: 0 },
  reason: { type: String, required: true, trim: true },
  color: { type: String, trim: true, default: '' },
  size: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  managerReason: { type: String, trim: true, default: '' },
  reviewedBy: { type: String, trim: true, default: '' },
  reviewedAt: { type: Date, default: null },
  stockDeducted: { type: Boolean, default: false },
  issuedTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { timestamps: true });
inventoryProductRequestSchema.index({ requesterId: 1, createdAt: -1 });
inventoryProductRequestSchema.index({ requestedById: 1, createdAt: -1 });
inventoryProductRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = {
  inventoryCategorySchema,
  inventoryQuantityTypeSchema,
  inventoryProductSchema,
  inventoryTransactionSchema,
  inventoryReturnSchema,
  inventoryPurchaseSchema,
  inventoryProductRequestSchema
};