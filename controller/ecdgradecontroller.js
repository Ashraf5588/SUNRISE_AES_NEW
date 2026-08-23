const path = require("path");
const multer  = require('multer')
const fs= require("fs");
const express = require("express");
const bs = require("bikram-sambat-js");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const { studentSchema } = require("../model/schema");
const { studentrecordschema } = require("../model/adminschema");
const { classSchema, subjectSchema,terminalSchema,newsubjectSchema } = require("../model/adminschema");
const {examSchema}= require("../model/examschema");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentClassModel = studentClass;
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");

const bcrypt = require("bcrypt");
const {holiday} = require('../model/holidayschema')
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const terminalModel = terminal;
const { marksheetsetupschemaForAdmin ,routineSchema} = require("../model/marksheetschema");
const { onlineAttendanceSchema } = require("../model/onlineattendanceschema");
const { fail } = require("assert");
const routineModel = mongoose.model("routine", routineSchema, "routine");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const Portfolio = require("../model/portfolio");
const HealthRecord = require("../model/nurseschema");
const onlineAttendance = mongoose.model("onlineAttendance", onlineAttendanceSchema, "onlineAttendance");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");

const getSlipModel = () => {
 
  if (mongoose.models[`exam_marks`]) {
    return mongoose.models[`exam_marks`];
  }
  return mongoose.model(`exam_marks`, examSchema, `exam_marks`);
};

const issuedNepaliDate = String(bs.ADToBS(new Date()) || '').trim() || new Date().toLocaleDateString('en-GB');

const BS_MONTH_NAMES = {
  1: 'Baisakh',
  2: 'Jestha',
  3: 'Ashadh',
  4: 'Shrawan',
  5: 'Bhadra',
  6: 'Ashwin',
  7: 'Kartik',
  8: 'Mangsir',
  9: 'Poush',
  10: 'Magh',
  11: 'Falgun',
  12: 'Chaitra'
};

const NEPALI_MONTHS = {
  Baisakh: { maxDays: 31 },
  Jestha: { maxDays: 31 },
  Ashadh: { maxDays: 32 },
  Shrawan: { maxDays: 31 },
  Bhadra: { maxDays: 31 },
  Ashwin: { maxDays: 31 },
  Kartik: { maxDays: 30 },
  Mangsir: { maxDays: 29 },
  Poush: { maxDays: 30 },
  Magh: { maxDays: 29 },
  Falgun: { maxDays: 30 },
  Chaitra: { maxDays: 30 }
};

