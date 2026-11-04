const mongoose = require('mongoose');
const bs = require('../../utils/bikramSambat');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const {
  inventoryCategorySchema,
  inventoryQuantityTypeSchema,
  inventoryProductSchema,
  inventoryTransactionSchema,
  inventoryReturnSchema,
  inventoryPurchaseSchema,
  inventoryProductRequestSchema
} = require('../../model/inventoryschema/inventorySchema');
const {
  roundQuantity,
  getProductUnits,
  convertToBaseQuantity,
  describeEquivalentStock,
  hasSufficientStock
} = require('../../utils/inventoryUnitConversion');
const { inventorySupplierSchema } = require('../../model/inventoryschema/supplierSchema');
const { teacherSchema } = require('../../model/admin');
const { studentrecordschema } = require('../../model/adminschema');

const InventoryCategory = mongoose.models.inventoryCategory || mongoose.model('inventoryCategory', inventoryCategorySchema, 'inventoryCategories');
const InventoryQuantityType = mongoose.models.inventoryQuantityType || mongoose.model('inventoryQuantityType', inventoryQuantityTypeSchema, 'inventoryQuantityTypes');
const InventoryProduct = mongoose.models.inventoryProduct || mongoose.model('inventoryProduct', inventoryProductSchema, 'inventoryProducts');
const InventoryTransaction = mongoose.models.inventoryTransaction || mongoose.model('inventoryTransaction', inventoryTransactionSchema, 'inventoryTransactions');
const InventoryReturn = mongoose.models.inventoryReturn || mongoose.model('inventoryReturn', inventoryReturnSchema, 'inventoryReturns');
const InventoryPurchase = mongoose.models.inventoryPurchase || mongoose.model('inventoryPurchase', inventoryPurchaseSchema, 'inventoryPurchases');
const InventoryProductRequest = mongoose.models.inventoryProductRequest || mongoose.model('inventoryProductRequest', inventoryProductRequestSchema, 'inventoryProductRequests');
const InventorySupplier = mongoose.models.inventorySupplier || mongoose.model('inventorySupplier', inventorySupplierSchema, 'inventorySuppliers');
const User = mongoose.models.inventoryUser || mongoose.model('inventoryUser', teacherSchema, 'users');
const StudentRecord = mongoose.models.inventoryStudentRecord || mongoose.model('inventoryStudentRecord', studentrecordschema, 'studentrecord');
const inventoryCsvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const transactionCsvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const PAGE_SIZE = 25;
const COMMON_PURCHASE_UNITS = ['Piece', 'Packet', 'Box', 'Carton', 'Dozen', 'Kg', 'Gram', 'Litre', 'Ml', 'Metre'];
const parsePage = (value) => Math.max(1, Number.parseInt(value, 10) || 1);
const startInventoryTransaction = async () => {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  if (!['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced'].includes(topologyType)) return null;
  const session = await mongoose.startSession();
  session.startTransaction();
  return session;
};
const normalizeProductStockDisplay = (product) => {
  const units = getProductUnits(product);
  return { ...product, ...units, stockEquivalent: describeEquivalentStock(product.quantity, product) };
};
const parsePositiveFactor = (value) => {
  const factor = Number(value);
  const roundedFactor = roundQuantity(factor);
  return Number.isFinite(factor) && factor > 0 && roundedFactor > 0 ? roundedFactor : null;
};
const standardizeProductName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^./, (character) => character.toUpperCase());
const productNameKey = (value) => standardizeProductName(value).replace(/\s+/g, '').toLowerCase();
const productNamePattern = (value) => {
  const normalizedName = productNameKey(value);
  if (!normalizedName) return null;
  const escapeRegExp = (character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${[...normalizedName].map(escapeRegExp).join('\\s*')}$`, 'i');
};
const normalizeProductIdentityValue = (value) => String(value ?? '').trim().toLowerCase();
const productIdentityKey = (product) => JSON.stringify([
  productNameKey(product.name),
  normalizeProductIdentityValue(product.categoryName),
  normalizeProductIdentityValue(getProductUnits(product).baseUnit),
  normalizeProductIdentityValue(getProductUnits(product).purchaseUnit),
  getProductUnits(product).conversionFactor,
  normalizeProductIdentityValue(product.color),
  normalizeProductIdentityValue(product.size),
  normalizeProductIdentityValue(product.sku),
  normalizeProductIdentityValue(product.barcode)
]);
const findMatchingProductRecords = async (product, excludeId) => {
  const namePattern = productNamePattern(product.name);
  if (!namePattern || !product.quantityType) return [];
  const filter = { active: true, quantityType: product.quantityType, name: namePattern };
  if (excludeId) filter._id = { $ne: excludeId };
  const candidates = await InventoryProduct.find(filter).lean();
  return candidates.filter(candidate => {
    const productDate = normalizeProductIdentityValue(product.entryDateNepali);
    const candidateDate = normalizeProductIdentityValue(candidate.entryDateNepali);
    const sameDate = !productDate || !candidateDate || productDate === candidateDate;
    const sameVariant = normalizeProductIdentityValue(candidate.color) === normalizeProductIdentityValue(product.color)
      && normalizeProductIdentityValue(candidate.size) === normalizeProductIdentityValue(product.size)
      && normalizeProductIdentityValue(candidate.categoryName) === normalizeProductIdentityValue(product.categoryName);
    const skuCompatible = !candidate.sku || !product.sku || normalizeProductIdentityValue(candidate.sku) === normalizeProductIdentityValue(product.sku);
    const barcodeCompatible = !candidate.barcode || !product.barcode || normalizeProductIdentityValue(candidate.barcode) === normalizeProductIdentityValue(product.barcode);
    return sameDate && sameVariant && skuCompatible && barcodeCompatible;
  });
};
const buildProductStockMergeOperation = (existing, incoming) => {
  const existingBuyQuantity = existing.buyQuantity === undefined || existing.buyQuantity === null
    ? Number(existing.quantity) || 0
    : Number(existing.buyQuantity) || 0;
  const setValues = {
    buyQuantity: existingBuyQuantity + (Number(incoming.buyQuantity) || 0),
    entryDateNepali: String(incoming.entryDateNepali || '') > String(existing.entryDateNepali || '')
      ? incoming.entryDateNepali
      : existing.entryDateNepali || incoming.entryDateNepali || ''
  };
  if (!existing.supplierName && incoming.supplierName) setValues.supplierName = incoming.supplierName;
  if (!existing.sku && incoming.sku) setValues.sku = incoming.sku;
  if (!existing.barcode && incoming.barcode) setValues.barcode = incoming.barcode;
  return {
    updateOne: {
      filter: { _id: existing._id, active: true },
      update: { $set: setValues, $inc: { quantity: Number(incoming.quantity) || 0 } }
    }
  };
};
const groupInventoryProducts = (products) => {
  const groups = new Map();
  for (const product of products) {
    const key = productIdentityKey(product);
    let group = groups.get(key);
    if (!group) {
      group = { ...product, quantity: 0, stockRecords: [] };
      groups.set(key, group);
    }
    group.quantity += Number(product.quantity) || 0;
    group.stockRecords.push(product);
  }
  return [...groups.values()];
};
const decrementGroupedProductStock = async (products, requestedQuantities, decremented, session = null) => {
  const groups = groupInventoryProducts(products);
  const groupByKey = new Map(groups.map((group) => [productIdentityKey(group), group]));
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const requestedByGroup = new Map();

  for (const [productId, quantity] of requestedQuantities) {
    const product = productById.get(String(productId));
    if (!product) throw new Error('PRODUCT_MISSING');
    const key = productIdentityKey(product);
    requestedByGroup.set(key, (requestedByGroup.get(key) || 0) + quantity);
  }

  for (const [key, totalQuantity] of requestedByGroup) {
    const group = groupByKey.get(key);
    if (!hasSufficientStock(group.quantity, totalQuantity)) throw new Error('INSUFFICIENT_STOCK');
    let remaining = totalQuantity;
    const stockRecords = [...group.stockRecords].sort((left, right) => {
      const leftDate = new Date(left.createdAt || 0).getTime() || 0;
      const rightDate = new Date(right.createdAt || 0).getTime() || 0;
      return leftDate - rightDate || String(left._id).localeCompare(String(right._id));
    });

    for (const stockRecord of stockRecords) {
      const available = Number(stockRecord.quantity) || 0;
      const deduction = Math.min(available, remaining);
      if (deduction <= 0) continue;
      const updated = await InventoryProduct.findOneAndUpdate(
        { _id: stockRecord._id, active: true, quantity: { $gte: deduction } },
        { $inc: { quantity: -deduction } },
        { new: true, ...(session ? { session } : {}) }
      );
      if (!updated) continue;
      decremented.push({ productId: String(stockRecord._id), quantity: deduction });
      remaining -= deduction;
      if (remaining <= 1e-8) {
        remaining = 0;
        break;
      }
    }

    if (remaining > 0) throw new Error('INSUFFICIENT_STOCK');
  }
};
const saveSupplierName = async (value) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) return '';
  const normalizedName = name.toLowerCase();
  try {
    await InventorySupplier.updateOne(
      { normalizedName },
      { $setOnInsert: { name, normalizedName, active: true } },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return name;
};

const parseInventoryCsv = (buffer) => new Promise((resolve, reject) => {
  const rows = [];
  const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const headerNames = {
    entrydatenepali: 'entryDateNepali',
    suppliername: 'supplierName',
    lowstockthreshold: 'lowStockThreshold',
    assignmentref: 'assignmentRef',
    recipienttype: 'recipientType',
    recipientname: 'recipientName',
    recipientid: 'recipientId',
    recipientclass: 'recipientClass',
    assignednepalidate: 'assignedNepaliDate',
    assignedby: 'assignedBy',
    productsku: 'productSku',
    productname: 'productName'
  };
  Readable.from([csvText]).pipe(csvParser({
    mapHeaders: ({ header }) => {
      const normalizedHeader = String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return headerNames[normalizedHeader] || normalizedHeader;
    }
  })).on('data', (row) => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
});

const renderPage = (res, view, data = {}) => res.render(`inventory/${view}`, { ...data, currentPath: res.req.path });
const isApprover = (user) => ['ADMIN', 'FRONTDESKOFFICER', 'FRONTDESK', 'INVENTORY_MANAGER', 'INVENTORYMANAGER'].includes(String(user?.role || '').toUpperCase());
const requireInventoryManager = (req, res, next) => isApprover(req.user)
  ? next()
  : res.status(403).send('Only administrators and frontdesk officers can review product requests.');
exports.requireInventoryManager = requireInventoryManager;

exports.productRequestsPage = async (req, res) => {
  try {
    const approver = isApprover(req.user);
    if (!approver) {
      const recipientName = String(req.user.teacherName || req.user.username || '').trim();
      const assignmentFilter = {
        recipientType: 'staff',
        $or: [
          { recipientId: String(req.user._id) },
          { recipientId: { $in: ['', null] }, recipientName }
        ]
      };
      const assignmentCount = await InventoryTransaction.aggregate([
        { $match: { status: { $ne: 'pending' } } },
        { $match: assignmentFilter },
        { $unwind: '$items' },
        { $count: 'total' }
      ]);
      const totalRequests = assignmentCount[0]?.total || 0;
      const requestedPage = parsePage(req.query.page);
      const totalPages = Math.max(1, Math.ceil(totalRequests / PAGE_SIZE));
      const page = Math.min(requestedPage, totalPages);
      const assignments = await InventoryTransaction.aggregate([
        { $match: { status: { $ne: 'pending' } } },
        { $match: assignmentFilter },
        { $unwind: '$items' },
        { $sort: { assignedAt: -1, _id: -1 } },
        { $skip: (page - 1) * PAGE_SIZE },
        { $limit: PAGE_SIZE },
        {
          $project: {
            _id: 0,
            transactionNo: 1,
            assignedNepaliDate: 1,
            assignedBy: 1,
            reason: 1,
            productName: '$items.productName',
            quantity: '$items.quantity',
            quantityTypeName: '$items.quantityTypeName'
          }
        }
      ]);
      return renderPage(res, 'productrequestform', {
        assignments,
        requests: [],
        page,
        totalPages,
        totalRequests,
        role: String(req.user.role || '').trim(),
        requesterUsername: String(req.user.teacherName || '').trim(),
        isInventoryManager: false,
        showInventoryNavigation: false,
        todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
        message: ''
      });
    }
    const filter = approver ? {} : { $or: [{ requesterId: req.user._id }, { requestedById: req.user._id }] };
    const requestedPage = parsePage(req.query.page);
    const totalRequests = await InventoryProductRequest.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalRequests / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const requests = await InventoryProductRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    renderPage(res, 'productrequestform', {
      requests,
      page,
      totalPages,
      totalRequests,
      role: String(req.user.role || '').trim(),
      requesterUsername: String(req.user.teacherName || '').trim(),
      isInventoryManager: approver,
      showInventoryNavigation: ['ADMIN', 'FRONTDESKOFFICER', 'FRONTDESK'].includes(String(req.user.role || '').trim().toUpperCase()),
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      message: req.query.saved ? 'Product request submitted.' : req.query.reviewed ? 'Request review saved.' : ''
    });
  } catch (error) {
    console.error('Unable to load product requests:', error);
    res.status(500).send('Unable to load product requests');
  }
};

exports.searchRequestProducts = async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  try {
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const products = await InventoryProduct.aggregate([
      {
        $match: {
          active: true,
          $or: [
            { name: { $regex: safeQuery, $options: 'i' } },
            { sku: { $regex: safeQuery, $options: 'i' } },
            { barcode: { $regex: safeQuery, $options: 'i' } }
          ]
        }
      },
      { $sort: { quantity: -1, createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: {
            name: '$name',
            categoryName: '$categoryName',
            baseUnit: { $ifNull: ['$baseUnit', '$quantityTypeName'] },
            purchaseUnit: { $ifNull: ['$purchaseUnit', { $ifNull: ['$baseUnit', '$quantityTypeName'] }] },
            conversionFactor: { $ifNull: ['$conversionFactor', 1] },
            color: '$color',
            size: '$size',
            sku: '$sku',
            barcode: '$barcode',
            description: '$description',
            price: '$price',
            lowStockThreshold: '$lowStockThreshold'
          },
          id: { $first: '$_id' },
          quantity: { $sum: { $ifNull: ['$quantity', 0] } },
          categoryId: { $first: '$category' },
          quantityTypeId: { $first: '$quantityType' },
          unit: { $first: { $ifNull: ['$baseUnit', '$quantityTypeName'] } },
          baseUnit: { $first: { $ifNull: ['$baseUnit', '$quantityTypeName'] } },
          purchaseUnit: { $first: { $ifNull: ['$purchaseUnit', { $ifNull: ['$baseUnit', '$quantityTypeName'] }] } },
          conversionFactor: { $first: { $ifNull: ['$conversionFactor', 1] } },
          sku: { $first: '$sku' },
          barcode: { $first: '$barcode' },
          supplierName: { $first: '$supplierName' },
          color: { $first: '$color' },
          size: { $first: '$size' },
          price: { $first: '$price' },
          lowStockThreshold: { $first: '$lowStockThreshold' },
          description: { $first: '$description' }
        }
      },
      { $sort: { '_id.name': 1 } },
      { $limit: 12 }
    ]);
    return res.json(products.map((product) => ({
      id: String(product.id),
      name: product._id.name,
      quantity: Number(product.quantity) || 0,
      categoryId: product.categoryId ? String(product.categoryId) : '',
      quantityTypeId: product.quantityTypeId ? String(product.quantityTypeId) : '',
      unit: product.unit,
      baseUnit: product.baseUnit,
      purchaseUnit: product.purchaseUnit,
      conversionFactor: product.conversionFactor,
      sku: product.sku || '',
      barcode: product.barcode || '',
      supplierName: product.supplierName || '',
      color: product.color || '',
      size: product.size || '',
      price: Number(product.price) || 0,
      lowStockThreshold: Number(product.lowStockThreshold) || 0,
      description: product.description || ''
    })));
  } catch (error) {
    console.error('Unable to search requested products:', error);
    return res.status(500).json({ message: 'Unable to search inventory products.' });
  }
};

exports.searchRequestTeachers = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json([]);
    const teachers = await User.find({
      $or: [
        { teacherName: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        { username: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      ]
    }).select('teacherName username').sort({ teacherName: 1 }).limit(10).lean();
    return res.json(teachers.map((teacher) => ({
      id: String(teacher._id),
      name: String(teacher.teacherName || '').trim(),
      username: String(teacher.username || '').trim()
    })).filter((teacher) => teacher.name));
  } catch (error) {
    console.error('Unable to search teacher names:', error);
    return res.status(500).json({ message: 'Unable to search teacher names.' });
  }
};

exports.createProductRequest = async (req, res) => {
  try {
    const productId = String(req.body.productId || '').trim();
    const productNameInput = String(req.body.productName || '').trim();
    const requestedById = String(req.body.requestedById || '').trim();
    const requestedByName = String(req.body.requestedByName || '').trim();
    const recommendedBy = String(req.body.recommendedBy || '').trim();
    const quantity = Number(req.body.quantity);
    const requestedAtNepali = String(req.body.requestedAtNepali || '').trim();
    const requiredByNepali = String(req.body.requiredByNepali || '').trim();
    const reason = String(req.body.reason || '').trim();
    const quantityTypeNameInput = String(req.body.quantityTypeName || 'pcs').trim();
    const color = String(req.body.color || '').trim();
    const size = String(req.body.size || '').trim();
    if (!productNameInput || productNameInput.length > 120 || !Number.isFinite(quantity) || quantity <= 0 || !reason || reason.length > 500 || !requestedByName || requestedByName.length > 120 || !recommendedBy || recommendedBy.length > 120 || quantityTypeNameInput.length > 40 || color.length > 40 || size.length > 40) {
      return res.status(400).send('Select a teacher, enter the recommended person, product, positive quantity, and reason for the request.');
    }
    const isNepaliDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!isNepaliDate(requestedAtNepali) || !isNepaliDate(requiredByNepali) || requiredByNepali < requestedAtNepali) {
      return res.status(400).send('Select valid Nepali request and required-by dates. The required-by date cannot be earlier than the request date.');
    }

    let requestedTeacher = null;
    if (requestedById) {
      if (!mongoose.isValidObjectId(requestedById)) return res.status(400).send('Select a valid requested teacher.');
      requestedTeacher = await User.findById(requestedById).select('teacherName').lean();
      if (!requestedTeacher || !requestedTeacher.teacherName) return res.status(404).send('That teacher record could not be found.');
    }

    let product = null;
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) return res.status(400).send('Select a valid inventory product.');
      product = await InventoryProduct.findOne({ _id: productId, active: true }).lean();
      if (!product) return res.status(404).send('That inventory product is no longer available. Search again.');
    }
    const quantityTypeName = product ? getProductUnits(product).baseUnit : quantityTypeNameInput || 'pcs';
    await InventoryProductRequest.create({
      requesterId: req.user._id,
      requesterUsername: String(req.user.username || '').trim(),
      requestedById: requestedTeacher?._id || null,
      requestedByName: requestedTeacher?.teacherName || requestedByName,
      recommendedBy,
      requestedAtNepali,
      requiredByNepali,
      product: product?._id,
      productName: product?.name || productNameInput,
      quantity,
      quantityTypeName,
      availableQuantityAtRequest: product?.quantity || 0,
      reason,
      color,
      size,
      status: 'pending'
    });
    return res.redirect('/inventory/productrequests?saved=1');
  } catch (error) {
    console.error('Unable to create product request:', error);
    return res.status(400).send('Unable to submit the product request. Check the entered fields.');
  }
};

exports.reviewProductRequest = async (req, res) => {
  const allowedStatuses = ['pending', 'approved', 'rejected'];
  const status = String(req.body.status || '').trim().toLowerCase();
  const managerReason = String(req.body.managerReason || '').trim();
  const quantity = Number(req.body.quantity);
  if (!mongoose.isValidObjectId(req.params.id) || !allowedStatuses.includes(status) || managerReason.length > 500 || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).send('Choose a valid request status and review reason.');
  }
  if (status === 'rejected' && !managerReason) return res.status(400).send('Add a reason when rejecting a request.');

  let stockAdjustment = null;
  let createdTransactionId = null;
  try {
    const request = await InventoryProductRequest.findById(req.params.id);
    if (!request) return res.status(404).send('Product request not found.');
    const selectedProductId = Object.prototype.hasOwnProperty.call(req.body, 'productId')
      ? String(req.body.productId || '').trim()
      : String(request.product || '').trim();
    const selectedProduct = selectedProductId && mongoose.isValidObjectId(selectedProductId)
      ? await InventoryProduct.findOne({ _id: selectedProductId, active: true }).lean()
      : null;
    if (selectedProductId && !selectedProduct) return res.status(400).send('Choose an active inventory product.');
    if (selectedProduct && String(selectedProduct.quantityTypeName).trim().toLowerCase() !== String(request.quantityTypeName).trim().toLowerCase()) {
      return res.status(400).send('The linked inventory product must use the same quantity unit as the request.');
    }

    if (request.stockDeducted && status === 'approved' && String(request.product) !== String(selectedProduct?._id)) {
      return res.status(409).send('This request already deducted stock. Move it to pending before changing its linked product.');
    }
    if (status === 'approved') {
      if (!selectedProduct) return res.status(409).send('Add the requested item to inventory and link it before approving.');
      const matchingProductIdentity = productIdentityKey(selectedProduct);
      const allStockRecords = await InventoryProduct.find({ active: true }).lean();
      const matchingStockRecords = allStockRecords.filter((product) => productIdentityKey(product) === matchingProductIdentity);
      if (!matchingStockRecords.length) return res.status(409).send('The selected inventory product is no longer available.');

      if (request.stockDeducted && String(request.product) === String(selectedProduct._id)) {
        const quantityDifference = quantity - request.quantity;
        if (quantityDifference > 0) {
          const decremented = [];
          await decrementGroupedProductStock(matchingStockRecords, new Map([[String(selectedProduct._id), quantityDifference]]), decremented);
          stockAdjustment = decremented;
        } else if (quantityDifference < 0) {
          const quantityToRestore = -quantityDifference;
          await InventoryProduct.updateOne({ _id: selectedProduct._id, active: true }, { $inc: { quantity: quantityToRestore } });
          stockAdjustment = [{ productId: selectedProduct._id, quantity: quantityToRestore }];
        }
      } else if (!request.stockDeducted) {
        const decremented = [];
        await decrementGroupedProductStock(matchingStockRecords, new Map([[String(selectedProduct._id), quantity]]), decremented);
        stockAdjustment = decremented;
      }
    } else if (request.stockDeducted && request.product) {
      await InventoryProduct.updateOne({ _id: request.product }, { $inc: { quantity: request.quantity } });
      stockAdjustment = [{ productId: request.product, quantity: request.quantity }];
    }

    const approvalTransaction = status === 'approved' && !request.issuedTransactionId
      ? {
          transactionNo: `REQ-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
          assignedAt: new Date(),
          assignedNepaliDate: request.requestedAtNepali || String(bs.ADToBS(new Date()) || '').trim(),
          recipientType: 'staff',
          recipientName: request.requestedByName,
          recipientId: request.requestedById ? String(request.requestedById) : '',
          recipientClass: '',
          reason: `Product request approved: ${request.reason}`.slice(0, 240),
          assignedBy: String(req.user.username || req.user.teacherName || '').trim(),
          items: [{
            product: selectedProduct._id,
            productName: selectedProduct.name,
            sku: selectedProduct.sku || '',
            quantity,
            enteredQuantity: quantity,
            unitName: getProductUnits(selectedProduct).baseUnit,
            conversionFactor: 1,
            baseQuantity: quantity,
            baseUnitName: getProductUnits(selectedProduct).baseUnit,
            quantityTypeName: getProductUnits(selectedProduct).baseUnit
          }]
        }
      : null;
    if (approvalTransaction) {
      const createdTransaction = await InventoryTransaction.create(approvalTransaction);
      createdTransactionId = createdTransaction._id;
    }

    const result = await InventoryProductRequest.updateOne(
      { _id: request._id, status: request.status, stockDeducted: request.stockDeducted, quantity: request.quantity },
      { $set: {
        product: selectedProduct?._id,
        quantityTypeName: selectedProduct?.quantityTypeName || request.quantityTypeName,
        quantity,
        status,
        managerReason: status === 'rejected' ? managerReason : '',
        reviewedBy: String(req.user.username || req.user.teacherName || '').trim(),
        reviewedAt: new Date(),
        stockDeducted: status === 'approved',
        issuedTransactionId: createdTransactionId || request.issuedTransactionId || null
      } }
    );
    if (!result.modifiedCount) throw new Error('REQUEST_CHANGED');
    const requestsPage = parsePage(req.body.requestsPage);
    return res.redirect(`/inventory/?reviewed=1&requestsPage=${requestsPage}`);
  } catch (error) {
    if (createdTransactionId) await InventoryTransaction.deleteOne({ _id: createdTransactionId });
    if (stockAdjustment?.length) {
      await Promise.all(stockAdjustment.map((adjustment) => InventoryProduct.updateOne(
        { _id: adjustment.productId, active: true },
        { $inc: { quantity: -adjustment.quantity } }
      )));
    }
    if (error.message === 'REQUEST_CHANGED') return res.status(409).send('This request was updated by another manager. Refresh and review it again.');
    console.error('Unable to review product request:', error);
    return res.status(400).send('Unable to save the request review.');
  }
};

