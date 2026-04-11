const Cirriculum = require('../model/cirriculumSchema');
const mongoose = require('mongoose');
const bs = require('bikram-sambat-js');






const { classSchema, subjectSchema, terminalSchema,newsubjectSchema} = require("../model/adminschema");
const { marksheetsetupschemaForAdmin } = require("../model/marksheetschema");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const {AnnualLessonPlan,UnitPlan,DailyPlan} = require('../model/lessonplanSchema');
const getSidenavData = async (req) => {
  try {
    const subjects = await subjectlist.find({}).lean();
   
    const studentClassdata = await studentClass.find({}).lean();
    const newsubjects = await newsubject.find({}).lean();
    let accessibleSubject = [];
    let accessibleClass = [];
    
    // Check if req exists and has user property
    if (req && req.user) {
      const user = req.user;
      // Log user info for debugging
      if (user && user.role) {
        console.log('User role:', user.role);
        console.log('User allowed subjects:', user.allowedSubjects || []);
      } else {
        console.log('User object exists but missing role or allowedSubjects');
      }
      
      if (user.role === "ADMIN") {
        accessibleSubject = newsubjects;
        accessibleClass = studentClassdata;
      } else {
        // Filter subjects based on user's allowed subjects
        accessibleSubject = newsubjects.filter(subj =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.subject === subj.newsubject
          )
        );
        
        // Filter classes based on user's allowed classes/sections
        accessibleClass = studentClassdata.filter(classItem =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.studentClass === classItem.studentClass && 
            allowed.section === classItem.section
          )
        );
        
        console.log('Filtered subjects:', accessibleSubject.length);
        console.log('Filtered classes:', accessibleClass.length);
      }
    } else {
      // If no user is found, return all data (default admin view)
      console.log('No user found in request, returning all data');
      accessibleSubject = newsubjects;
      accessibleClass = studentClassdata;
    }
    
    return {
      subjects: accessibleSubject,
      studentClassdata: accessibleClass,
      user: req.user || null
      
    };
  } catch (error) {
    console.error('Error fetching sidenav data:', error);
    return {
      subjects: [],
      studentClassdata: [],
     
    };
  }
};

const isTruthyString = (value) => {
  return normalizeString(value).toLowerCase() === 'true';
};

const toTextArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter((item) => item.length > 0);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(/\r?\n/)
    .map((item) => normalizeString(item))
    .filter((item) => item.length > 0);
};

const toTextareaValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter((item) => item.length > 0).join('\n');
  }

  return normalizeString(value);
};

const formatDateForInput = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizeString(value);
  }

  return date.toISOString().slice(0, 10);
};

const convertBsToAd = (value) => {
  const dateValue = normalizeString(value);

  if (!dateValue) {
    return '';
  }

  try {
    return bs.BSToAD(dateValue);
  } catch (error) {
    return '';
  }
};

const convertAdToBs = (value) => {
  const dateValue = normalizeString(value);

  if (!dateValue) {
    return '';
  }

  try {
    return bs.ADToBS(dateValue);
  } catch (error) {
    return '';
  }
};

const getPlanUnitsById = (units) => {
  const unitMap = new Map();

  (Array.isArray(units) ? units : []).forEach((unit) => {
    const unitId = unit && unit.unitId ? String(unit.unitId) : '';
    if (unitId) {
      unitMap.set(unitId, unit);
    }
  });

  return unitMap;
};

const buildAnnualLessonUnits = (curriculumUnits, savedPlan) => {
  const savedUnitsById = getPlanUnitsById(savedPlan && savedPlan.units);

  return (Array.isArray(curriculumUnits) ? curriculumUnits : []).map((curriculumUnit) => {
    const savedUnit = savedUnitsById.get(String(curriculumUnit._id)) || {};

    return {
      unitId: curriculumUnit._id,
      unitName: normalizeString(savedUnit.unitName || curriculumUnit.unitName),
      content: toTextareaValue(savedUnit.content && savedUnit.content.length ? savedUnit.content : curriculumUnit.content),
      period: normalizeString(savedUnit.period || curriculumUnit.period),
      instructionalMaterial: Array.isArray(savedUnit.instructionalMaterial) && savedUnit.instructionalMaterial.length
        ? savedUnit.instructionalMaterial.map((item) => normalizeString(item)).filter(Boolean)
        : [],
      month: normalizeString(savedUnit.month)
    };
  });
};

