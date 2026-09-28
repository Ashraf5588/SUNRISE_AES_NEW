const express = require('express');
const inventory = express.Router();
const inventoryController = require('../controller/inventorycontroller/inventorycontroller');
const { verifytoken,isFrontdesk } = require('../middleware/auth');

inventory.get('/', verifytoken,isFrontdesk,inventoryController.dashboard);
inventory.get('/products',verifytoken,isFrontdesk, inventoryController.productsPage);
inventory.get('/products/template.csv',verifytoken,isFrontdesk,inventoryController.downloadProductTemplate);
inventory.post('/products/import-csv',verifytoken,isFrontdesk,inventoryController.importProductsCsv);
inventory.post('/products',verifytoken,isFrontdesk, inventoryController.createProduct);
inventory.post('/products/save',verifytoken,isFrontdesk, inventoryController.saveProducts);
inventory.get('/categories',verifytoken,isFrontdesk, inventoryController.categoriesPage);
inventory.post('/categories',verifytoken,isFrontdesk, inventoryController.createCategory);
inventory.get('/quantity-types',verifytoken,isFrontdesk, inventoryController.quantityTypesPage);
inventory.post('/quantity-types', verifytoken,isFrontdesk, inventoryController.createQuantityType);
inventory.get('/suppliers', verifytoken,isFrontdesk, inventoryController.suppliersPage);
inventory.post('/suppliers', verifytoken,isFrontdesk, inventoryController.createSupplier);
inventory.get('/sales', verifytoken,isFrontdesk, inventoryController.salesPage);
inventory.post('/sales', verifytoken,isFrontdesk, inventoryController.createTransaction);
inventory.get('/productrequests', verifytoken,isFrontdesk, inventoryController.productRequestsPage);
inventory.post('/productrequests', verifytoken,isFrontdesk, inventoryController.createProductRequest);
inventory.post('/productrequests/:id/review', verifytoken,isFrontdesk, inventoryController.requireInventoryManager, inventoryController.reviewProductRequest);
inventory.get('/search/products', verifytoken,isFrontdesk, inventoryController.searchRequestProducts);
inventory.get('/analytics',verifytoken,isFrontdesk, inventoryController.analyticsPage);
inventory.get('/search/assignees', verifytoken,isFrontdesk, inventoryController.searchAssignees);
inventory.get('/transactions/:id/print', verifytoken,isFrontdesk, inventoryController.printTransaction);

module.exports = inventory;