exports.dashboard = async (req, res) => {
  try {
    const manager = isApprover(req.user);
    const pendingRequestPageSize = 30;
    const [totalProducts, stockSummary, lowStockItems, recentTransactions, categoryCount, monthly] = await Promise.all([
      InventoryProduct.countDocuments({ active: true }),
      InventoryProduct.aggregate([
        { $match: { active: true } },
        {
          $group: {
            _id: null,
            productsWithStock: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } }
          }
        }
      ]),
      InventoryProduct.aggregate([
        { $match: { active: true, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } } },
        {
          $addFields: {
            stockRatio: {
              $cond: [
                { $gt: ['$lowStockThreshold', 0] },
                { $divide: ['$quantity', '$lowStockThreshold'] },
                0
              ]
            }
          }
        },
        { $sort: { stockRatio: 1, name: 1 } },
        { $limit: 8 },
        { $project: { stockRatio: 0 } }
      ]),
      InventoryTransaction.find({ status: { $ne: 'pending' } }).sort({ assignedAt: -1 }).limit(8).lean(),
      InventoryCategory.countDocuments({ active: true }),
      InventoryTransaction.aggregate([
        { $match: { status: { $ne: 'pending' }, assignedAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$assignedAt' } }, quantity: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    const requestFilter = manager ? { status: 'pending' } : { status: 'pending', $or: [{ requesterId: req.user._id }, { requestedById: req.user._id }] };
    const requestedPage = parsePage(req.query.requestsPage);
    const totalProductRequests = await InventoryProductRequest.countDocuments(requestFilter);
    const requestTotalPages = Math.max(1, Math.ceil(totalProductRequests / pendingRequestPageSize));
    const requestsPage = Math.min(requestedPage, requestTotalPages);
    const productRequests = await InventoryProductRequest.find(requestFilter).sort({ createdAt: -1 }).skip((requestsPage - 1) * pendingRequestPageSize).limit(pendingRequestPageSize).lean();
    const linkedProductIds = productRequests.map((request) => request.product).filter(Boolean);
    const linkedProducts = linkedProductIds.length
      ? await InventoryProduct.find({ _id: { $in: linkedProductIds } }).select('name').lean()
      : [];
    const linkedProductNames = Object.fromEntries(linkedProducts.map((product) => [String(product._id), product.name]));
    renderPage(res, 'inventorydashboard', {
      totalProducts,
      productsWithStock: stockSummary[0]?.productsWithStock || 0,
      categoryCount,
      lowStockItems: lowStockItems.map(normalizeProductStockDisplay),
      recentTransactions,
      productRequests,
      linkedProductNames,
      requestsPage,
      requestTotalPages,
      totalProductRequests,
      isInventoryManager: isApprover(req.user),
      productRequestMessage: req.query.reviewed ? 'Product request review saved.' : '',
      chartLabels: monthly.map((row) => row._id),
      chartValues: monthly.map((row) => row.quantity)
    });
  } catch (error) {
    console.error('Unable to load inventory dashboard:', error);
    res.status(500).send('Unable to load inventory dashboard');
  }
};

exports.productsPage = async (req, res) => {
  try {
    const requestedPage = parsePage(req.query.page);
    const search = String(req.query.search || '').trim().slice(0, 120);
    const productFilter = { active: true };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      productFilter.$or = ['name', 'sku', 'barcode', 'supplierName', 'color', 'size', 'description', 'categoryName', 'quantityTypeName']
        .map((field) => ({ [field]: searchRegex }));
    }
    const totalProducts = await InventoryProduct.countDocuments(productFilter);
    const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const [products, categories, quantityTypes, suppliers, recentPurchases, purchaseProducts] = await Promise.all([
      InventoryProduct.find(productFilter).sort({ entryDateNepali: -1, createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      InventoryCategory.find({ active: true }).sort({ name: 1 }).lean(),
      InventoryQuantityType.find({ active: true }).sort({ name: 1 }).lean(),
      InventorySupplier.find({ active: true }).sort({ name: 1 }).lean(),
      InventoryPurchase.find({ status: 'posted' }).sort({ purchasedAt: -1 }).limit(10).lean(),
      InventoryProduct.find({ active: true }).sort({ name: 1 }).lean()
    ]);
    let defaultQuantityType = quantityTypes.find((unit) => /^(pcs?|pieces?)$/i.test(unit.name) || /^(pcs?|pieces?)$/i.test(unit.abbreviation || ''));
    if (!defaultQuantityType) {
      defaultQuantityType = await InventoryQuantityType.create({ name: 'Pieces', abbreviation: 'pcs' });
      quantityTypes.push(defaultQuantityType.toObject());
    }
    renderPage(res, 'addproduct', {
      products: products.map(normalizeProductStockDisplay),
      purchaseProducts: purchaseProducts.map(normalizeProductStockDisplay),
      totalProducts,
      page,
      totalPages,
      search,
      categories,
      suppliers,
      quantityTypes,
      purchaseUnits: [...new Set([
        ...COMMON_PURCHASE_UNITS,
        ...quantityTypes.map((unit) => unit.name),
        ...purchaseProducts.map((product) => getProductUnits(product).purchaseUnit)
      ])].sort((a, b) => a.localeCompare(b)),
      recentPurchases,
      purchaseSubmissionKey: new mongoose.Types.ObjectId().toString(),
      defaultQuantityTypeId: String(defaultQuantityType._id),
      defaultBaseUnitName: defaultQuantityType.name,
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      message: req.query.purchaseDuplicate
        ? 'This purchase was already recorded; stock was not added a second time.'
        : req.query.purchaseSaved
          ? 'Purchase recorded and stock updated.'
          : req.query.merged ? 'Stock added to the existing matching product.' : req.query.saved ? 'Product table saved.' : ''
    });
  } catch (error) {
    console.error('Unable to load inventory products:', error);
    res.status(500).send('Unable to load inventory products');
  }
};

exports.unitConversionsPage = async (req, res) => {
  try {
    const [products, quantityTypes] = await Promise.all([
      InventoryProduct.find({ active: true }).sort({ name: 1, _id: 1 }).lean(),
      InventoryQuantityType.find({ active: true }).sort({ name: 1 }).lean()
    ]);
    const conversionGroups = new Map();
    for (const product of products) {
      const key = productNameKey(product.name);
      if (!conversionGroups.has(key)) conversionGroups.set(key, []);
      conversionGroups.get(key).push(product);
    }
    const groupedProducts = [...conversionGroups.values()].map((records) => {
      const representative = normalizeProductStockDisplay(records[0]);
      const units = records.map((record) => getProductUnits(record));
      const stockByBaseUnit = new Map();
      records.forEach((record, index) => {
        const baseUnit = units[index].baseUnit;
        const stockEntry = stockByBaseUnit.get(baseUnit) || 0;
        stockByBaseUnit.set(baseUnit, stockEntry + (Number(record.quantity) || 0));
      });
      const settingsDiffer = units.some((unit) =>
        unit.baseUnit.toLowerCase() !== units[0].baseUnit.toLowerCase() ||
        unit.purchaseUnit.toLowerCase() !== units[0].purchaseUnit.toLowerCase() ||
        unit.conversionFactor !== units[0].conversionFactor
      );
      return {
        ...representative,
        duplicateCount: records.length,
        settingsDiffer,
        stockSummary: [...stockByBaseUnit.entries()]
          .map(([unit, quantity]) => `${roundQuantity(quantity)} ${unit}`)
          .join('; '),
        stockEquivalent: records.length === 1
          ? representative.stockEquivalent
          : settingsDiffer
            ? 'Conversion settings differ across these records'
            : describeEquivalentStock([...stockByBaseUnit.values()][0], representative)
      };
    });
    renderPage(res, 'unitconversions', {
      products: groupedProducts,
      quantityTypes,
      purchaseUnits: [...new Set([
        ...COMMON_PURCHASE_UNITS,
        ...quantityTypes.map((unit) => unit.name),
        ...products.map((product) => getProductUnits(product).purchaseUnit)
      ])].sort((a, b) => a.localeCompare(b)),
      message: req.query.saved
        ? 'Unit conversion saved for this product name across all matching active records. Existing stock quantities were not changed.'
        : req.query.error === 'base-unit'
          ? 'A product with existing stock cannot change its base unit.'
          : ''
    });
  } catch (error) {
    console.error('Unable to load inventory unit conversions:', error);
    res.status(500).send('Unable to load unit conversions');
  }
};

exports.saveUnitConversion = async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    const purchaseUnit = String(req.body.purchaseUnit || '').trim();
    const conversionFactor = parsePositiveFactor(req.body.conversionFactor);
    const quantityTypeId = String(req.body.quantityType || '').trim();
    if (!mongoose.isValidObjectId(productId) || !purchaseUnit || purchaseUnit.length > 40 ||
        !conversionFactor || !mongoose.isValidObjectId(quantityTypeId)) {
      return res.status(400).send('This product needs a valid base unit, purchase unit, and conversion factor greater than zero.');
    }

    const [product, quantityType] = await Promise.all([
      InventoryProduct.findOne({ _id: productId, active: true }).select('name quantity quantityTypeName baseUnit').lean(),
      InventoryQuantityType.findOne({ _id: quantityTypeId, active: true }).select('name').lean()
    ]);
    if (!product || !quantityType) return res.status(404).send('The product or selected base unit could not be found. Refresh and try again.');
    const namePattern = productNamePattern(product.name);
    const matchingProducts = await InventoryProduct.find({ active: true, name: namePattern })
      .select('quantity quantityTypeName baseUnit')
      .lean();
    if (!matchingProducts.length) return res.status(404).send('No active inventory records were found for this product.');
    const hasStockWithDifferentBaseUnit = matchingProducts.some((matchingProduct) =>
      (Number(matchingProduct.quantity) || 0) > 0 &&
      getProductUnits(matchingProduct).baseUnit.toLowerCase() !== quantityType.name.toLowerCase()
    );
    if (hasStockWithDifferentBaseUnit) {
      return res.redirect('/inventory/unit-conversions?error=base-unit');
    }

    const result = await InventoryProduct.updateMany(
      { active: true, name: namePattern },
      {
        $set: {
          quantityType: quantityTypeId,
          quantityTypeName: quantityType.name,
          baseUnit: quantityType.name,
          purchaseUnit,
          conversionFactor
        }
      }
    );
    if (!result.matchedCount) return res.status(404).send('The product could not be found. Refresh and try again.');
    return res.redirect('/inventory/unit-conversions?saved=1#conversion-' + productId);
  } catch (error) {
    console.error('Unable to save inventory unit conversions:', error);
    return res.status(500).send("Unable to save this product's unit conversion. Please try again.");
  }
};

exports.createProduct = async (req, res) => {
  try {
    const [category, quantityType] = await Promise.all([
      req.body.category ? InventoryCategory.findById(req.body.category) : null,
      req.body.quantityType ? InventoryQuantityType.findById(req.body.quantityType) : InventoryQuantityType.findOne({ abbreviation: /^pcs$/i, active: true })
    ]);
    if ((req.body.category && !category) || !quantityType) return res.status(400).send('Select a valid category and quantity type.');
    const quantity = Number(req.body.quantity);
    const buyQuantityInput = String(req.body.buyQuantity ?? '').trim();
    const buyQuantity = buyQuantityInput ? Number(buyQuantityInput) : quantity;
    const price = Number(req.body.price || 0);
    const lowStockThreshold = Number(req.body.lowStockThreshold);
    const supplierName = String(req.body.supplierName || '').trim();
    const conversionFactor = parsePositiveFactor(req.body.conversionFactor || 1);
    const purchaseUnit = String(req.body.purchaseUnit || quantityType.name).trim();
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(buyQuantity) || buyQuantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0 || !conversionFactor || !purchaseUnit || purchaseUnit.length > 40) {
      return res.status(400).send('Stock, price, and low-stock threshold must be valid and zero or greater.');
    }
    if (supplierName.length > 120) return res.status(400).send('Supplier name must be 120 characters or fewer.');
    if (supplierName) await saveSupplierName(supplierName);
    const productValues = {
      name: standardizeProductName(req.body.name),
      sku: String(req.body.sku || '').trim() || undefined,
      category: category?._id,
      categoryName: category?.name || '',
      supplierName,
      quantityType: quantityType._id,
      quantityTypeName: quantityType.name,
      baseUnit: quantityType.name,
      purchaseUnit,
      conversionFactor,
      buyQuantity,
      quantity,
      price,
      barcode: String(req.body.barcode || '').trim() || undefined,
      lowStockThreshold,
      entryDateNepali: String(req.body.entryDateNepali || bs.ADToBS(new Date()) || '').trim(),
      color: String(req.body.color || '').trim(),
      size: String(req.body.size || '').trim(),
      description: req.body.description
    };
    const matchingProducts = await findMatchingProductRecords(productValues);
    if (matchingProducts.length > 1) {
      return res.status(409).send(`More than one existing product matches "${productValues.name}" on the same date. Update the correct product row instead of adding a new one.`);
    }
    if (matchingProducts.length === 1) {
      await InventoryProduct.bulkWrite([buildProductStockMergeOperation(matchingProducts[0], productValues)]);
      return res.redirect('/inventory/products?saved=1&merged=1');
    }
    await InventoryProduct.create(productValues);
    res.redirect('/inventory/products?saved=1');
  } catch (error) {
    console.error('Unable to create inventory product:', error);
    res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'A product with that SKU already exists.' : 'Unable to add product. Check the entered fields.');
  }
};

