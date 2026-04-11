const Cirriculum = require('../model/cirriculumSchema');
const mongoose = require('mongoose');
const bs = require('bikram-sambat-js');

const Event = require('../model/eventmodel');




const { classSchema, subjectSchema, terminalSchema,newsubjectSchema} = require("../model/adminschema");
const { marksheetsetupschemaForAdmin } = require("../model/marksheetschema");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const {AnnualLessonPlan,UnitPlan,DailyPlan} = require('../model/lessonplanSchema');
const { themeSchemaFor1, scienceSchema } = require('../model/themeschema');
const { holidaySchema } = require("../model/holidayschema");
const holiday = mongoose.models.holiday || mongoose.model("holiday", holidaySchema, "holiday");

const HOLIDAY_MONTH_ALIASES = {
  Ashar: 'Ashadh',
  Ashadh: 'Ashadh',
  Ashoj: 'Ashwin',
  Ashwin: 'Ashwin'
};

const BS_MONTH_NUMBERS = {
  Baisakh: 1,
  Jestha: 2,
  Ashar: 3,
  Ashadh: 3,
  Shrawan: 4,
  Bhadra: 5,
  Ashoj: 6,
  Ashwin: 6,
  Kartik: 7,
  Mangsir: 8,
  Poush: 9,
  Magh: 10,
  Falgun: 11,
  Chaitra: 12
};

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const getCurrentAcademicYear = () => {
  const convertedDate = bs.ADToBS(new Date());
  return normalizeString(convertedDate).split('-')[0] || '';
};

const getHolidayKey = (monthName, day) => {
  const normalizedMonth = HOLIDAY_MONTH_ALIASES[normalizeString(monthName)] || normalizeString(monthName);
  const normalizedDay = Number.parseInt(normalizeString(day), 10);

  if (!normalizedMonth || !Number.isFinite(normalizedDay)) {
    return '';
  }

  return `${normalizedMonth}-${normalizedDay}`;
};

const buildHolidaySet = (holidayDocuments) => {
  const keys = new Set();

  (Array.isArray(holidayDocuments) ? holidayDocuments : []).forEach((document) => {
    (Array.isArray(document && document.month) ? document.month : []).forEach((monthEntry) => {
      (Array.isArray(monthEntry && monthEntry.holidayDays) ? monthEntry.holidayDays : []).forEach((day) => {
        const key = getHolidayKey(monthEntry && monthEntry.monthName, day);
        if (key) {
          keys.add(key);
        }
      });
    });
  });

  return keys;
};

const getLocalDateString = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getLessonDateString = (lesson) => {
  const englishDate = normalizeString(lesson && lesson.date);
  if (englishDate) {
    return englishDate;
  }

  const nepaliDate = normalizeString(lesson && lesson.nepaliDate);
  if (!nepaliDate) {
    return '';
  }

  return normalizeString(bs.BSToAD(nepaliDate));
};

const parseNepaliDateParts = (lesson) => {
  const nepaliDate = normalizeString(lesson && lesson.nepaliDate);
  if (!nepaliDate) {
    const englishDate = normalizeString(lesson && lesson.date);
    if (!englishDate) {
      return null;
    }

    const convertedDate = bs.ADToBS(englishDate);
    const parts = normalizeString(convertedDate).split('-').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
      return null;
    }

    return { year: parts[0], month: parts[1], day: parts[2] };
  }

  const parts = nepaliDate.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return { year: parts[0], month: parts[1], day: parts[2] };
};

const isHolidayLesson = (lesson, holidaySet) => {
  const parts = parseNepaliDateParts(lesson);
  if (!parts) {
    return false;
  }

  const monthName = Object.entries(BS_MONTH_NUMBERS).find(([, monthNumber]) => monthNumber === parts.month);
  if (!monthName) {
    return false;
  }

  return holidaySet.has(getHolidayKey(monthName[0], parts.day));
};

const isValidDailyLesson = (lesson) => {
  if (!normalizeString(lesson && lesson.date)) {
    return false;
  }

  const objective = Array.isArray(lesson && lesson.objective) ? lesson.objective : [];
  const hasObjective = objective.some((item) => normalizeString(item).length > 0);

  const hasActivity = ['engage', 'explore', 'explain', 'elaborate', 'evaluate']
    .some((field) => normalizeString(lesson && lesson[field]).length > 0);

  const hasAssessment = ['assessment', 'assignment']
    .some((field) => normalizeString(lesson && lesson[field]).length > 0);

  return hasObjective && hasActivity && hasAssessment;
};

