const express = require('express');
const router = express.Router();
const setupController = require('../controller/billingcontroller/setupController');

router.get('/classes', setupController.listClasses);
router.post('/classes', setupController.createClass);

router.get('/fee-categories', setupController.listFeeCategories);
router.post('/fee-categories', setupController.createFeeCategory);

router.get('/sessions', setupController.listSessions);
router.post('/sessions', setupController.createSession);
router.get('/transportfee', setupController.listTransportFees);
router.post('/transportfee', setupController.createTransportFee);
router.get('/discount', setupController.discountdata);
router.post('/discount', setupController.createDiscountFee);
router.get('/fee-structures', setupController.listFeeStructures);
router.post('/fee-structures', setupController.createFeeStructure);

router.get('/school', setupController.getSchoolSettings);
router.post('/school', setupController.updateSchoolSettings);

module.exports = router;