exports.saveProducts = async (req, res) => {
  const rows = Array.isArray(req.body.products) ? req.body.products : [];
  const page = parsePage(req.body.page);
  const search = String(req.body.search || '').trim().slice(0, 120);
  const returnUrl = `/inventory/products?saved=1&page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const changedRows = rows.filter((row) => row.productId || row.touched === '1');
  if (!changedRows.length) return res.redirect(returnUrl);

  try {
    const productIds = changedRows.map((row) => String(row.productId || '').trim()).filter(Boolean);
    if (productIds.some((id) => !mongoose.isValidObjectId(id)) || new Set(productIds).size !== productIds.length) {
      return res.status(400).send('Product rows contain an invalid or repeated product ID.');
    }

    const operations = [];
    const submittedSkus = new Set();
    const submittedBarcodes = new Set();
    let mergedExistingProduct = false;
    for (const row of changedRows) {
      const name = standardizeProductName(row.name);
      const sku = String(row.sku || '').trim();
      const quantity = Number(row.quantity);
      const buyQuantityInput = String(row.buyQuantity ?? '').trim();
      const buyQuantity = buyQuantityInput ? Number(buyQuantityInput) : quantity;
      const price = Number(row.price || 0);
      const lowStockThreshold = Number(row.lowStockThreshold);
      const conversionFactor = parsePositiveFactor(row.conversionFactor || 1);
      const purchaseUnit = String(row.purchaseUnit || '').trim();
      const supplierName = String(row.supplierName || '').trim();
      const barcode = String(row.barcode || '').trim();
      if (!name || name.length > 120 || supplierName.length > 120 || sku.length > 60 || barcode.length > 100 || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(buyQuantity) || buyQuantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0 || !conversionFactor || !purchaseUnit || purchaseUnit.length > 40) {
        return res.status(400).send('Each changed row needs a product name, nonnegative stock values, a valid purchase unit and conversion factor greater than zero.');
      }
      if (sku && submittedSkus.has(sku.toLowerCase())) return res.status(409).send(`SKU ${sku} is repeated in the table.`);
      if (sku) submittedSkus.add(sku.toLowerCase());
      if (barcode && submittedBarcodes.has(barcode.toLowerCase())) return res.status(409).send(`Barcode ${barcode} is repeated in the table.`);
      if (barcode) submittedBarcodes.add(barcode.toLowerCase());

      const [category, quantityType] = await Promise.all([
        row.category ? InventoryCategory.findById(row.category) : null,
        mongoose.isValidObjectId(row.quantityType) ? InventoryQuantityType.findById(row.quantityType) : null
      ]);
      if ((row.category && !category) || !quantityType) return res.status(400).send('Choose a valid category and quantity type for every changed row.');

      const values = {
        name,
        category: category?._id,
        categoryName: category?.name || '',
        supplierName,
        quantityType: quantityType._id,
        quantityTypeName: quantityType.name,
        baseUnit: quantityType.name,
        purchaseUnit,
        conversionFactor,
        buyQuantity,
        price,
        lowStockThreshold,
        entryDateNepali: String(row.entryDateNepali || bs.ADToBS(new Date()) || '').trim(),
        color: String(row.color || '').trim(),
        size: String(row.size || '').trim(),
        description: String(row.description || '').trim()
      };
      if (!row.productId) {
        values.quantity = roundQuantity(buyQuantity * conversionFactor);
        if (!Number.isFinite(values.quantity)) return res.status(400).send('Opening stock quantity is outside the supported range.');
      }
      if (values.color.length > 40 || values.size.length > 40 || values.description.length > 400 || values.entryDateNepali.length > 20) {
        return res.status(400).send('Color, size, description, or Nepali date is too long.');
      }

      if (row.productId) {
        const existingProduct = await InventoryProduct.findOne({ _id: row.productId, active: true }).select('quantity quantityTypeName baseUnit').lean();
        if (!existingProduct) return res.status(404).send('One or more products could not be found. Refresh and try again.');
        const existingBaseUnit = getProductUnits(existingProduct).baseUnit;
        if ((Number(existingProduct.quantity) || 0) > 0 && existingBaseUnit.toLowerCase() !== values.baseUnit.toLowerCase()) {
          return res.status(409).send(`Cannot change the base unit for ${name} while stock exists. Set its stock to zero or correct the base unit first.`);
        }
        const update = { $set: values };
        if (sku) values.sku = sku;
        else update.$unset = { sku: 1 };
        if (barcode) values.barcode = barcode;
        else update.$unset.barcode = 1;
        operations.push({ updateOne: { filter: { _id: row.productId, active: true }, update } });
      } else {
        if (sku) values.sku = sku;
        if (barcode) values.barcode = barcode;
        const matchingProducts = await findMatchingProductRecords(values);
        if (matchingProducts.length > 1) {
          return res.status(409).send(`More than one existing product matches "${name}" on the same date. Update the correct product row instead of adding a new one.`);
        }
        if (matchingProducts.length === 1) {
          operations.push(buildProductStockMergeOperation(matchingProducts[0], values));
          mergedExistingProduct = true;
        } else {
          operations.push({ insertOne: { document: values } });
        }
      }
    }

    if (productIds.length) {
      const activeProducts = await InventoryProduct.countDocuments({ _id: { $in: productIds }, active: true });
      if (activeProducts !== productIds.length) return res.status(404).send('One or more products could not be found. Refresh and try again.');
    }
    await InventoryProduct.bulkWrite(operations, { ordered: true });
    await Promise.all([...new Set(changedRows.map((row) => String(row.supplierName || '').trim()).filter(Boolean))].map(saveSupplierName));
    return res.redirect(mergedExistingProduct ? `${returnUrl}&merged=1` : returnUrl);
  } catch (error) {
    console.error('Unable to save inventory product rows:', error);
    if (error.code === 11000) return res.status(409).send('A product SKU is already in use. Review the table and try again.');
    return res.status(400).send('Unable to save product rows. Check the entered fields and try again.');
  }
};

exports.downloadProductTemplate = (req, res) => {
  const headers = ['entryDateNepali', 'name', 'buyQuantity', 'quantity', 'unit', 'purchaseUnit', 'conversionFactor', 'supplierName', 'price', 'color', 'size', 'sku', 'description', 'barcode', 'category', 'lowStockThreshold'];
  res.type('text/csv');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-products-template.csv"');
  res.send(`${headers.join(',')}\r\n${String(bs.ADToBS(new Date()) || '').trim()},Sample product,10,10,pcs,Packet,1,,0,Blue,Medium,SKU-001,Product description,123456789012,,5\r\n`);
};

exports.receiveProductStock = async (req, res) => {
  const submissionKey = String(req.body.submissionKey || '').trim();
  const productId = String(req.body.productId || '').trim();
  const enteredQuantity = Number(req.body.quantity);
  const unitCost = Number(req.body.unitCost);
  const purchaseNepaliDate = String(req.body.purchaseNepaliDate || '').trim();
  const supplierName = String(req.body.supplierName || '').trim().replace(/\s+/g, ' ');
  const referenceNo = String(req.body.referenceNo || '').trim();
  if (!mongoose.isValidObjectId(submissionKey) || !mongoose.isValidObjectId(productId)
    || !Number.isFinite(enteredQuantity) || enteredQuantity <= 0
    || !Number.isFinite(unitCost) || unitCost < 0
    || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseNepaliDate)
    || supplierName.length > 120 || referenceNo.length > 100) {
    return res.status(400).send('Choose a product and enter a valid purchase quantity, unit cost, supplier, and date.');
  }

  let purchase;
  let stockAdded = false;
  let session = null;
  try {
    const product = await InventoryProduct.findOne({ _id: productId, active: true }).lean();
    if (!product) return res.status(404).send('The selected product is no longer available.');
    const units = getProductUnits(product);
    const baseQuantity = roundQuantity(enteredQuantity * units.conversionFactor);
    const totalCost = roundQuantity(enteredQuantity * unitCost);
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0 || !Number.isFinite(totalCost)) {
      return res.status(400).send('Purchase quantity and total cost are outside the supported range.');
    }
    if (supplierName) await saveSupplierName(supplierName);
    session = await startInventoryTransaction();
    const purchaseValues = {
      purchaseNo: `PUR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      submissionKey,
      purchasedAt: new Date(),
      purchaseNepaliDate,
      product: product._id,
      productName: product.name,
      sku: product.sku || '',
      enteredQuantity: roundQuantity(enteredQuantity),
      purchaseUnit: units.purchaseUnit,
      conversionFactor: units.conversionFactor,
      baseQuantity,
      baseUnit: units.baseUnit,
      unitCost: roundQuantity(unitCost),
      totalCost,
      supplierName,
      referenceNo,
      purchasedBy: String(req.user?.teacherName || req.user?.username || 'Inventory').trim(),
      status: 'pending'
    };
    [purchase] = await InventoryPurchase.create([purchaseValues], session ? { session } : {});
    const stockUpdate = await InventoryProduct.updateOne(
      { _id: product._id, active: true },
      { $inc: { quantity: baseQuantity } },
      session ? { session } : {}
    );
    if (!stockUpdate.modifiedCount) throw new Error('PURCHASE_PRODUCT_CHANGED');
    stockAdded = true;
    const posted = await InventoryPurchase.updateOne(
      { _id: purchase._id, status: 'pending' },
      { $set: { status: 'posted' } },
      session ? { session } : {}
    );
    if (!posted.modifiedCount) throw new Error('PURCHASE_STATUS_CHANGED');
    if (session) await session.commitTransaction();
    return res.redirect('/inventory/products?purchaseSaved=1');
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction();
    if (error.code === 11000) {
      const existing = await InventoryPurchase.findOne({ submissionKey }).select('status').lean();
      if (existing?.status === 'posted') return res.redirect('/inventory/products?purchaseDuplicate=1');
      return res.status(409).send('This purchase is already being processed. Refresh the products page before retrying.');
    }
    if (!session && stockAdded && purchase) {
      await InventoryProduct.updateOne(
        { _id: productId, quantity: { $gte: roundQuantity(enteredQuantity * Number(purchase.conversionFactor)) } },
        { $inc: { quantity: -roundQuantity(enteredQuantity * Number(purchase.conversionFactor)) } }
      );
    }
    if (!session && purchase) await InventoryPurchase.deleteOne({ _id: purchase._id, status: 'pending' });
    console.error('Unable to receive inventory stock:', error);
    if (error.message === 'PURCHASE_PRODUCT_CHANGED') return res.status(409).send('The product changed while saving. Refresh and try again.');
    if (error.message === 'PURCHASE_STATUS_CHANGED') return res.status(409).send('The purchase status changed while saving. Check purchase history before retrying.');
    return res.status(400).send('Unable to record this purchase. Stock was not changed.');
  } finally {
    if (session) await session.endSession();
  }
};