const buildUnitPlanUnits = (curriculumUnits, savedPlan) => {
  const savedUnitsById = getPlanUnitsById(savedPlan && savedPlan.units);

  return (Array.isArray(curriculumUnits) ? curriculumUnits : []).map((curriculumUnit) => {
    const savedUnit = savedUnitsById.get(String(curriculumUnit._id)) || {};

    return {
      unitId: curriculumUnit._id,
      unitName: normalizeString(savedUnit.unitName || curriculumUnit.unitName),
      content: toTextareaValue(savedUnit.content && savedUnit.content.length ? savedUnit.content : curriculumUnit.content),
      period: normalizeString(savedUnit.period || curriculumUnit.period),
      objectives: toTextareaValue(savedUnit.objectives && savedUnit.objectives.length ? savedUnit.objectives : curriculumUnit.objectives),
      instructionalMaterial: toTextareaValue(savedUnit.instructionalMaterial && savedUnit.instructionalMaterial.length ? savedUnit.instructionalMaterial : curriculumUnit.instructionalMaterial),
      instructionalMethod: Array.isArray(savedUnit.instructionalMethod) && savedUnit.instructionalMethod.length
        ? savedUnit.instructionalMethod.map((item) => normalizeString(item)).filter(Boolean)
        : [''],
      evaluationProcess: Array.isArray(savedUnit.evaluationProcess) && savedUnit.evaluationProcess.length
        ? savedUnit.evaluationProcess.map((item) => normalizeString(item)).filter(Boolean)
        : [''],
      remarks: Array.isArray(savedUnit.remarks) && savedUnit.remarks.length
        ? savedUnit.remarks.map((item) => normalizeString(item)).filter(Boolean)
        : ['']
    };
  });
};

const buildDailyPlanUnits = (curriculumUnits, savedPlan) => {
  const savedUnitsById = getPlanUnitsById(savedPlan && savedPlan.units);

  return (Array.isArray(curriculumUnits) ? curriculumUnits : []).map((curriculumUnit) => {
    const savedUnit = savedUnitsById.get(String(curriculumUnit._id)) || {};
    const savedLessons = Array.isArray(savedUnit.dailyLessons) ? savedUnit.dailyLessons : [];
    const lessonCount = Math.max(
      Number.parseInt(normalizeString(savedUnit.period || curriculumUnit.period), 10) || 0,
      savedLessons.length
    );

    const dailyLessons = [];

    for (let lessonIndex = 0; lessonIndex < lessonCount; lessonIndex += 1) {
      const savedLesson = savedLessons[lessonIndex] || {};
      const savedEnglishDate = formatDateForInput(savedLesson.date);
      const savedNepaliDate = normalizeString(savedLesson.nepaliDate);

      dailyLessons.push({
        date: savedEnglishDate || convertBsToAd(savedNepaliDate),
        nepaliDate: savedNepaliDate || convertAdToBs(savedEnglishDate),
        objective: toTextArray(savedLesson.objective || savedUnit.objective),
        instructionalMaterial: toTextArray(savedLesson.instructionalMaterial || savedUnit.instructionalMaterial),
        engage: normalizeString(savedLesson.engage),
        explore: normalizeString(savedLesson.explore),
        explain: normalizeString(savedLesson.explain),
        elaborate: normalizeString(savedLesson.elaborate),
        evaluate: normalizeString(savedLesson.evaluate),
        assessment: normalizeString(savedLesson.assessment || ''),
        assignment: normalizeString(savedLesson.assignment || '')
      });
    }

    return {
      unitId: curriculumUnit._id,
      unitName: normalizeString(savedUnit.unitName || curriculumUnit.unitName),
      period: normalizeString(savedUnit.period || curriculumUnit.period),
      objectives: toTextareaValue(savedUnit.objectives && savedUnit.objectives.length ? savedUnit.objectives : curriculumUnit.objectives),
      instructionalMaterial: toTextareaValue(savedUnit.instructionalMaterial && savedUnit.instructionalMaterial.length ? savedUnit.instructionalMaterial : curriculumUnit.instructionalMaterial),
      dailyLessons
    };
  });
};

