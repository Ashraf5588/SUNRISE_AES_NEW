const express = require('express');
const cirriculum = express.Router();
const {verifytoken,authorized,isAdmin,isnewsAdmin}=require('../middleware/auth')
const { createCirriculum, getCirriculumData, saveCirriculum,lessonPlanSelect,annualLessonForm,saveAnnualLessonPlan,saveUnitPlan,saveDailyLessonPlan} = require('../controller/cirriculumcontroller');

const {principaldashboard} = require('../controller/principaldashboard');

cirriculum.get('/createcirriculum',verifytoken,authorized,createCirriculum);
cirriculum.get('/createcirriculum/data',verifytoken,getCirriculumData);
cirriculum.post('/createcirriculum',saveCirriculum);


cirriculum.get('/lessonplanselect',verifytoken,authorized,lessonPlanSelect);
cirriculum.get('/annualform',verifytoken,authorized,annualLessonForm);

cirriculum.post('/annuallessonform',verifytoken,authorized,saveAnnualLessonPlan);
cirriculum.post('/unitplan',verifytoken,authorized,saveUnitPlan);
cirriculum.post('/dailylessonplan',verifytoken,authorized,saveDailyLessonPlan);

cirriculum.get('/principaldashboard',verifytoken,authorized,principaldashboard);

module.exports = cirriculum;