exports.importProductsCsv = [inventoryCsvUpload.single('productCsv'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: 'Choose a CSV file to upload.' });
    const rows = await parseInventoryCsv(req.file.buffer);
    if (!rows.length) return res.status(400).json({ message: 'The CSV file has no product rows.' });

    const [categories, quantityTypes] = await Promise.all([
      InventoryCategory.find({ active: true }).lean(),
      InventoryQuantityType.find({ active: true }).lean()
    ]);
    const categoryMap = new Map(categories.map((item) => [item.name.trim().toLowerCase(), item]));
    const unitMap = new Map();
    quantityTypes.forEach((item) => {
      unitMap.set(item.name.trim().toLowerCase(), item);
      if (item.abbreviation) unitMap.set(item.abbreviation.trim().toLowerCase(), item);
    });
    const documents = [];
    const uniqueValues = new Set();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;
      const name = standardizeProductName(row.name);
      const unit = unitMap.get(String(row.unit || '').trim().toLowerCase());
      const supplierName = String(row.supplierName || '').trim().replace(/\s+/g, ' ');
      const categoryName = String(row.category || '').trim();
      const category = categoryName ? categoryMap.get(categoryName.toLowerCase()) : null;
      const quantity = Number(row.quantity);
      const buyQuantity = row.buyQuantity === undefined || String(row.buyQuantity).trim() === '' ? quantity : Number(row.buyQuantity);
      const conversionFactor = String(row.conversionFactor || '').trim() ? parsePositiveFactor(row.conversionFactor) : 1;
      const purchaseUnit = String(row.purchaseUnit || '').trim() || unit?.name;
      const price = Number(row.price || 0);
      const lowStockThreshold = Number(row.lowStockThreshold || 5);
      const sku = String(row.sku || '').trim();
      const barcode = String(row.barcode || '').trim();
      const invalidFields = [];
      if (!name || name.length > 120) invalidFields.push('name');
      if (supplierName.length > 120) invalidFields.push('supplier name');
      if (!unit) invalidFields.push('unit');
      if (categoryName && !category) invalidFields.push('category');
      if (!Number.isFinite(quantity) || quantity < 0) invalidFields.push('quantity (base units)');
      if (!Number.isFinite(buyQuantity) || buyQuantity < 0) invalidFields.push('buy quantity');
      if (!conversionFactor || !purchaseUnit || purchaseUnit.length > 40) invalidFields.push('purchase unit or conversion factor');
      if (!Number.isFinite(price) || price < 0) invalidFields.push('price');
      if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) invalidFields.push('low-stock alert');
      if (invalidFields.length) {
        return res.status(400).json({ message: `CSV row ${rowNumber} has invalid or unrecognized values for: ${invalidFields.join(', ')}.` });
      }
      if (sku.length > 60 || barcode.length > 100 || String(row.color || '').length > 40 || String(row.size || '').length > 40 || String(row.description || '').length > 400 || String(row.entryDateNepali || '').length > 20) {
        return res.status(400).json({ message: `CSV row ${rowNumber} contains a value that is too long.` });
      }
      for (const [kind, value] of [['SKU', sku], ['barcode', barcode]]) {
        const key = `${kind}:${value.toLowerCase()}`;
        if (!value) continue;
        if (uniqueValues.has(key)) return res.status(409).json({ message: `CSV row ${rowNumber} repeats ${kind} ${value}.` });
        uniqueValues.add(key);
      }
      documents.push({
        name,
        sku: sku || undefined,
        barcode: barcode || undefined,
        category: category?._id,
        categoryName: category?.name || '',
        supplierName,
        quantityType: unit._id,
        quantityTypeName: unit.name,
        baseUnit: unit.name,
        purchaseUnit,
        conversionFactor,
        buyQuantity,
        quantity,
        price,
        lowStockThreshold,
        entryDateNepali: String(row.entryDateNepali || bs.ADToBS(new Date()) || '').trim(),
        color: String(row.color || '').trim(),
        size: String(row.size || '').trim(),
        description: String(row.description || '').trim()
      });
    }
    await Promise.all([...new Set(documents.map((document) => document.supplierName).filter(Boolean))].map(saveSupplierName));
    await InventoryProduct.insertMany(documents, { ordered: true });
    return res.json({ message: `Imported ${documents.length} products successfully.`, imported: documents.length });
  } catch (error) {
    console.error('Unable to import inventory CSV:', error);
    if (error.code === 11000) return res.status(409).json({ message: 'An SKU or barcode in this file is already in use.' });
    if (error instanceof multer.MulterError) return res.status(400).json({ message: 'CSV upload must be smaller than 2 MB.' });
    return res.status(400).json({ message: 'Unable to import this CSV. Check the template and values.' });
  }
}];