const loadLessonPlanContext = async (req, studentClass, subject) => {
  const sidenavData = await getSidenavData(req);
  const curriculum = await Cirriculum.findOne({ forClass: studentClass, subject }).lean();

  if (!curriculum) {
    return {
      sidenavData,
      curriculum: null,
      annualLessonPlan: null,
      unitPlan: null,
      dailyPlan: null,
      annualLessonUnits: [],
      unitPlanUnits: [],
      dailyPlanUnits: []
    };
  }

  const [annualLessonPlan, unitPlan, dailyPlan] = await Promise.all([
    AnnualLessonPlan.findOne({ forClass: studentClass, subject }).lean(),
    UnitPlan.findOne({ forClass: studentClass, subject }).lean(),
    DailyPlan.findOne({ forClass: studentClass, subject }).lean()
  ]);

  return {
    sidenavData,
    curriculum,
    annualLessonPlan,
    unitPlan,
    dailyPlan,
    annualLessonUnits: buildAnnualLessonUnits(curriculum.units, annualLessonPlan),
    unitPlanUnits: buildUnitPlanUnits(curriculum.units, unitPlan),
    dailyPlanUnits: buildDailyPlanUnits(curriculum.units, dailyPlan)
  };
};

const wantsJsonResponse = (req) => {
  const acceptHeader = normalizeString(req.headers.accept).toLowerCase();

  return Boolean(
    req.xhr ||
    acceptHeader.includes('application/json') ||
    isTruthyString(req.body && req.body.autosave) ||
    isTruthyString(req.body && req.body.ajax)
  );
};

const redirectToLessonPlan = (res, forClass, subject) => {
  const redirectUrl = `/annualform?studentClass=${encodeURIComponent(forClass)}&subject=${encodeURIComponent(subject)}`;
  return res.redirect(redirectUrl);
};

const parseLessonPlanUnits = (units, mapper) => {
  const unitList = normalizeRepeatGroup(units);

  return unitList
    .map((unit) => mapper(unit || {}))
    .filter((unit) => {
      if (normalizeString(unit.unitId).length > 0) {
        return true;
      }

      return Object.values(unit).some((value) => {
        if (Array.isArray(value)) {
          return value.length > 0;
        }

        return normalizeString(value).length > 0;
      });
    });
};

const saveLessonPlanDocument = async (Model, filter, update, req, res, redirectSubject) => {
  const savedDocument = await Model.findOneAndUpdate(
    filter,
    {
      $set: update,
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );

  if (wantsJsonResponse(req)) {
    return res.json({
      success: true,
      message: 'Lesson plan saved successfully',
      lessonPlan: savedDocument
    });
  }

  return redirectToLessonPlan(res, filter.forClass, redirectSubject || filter.subject);
};

const normalizeRepeatGroup = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((leftKey, rightKey) => Number(leftKey) - Number(rightKey))
      .map((key) => value[key]);
  }

  return [];
};
exports.createCirriculum = async (req, res) => {
try{
  const sidenavData = await getSidenavData(req);
  const { forClass = '', subject = '' } = req.query;
  let existingCirriculum = null;

  if (forClass && subject) {
    existingCirriculum = await Cirriculum.findOne({ forClass, subject }).lean();
  }
  
  res.render('lessonplan/cirriculumform', { sidenavData, existingCirriculum, selectedForClass: forClass, selectedSubject: subject }); 
}catch(err){
  console.error('Error creating cirriculum:', err);
  res.status(500).render('error', { message: 'Error creating cirriculum' });
}
};

exports.getCirriculumData = async (req, res) => {
  try {
    const { forClass = '', subject = '' } = req.query;

    if (!forClass || !subject) {
      return res.json({ curriculum: null });
    }

    const curriculum = await Cirriculum.findOne({ forClass, subject }).lean();
    return res.json({ curriculum });
  } catch (error) {
    console.error('Error loading cirriculum data:', error);
    return res.status(500).json({ error: 'Failed to load curriculum data' });
  }
};

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const normalizeArray = (value) => {
  const arrayValue = Array.isArray(value) ? value : (value ? [value] : []);

  return arrayValue
    .map((item) => normalizeString(item))
    .filter((item) => item.length > 0);
};

