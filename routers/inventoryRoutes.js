const express = require('express');
const inventory = express.Router();
const inventoryController = require('../controller/inventorycontroller/inventorycontroller');
const { verifytoken } = require('../middleware/auth');

inventory.get('/', verifytoken, inventoryController.dashboard);
inventory.get('/products', inventoryController.productsPage);
inventory.get('/products/template.csv', inventoryController.downloadProductTemplate);
inventory.post('/products/import-csv', inventoryController.importProductsCsv);
inventory.post('/products', inventoryController.createProduct);
inventory.post('/products/save', inventoryController.saveProducts);
inventory.get('/categories', inventoryController.categoriesPage);
inventory.post('/categories', inventoryController.createCategory);
inventory.get('/quantity-types', inventoryController.quantityTypesPage);
inventory.post('/quantity-types', inventoryController.createQuantityType);
inventory.get('/sales', verifytoken, inventoryController.salesPage);
inventory.post('/sales', verifytoken, inventoryController.createTransaction);
inventory.get('/productrequests', verifytoken, inventoryController.productRequestsPage);
inventory.post('/productrequests', verifytoken, inventoryController.createProductRequest);
inventory.post('/productrequests/:id/review', verifytoken, inventoryController.requireInventoryManager, inventoryController.reviewProductRequest);
inventory.get('/search/products', verifytoken, inventoryController.searchRequestProducts);
inventory.get('/analytics', inventoryController.analyticsPage);
inventory.get('/search/assignees', verifytoken, inventoryController.searchAssignees);
inventory.get('/transactions/:id/print', inventoryController.printTransaction);

module.exports = inventory;