exports.categoriesPage = async (req, res) => {
  try {
    const categories = await InventoryCategory.find({ active: true }).sort({ name: 1 }).lean();
    const message = req.query.error === 'in-use'
      ? 'This category is used by products and cannot be deleted.'
      : req.query.saved === 'edited' ? 'Category updated.'
        : req.query.saved === 'deleted' ? 'Category deleted.'
          : req.query.saved ? 'Category added.' : '';
    renderPage(res, 'addcategory', { categories, message });
  } catch (error) {
    console.error('Unable to load inventory categories:', error);
    res.status(500).send('Unable to load inventory categories');
  }
};

exports.createCategory = async (req, res) => {
  try {
    await InventoryCategory.create({ name: req.body.name, description: req.body.description });
    res.redirect('/inventory/categories?saved=1');
  } catch (error) {
    console.error('Unable to create inventory category:', error);
    res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'That category already exists.' : 'Unable to add category.');
  }
};

exports.editCategory = async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const description = String(req.body.description || '').trim();
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Category not found.');
  if (!name || name.length > 80 || description.length > 300) return res.status(400).send('Enter a category name up to 80 characters and description up to 300 characters.');
  try {
    const category = await InventoryCategory.findByIdAndUpdate(req.params.id, { name, description }, { new: true, runValidators: true });
    if (!category) return res.status(404).send('Category not found.');
    await InventoryProduct.updateMany({ category: category._id }, { $set: { categoryName: category.name } });
    return res.redirect('/inventory/categories?saved=edited');
  } catch (error) {
    console.error('Unable to update inventory category:', error);
    return res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'That category already exists.' : 'Unable to update category.');
  }
};

