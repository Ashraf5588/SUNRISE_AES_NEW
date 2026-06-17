const express = require('express');
const router = express.Router();
const aspectController = require('../controller/aspectcontroller');

router.get('/aspect/add/theme', aspectController.addAspectForm);
// Keep legacy and new endpoints supported
router.post('/aspect/save/theme', aspectController.saveAspect);
router.post('/aspect/save', aspectController.saveAspect);
router.get('/aspect/get/theme', aspectController.getAspect);

module.exports = router;
