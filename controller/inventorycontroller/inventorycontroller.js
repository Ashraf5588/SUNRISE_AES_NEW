const mongoose = require('mongoose');
const bs = require('bikram-sambat-js');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const {
  inventoryCategorySchema,
  inventoryQuantityTypeSchema,
  inventoryProductSchema,
  inventoryTransactionSchema,
  inventoryProductRequestSchema
} = require('../../model/inventoryschema/inventorySchema');
const { teacherSchema } = require('../../model/admin');
const { studentrecordschema } = require('../../model/adminschema');

const InventoryCategory = mongoose.models.inventoryCategory || mongoose.model('inventoryCategory', inventoryCategorySchema, 'inventoryCategories');
const InventoryQuantityType = mongoose.models.inventoryQuantityType || mongoose.model('inventoryQuantityType', inventoryQuantityTypeSchema, 'inventoryQuantityTypes');
const InventoryProduct = mongoose.models.inventoryProduct || mongoose.model('inventoryProduct', inventoryProductSchema, 'inventoryProducts');
const InventoryTransaction = mongoose.models.inventoryTransaction || mongoose.model('inventoryTransaction', inventoryTransactionSchema, 'inventoryTransactions');
const InventoryProductRequest = mongoose.models.inventoryProductRequest || mongoose.model('inventoryProductRequest', inventoryProductRequestSchema, 'inventoryProductRequests');
const User = mongoose.models.inventoryUser || mongoose.model('inventoryUser', teacherSchema, 'users');
const StudentRecord = mongoose.models.inventoryStudentRecord || mongoose.model('inventoryStudentRecord', studentrecordschema, 'studentrecord');
const inventoryCsvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const PAGE_SIZE = 25;
const parsePage = (value) => Math.max(1, Number.parseInt(value, 10) || 1);