exports.deleteCategory = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Category not found.');
  try {
    if (await InventoryProduct.exists({ category: req.params.id })) return res.redirect('/inventory/categories?error=in-use');
    const category = await InventoryCategory.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).send('Category not found.');
    return res.redirect('/inventory/categories?saved=deleted');
  } catch (error) {
    console.error('Unable to delete inventory category:', error);
    return res.status(500).send('Unable to delete category.');
  }
};

exports.quantityTypesPage = async (req, res) => {
  try {
    const quantityTypes = await InventoryQuantityType.find({ active: true }).sort({ name: 1 }).lean();
    const message = req.query.error === 'in-use'
      ? 'This unit is used by products and cannot be deleted.'
      : req.query.saved === 'edited' ? 'Quantity type updated.'
        : req.query.saved === 'deleted' ? 'Quantity type deleted.'
          : req.query.saved ? 'Unit added.' : '';
    renderPage(res, 'quantitytype', { quantityTypes, message });
  } catch (error) {
    console.error('Unable to load inventory quantity types:', error);
    res.status(500).send('Unable to load quantity types');
  }
};

exports.createQuantityType = async (req, res) => {
  try {
    await InventoryQuantityType.create({ name: req.body.name, abbreviation: req.body.abbreviation });
    res.redirect('/inventory/quantity-types?saved=1');
  } catch (error) {
    console.error('Unable to create inventory quantity type:', error);
    res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'That unit already exists.' : 'Unable to add unit.');
  }
};

exports.editQuantityType = async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const abbreviation = String(req.body.abbreviation || '').trim();
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Quantity type not found.');
  if (!name || name.length > 40 || abbreviation.length > 12) return res.status(400).send('Enter a unit name up to 40 characters and abbreviation up to 12 characters.');
  try {
    const quantityType = await InventoryQuantityType.findById(req.params.id);
    if (!quantityType) return res.status(404).send('Quantity type not found.');
    const previousName = quantityType.name;
    quantityType.name = name;
    quantityType.abbreviation = abbreviation;
    await quantityType.save();
    await InventoryProduct.updateMany(
      { quantityType: quantityType._id },
      { $set: { quantityTypeName: quantityType.name, baseUnit: quantityType.name } }
    );
    await InventoryProduct.updateMany(
      {
        quantityType: quantityType._id,
        $or: [{ purchaseUnit: previousName }, { purchaseUnit: '' }, { purchaseUnit: { $exists: false } }]
      },
      { $set: { purchaseUnit: quantityType.name } }
    );
    return res.redirect('/inventory/quantity-types?saved=edited');
  } catch (error) {
    console.error('Unable to update inventory quantity type:', error);
    return res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'That unit already exists.' : 'Unable to update quantity type.');
  }
};

exports.deleteQuantityType = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Quantity type not found.');
  try {
    if (await InventoryProduct.exists({ quantityType: req.params.id })) return res.redirect('/inventory/quantity-types?error=in-use');
    const quantityType = await InventoryQuantityType.findByIdAndDelete(req.params.id);
    if (!quantityType) return res.status(404).send('Quantity type not found.');
    return res.redirect('/inventory/quantity-types?saved=deleted');
  } catch (error) {
    console.error('Unable to delete inventory quantity type:', error);
    return res.status(500).send('Unable to delete quantity type.');
  }
};

exports.salesPage = async (req, res) => {
  try {
    const requestedPage = parsePage(req.query.page);
    const [products, issueCount] = await Promise.all([
      InventoryProduct.find({ active: true }).sort({ name: 1 }).lean(),
      InventoryTransaction.aggregate([{ $match: { status: { $ne: 'pending' } } }, { $unwind: '$items' }, { $count: 'total' }])
    ]);
    const totalIssueItems = issueCount[0]?.total || 0;
    const totalIssuePages = Math.max(1, Math.ceil(totalIssueItems / PAGE_SIZE));
    const issuePage = Math.min(requestedPage, totalIssuePages);
    const issueItems = await InventoryTransaction.aggregate([
      { $match: { status: { $ne: 'pending' } } },
      { $unwind: '$items' },
      { $sort: { assignedAt: -1, _id: -1 } },
      { $skip: (issuePage - 1) * PAGE_SIZE },
      { $limit: PAGE_SIZE }
    ]);
    renderPage(res, 'salesproduct', {
      products: groupInventoryProducts(products).filter((product) => product.quantity > 0).map(normalizeProductStockDisplay),
      issueItems,
      totalIssueItems,
      issuePage,
      totalIssuePages,
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      assignedBy: String(req.user?.teacherName || req.user?.username || '').trim(),
      transactionSubmissionKey: new mongoose.Types.ObjectId().toString(),
      message: req.query.duplicate ? 'This assignment was already recorded; stock was not deducted again.' : req.query.saved ? 'Transaction recorded and stock updated.' : ''
    });
  } catch (error) {
    console.error('Unable to load inventory transactions:', error);
    res.status(500).send('Unable to load inventory transactions');
  }
};