const getThemeFormat = (studentClass) => {
  const collectionName = `themeFor${studentClass}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  return mongoose.model(collectionName, themeSchemaFor1, collectionName);
};

const getProjectThemeFormat = (studentClass) => {
  const collectionName = `ProjectRubriksFor${studentClass}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  return mongoose.model(collectionName, themeSchemaFor1, collectionName);
};

const SciencePracticals = mongoose.models.sciencepractical || mongoose.model('sciencepractical', scienceSchema, 'sciencepracticals');
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
      
    };
  } catch (error) {
    console.error('Error fetching sidenav data:', error);
    return {
      subjects: [],
      studentClassdata: [],
     
    };
  }
};

exports.principaldashboard = async (req, res) => {
  try {
    const sidenavData = await getSidenavData(req);
    const yearlyPlansEntry = await AnnualLessonPlan.aggregate([
      {
        $group: {
          _id: {
            teacherName: "$teacherName",
            class: "$forClass",
            subject: "$subject"
          },
          monthsEntered: { $addToSet: "$units.month" }
        }
      },
      {
        $project: {
          teacherName: "$_id.teacherName",
          class: "$_id.class",
          subject: "$_id.subject",
          monthsEntered: {
            $reduce: {
              input: "$monthsEntered",
              initialValue: [],
              in: { $setUnion: ["$$value", { $ifNull: ["$$this", []] }] }
            }
          },
          allMonths: [
            "Baisakh","Jestha","Ashad","Shrawan",
            "Bhadra","Ashwin","Kartik","Mangsir",
            "Poush","Magh","Falgun","Chaitra"
          ]
        }
      },
      {
        $project: {
          teacherName: 1,
          class: 1,
          subject: 1,
          monthsEntered: 1,
          missingMonths: {
            $setDifference: ["$allMonths", "$monthsEntered"]
          }
        }
      }
    ]);

 const unitDataTeacher = await UnitPlan.aggregate([

  // 1. Group by class + subject + teacher
  {
    $group: {
      _id: {
        teacherName: "$teacherName",
        subject: "$subject",
        class: "$forClass"
      },
      units: { $push: "$units" }
    }
  },

  // 2. Flatten units array
  {
    $project: {
      teacherName: "$_id.teacherName",
      subject: "$_id.subject",
      class: "$_id.class",
      units: {
        $reduce: {
          input: "$units",
          initialValue: [],
          in: { $concatArrays: ["$$value", "$$this"] }
        }
      }
    }
  },

  // 3. Filter VALID (completed) units
  {
    $addFields: {
      completedUnits: {
        $filter: {
          input: "$units",
          as: "u",
          cond: {
            $and: [

              // ✅ instructionalMethod valid
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ["$$u.instructionalMethod", []] },
                        as: "im",
                        cond: { $ne: ["$$im", ""] }
                      }
                    }
                  },
                  0
                ]
              },

              // ✅ evaluationProcess valid
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ["$$u.evaluationProcess", []] },
                        as: "ep",
                        cond: { $ne: ["$$ep", ""] }
                      }
                    }
                  },
                  0
                ]
              }

            ]
          }
        }
      }
    }
  },

  // 4. Extract completed unitIds
  {
    $addFields: {
      completedUnitIds: "$completedUnits.unitId"
    }
  },

  // 5. Lookup curriculum to get ALL units
  {
    $lookup: {
      from: "curriculum",
      localField: "class",
      foreignField: "forClass",
      as: "curriculum"
    }
  },

  // 6. Match correct subject
  {
    $addFields: {
      curriculum: {
        $filter: {
          input: "$curriculum",
          as: "c",
          cond: { $eq: ["$$c.subject", "$subject"] }
        }
      }
    }
  },

  {
    $unwind: "$curriculum"
  },

  // 7. Get all unitIds from curriculum
  {
    $addFields: {
      allUnitIds: "$curriculum.units._id"
    }
  },

  // 8. Find missing units
  {
    $addFields: {
      remainingUnitIds: {
        $setDifference: ["$allUnitIds", "$completedUnitIds"]
      }
    }
  },

  {
    $addFields: {
      remainingUnits: {
        $filter: {
          input: "$curriculum.units",
          as: "unit",
          cond: {
            $in: ["$$unit._id", "$remainingUnitIds"]
          }
        }
      }
    }
  },

  // 9. Final output
  {
    $project: {
      teacherName: 1,
      subject: 1,
      class: 1,

      totalUnits: { $size: "$allUnitIds" },
      completedCount: { $size: "$completedUnitIds" },
      remainingCount: { $size: "$remainingUnitIds" },

      remainingUnitIds: 1,
      remainingUnits: {
        $map: {
          input: "$remainingUnits",
          as: "unit",
          in: {
            unitId: "$$unit._id",
            unitName: "$$unit.unitName"
          }
        }
      }
    }
  }



]);
 


    const todayDateString = getLocalDateString(new Date());

    const currentAcademicYear = getCurrentAcademicYear();
    const [dailyPlanRecords, holidayRecords] = await Promise.all([
      DailyPlan.find({}).lean(),
      currentAcademicYear ? holiday.find({ academicYear: currentAcademicYear }).lean() : []
    ]);

    const holidaySet = buildHolidaySet(holidayRecords);
    const dailyPlanSummary = new Map();

    (Array.isArray(dailyPlanRecords) ? dailyPlanRecords : []).forEach((plan) => {
      const teacherName = normalizeString(plan && plan.teacherName) || 'Unknown';
      const className = normalizeString(plan && plan.forClass);
      const subject = normalizeString(plan && plan.subject);
      const groupKey = `${teacherName}__${className}__${subject}`;

      if (!dailyPlanSummary.has(groupKey)) {
        dailyPlanSummary.set(groupKey, {
          teacherName,
          class: className,
          subject,
          totalDaysTillNow: 0,
          completedDays: 0,
          missedDays: 0
        });
      }

      const summary = dailyPlanSummary.get(groupKey);

      (Array.isArray(plan && plan.units) ? plan.units : []).forEach((unit) => {
        (Array.isArray(unit && unit.dailyLessons) ? unit.dailyLessons : []).forEach((lesson) => {
          const lessonDateString = getLessonDateString(lesson);

          if (!lessonDateString || lessonDateString >= todayDateString) {
            return;
          }

          if (isHolidayLesson(lesson, holidaySet)) {
            return;
          }

          summary.totalDaysTillNow += 1;

          if (isValidDailyLesson(lesson)) {
            summary.completedDays += 1;
          } else {
            summary.missedDays += 1;
          }
        });
      });
    });

    const dailyPlanData = Array.from(dailyPlanSummary.values());

    console.log('Daily plan data for teachers:', JSON.stringify(dailyPlanData, null, 2));
      


    const events = await Event.find({});
    const sciencePracticals = await SciencePracticals.find({}).lean();

    const themeClasses = [4, 5, 6, 7, 8, 9, 10];
    const rubrikResults = await Promise.all(
      themeClasses.map(async (classValue) => {
        try {
          const themeModel = getThemeFormat(classValue);
          const projectModel = getProjectThemeFormat(classValue);
          const [themeDocs, projectDocs] = await Promise.all([
            themeModel.find({}).lean(),
            projectModel.find({}).lean()
          ]);

          return { classValue, themeDocs, projectDocs };
        } catch (error) {
          console.error(`Error loading rubriks for class ${classValue}:`, error);
          return { classValue, themeDocs: [], projectDocs: [] };
        }
      })
    );

    const themeRubriks = [];
    rubrikResults.forEach(({ classValue, themeDocs, projectDocs }) => {
      themeDocs.forEach((doc) => {
        themeRubriks.push({
          ...doc,
          rubrikSource: 'theme',
          rubrikSourceOrder: 0,
          studentClass: doc.studentClass || String(classValue)
        });
      });
      projectDocs.forEach((doc) => {
        themeRubriks.push({
          ...doc,
          rubrikSource: 'project',
          rubrikSourceOrder: 1,
          studentClass: doc.studentClass || String(classValue)
        });
      });
    });


    res.render('lessonplan/principaldashboard', {
      ...sidenavData,
      yearlyPlansEntry,
      unitDataTeacher,
      dailyPlanData,
      events,
      themeRubriks,
      sciencePracticals,
    });

}catch(error) {
  console.error('Error fetching yearly plans entry:', error);
}
}


