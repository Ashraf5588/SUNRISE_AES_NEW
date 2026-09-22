const legacyBillingController = require('../billingcontroller');
const billingController = require('./billingController');
const paymentController = require('./paymentController');
const setupController = require('./setupController');
const studentController = require('./studentController');

module.exports = {
  ...legacyBillingController,
  ...billingController,
  ...paymentController,
  ...setupController,
  ...studentController,
};