function normalizeText(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function getBsMonthNumber(monthName) {
  const normalized = normalizeText(monthName);
  for (const [key, value] of Object.entries(BS_MONTH_NAMES)) {
    if (normalizeText(value) === normalized) {
      return Number.parseInt(key, 10);
    }
  }
  return null;
}

function getBsMonthLength(monthName) {
  return NEPALI_MONTHS[monthName]?.maxDays || 32;
}

function getCanonicalMonthName(monthName) {
  if (!monthName) return '';
  const normalized = normalizeText(monthName);
  for (const [, value] of Object.entries(BS_MONTH_NAMES)) {
    if (normalizeText(value) === normalized) {
      return value;
    }
  }
  return String(monthName).trim();
}

function getStatusIsAbsent(status) {
  if (!status) return false;
  const normalized = normalizeText(status);
  return ['absent', 'ab', 'a', 'false'].includes(normalized);
}

function parseBsDate(bsDateString) {
  if (!bsDateString) return null;
  const parts = String(bsDateString).split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function getCurrentBSDate() {
  try {
    if (typeof bs.ADToBS === 'function') {
      const result = bs.ADToBS(new Date());
      const parsed = parseBsDate(result);
      if (parsed) return parsed;
    }
    if (typeof bs.toBS === 'function') {
      const result = bs.toBS(new Date());
      const parsed = parseBsDate(result);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.error('Error converting current date to BS:', err);
  }
  return { year: 2083, month: 2, day: 15 };
}


// ecdgrade controller
// controllers/ecdGradeCounterController.js


// Helper function to check if a value is Ab (sentinel 0.000001)
function isAb(value) {
    if (value === null || value === undefined) return false;
    const strValue = String(value).trim();
    if (strValue === '0.000001') return true;
    if (typeof value === 'number') {
        const epsilon = 0.0000001;
        if (Math.abs(value - 0.000001) < epsilon) return true;
    }
    if (typeof value === 'string') {
        const cleanValue = value.trim().toLowerCase();
        if (cleanValue === '0.000001' || cleanValue === 'ab' || cleanValue === 'absent') return true;
    }
    return false;
}

// Helper function to get numeric value
function getNumericValue(value) {
    if (isAb(value)) return 0;
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

// Helper function to round to 2 decimal places
function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

function getGPFromPercentage(percentage) {
    if (percentage >= 90) return 4.0;
    if (percentage >= 80) return 3.6;
    if (percentage >= 70) return 3.2;
    if (percentage >= 60) return 2.8;
    if (percentage >= 50) return 2.4;
    if (percentage >= 40) return 2.0;
    if (percentage >= 33) return 1.6;
    return 0;
}

// Helper function to get grade from GP
function getGradeFromGP(gp) {
    if (gp >= 3.61 && gp <= 4.0) return "A+";
    if (gp >= 3.21 && gp <= 3.60) return "A";
    if (gp >= 2.81 && gp <= 3.20) return "B+";
    if (gp >= 2.41 && gp <= 2.80) return "B";
    if (gp >= 2.01 && gp <= 2.40) return "C+";
    if (gp >= 1.61 && gp <= 2.00) return "C";
    if (gp === 1.6) return "D";
    return "NG";
}

// Helper function to get worksheet GP
function getWorksheetGP(grade) {
    if (!grade) return 0;
    if (isAb(grade)) return 0;
    const gradeMap = {
        'A+': 4.0,
        'A': 3.6,
        'B+': 3.2,
        'B': 2.8,
        'C+': 2.4,
        'C': 2.0,
        'D': 1.6,
        'NG': 0.0
    };
    return gradeMap[grade] || 0;
}

// Helper function to get subject model
const getSubjectModel = (subjectinput, studentClass, section, terminal) => {
    const modelName = `${subjectinput.replace(/\s+/g, '_')}_${studentClass}_${section}_${terminal}`;
    if (mongoose.models[modelName]) {
        return mongoose.models[modelName];
    }
    return mongoose.model(modelName, new mongoose.Schema({}, { strict: false }), modelName);
};

// Helper function to get all students for a class
const getStudentsForClass = async (studentClass, section, terminal) => {
    try {
   const examModel = await getSlipModel();
        const query = {
            studentClass: studentClass,
            terminal: terminal
        };
        if (section && section !== 'all') {
            query.section = section;
        }
        const students = await examModel.find(query).lean();
        return students;
    } catch (err) {
        console.error('Error getting students:', err);
        return [];
    }
};

// Helper function to get all subjects for a class
const getSubjectsForClass = async (studentClass, terminal) => {
    try {
        const subjects = (await newsubject.find({}).lean()).filter((item) =>
            String(item.forClass || '').trim().toLowerCase() === String(studentClass || '').trim().toLowerCase()
        );
        return subjects.map((item) => ({ ...item, subject: item.newsubject }));
    } catch (err) {
        console.error('Error getting subjects:', err);
        return [];
    }
};

// Helper function to get subject data with question keys
const getSubjectData = async (subjectName, studentClass, terminal) => {
    try {
        const subjectData = await newsubject.findOne({
            subject: subjectName,
            forClass: studentClass,
            
        }).lean();
        return subjectData;
    } catch (err) {
        console.error('Error getting subject data:', err);
        return null;
    }
};

// Helper function to get credit hours
const getCreditHours = async (subjectName) => {
    try {
        const creditData = await newsubject.findOne({
            newsubject: subjectName
        }).lean();
        if (creditData) {
            return {
                total: (creditData.theoryCreditHour || 0) + (creditData.practicalCreditHour || 0),
                practical: creditData.practicalCreditHour || 0
            };
        }
        return { total: 0, practical: 0 };
    } catch (err) {
        console.error('Error getting credit hours:', err);
        return { total: 0, practical: 0 };
    }
};

// Main function to calculate subject GP
function calculateSubjectGP(studentMarks, subjectData, calcMode) {
    // Get question key values
    const keyValues = {};
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    
    if (subjectData && subjectData.chapter && Array.isArray(subjectData.chapter)) {
        subjectData.chapter.forEach(chap => {
            if (chap.questions && Array.isArray(chap.questions)) {
                chap.questions.forEach(q => {
                    // Add question to keyValues
                });
            }
        });
    }

    // Extract question marks
    for (const key in subjectData) {
        if (/^q\d+[a-z]$/.test(key)) {
            const hasSubparts = subjectData[`${key}_has_subparts`] === "on" || subjectData[`${key}_has_subparts`] === true;
            const subpartsCount = parseInt(subjectData[`${key}_subparts_count`] || 0);
            const marksPerSubpart = parseFloat(subjectData[`${key}_marks_per_subpart`] || 0);
            const marks = parseFloat(subjectData[key] || 0);

            if (hasSubparts && subpartsCount > 0 && !isNaN(marksPerSubpart) && marksPerSubpart > 0) {
                for (let i = 0; i < subpartsCount; i++) {
                    const subKey = `${key}_${roman[i]}`;
                    keyValues[subKey] = marksPerSubpart;
                }
            } else if (!hasSubparts && !isNaN(marks) && marks > 0) {
                keyValues[key] = marks;
            }
        }
    }

    let totalTheoryMarks = 0;
    let totalTheoryPossible = 0;
    let hasAbInTheory = false;

    // Calculate theory marks
    for (const key in keyValues) {
        const fullMarks = keyValues[key];
        if (isNaN(fullMarks) || fullMarks <= 0) continue;

        const obtainedMarks = studentMarks[key] !== undefined ? studentMarks[key] : 0;
        const isAbValue = isAb(obtainedMarks);
        
        if (isAbValue) {
            hasAbInTheory = true;
        }
        totalTheoryMarks += isAbValue ? 0 : parseFloat(obtainedMarks) || 0;
        totalTheoryPossible += fullMarks;
    }

    // Calculate theory percentage
    const theoryPercentage = totalTheoryPossible > 0 ? (totalTheoryMarks / totalTheoryPossible) * 100 : 0;
    let theoryGP = 0;

    // Convert percentage to GP
    if (theoryPercentage >= 90) theoryGP = 4.0;
    else if (theoryPercentage >= 80) theoryGP = 3.6;
    else if (theoryPercentage >= 70) theoryGP = 3.2;
    else if (theoryPercentage >= 60) theoryGP = 2.8;
    else if (theoryPercentage >= 50) theoryGP = 2.4;
    else if (theoryPercentage >= 40) theoryGP = 2.0;
    else if (theoryPercentage >= 33) theoryGP = 1.6;
    else theoryGP = 0.0;

    // If theory has Ab, return 0
    if (hasAbInTheory) {
        return { theoryGP: 0, practicalGP: 0, finalGP: 0, hasAb: true };
    }

    // If mode is 'theoryonly', return theory GP only
    if (calcMode === 'theoryonly') {
        return { theoryGP, practicalGP: 0, finalGP: theoryGP, hasAb: false };
    }

    // Calculate practical/worksheet GP
    let practicalGP = 0;
    let hasAbInWorksheet = false;
    
    if (studentMarks.worksheetGrades && studentMarks.worksheetGrades.length > 0) {
        let totalWorksheetGP = 0;
        let validWorksheets = 0;
        studentMarks.worksheetGrades.forEach(grade => {
            if (isAb(grade)) {
                hasAbInWorksheet = true;
                return;
            }
            const gp = getWorksheetGP(grade);
            if (gp > 0 || grade === 'NG' || grade === 'D') {
                totalWorksheetGP += gp;
                validWorksheets++;
            }
        });
        if (validWorksheets > 0) {
            practicalGP = totalWorksheetGP / validWorksheets;
        }
    }

    // If worksheet has Ab, practical GP should be 0
    if (hasAbInWorksheet) {
        practicalGP = 0;
    }

    // Calculate combined GP (average of theory and practical)
    // Formula: (theoryGP + practicalGP) / 2
    const finalGP = (theoryGP + practicalGP) / 2;

    return { 
        theoryGP, 
        practicalGP, 
        finalGP: roundToTwo(finalGP), 
        hasAb: hasAbInTheory || hasAbInWorksheet 
    };
}

// Main controller for ECD grade counter
exports.getECDGradeCounter = async (req, res) => {
    try {
        const { terminal, academicYear, studentClass, section, calcMode, viewMode } = req.query;
        
        // Get all class data for dropdown
        const studentClassdata = await studentClassModel.find({}).lean();

        const Exammodel = getSlipModel();
        const allExamMarks = await Exammodel.find({}).lean();
        const terminals = [...new Set(allExamMarks.map((item) => item.terminal).filter(Boolean))].sort();

        // Get unique years from marksheet setups
        const years = [...new Set(allExamMarks.map((item) => item.academicYear).filter(Boolean))].sort((a, b) => b - a);

        // Get all unique subjects for ECD
        const subjectList = [...new Set(allExamMarks
            .filter((item) => ['NURSERY', 'LKG', 'UKG'].includes(String(item.studentClass || '').toUpperCase()))
            .map((item) => item.subject)
            .filter(Boolean))].sort();

        // Get credit hours for all subjects
        const creditHoursData = await newsubject.find({}).lean();
        const creditHourMap = {};
        creditHoursData.forEach(ch => {
            creditHourMap[`${ch.newsubject}_${ch.forClass}`] = {
                total: (ch.theoryCreditHour || 0) + (ch.practicalCreditHour || 0),
                practical: ch.practicalCreditHour || 0
            };
        });

        // Initialize grade data structure
        const gradeData = {};
        const grades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'NG', 'Ab'];

        // If no filters are applied, show selection page
        if (!terminal || !academicYear || !studentClass) {
            return res.render("./exam/ecdgradecounter", {
                gradeData: {},
                grades: grades,
                terminals: terminals,
                years: years,
                subjectList: subjectList,
                selectedTerminal: terminal || '',
                selectedYear: academicYear || '',
                selectedClass: studentClass || '',
                selectedSection: section || 'all',
                calcMode: calcMode || 'combined',
                viewMode: viewMode || 'sectionwise',
                studentClassdata: studentClassdata,
                currentPage: 'ecdgradecounter'
            });
        }

        // Process the data based on filters
        const sectionsToProcess = [];
        if (section && section !== 'all') {
            sectionsToProcess.push(section);
        } else {
            // Get all sections for this class
            const allStudents = await getStudentsForClass(studentClass, null, terminal);
            const uniqueSections = [...new Set(allStudents.map(s => s.section).filter(Boolean))];
            sectionsToProcess.push(...uniqueSections);
        }

        // Initialize grade data
        if (!gradeData[studentClass]) {
            gradeData[studentClass] = {};
        }

        // Subjects that should NOT have worksheets
        const NO_WORKSHEET_SUBJECTS = ['ORAL', 'HYGIENE', 'ECA', 'HYGINE'];
        if (studentClass && studentClass.toUpperCase() === 'LKG') {
            NO_WORKSHEET_SUBJECTS.push('THEME');
        }

        // Process each section
        for (const sec of sectionsToProcess) {
            if (!gradeData[studentClass][sec]) {
                gradeData[studentClass][sec] = {};
            }

            // Get students for this section
            const students = allExamMarks.filter((mark) =>
                mark.studentClass === studentClass && mark.section === sec && mark.terminal === terminal && mark.academicYear === academicYear
            );
            if (!students || students.length === 0) continue;

            // Get subjects for this class
            const subjects = await getSubjectsForClass(studentClass, terminal);
            if (!subjects || subjects.length === 0) continue;

            // Process each subject
            for (const subjectItem of subjects) {
                const subjectName = subjectItem.subject;
                const isNoWorksheet = NO_WORKSHEET_SUBJECTS.includes(subjectName.toUpperCase());

                // Initialize subject data
                if (!gradeData[studentClass][sec][subjectName]) {
                    gradeData[studentClass][sec][subjectName] = {
                        grades: {},
                        total: 0,
                        abCount: 0
                    };
                    grades.forEach(g => gradeData[studentClass][sec][subjectName].grades[g] = 0);
                }

                // Get subject data
                // Process each student
                for (const student of students) {
                    try {
                        if (String(student.subject || '').trim() !== subjectName) continue;
                        const subjectConfig = creditHoursData.find((config) =>
                            String(config.newsubject || '').trim() === subjectName &&
                            String(config.forClass || '').trim().toLowerCase() === String(studentClass || '').trim().toLowerCase()
                        );
                        const gradeResult = calculateEcdGrade(student, subjectConfig, isNoWorksheet || calcMode === 'theoryonly' ? 'theoryonly' : calcMode);
                        const grade = gradeResult.grade;

                        // Increment grade count
                        if (gradeData[studentClass][sec][subjectName].grades[grade] !== undefined) {
                            gradeData[studentClass][sec][subjectName].grades[grade]++;
                        }
                        gradeData[studentClass][sec][subjectName].total++;

                        if (grade === 'Ab') {
                            gradeData[studentClass][sec][subjectName].abCount++;
                        }

                    } catch (err) {
                        console.error(`Error processing student ${student.roll} for ${subjectName}:`, err);
                        continue;
                    }
                }
            }
        }

        // Calculate aggregate GPA if aggregate view
        if (viewMode === 'aggregate') {
            // Calculate overall aggregate for all sections
            const aggregateData = {
                grades: {},
                total: 0,
                abCount: 0,
                gpaSum: 0,
                studentCount: 0
            };
            grades.forEach(g => aggregateData.grades[g] = 0);

            for (const sec in gradeData[studentClass]) {
                for (const subject in gradeData[studentClass][sec]) {
                    const subjectData = gradeData[studentClass][sec][subject];
                    for (const grade in subjectData.grades) {
                        aggregateData.grades[grade] = (aggregateData.grades[grade] || 0) + subjectData.grades[grade];
                    }
                    aggregateData.total += subjectData.total;
                    aggregateData.abCount += subjectData.abCount || 0;
                }
            }

            // Store aggregate data
            gradeData[studentClass]['aggregate'] = aggregateData;
        }

        res.render("./exam/ecdgradecounter", {
            gradeData: gradeData,
            grades: grades,
            terminals: terminals,
            years: years,
            subjectList: subjectList,
            selectedTerminal: terminal || '',
            selectedYear: academicYear || '',
            selectedClass: studentClass || '',
            selectedSection: section || 'all',
            calcMode: calcMode || 'combined',
            viewMode: viewMode || 'sectionwise',
            studentClassdata: studentClassdata,
            currentPage: 'ecdgradecounter',
            creditHourMap: creditHourMap
        });

    } catch (err) {
        console.error("Error in getECDGradeCounter:", err);
        res.status(500).render('404', {
            errorMessage: 'Error loading ECD grade counter: ' + err.message,
            currentPage: 'teacher'
        });
    }
};

// Export to Excel function
exports.exportECDGradeCounterExcel = async (req, res) => {
    try {
        const { terminal, academicYear, studentClass, section, calcMode } = req.query;
        const Exammodel = getSlipModel();
        const allExamMarks = await Exammodel.find({}).lean();
        
        // Get all class data for dropdown
        const studentClassdata = await studentClassModel.find({}).lean();

        // Get all terminals
        const terminals = [...new Set(allExamMarks.map((item) => item.terminal).filter(Boolean))].sort();

        // Get unique years from marksheet setups
        const years = [...new Set(allExamMarks.map((item) => item.academicYear).filter(Boolean))].sort((a, b) => b - a);

        // Get all unique subjects for ECD
        const subjectList = [...new Set(allExamMarks
            .filter((item) => ['NURSERY', 'LKG', 'UKG'].includes(String(item.studentClass || '').toUpperCase()))
            .map((item) => item.subject)
            .filter(Boolean))].sort();

        // Get credit hours for all subjects
        const creditHoursData = await newsubject.find({}).lean();
        const creditHourMap = {};
        creditHoursData.forEach(ch => {
            creditHourMap[ch.newsubject] = {
                total: (ch.theoryCreditHour || 0) + (ch.practicalCreditHour || 0),
                practical: ch.practicalCreditHour || 0
            };
        });

        // Initialize grade data structure
        const gradeData = {};
        const grades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'NG', 'Ab'];

        // Process the data based on filters
        const sectionsToProcess = [];
        if (section && section !== 'all') {
            sectionsToProcess.push(section);
        } else {
            // Get all sections for this class
            const allStudents = allExamMarks.filter((mark) => mark.studentClass === studentClass && mark.terminal === terminal && mark.academicYear === academicYear);
            const uniqueSections = [...new Set(allStudents.map(s => s.section).filter(Boolean))];
            sectionsToProcess.push(...uniqueSections);
        }

        // Initialize grade data
        if (!gradeData[studentClass]) {
            gradeData[studentClass] = {};
        }

        // Subjects that should NOT have worksheets
        const NO_WORKSHEET_SUBJECTS = ['ORAL', 'HYGIENE', 'ECA', 'HYGINE'];
        if (studentClass && studentClass.toUpperCase() === 'LKG') {
            NO_WORKSHEET_SUBJECTS.push('THEME');
        }

        // Process each section
        for (const sec of sectionsToProcess) {
            if (!gradeData[studentClass][sec]) {
                gradeData[studentClass][sec] = {};
            }

            // Get students for this section
            const students = allExamMarks.filter((mark) =>
                mark.studentClass === studentClass && mark.section === sec && mark.terminal === terminal && mark.academicYear === academicYear
            );
            if (!students || students.length === 0) continue;

            // Get subjects for this class
            const subjects = await getSubjectsForClass(studentClass, terminal);
            if (!subjects || subjects.length === 0) continue;

            // Process each subject
            for (const subjectItem of subjects) {
                const subjectName = subjectItem.subject;
                const isNoWorksheet = NO_WORKSHEET_SUBJECTS.includes(subjectName.toUpperCase());

                // Initialize subject data
                if (!gradeData[studentClass][sec][subjectName]) {
                    gradeData[studentClass][sec][subjectName] = {
                        grades: {},
                        total: 0,
                        abCount: 0
                    };
                    grades.forEach(g => gradeData[studentClass][sec][subjectName].grades[g] = 0);
                }

                // Process each student
                for (const student of students) {
                    try {
                        if (String(student.subject || '').trim() !== subjectName) continue;
                        const subjectConfig = creditHoursData.find((config) =>
                            String(config.newsubject || '').trim() === subjectName &&
                            String(config.forClass || '').trim().toLowerCase() === String(studentClass || '').trim().toLowerCase()
                        );
                        const grade = calculateEcdGrade(
                            student,
                            subjectConfig,
                            isNoWorksheet || calcMode === 'theoryonly' ? 'theoryonly' : calcMode
                        );

                        // Increment grade count
                        if (gradeData[studentClass][sec][subjectName].grades[grade.grade] !== undefined) {
                            gradeData[studentClass][sec][subjectName].grades[grade.grade]++;
                        }
                        gradeData[studentClass][sec][subjectName].total++;

                        if (grade.grade === 'Ab') {
                            gradeData[studentClass][sec][subjectName].abCount++;
                        }

                    } catch (err) {
                        console.error(`Error processing student ${student.roll} for ${subjectName}:`, err);
                        continue;
                    }
                }
            }
        }

        // Generate Excel data
        const excelData = [];
        
        // Header row
        const headerRow = ['Class', 'Section', 'Subject', 'Total Students', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'NG', 'Ab'];
        excelData.push(headerRow);

        // Data rows
        for (const cls in gradeData) {
            for (const sec in gradeData[cls]) {
                for (const subject in gradeData[cls][sec]) {
                    const subjectData = gradeData[cls][sec][subject];
                    const row = [
                        cls,
                        sec,
                        subject,
                        subjectData.total,
                        subjectData.grades['A+'] || 0,
                        subjectData.grades['A'] || 0,
                        subjectData.grades['B+'] || 0,
                        subjectData.grades['B'] || 0,
                        subjectData.grades['C+'] || 0,
                        subjectData.grades['C'] || 0,
                        subjectData.grades['D'] || 0,
                        subjectData.grades['NG'] || 0,
                        subjectData.abCount || 0
                    ];
                    excelData.push(row);
                }
            }
        }

        // Create CSV content
        let csvContent = excelData.map(row => row.join(',')).join('\n');

        // Add BOM for UTF-8
        const BOM = '\uFEFF';
        csvContent = BOM + csvContent;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=ecd_grade_counter_${studentClass}_${terminal}_${academicYear}.csv`);
        res.send(csvContent);

    } catch (err) {
        console.error("Error in exportECDGradeCounterExcel:", err);
        res.status(500).json({ error: 'Error exporting data: ' + err.message });
    }
};

function calculateEcdGrade(studentMarks, subjectConfig, calcMode) {
    const theoryMarks = studentMarks.theorymarks;
    const worksheetGrades = studentMarks.worksheetGrades || [];

    const isTheoryAbsent = isAb(theoryMarks);
    const theoryGP = isTheoryAbsent ? 0 : getNumericValue(theoryMarks);
    const noWorksheet = calcMode === 'theoryonly' || worksheetGrades.length === 0;

    if (noWorksheet) {
        return { grade: getGradeFromGP(theoryGP), finalGP: theoryGP };
    }

    let totalWorksheetGP = 0;
    worksheetGrades.forEach((grade) => {
        totalWorksheetGP += getWorksheetGP(grade);
    });

    const finalGP = roundToTwo(
        (theoryGP + totalWorksheetGP) / (worksheetGrades.length + 1)
    );

    return { grade: getGradeFromGP(finalGP), finalGP };
}