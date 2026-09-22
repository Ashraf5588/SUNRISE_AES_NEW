const express = require('express');
const router = express.Router();
const paymentController = require('../controller/billingcontroller/paymentController');

router.get('/', paymentController.listPayments);
router.get('/new/:studentId', paymentController.showPaymentForm);
router.post('/', paymentController.createPayment);
router.get('/:id', paymentController.viewReceipt);

module.exports = router;
