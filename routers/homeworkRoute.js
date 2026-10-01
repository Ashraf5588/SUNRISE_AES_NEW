const express = require('express');
const homework = express.Router();
const homeworkController = require('../controller/homeworkcontroller/homeworkcontroller');
const { verifytoken } = require('../middleware/auth');

homework.get('/', verifytoken, homeworkController.homeworkPage);
homework.post('/', verifytoken, homeworkController.uploadHomeworkImages, homeworkController.createHomework);
homework.get('/:id/edit', verifytoken, homeworkController.editHomeworkPage);
homework.post('/:id/edit', verifytoken, homeworkController.uploadHomeworkImages, homeworkController.updateHomework);
homework.post('/:id/delete', verifytoken, homeworkController.deleteHomework);

module.exports = homework;
