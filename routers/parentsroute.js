const express = require('express');
const parents = express.Router();
const controller = require('../controller/paretnscontroller/paretnscontroller');
const { verifytoken, isAdmin } = require('../middleware/auth');

parents.post('/logout', controller.logout);
parents.post('/complaints', controller.requireParent, controller.submitComplaint);
parents.get('/portfolio', controller.requireParent, controller.portfolioPage);
parents.get('/internal-marks', controller.requireParent, controller.internalMarksPage);
parents.get('/admin/accounts/create', verifytoken, isAdmin, controller.adminAccountsPage);
parents.post('/admin/accounts/create', verifytoken, isAdmin, controller.saveParentAccount);
parents.get('/', controller.requireParent, controller.dashboard);

module.exports = parents;