const returnPageData = async (returnType, page) => {
  const totalReturns = await InventoryReturn.countDocuments({ returnType });
  const totalPages = Math.max(1, Math.ceil(totalReturns / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const returns = await InventoryReturn.find({ returnType })
    .sort({ returnedAt: -1, _id: -1 })
    .skip((currentPage - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();
  return { returns, totalReturns, page: currentPage, totalPages };
};

exports.salesReturnsPage = async (req, res) => {
  try {
    const [history, sourceItems] = await Promise.all([
      returnPageData('sales', parsePage(req.query.page)),
      InventoryTransaction.aggregate([
        { $match: { status: { $ne: 'pending' } } },
        { $unwind: '$items' },
        { $match: { $expr: { $lt: [{ $ifNull: ['$items.returnedQuantity', 0] }, '$items.quantity'] } } },
        { $sort: { assignedAt: -1, _id: -1 } },
        { $limit: 500 }
      ])
    ]);
    renderPage(res, 'salesreturn', {
      ...history,
      sourceItems,
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      returnedBy: String(req.user?.teacherName || req.user?.username || '').trim(),
      message: req.query.saved ? 'Sales return recorded and stock restored.' : ''
    });
  } catch (error) {
    console.error('Unable to load sales returns:', error);
    res.status(500).send('Unable to load sales returns');
  }
};

exports.createSalesReturn = async (req, res) => {
  const sourceTransactionId = String(req.body.sourceTransactionId || '').trim();
  const sourceItemId = String(req.body.sourceItemId || '').trim();
  const returnNepaliDate = String(req.body.returnNepaliDate || '').trim();
  const quantity = Number(req.body.quantity);
  const reason = String(req.body.reason || '').trim();
  if (!mongoose.isValidObjectId(sourceTransactionId) || !mongoose.isValidObjectId(sourceItemId)
    || !/^\d{4}-\d{2}-\d{2}$/.test(returnNepaliDate) || !Number.isFinite(quantity) || quantity <= 0
    || !reason || reason.length > 500) {
    return res.status(400).send('Choose an issued item, valid return date, whole-number quantity, and reason.');
  }

  let sourceTransaction;
  let sourceItem;
  let previousReturned;
  let reservedSourceQuantity = false;
  let restoredStock = false;
  let productId;
  try {
    sourceTransaction = await InventoryTransaction.findById(sourceTransactionId);
    if (!sourceTransaction) return res.status(404).send('The source issue was not found.');
    sourceItem = sourceTransaction.items.id(sourceItemId);
    if (!sourceItem) return res.status(404).send('The source item was not found.');
    previousReturned = Number(sourceItem.returnedQuantity) || 0;
    const sourceQuantity = Number(sourceItem.quantity) || 0;
    if (quantity > sourceQuantity - previousReturned) {
      return res.status(409).send(`Only ${sourceQuantity - previousReturned} ${sourceItem.quantityTypeName} remain available to return.`);
    }
    productId = sourceItem.product;
    const itemReturnFilter = {
      _id: sourceItemId,
      product: productId,
      quantity: sourceQuantity,
      $or: [{ returnedQuantity: previousReturned }]
    };
    if (previousReturned === 0) itemReturnFilter.$or.push({ returnedQuantity: { $exists: false } });
    const sourceUpdate = await InventoryTransaction.updateOne(
      { _id: sourceTransaction._id, items: { $elemMatch: itemReturnFilter } },
      { $inc: { 'items.$.returnedQuantity': quantity } }
    );
    if (!sourceUpdate.modifiedCount) return res.status(409).send('This item was returned by another user. Refresh the page and try again.');
    reservedSourceQuantity = true;

    const stockUpdate = await InventoryProduct.updateOne({ _id: productId }, { $inc: { quantity } });
    if (!stockUpdate.matchedCount) throw new Error('RETURN_PRODUCT_MISSING');
    restoredStock = true;
    await InventoryReturn.create({
      returnType: 'sales',
      returnNo: `SR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      returnedAt: new Date(),
      returnNepaliDate,
      product: productId,
      productName: sourceItem.productName,
      sku: sourceItem.sku || '',
      quantityTypeName: sourceItem.quantityTypeName,
      quantity,
      conversionFactor: 1,
      baseQuantity: quantity,
      baseUnitName: sourceItem.baseUnitName || sourceItem.quantityTypeName,
      sourceQuantity: sourceQuantity,
      previouslyReturned: previousReturned,
      sourceTransaction: sourceTransaction._id,
      sourceItemId: sourceItem._id,
      sourceTransactionNo: sourceTransaction.transactionNo,
      sourceDateNepali: sourceTransaction.assignedNepaliDate || '',
      counterpartyName: sourceTransaction.recipientName,
      counterpartyType: sourceTransaction.recipientType,
      counterpartyClass: sourceTransaction.recipientClass || '',
      referenceNo: sourceTransaction.transactionNo,
      reason,
      returnedBy: String(req.user?.teacherName || req.user?.username || 'Inventory').trim()
    });
    return res.redirect('/inventory/salesreturns?saved=1');
  } catch (error) {
    if (restoredStock) await InventoryProduct.updateOne({ _id: productId, quantity: { $gte: quantity } }, { $inc: { quantity: -quantity } });
    if (reservedSourceQuantity) await InventoryTransaction.updateOne(
      { _id: sourceTransaction._id, items: { $elemMatch: { _id: sourceItemId, returnedQuantity: previousReturned + quantity } } },
      { $inc: { 'items.$.returnedQuantity': -quantity } }
    );
    console.error('Unable to record sales return:', error);
    return res.status(400).send('Unable to record sales return. Stock and source quantities were restored.');
  }
};

exports.purchaseReturnsPage = async (req, res) => {
  try {
    const [history, stockRecords, suppliers] = await Promise.all([
      returnPageData('purchase', parsePage(req.query.page)),
      InventoryProduct.find({ active: true }).sort({ name: 1 }).lean(),
      InventorySupplier.find({ active: true }).sort({ name: 1 }).select('name').lean()
    ]);
    renderPage(res, 'purchasereturn', {
      ...history,
      products: groupInventoryProducts(stockRecords).filter((product) => product.quantity > 0).map(normalizeProductStockDisplay),
      suppliers: suppliers.map((supplier) => supplier.name),
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      returnedBy: String(req.user?.teacherName || req.user?.username || '').trim(),
      message: req.query.saved ? 'Purchase return recorded and stock reduced.' : ''
    });
  } catch (error) {
    console.error('Unable to load purchase returns:', error);
    res.status(500).send('Unable to load purchase returns');
  }
};

exports.createPurchaseReturn = async (req, res) => {
  const productId = String(req.body.productId || '').trim();
  const returnNepaliDate = String(req.body.returnNepaliDate || '').trim();
  const quantity = Number(req.body.quantity);
  const supplierName = String(req.body.supplierName || '').trim().replace(/\s+/g, ' ');
  const referenceNo = String(req.body.referenceNo || '').trim();
  const reason = String(req.body.reason || '').trim();
  if (!mongoose.isValidObjectId(productId) || !/^\d{4}-\d{2}-\d{2}$/.test(returnNepaliDate)
    || !Number.isFinite(quantity) || quantity <= 0 || !supplierName || supplierName.length > 120
    || referenceNo.length > 100 || !reason || reason.length > 500) {
    return res.status(400).send('Choose an item, valid return date, whole-number quantity, supplier, and reason.');
  }

  const decremented = [];
  try {
    const products = await InventoryProduct.find({ active: true }).lean();
    const product = products.find((record) => String(record._id) === productId);
    if (!product) return res.status(404).send('The selected inventory item is no longer available.');
    await saveSupplierName(supplierName);
    await decrementGroupedProductStock(products, new Map([[productId, quantity]]), decremented);
    await InventoryReturn.create({
      returnType: 'purchase',
      returnNo: `PR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      returnedAt: new Date(),
      returnNepaliDate,
      product: product._id,
      productName: product.name,
      sku: product.sku || '',
      quantityTypeName: product.quantityTypeName,
      quantity,
      conversionFactor: 1,
      baseQuantity: quantity,
      baseUnitName: getProductUnits(product).baseUnit,
      sourceQuantity: Number(product.quantity) || 0,
      previouslyReturned: 0,
      counterpartyName: supplierName,
      counterpartyType: 'supplier',
      referenceNo,
      reason,
      returnedBy: String(req.user?.teacherName || req.user?.username || 'Inventory').trim()
    });
    return res.redirect('/inventory/purchasereturns?saved=1');
  } catch (error) {
    await Promise.all(decremented.map(({ productId: decrementedProductId, quantity: decrementedQuantity }) =>
      InventoryProduct.updateOne({ _id: decrementedProductId }, { $inc: { quantity: decrementedQuantity } })
    ));
    if (error.message === 'INSUFFICIENT_STOCK') return res.status(409).send('The requested quantity exceeds available stock. Stock was not changed.');
    console.error('Unable to record purchase return:', error);
    return res.status(400).send('Unable to record purchase return. Stock was restored.');
  }
};

exports.searchAssignees = async (req, res) => {
  const query = String(req.query.q || '').trim();
  const type = req.query.type;
  if (!query || !['staff', 'student'].includes(type)) return res.json([]);
  try {
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (type === 'staff') {
      const people = await User.find({ $or: [{ staffName: { $regex: safeQuery, $options: 'i' } }, { teacherName: { $regex: safeQuery, $options: 'i' } }] }).limit(10).lean();
      return res.json(people.map((person) => ({ name: person.staffName || person.teacherName, id: person._id })).filter((person) => person.name));
    }
    const students = await StudentRecord.find({ name: { $regex: safeQuery, $options: 'i' } }).select('name reg studentClass section roll').limit(10).lean();
    return res.json(students.map((student) => ({ name: student.name, id: student.reg || String(student._id), studentClass: [student.studentClass, student.section].filter(Boolean).join(' / '), roll: student.roll })));
  } catch (error) {
    console.error('Unable to search inventory assignees:', error);
    res.status(500).json({ error: 'Unable to search people' });
  }
};

exports.downloadTransactionTemplate = (req, res) => {
  const headers = ['assignmentRef', 'recipientType', 'recipientName', 'recipientId', 'recipientClass', 'assignedNepaliDate', 'assignedBy', 'reason', 'productSku', 'productName', 'quantity'];
  res.type('text/csv');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-issue-template.csv"');
  res.send(`${headers.join(',')}\r\n`);
};

exports.importTransactionsCsv = [transactionCsvUpload.single('transactionCsv'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: 'Choose a CSV file to upload.' });
    const rows = await parseInventoryCsv(req.file.buffer);
    if (!rows.length) return res.status(400).json({ message: 'The CSV file has no issue rows.' });

    const products = await InventoryProduct.find({ active: true }).lean();
    const productGroups = groupInventoryProducts(products);
    const productsBySku = new Map(productGroups.filter((product) => product.sku).map((product) => [String(product.sku).trim().toLowerCase(), product]));
    const productsByName = new Map();
    productGroups.forEach((product) => {
      const key = standardizeProductName(product.name).replace(/\s+/g, '').toLowerCase();
      if (!productsByName.has(key)) productsByName.set(key, []);
      productsByName.get(key).push(product);
    });

    const assignments = new Map();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;
      const assignmentRef = String(row.assignmentRef || `row-${rowNumber}`).trim();
      const recipientType = String(row.recipientType || '').trim().toLowerCase();
      const recipientName = String(row.recipientName || '').trim();
      const recipientId = String(row.recipientId || '').trim();
      const recipientClass = String(row.recipientClass || '').trim();
      const assignedNepaliDate = String(row.assignedNepaliDate || '').trim();
      const assignedBy = String(row.assignedBy || '').trim();
      const reason = String(row.reason || '').trim();
      const productSku = String(row.productSku || '').trim().toLowerCase();
      const productName = String(row.productName || '').trim();
      const quantity = Number(row.quantity);
      const invalidFields = [];
      if (!assignmentRef || assignmentRef.length > 100) invalidFields.push('assignmentRef');
      if (!['staff', 'student'].includes(recipientType)) invalidFields.push('recipientType');
      if (!recipientName) invalidFields.push('recipientName');
      if (!assignedNepaliDate) invalidFields.push('assignedNepaliDate');
      if (!assignedBy) invalidFields.push('assignedBy');
      if (!reason) invalidFields.push('reason');
      if (!Number.isFinite(quantity) || quantity <= 0) invalidFields.push('quantity');
      if (!productSku && !productName) invalidFields.push('productSku or productName');
      if (invalidFields.length) {
        return res.status(400).json({ message: `CSV row ${rowNumber} is missing or has invalid fields: ${invalidFields.join(', ')}.` });
      }

      const skuMatch = productSku ? productsBySku.get(productSku) : null;
      const nameMatches = productName ? (productsByName.get(standardizeProductName(productName).replace(/\s+/g, '').toLowerCase()) || []) : [];
      const productGroups = skuMatch ? [skuMatch] : nameMatches;
      if (!productGroups.length) {
        const problem = productSku && !skuMatch ? `SKU ${productSku} was not found` : `Product ${productName || productSku} was not found`;
        return res.status(400).json({ message: `CSV row ${rowNumber}: ${problem}.` });
      }
      if (skuMatch && productName && standardizeProductName(skuMatch.name).replace(/\s+/g, '').toLowerCase() !== standardizeProductName(productName).replace(/\s+/g, '').toLowerCase()) {
        return res.status(400).json({ message: `CSV row ${rowNumber}: productName does not match productSku.` });
      }

      const assignmentDetails = { recipientType, recipientName, recipientId, recipientClass, assignedNepaliDate, assignedBy, reason };
      let assignment = assignments.get(assignmentRef);
      if (!assignment) {
        assignment = { ...assignmentDetails, items: [] };
        assignments.set(assignmentRef, assignment);
      } else if (Object.keys(assignmentDetails).some((key) => assignment[key] !== assignmentDetails[key])) {
        return res.status(400).json({ message: `CSV row ${rowNumber}: assignmentRef ${assignmentRef} has conflicting recipient or assignment details.` });
      }

      assignment.items.push({ productGroups, productName: productName || productGroups[0].name, quantity });
    }

    const requestedQuantities = new Map();
    for (const assignment of assignments.values()) {
      for (const item of assignment.items) {
        const candidateGroups = [...item.productGroups].sort((left, right) => {
          const leftDate = Math.min(...left.stockRecords.map((record) => new Date(record.createdAt || 0).getTime() || 0));
          const rightDate = Math.min(...right.stockRecords.map((record) => new Date(record.createdAt || 0).getTime() || 0));
          return leftDate - rightDate || String(left._id).localeCompare(String(right._id));
        });
        let remaining = item.quantity;
        item.allocations = [];
        for (const productGroup of candidateGroups) {
          const productId = String(productGroup._id);
          const alreadyRequested = requestedQuantities.get(productId) || 0;
          const available = Math.max(0, (Number(productGroup.quantity) || 0) - alreadyRequested);
          const allocated = Math.min(available, remaining);
          if (!allocated) continue;
          requestedQuantities.set(productId, alreadyRequested + allocated);
          item.allocations.push({ product: productGroup, quantity: allocated });
          remaining -= allocated;
          if (!remaining) break;
        }
        if (remaining) {
          return res.status(409).json({ message: `Not enough stock for ${item.productName}; ${remaining} more units are needed. No assignments were imported.` });
        }
      }
    }

    const decremented = [];
    const transactionNumbers = [...assignments.keys()].map((_, index) => `INV-${Date.now()}-${index}-${Math.floor(Math.random() * 900 + 100)}`);
    try {
      await decrementGroupedProductStock(products, requestedQuantities, decremented);

      const transactions = [...assignments.values()].map((assignment, index) => ({
        transactionNo: transactionNumbers[index],
        assignedAt: new Date(),
        assignedNepaliDate: assignment.assignedNepaliDate,
        recipientType: assignment.recipientType,
        recipientName: assignment.recipientName,
        recipientId: assignment.recipientId,
        recipientClass: assignment.recipientClass,
        reason: assignment.reason,
        assignedBy: assignment.assignedBy,
        items: assignment.items.flatMap((item) => item.allocations.map(({ product, quantity }) => ({
          product: product._id,
          productName: product.name,
          sku: product.sku || '',
          quantity,
          enteredQuantity: quantity,
          unitName: getProductUnits(product).baseUnit,
          conversionFactor: 1,
          baseQuantity: quantity,
          baseUnitName: getProductUnits(product).baseUnit,
          quantityTypeName: getProductUnits(product).baseUnit
        })))
      }));
      await InventoryTransaction.insertMany(transactions, { ordered: true });
      return res.json({ message: `Imported ${transactions.length} assignments with ${rows.length} item rows.`, imported: transactions.length });
    } catch (error) {
      await Promise.all([
        ...decremented.map(({ productId, quantity }) => InventoryProduct.updateOne({ _id: productId }, { $inc: { quantity } })),
        InventoryTransaction.deleteMany({ transactionNo: { $in: transactionNumbers } })
      ]);
      if (error.message === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: 'One or more products do not have enough stock for this CSV. No assignments were imported.' });
      throw error;
    }
  } catch (error) {
    console.error('Unable to import inventory issue CSV:', error);
    if (error instanceof multer.MulterError) return res.status(400).json({ message: 'CSV upload must be smaller than 2 MB.' });
    return res.status(400).json({ message: 'Unable to import issue CSV. Check the template and values.' });
  }
}];

