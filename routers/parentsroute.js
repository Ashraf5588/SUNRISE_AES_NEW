const express = require('express');
const parents = express.Router();
const controller = require('../controller/paretnscontroller/paretnscontroller');
const { verifytoken, isAdmin } = require('../middleware/auth');

parents.get('/login', controller.loginPage);
parents.post('/login', controller.login);
parents.post('/logout', controller.logout);
parents.post('/complaints', controller.requireParent, controller.submitComplaint);
parents.get('/admin/accounts', verifytoken, isAdmin, controller.adminAccountsPage);
parents.post('/admin/accounts', verifytoken, isAdmin, controller.saveParentAccount);
parents.get('/', controller.requireParent, controller.dashboard);

module.exports = parents;