const parseInventoryCsv = (buffer) => new Promise((resolve, reject) => {
  const rows = [];
  const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
  Readable.from([csvText]).pipe(csvParser()).on('data', (row) => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
});

const renderPage = (res, view, data = {}) => res.render(`inventory/${view}`, { ...data, currentPath: res.req.path });
const isInventoryManager = (user) => ['ADMIN', 'INVENTORY_MANAGER', 'INVENTORYMANAGER'].includes(String(user?.role || '').toUpperCase());
const requireInventoryManager = (req, res, next) => isInventoryManager(req.user)
  ? next()
  : res.status(403).send('Only inventory managers can review product requests.');
exports.requireInventoryManager = requireInventoryManager;

exports.productRequestsPage = async (req, res) => {
  try {
    const filter = { requesterId: req.user._id };
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
      requesterUsername: String(req.user.username || '').trim(),
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
    const products = await InventoryProduct.find({
      active: true,
      $or: [
        { name: { $regex: safeQuery, $options: 'i' } },
        { sku: { $regex: safeQuery, $options: 'i' } },
        { barcode: { $regex: safeQuery, $options: 'i' } }
      ]
    }).sort({ name: 1 }).limit(12).lean();
    return res.json(products.map((product) => ({
      id: String(product._id),
      name: product.name,
      quantity: product.quantity,
      unit: product.quantityTypeName,
      sku: product.sku || ''
    })));
  } catch (error) {
    console.error('Unable to search requested products:', error);
    return res.status(500).json({ message: 'Unable to search inventory products.' });
  }
};

exports.createProductRequest = async (req, res) => {
  try {
    const productId = String(req.body.productId || '').trim();
    const productNameInput = String(req.body.productName || '').trim();
    const quantity = Number(req.body.quantity);
    const requestedAtNepali = String(req.body.requestedAtNepali || '').trim();
    const requiredByNepali = String(req.body.requiredByNepali || '').trim();
    const reason = String(req.body.reason || '').trim();
    const quantityTypeNameInput = String(req.body.quantityTypeName || 'pcs').trim();
    const color = String(req.body.color || '').trim();
    const size = String(req.body.size || '').trim();
    if (!productNameInput || productNameInput.length > 120 || !Number.isInteger(quantity) || quantity < 1 || !reason || reason.length > 500 || quantityTypeNameInput.length > 40 || color.length > 40 || size.length > 40) {
      return res.status(400).send('Enter a product, whole-number quantity, and reason for the request.');
    }
    const isNepaliDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!isNepaliDate(requestedAtNepali) || !isNepaliDate(requiredByNepali) || requiredByNepali < requestedAtNepali) {
      return res.status(400).send('Select valid Nepali request and required-by dates. The required-by date cannot be earlier than the request date.');
    }

    let product = null;
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) return res.status(400).send('Select a valid inventory product.');
      product = await InventoryProduct.findOne({ _id: productId, active: true }).lean();
      if (!product) return res.status(404).send('That inventory product is no longer available. Search again.');
    }
    const quantityTypeName = product?.quantityTypeName || quantityTypeNameInput || 'pcs';
    await InventoryProductRequest.create({
      requesterId: req.user._id,
      requesterUsername: String(req.user.username || '').trim(),
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
  if (!mongoose.isValidObjectId(req.params.id) || !allowedStatuses.includes(status) || managerReason.length > 500 || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).send('Choose a valid request status and review reason.');
  }
  if (status === 'rejected' && !managerReason) return res.status(400).send('Add a reason when rejecting a request.');

  let stockAdjustment = null;
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
      if (request.stockDeducted && String(request.product) === String(selectedProduct._id)) {
        const quantityDifference = quantity - request.quantity;
        if (quantityDifference > 0) {
          const updatedProduct = await InventoryProduct.findOneAndUpdate(
            { _id: selectedProduct._id, active: true, quantity: { $gte: quantityDifference } },
            { $inc: { quantity: -quantityDifference } },
            { new: true }
          );
          if (!updatedProduct) return res.status(409).send('Not enough additional stock is available for the revised quantity.');
          stockAdjustment = { productId: selectedProduct._id, quantity: -quantityDifference };
        } else if (quantityDifference < 0) {
          const quantityToRestore = -quantityDifference;
          await InventoryProduct.updateOne({ _id: selectedProduct._id, active: true }, { $inc: { quantity: quantityToRestore } });
          stockAdjustment = { productId: selectedProduct._id, quantity: quantityToRestore };
        }
      } else if (!request.stockDeducted) {
        const updatedProduct = await InventoryProduct.findOneAndUpdate(
          { _id: selectedProduct._id, active: true, quantity: { $gte: quantity } },
          { $inc: { quantity: -quantity } },
          { new: true }
        );
        if (!updatedProduct) return res.status(409).send('Not enough stock is available to approve this request.');
        stockAdjustment = { productId: selectedProduct._id, quantity: -quantity };
      }
    } else if (request.stockDeducted && request.product) {
      await InventoryProduct.updateOne({ _id: request.product }, { $inc: { quantity: request.quantity } });
      stockAdjustment = { productId: request.product, quantity: request.quantity };
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
        stockDeducted: status === 'approved'
      } }
    );
    if (!result.modifiedCount) throw new Error('REQUEST_CHANGED');
    const requestsPage = parsePage(req.body.requestsPage);
    return res.redirect(`/inventory/?reviewed=1&requestsPage=${requestsPage}`);
  } catch (error) {
    if (stockAdjustment) await InventoryProduct.updateOne({ _id: stockAdjustment.productId }, { $inc: { quantity: -stockAdjustment.quantity } });
    if (error.message === 'REQUEST_CHANGED') return res.status(409).send('This request was updated by another manager. Refresh and review it again.');
    console.error('Unable to review product request:', error);
    return res.status(400).send('Unable to save the request review.');
  }
};