exports.createTransaction = async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const submissionKey = String(req.body.submissionKey || '').trim();
  if (!['staff', 'student'].includes(req.body.recipientType) || !req.body.recipientName || !req.body.assignedNepaliDate || !req.body.reason || !req.body.assignedBy || !items.length) {
    return res.status(400).send('Complete the assignment details and add at least one item.');
  }
  if (!mongoose.isValidObjectId(submissionKey)) return res.status(400).send('Refresh the assignment form before submitting.');
  const normalizedItems = items.map((item) => ({
    productId: String(item.productId || ''),
    quantity: Number(item.quantity),
    unit: String(item.unit || 'base')
  }));
  if (normalizedItems.some((item) => !mongoose.isValidObjectId(item.productId) || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return res.status(400).send('Every item must have a valid product and a quantity greater than zero.');
  }
  const decremented = [];
  let reservedTransaction;
  let session = null;
  try {
    const products = await InventoryProduct.find({ active: true }).lean();
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const quantities = new Map();
    const convertedItems = normalizedItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error('PRODUCT_MISSING');
      const conversion = convertToBaseQuantity(item.quantity, item.unit, product);
      if (!conversion) throw new Error('INVALID_SALE_UNIT');
      quantities.set(item.productId, roundQuantity((quantities.get(item.productId) || 0) + conversion.baseQuantity));
      return { product, ...conversion };
    });
    const transactionItems = convertedItems.map(({ product, ...conversion }) => ({
      product: product._id,
      productName: product.name,
      sku: product.sku || '',
      quantity: conversion.baseQuantity,
      enteredQuantity: conversion.enteredQuantity,
      unitName: conversion.unitName,
      conversionFactor: conversion.conversionFactor,
      baseQuantity: conversion.baseQuantity,
      baseUnitName: conversion.baseUnit,
      quantityTypeName: conversion.baseUnit
    }));
    const transactionNo = `INV-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    session = await startInventoryTransaction();
    [reservedTransaction] = await InventoryTransaction.create([{
      transactionNo,
      submissionKey,
      status: 'pending',
      assignedAt: new Date(),
      assignedNepaliDate: String(req.body.assignedNepaliDate || bs.ADToBS(new Date()) || '').trim(),
      recipientType: req.body.recipientType,
      recipientName: req.body.recipientName.trim(),
      recipientId: req.body.recipientId,
      recipientClass: req.body.recipientClass,
      reason: req.body.reason.trim(),
      assignedBy: req.body.assignedBy.trim(),
      items: transactionItems
    }], session ? { session } : {});
    await decrementGroupedProductStock(products, quantities, decremented, session);
    const posted = await InventoryTransaction.updateOne(
      { _id: reservedTransaction._id, status: 'pending' },
      { $set: { status: 'posted' } },
      session ? { session } : {}
    );
    if (!posted.modifiedCount) throw new Error('TRANSACTION_STATUS_CHANGED');
    if (session) await session.commitTransaction();
    return res.redirect('/inventory/sales?saved=1');
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction();
    if (!session) {
      await Promise.all(decremented.map(({ productId, quantity }) => InventoryProduct.updateOne({ _id: productId }, { $inc: { quantity } })));
      if (reservedTransaction) await InventoryTransaction.deleteOne({ _id: reservedTransaction._id, status: 'pending' });
    }
    if (error.code === 11000) {
      const existing = await InventoryTransaction.findOne({ submissionKey }).select('status').lean();
      if (existing?.status === 'posted') return res.redirect('/inventory/sales?duplicate=1');
      return res.status(409).send('This assignment is already being processed. Check the issue history before retrying.');
    }
    if (error.message === 'INSUFFICIENT_STOCK') return res.status(409).send('Stock changed while saving. Review the available quantities and try again.');
    if (error.message === 'INVALID_SALE_UNIT') return res.status(400).send('Choose a valid selling unit for every product.');
    if (error.message === 'TRANSACTION_STATUS_CHANGED') return res.status(409).send('The assignment status changed while saving. Check issue history before retrying.');
    console.error('Unable to record inventory transaction:', error);
    return res.status(400).send('Unable to record transaction. Stock was restored.');
  } finally {
    if (session) await session.endSession();
  }
};

exports.analyticsPage = async (req, res) => {
  try {
    const [stockRecords, monthly, categoryStock] = await Promise.all([
      InventoryProduct.find({ active: true }).lean(),
      InventoryTransaction.aggregate([
        { $match: { status: { $ne: 'pending' }, assignedAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$assignedAt' } }, quantity: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      InventoryProduct.aggregate([
        { $match: { active: true, quantity: { $gt: 0 } } },
        { $group: { _id: '$categoryName', quantity: { $sum: 1 } } },
        { $sort: { quantity: -1 } }
      ])
    ]);
    const products = groupInventoryProducts(stockRecords)
      .map(normalizeProductStockDisplay)
      .sort((left, right) => {
        const leftRatio = left.lowStockThreshold > 0 ? left.quantity / left.lowStockThreshold : left.quantity === 0 ? 0 : Infinity;
        const rightRatio = right.lowStockThreshold > 0 ? right.quantity / right.lowStockThreshold : right.quantity === 0 ? 0 : Infinity;
        return leftRatio - rightRatio || left.name.localeCompare(right.name);
      });
    renderPage(res, 'analytics', {
      products,
      monthlyLabels: monthly.map((row) => row._id),
      monthlyValues: monthly.map((row) => row.quantity),
      categoryLabels: categoryStock.map((row) => row._id || 'Uncategorized'),
      categoryValues: categoryStock.map((row) => row.quantity)
    });
  } catch (error) {
    console.error('Unable to load inventory analytics:', error);
    res.status(500).send('Unable to load inventory analytics');
  }
};

exports.printTransaction = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Transaction not found');
    const transaction = await InventoryTransaction.findOne({ _id: req.params.id, status: { $ne: 'pending' } }).lean();
    if (!transaction) return res.status(404).send('Transaction not found');
    renderPage(res, 'transactionprint', { transaction });
  } catch (error) {
    console.error('Unable to load inventory receipt:', error);
    res.status(500).send('Unable to load receipt');
  }
};

exports.suppliersPage = async (req, res) => {
  try {
    const suppliers = await InventorySupplier.find({ active: true }).sort({ name: 1 }).lean();
    renderPage(res, 'addstorename', {
      suppliers,
      message: req.query.saved === 'edited' ? 'Supplier updated.'
        : req.query.saved === 'deleted' ? 'Supplier deleted.'
          : req.query.saved ? 'Supplier saved and available in product entry.' : ''
    });
  } catch (error) {
    console.error('Unable to load inventory suppliers:', error);
    res.status(500).send('Unable to load inventory suppliers');
  }
};

exports.createSupplier = async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) return res.status(400).send('Enter a supplier name up to 120 characters.');
  try {
    await saveSupplierName(name);
    return res.redirect('/inventory/suppliers?saved=1');
  } catch (error) {
    console.error('Unable to save inventory supplier:', error);
    return res.status(500).send('Unable to save supplier. Please try again.');
  }
};

exports.editSupplier = async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Supplier not found.');
  if (!name || name.length > 120) return res.status(400).send('Enter a supplier name up to 120 characters.');
  try {
    const existingSupplier = await InventorySupplier.findById(req.params.id);
    if (!existingSupplier) return res.status(404).send('Supplier not found.');
    const supplier = await InventorySupplier.findByIdAndUpdate(req.params.id, {
      name,
      normalizedName: name.toLowerCase()
    }, { new: true, runValidators: true });
    if (!supplier) return res.status(404).send('Supplier not found.');
    if (existingSupplier.name !== supplier.name) {
      await InventoryProduct.updateMany({ supplierName: existingSupplier.name }, { $set: { supplierName: supplier.name } });
    }
    return res.redirect('/inventory/suppliers?saved=edited');
  } catch (error) {
    console.error('Unable to update inventory supplier:', error);
    return res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'That supplier already exists.' : 'Unable to update supplier.');
  }
};

exports.deleteSupplier = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Supplier not found.');
  try {
    const supplier = await InventorySupplier.findByIdAndDelete(req.params.id);
    if (!supplier) return res.status(404).send('Supplier not found.');
    return res.redirect('/inventory/suppliers?saved=deleted');
  } catch (error) {
    console.error('Unable to delete inventory supplier:', error);
    return res.status(500).send('Unable to delete supplier.');
  }
};