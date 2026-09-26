const express = require('express');
const router = express.Router();
const studentController = require('../controller/billingcontroller/studentController');

router.get('/', studentController.listStudents);
router.get('/new', studentController.newStudentForm);
router.get('/form', studentController.newStudentForm);
router.get('/import-template.csv', studentController.downloadStudentTemplate);
router.post('/import-csv', studentController.importStudentsCsv);
router.post('/', studentController.createStudent);
router.get('/:id/edit', studentController.editStudentForm);
router.post('/:id', studentController.updateStudent);
router.get('/:id', studentController.viewStudentProfile);

module.exports = router;