exports.dashboard = async (req, res) => {
  try {
    const manager = isInventoryManager(req.user);
    const [totalProducts, stockSummary, lowStockItems, recentTransactions, categoryCount, monthly] = await Promise.all([
      InventoryProduct.countDocuments({ active: true }),
      InventoryProduct.aggregate([
        { $match: { active: true } },
        { $group: { _id: null, totalStock: { $sum: { $ifNull: ['$quantity', 0] } } } }
      ]),
      InventoryProduct.find({ active: true, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } }).sort({ quantity: 1 }).limit(8).lean(),
      InventoryTransaction.find().sort({ assignedAt: -1 }).limit(8).lean(),
      InventoryCategory.countDocuments({ active: true }),
      InventoryTransaction.aggregate([
        { $match: { assignedAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$assignedAt' } }, quantity: { $sum: '$items.quantity' } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    const requestFilter = manager ? {} : { requesterId: req.user._id };
    const requestedPage = parsePage(req.query.requestsPage);
    const totalProductRequests = await InventoryProductRequest.countDocuments(requestFilter);
    const requestTotalPages = Math.max(1, Math.ceil(totalProductRequests / PAGE_SIZE));
    const requestsPage = Math.min(requestedPage, requestTotalPages);
    const productRequests = await InventoryProductRequest.find(requestFilter).sort({ createdAt: -1 }).skip((requestsPage - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    const linkedProductIds = productRequests.map((request) => request.product).filter(Boolean);
    const linkedProducts = linkedProductIds.length
      ? await InventoryProduct.find({ _id: { $in: linkedProductIds } }).select('name').lean()
      : [];
    const linkedProductNames = Object.fromEntries(linkedProducts.map((product) => [String(product._id), product.name]));
    renderPage(res, 'inventorydashboard', {
      totalProducts,
      totalStock: stockSummary[0]?.totalStock || 0,
      categoryCount,
      lowStockItems,
      recentTransactions,
      productRequests,
      linkedProductNames,
      requestsPage,
      requestTotalPages,
      totalProductRequests,
      isInventoryManager: manager,
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
    const totalProducts = await InventoryProduct.countDocuments({ active: true });
    const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const [products, categories, quantityTypes] = await Promise.all([
      InventoryProduct.find({ active: true }).sort({ name: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      InventoryCategory.find({ active: true }).sort({ name: 1 }).lean(),
      InventoryQuantityType.find({ active: true }).sort({ name: 1 }).lean()
    ]);
    let defaultQuantityType = quantityTypes.find((unit) => /^(pcs?|pieces?)$/i.test(unit.name) || /^(pcs?|pieces?)$/i.test(unit.abbreviation || ''));
    if (!defaultQuantityType) {
      defaultQuantityType = await InventoryQuantityType.create({ name: 'Pieces', abbreviation: 'pcs' });
      quantityTypes.push(defaultQuantityType.toObject());
    }
    renderPage(res, 'addproduct', {
      products,
      totalProducts,
      page,
      totalPages,
      categories,
      quantityTypes,
      defaultQuantityTypeId: String(defaultQuantityType._id),
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      message: req.query.saved ? 'Product table saved.' : ''
    });
  } catch (error) {
    console.error('Unable to load inventory products:', error);
    res.status(500).send('Unable to load inventory products');
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
    const price = Number(req.body.price || 0);
    const lowStockThreshold = Number(req.body.lowStockThreshold);
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      return res.status(400).send('Stock, price, and low-stock threshold must be valid and zero or greater.');
    }
    await InventoryProduct.create({
      name: req.body.name,
      sku: String(req.body.sku || '').trim() || undefined,
      category: category?._id,
      categoryName: category?.name || '',
      quantityType: quantityType._id,
      quantityTypeName: quantityType.name,
      quantity,
      price,
      barcode: String(req.body.barcode || '').trim() || undefined,
      lowStockThreshold,
      entryDateNepali: String(req.body.entryDateNepali || bs.ADToBS(new Date()) || '').trim(),
      color: String(req.body.color || '').trim(),
      size: String(req.body.size || '').trim(),
      description: req.body.description
    });
    res.redirect('/inventory/products?saved=1');
  } catch (error) {
    console.error('Unable to create inventory product:', error);
    res.status(error.code === 11000 ? 409 : 400).send(error.code === 11000 ? 'A product with that SKU already exists.' : 'Unable to add product. Check the entered fields.');
  }
};

exports.saveProducts = async (req, res) => {
  const rows = Array.isArray(req.body.products) ? req.body.products : [];
  const page = parsePage(req.body.page);
  const changedRows = rows.filter((row) => row.productId || row.touched === '1');
  if (!changedRows.length) return res.redirect(`/inventory/products?saved=1&page=${page}`);

  try {
    const productIds = changedRows.map((row) => String(row.productId || '').trim()).filter(Boolean);
    if (productIds.some((id) => !mongoose.isValidObjectId(id)) || new Set(productIds).size !== productIds.length) {
      return res.status(400).send('Product rows contain an invalid or repeated product ID.');
    }

    const operations = [];
    const submittedSkus = new Set();
    const submittedBarcodes = new Set();
    for (const row of changedRows) {
      const name = String(row.name || '').trim();
      const sku = String(row.sku || '').trim();
      const quantity = Number(row.quantity);
      const price = Number(row.price || 0);
      const lowStockThreshold = Number(row.lowStockThreshold);
      const barcode = String(row.barcode || '').trim();
      if (!name || name.length > 120 || sku.length > 60 || barcode.length > 100 || !Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
        return res.status(400).send('Each changed row needs a product name, valid whole-number stock values, and a nonnegative price.');
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
        quantityType: quantityType._id,
        quantityTypeName: quantityType.name,
        quantity,
        price,
        lowStockThreshold,
        entryDateNepali: String(row.entryDateNepali || bs.ADToBS(new Date()) || '').trim(),
        color: String(row.color || '').trim(),
        size: String(row.size || '').trim(),
        description: String(row.description || '').trim()
      };
      if (values.color.length > 40 || values.size.length > 40 || values.description.length > 400 || values.entryDateNepali.length > 20) {
        return res.status(400).send('Color, size, description, or Nepali date is too long.');
      }

      if (row.productId) {
        const update = { $set: values };
        if (sku) values.sku = sku;
        else update.$unset = { sku: 1 };
        if (barcode) values.barcode = barcode;
        else update.$unset.barcode = 1;
        operations.push({ updateOne: { filter: { _id: row.productId, active: true }, update } });
      } else {
        if (sku) values.sku = sku;
        if (barcode) values.barcode = barcode;
        operations.push({ insertOne: { document: values } });
      }
    }

    if (productIds.length) {
      const activeProducts = await InventoryProduct.countDocuments({ _id: { $in: productIds }, active: true });
      if (activeProducts !== productIds.length) return res.status(404).send('One or more products could not be found. Refresh and try again.');
    }
    await InventoryProduct.bulkWrite(operations, { ordered: true });
    return res.redirect(`/inventory/products?saved=1&page=${page}`);
  } catch (error) {
    console.error('Unable to save inventory product rows:', error);
    if (error.code === 11000) return res.status(409).send('A product SKU is already in use. Review the table and try again.');
    return res.status(400).send('Unable to save product rows. Check the entered fields and try again.');
  }
};

exports.downloadProductTemplate = (req, res) => {
  const headers = ['entryDateNepali', 'name', 'quantity', 'unit', 'price', 'color', 'size', 'sku', 'description', 'barcode', 'category', 'lowStockThreshold'];
  res.type('text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-products-template.csv"');
  res.send(`${headers.join(',')}\r\n${String(bs.ADToBS(new Date()) || '').trim()},Sample product,10,pcs,0,Blue,Medium,SKU-001,Product description,123456789012,,5\r\n`);
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
      const name = String(row.name || '').trim();
      const unit = unitMap.get(String(row.unit || '').trim().toLowerCase());
      const categoryName = String(row.category || '').trim();
      const category = categoryName ? categoryMap.get(categoryName.toLowerCase()) : null;
      const quantity = Number(row.quantity);
      const price = Number(row.price || 0);
      const lowStockThreshold = Number(row.lowStockThreshold || 5);
      const sku = String(row.sku || '').trim();
      const barcode = String(row.barcode || '').trim();
      if (!name || name.length > 120 || !unit || (categoryName && !category) || !Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
        return res.status(400).json({ message: `CSV row ${rowNumber} has an invalid name, unit, category, quantity, price, or low-stock alert.` });
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
        quantityType: unit._id,
        quantityTypeName: unit.name,
        quantity,
        price,
        lowStockThreshold,
        entryDateNepali: String(row.entryDateNepali || bs.ADToBS(new Date()) || '').trim(),
        color: String(row.color || '').trim(),
        size: String(row.size || '').trim(),
        description: String(row.description || '').trim()
      });
    }
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
    renderPage(res, 'addcategory', { categories, message: req.query.saved ? 'Category added.' : '' });
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

exports.quantityTypesPage = async (req, res) => {
  try {
    const quantityTypes = await InventoryQuantityType.find({ active: true }).sort({ name: 1 }).lean();
    renderPage(res, 'quantitytype', { quantityTypes, message: req.query.saved ? 'Unit added.' : '' });
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

exports.salesPage = async (req, res) => {
  try {
    const [products, recentTransactions] = await Promise.all([
      InventoryProduct.find({ active: true, quantity: { $gt: 0 } }).sort({ name: 1 }).lean(),
      InventoryTransaction.find().sort({ assignedAt: -1 }).limit(20).lean()
    ]);
    renderPage(res, 'salesproduct', {
      products,
      recentTransactions,
      todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
      assignedBy: String(req.user?.teacherName || req.user?.username || '').trim(),
      message: req.query.saved ? 'Transaction recorded and stock updated.' : ''
    });
  } catch (error) {
    console.error('Unable to load inventory transactions:', error);
    res.status(500).send('Unable to load inventory transactions');
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

exports.createTransaction = async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!['staff', 'student'].includes(req.body.recipientType) || !req.body.recipientName || !req.body.assignedNepaliDate || !req.body.reason || !req.body.assignedBy || !items.length) {
    return res.status(400).send('Complete the assignment details and add at least one item.');
  }
  const normalizedItems = items.map((item) => ({ productId: String(item.productId || ''), quantity: Number(item.quantity) }));
  if (normalizedItems.some((item) => !mongoose.isValidObjectId(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    return res.status(400).send('Every item must have a valid product and whole-number quantity.');
  }
  const quantities = new Map();
  normalizedItems.forEach((item) => quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity));
  const decremented = [];
  try {
    for (const [productId, quantity] of quantities) {
      const product = await InventoryProduct.findOneAndUpdate(
        { _id: productId, active: true, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { new: true }
      );
      if (!product) throw new Error('INSUFFICIENT_STOCK');
      decremented.push({ productId, quantity });
    }
    const productMap = new Map();
    const products = await InventoryProduct.find({ _id: { $in: [...quantities.keys()] } }).lean();
    products.forEach((product) => productMap.set(String(product._id), product));
    const transactionItems = normalizedItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error('PRODUCT_MISSING');
      return { product: product._id, productName: product.name, sku: product.sku, quantity: item.quantity, quantityTypeName: product.quantityTypeName };
    });
    const transactionNo = `INV-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    await InventoryTransaction.create({
      transactionNo,
      assignedAt: new Date(),
      assignedNepaliDate: String(req.body.assignedNepaliDate || bs.ADToBS(new Date()) || '').trim(),
      recipientType: req.body.recipientType,
      recipientName: req.body.recipientName.trim(),
      recipientId: req.body.recipientId,
      recipientClass: req.body.recipientClass,
      reason: req.body.reason.trim(),
      assignedBy: req.body.assignedBy.trim(),
      items: transactionItems
    });
    return res.redirect('/inventory/sales?saved=1');
  } catch (error) {
    await Promise.all(decremented.map(({ productId, quantity }) => InventoryProduct.updateOne({ _id: productId }, { $inc: { quantity } })));
    if (error.message === 'INSUFFICIENT_STOCK') return res.status(409).send('Stock changed while saving. Review the available quantities and try again.');
    console.error('Unable to record inventory transaction:', error);
    return res.status(400).send('Unable to record transaction. Stock was restored.');
  }
};

exports.analyticsPage = async (req, res) => {
  try {
    const [products, monthly, categoryStock] = await Promise.all([
      InventoryProduct.find({ active: true }).sort({ quantity: 1 }).lean(),
      InventoryTransaction.aggregate([
        { $match: { assignedAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$assignedAt' } }, quantity: { $sum: '$items.quantity' } } },
        { $sort: { _id: 1 } }
      ]),
      InventoryProduct.aggregate([{ $match: { active: true } }, { $group: { _id: '$categoryName', quantity: { $sum: '$quantity' } } }, { $sort: { quantity: -1 } }])
    ]);
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
    const transaction = await InventoryTransaction.findById(req.params.id).lean();
    if (!transaction) return res.status(404).send('Transaction not found');
    renderPage(res, 'transactionprint', { transaction });
  } catch (error) {
    console.error('Unable to load inventory receipt:', error);
    res.status(500).send('Unable to load receipt');
  }
};