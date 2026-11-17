const express = require('express');
const router = express.Router();
const setupController = require('../controller/billingcontroller/setupController');
const { verifytoken, authorized, isAdmin } = require('../middleware/auth');

router.use(verifytoken, authorized, isAdmin);

router.get('/classes', setupController.listClasses);
router.post('/classes', setupController.createClass);

router.get('/fee-categories', setupController.listFeeCategories);
router.post('/fee-categories', setupController.createFeeCategory);

router.get('/sessions', setupController.listSessions);
router.get('/sessions/:id/edit', setupController.editSessionForm);
router.post('/sessions', setupController.createSession);
router.post('/sessions/:id/edit', setupController.updateSession);
router.post('/sessions/:id/delete', setupController.deleteSession);
router.get('/transportfee', setupController.listTransportFees);
router.get('/transportfee/:id/edit', setupController.listTransportFees);
router.post('/transportfee', setupController.createTransportFee);
router.post('/transportfee/:id/edit', setupController.updateTransportFee);
router.post('/transportfee/:id/delete', setupController.deleteTransportFee);
router.get('/discount', setupController.discountdata);
router.post('/discount', setupController.createDiscountFee);
router.get('/fee-structures', setupController.listFeeStructures);
router.post('/fee-structures', setupController.createFeeStructure);

router.get('/school', setupController.getSchoolSettings);
router.post('/school', setupController.updateSchoolSettings);
router.get('/opening-balances', setupController.openingBalancesPage);
router.post('/opening-balances', setupController.createOpeningBalance);

module.exports = router;