const normalizeUnits = (units) => {
  const unitList = Array.isArray(units) ? units : [];

  return unitList
    .map((unit) => ({
      unitName: normalizeString(unit && unit.unitName),
      content: normalizeArray(unit && unit.content),
      period: normalizeString(unit && unit.period),
      instructionalMaterial: normalizeArray(unit && unit.instructionalMaterial),
      remarks: normalizeString(unit && unit.remarks),
      objectives: normalizeArray(unit && unit.objectives),
      instructionalMethod: normalizeArray(unit && unit.instructionalMethod),
      evaluationprocess: normalizeArray(unit && unit.evaluationprocess)
    }))
    .filter((unit) => {
      return unit.unitName || unit.period || unit.remarks || unit.content.length || unit.instructionalMaterial.length || unit.objectives.length || unit.instructionalMethod.length || unit.evaluationprocess.length;
    });
};

exports.saveCirriculum = async (req, res) => {
  try {
    const forClass = normalizeString(req.body.forClass);
    const subject = normalizeString(req.body.subject);
    const units = normalizeUnits(req.body.units);

    if (!forClass || !subject) {
      return res.status(400).json({
        success: false,
        message: 'Class and subject are required'
      });
    }

    const updatedCirriculum = await Cirriculum.findOneAndUpdate(
      { forClass, subject },
      {
        $set: {
          forClass,
          subject,
          units
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    return res.json({
      success: true,
      curriculum: updatedCirriculum
    });
  } catch (error) {
    console.error('Error saving cirriculum:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save curriculum'
    });
  }
};

exports.lessonPlanSelect = async (req, res) => {
  try {

    const sidenavData = await getSidenavData(req);
  

      res.render('lessonplan/lessonformselect', { sidenavData }); 
  }catch (err) {
      console.error("Error fetching events:", err);
  }

};
exports.annualLessonForm = async (req, res) => {
  try {
    const {studentClass, subject} = req.query;
    if (!studentClass || !subject) {
      return res.status(400).render('error', { message: 'Class and subject are required' });
    }
    const lessonPlanContext = await loadLessonPlanContext(req, studentClass, subject);
    if (!lessonPlanContext.curriculum) {
      return res.status(404).render('error', { message: 'Curriculum not found for the selected class and subject' });
    }
  res.render('lessonplan/annuallessonform', {
    ...lessonPlanContext,
    selectedForClass: studentClass,
    selectedSubject: subject,
    teacherName: req.user ? req.user.teacherName : ''
  }); 
  } catch (err) {
    console.error('Error loading annual lesson form:', err);
    res.status(500).render('error', { message: 'Error loading annual lesson form' });
  }
};

exports.saveAnnualLessonPlan = async (req, res) => {
  try{

    const forClass = normalizeString(req.body.forClass);
    const subject = normalizeString(req.body.subject);
    const curriculum = await Cirriculum.findOne({ forClass, subject }).lean();

    if (!forClass || !subject) {
      return res.status(400).json({ success: false, message: 'Class and subject are required' });
    }

    const units = parseLessonPlanUnits(req.body.units, (unit) => ({
      unitId: normalizeString(unit.unitId) || undefined,
      unitName: normalizeString(unit.unitName),
      content: toTextArray(unit.content),
      period: normalizeString(unit.period),
      instructionalMaterial: toTextArray(unit.instructionalMaterial),
      month: normalizeString(unit.month)
    }));

    const payload = {
      forClass,
      subject,
      teacherName: normalizeString(req.body.teacherName),
      curriculumId: curriculum && curriculum._id ? curriculum._id : undefined,
      units
    };

    return saveLessonPlanDocument(
      AnnualLessonPlan,
      { forClass, subject, teacherName: payload.teacherName },
      payload,
      req,
      res,
      subject
    );
    
  }catch(err){
    console.error('Error saving annual lesson plan:', err);
    res.status(500).json({ success: false, message: 'Error saving annual lesson plan' });
  }
};

exports.saveUnitPlan = async (req, res) => {
  try{

    const forClass = normalizeString(req.body.forClass);
    const subject = normalizeString(req.body.subject);
    const curriculum = await Cirriculum.findOne({ forClass, subject }).lean();

    if (!forClass || !subject) {
      return res.status(400).json({ success: false, message: 'Class and subject are required' });
    }

    const units = parseLessonPlanUnits(req.body.units, (unit) => ({
      unitId: normalizeString(unit.unitId) || undefined,
      unitName: normalizeString(unit.unitName),
      content: toTextArray(unit.content),
      period: normalizeString(unit.period),
      objectives: toTextArray(unit.objectives),
      instructionalMaterial: toTextArray(unit.instructionalMaterial),
      instructionalMethod: toTextArray(unit.instructionalMethod),
      evaluationProcess: toTextArray(unit.evaluationProcess),
      remarks: toTextArray(unit.remarks)
    }));

    const payload = {
      forClass,
      subject,
      teacherName: normalizeString(req.body.teacherName),
      curriculumId: curriculum && curriculum._id ? curriculum._id : undefined,
      units
    };

    return saveLessonPlanDocument(
      UnitPlan,
      { forClass, subject ,teacherName: payload.teacherName},
      payload,
      req,
      res,
      subject
    );
    
  }catch(err){
    console.error('Error saving unit plan:', err);
    res.status(500).json({ success: false, message: 'Error saving unit plan' });
  }
};
exports.saveDailyLessonPlan = async (req, res) => {
  try{

    const forClass = normalizeString(req.body.forClass);
    const subject = normalizeString(req.body.subject);
    const teacherName = normalizeString(req.body.teacherName);
    const curriculum = await Cirriculum.findOne({ forClass, subject }).lean();

    if (!forClass || !subject) {
      return res.status(400).json({ success: false, message: 'Class and subject are required' });
    }

    const curriculumUnits = Array.isArray(curriculum && curriculum.units) ? curriculum.units : [];
    const incomingUnits = normalizeRepeatGroup(req.body.units);

    const units = curriculumUnits.map((curriculumUnit, unitIndex) => {
      const submittedUnit = incomingUnits[unitIndex] || {};
      const submittedLessons = Array.isArray(submittedUnit.dailyLessons) ? submittedUnit.dailyLessons : [];
      const lessonCount = Math.max(
        Number.parseInt(normalizeString(curriculumUnit.period), 10) || 0,
        submittedLessons.length
      );
      const dailyLessons = [];

      for (let lessonIndex = 0; lessonIndex < lessonCount; lessonIndex += 1) {
        const lesson = submittedLessons[lessonIndex] || {};
        const englishDate = normalizeString(lesson.date);
        const nepaliDate = normalizeString(lesson.nepaliDate);

        dailyLessons.push({
          date: englishDate || convertBsToAd(nepaliDate),
          nepaliDate: nepaliDate || convertAdToBs(englishDate),
          objective: toTextArray(lesson.objective),
          instructionalMaterial: toTextArray(lesson.instructionalMaterial),
          engage: normalizeString(lesson.engage),
          explore: normalizeString(lesson.explore),
          explain: normalizeString(lesson.explain),
          elaborate: normalizeString(lesson.elaborate),
          evaluate: normalizeString(lesson.evaluate),
          assessment: normalizeString(lesson.assessment),
          assignment: normalizeString(lesson.assignment)
        });
      }

      return {
        unitId: normalizeString(submittedUnit.unitId) || curriculumUnit._id,
        unitName: normalizeString(curriculumUnit.unitName),
        period: normalizeString(curriculumUnit.period),
        dailyLessons
      };
    });

    const payload = {
      forClass,
      subject,
      teacherName,
      curriculumId: curriculum && curriculum._id ? curriculum._id : undefined,
      units
    };

    return saveLessonPlanDocument(
      DailyPlan,
      { forClass, subject },
      payload,
      req,
      res,
      subject
    );
    
  }catch(err){
    console.error('Error saving daily lesson plan:', err);
    res.status(500).json({ success: false, message: 'Error saving daily lesson plan' });
  }
};
