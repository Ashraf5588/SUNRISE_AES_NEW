const mongoose = require('mongoose');
const TotalAttendance = mongoose.models.attendanceTotal || require('../../model/totalattendanceSchema');
const { studentrecordschema, classSchema } = require('../../model/adminschema');
const { examSchema } = require('../../model/examschema');
const { marksheetsetupschemaForAdmin } = require('../../model/marksheetschema');
const { calculateAttendanceMarks } = require('../../utils/attendanceMarks');

const StudentRecord = mongoose.models.studentRecord || mongoose.model('studentRecord', studentrecordschema, 'studentrecord');
const ClassList = mongoose.models.studentClass || mongoose.model('studentClass', classSchema, 'classlist');
const ExamMarks = mongoose.models.exam_marks || mongoose.model('exam_marks', examSchema, 'exam_marks');
const MarksheetSetup = mongoose.models.marksheetSetup || mongoose.model('marksheetSetup', marksheetsetupschemaForAdmin, 'marksheetSetup');
const normalize = (value) => String(value || '').trim().toLowerCase();
const exactRegex = (value) => new RegExp(`^${String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

exports.TotalAttendanceEntryPage = async (req, res) => {
  try {
    const setups = await MarksheetSetup.find({}).sort({ academicYear: -1 }).lean();
    const academicYear = String(req.query.academicYear || setups[0]?.academicYear || '').trim();
    const currentSetup = setups.find((setup) => String(setup.academicYear) === academicYear) || setups[0];
    const selectedClassSection = String(req.query.classSection || '').trim();
    const separatorIndex = selectedClassSection.indexOf('-');
    const studentClass = separatorIndex >= 0
      ? selectedClassSection.slice(0, separatorIndex).trim()
      : String(req.query.studentClass || '').trim();
    const section = separatorIndex >= 0
      ? selectedClassSection.slice(separatorIndex + 1).trim()
      : String(req.query.section || '').trim();
    const terminal = String(req.query.terminal || '').trim();
    const classSections = await ClassList.find({
      studentClass: { $exists: true, $nin: ['', null] },
      section: { $exists: true, $nin: ['', null] }
    })
      .select('studentClass section classorder')
      .sort({ classorder: 1, studentClass: 1, section: 1 })
      .lean();
    const terminalOptions = currentSetup?.terminals || [];
    const selectedTerminal = terminalOptions.find((item) => normalize(item.name) === normalize(terminal));
    const workingDays = Number(selectedTerminal?.workingDays) || 0;
    let students = [];

    if (studentClass && section && terminal && academicYear) {
      const [studentRecords, attendanceRecords] = await Promise.all([
        StudentRecord.find({ studentClass: exactRegex(studentClass), section: exactRegex(section) })
          .select('reg roll name gender studentClass section')
          .sort({ roll: 1 })
          .lean(),
        TotalAttendance.find({
          academicYear,
          terminal: terminal.toUpperCase(),
          studentClass,
          section: section.toUpperCase()
        }).lean()
      ]);
      const regs = studentRecords.map((student) => String(student.reg || '').trim()).filter(Boolean);
      const examRecords = regs.length ? await ExamMarks.find({
        academicYear,
        terminal: exactRegex(terminal),
        studentClass: exactRegex(studentClass),
        section: exactRegex(section),
        reg: { $in: regs }
      }).lean() : [];
      const attendanceByReg = new Map(attendanceRecords.map((record) => [String(record.reg), record]));
      const examRecordsByReg = new Map();
      examRecords.forEach((record) => {
        const reg = String(record.reg || '').trim();
        if (!examRecordsByReg.has(reg)) examRecordsByReg.set(reg, []);
        examRecordsByReg.get(reg).push(record);
      });

      students = studentRecords.filter((student) => String(student.reg || '').trim()).map((student) => {
        const reg = String(student.reg).trim();
        const attendanceRecord = attendanceByReg.get(reg);
        const subjectMarks = [...new Map((examRecordsByReg.get(reg) || []).map((record) => [normalize(record.subject), {
          subject: String(record.subject || '').trim(),
          marks: calculateAttendanceMarks({
            attendance: attendanceRecord?.presentDays ?? record.attendance,
            workingDays,
            subject: record.subject,
            theoryFullMarks: record.theoryfullmarks
          })
        }])).values()];
        return {
          ...student,
          reg,
          attendance: attendanceRecord?.presentDays ?? examRecordsByReg.get(reg)?.[0]?.attendance ?? '',
          attendanceMarks: attendanceRecord?.attendanceMarks ?? 0,
          subjectMarks
        };
      });
    }

    res.render('totalattendance/totalattendanceentrypage', {
      classSections,
      setups,
      academicYear,
      studentClass,
      section,
      terminal,
      terminalOptions,
      workingDays,
      students,
      message: req.query.saved ? 'Attendance saved.' : ''
    });
  }
  catch (error) {
    console.error('Unable to load total attendance entry page:', error);
    res.status(500).send('Unable to load total attendance entry page.');
  }
};

exports.saveTotalAttendance = async (req, res) => {
  try {
    const studentClass = String(req.body.studentClass || '').trim();
    const section = String(req.body.section || '').trim();
    const terminal = String(req.body.terminal || '').trim();
    const academicYear = String(req.body.academicYear || '').trim();
    const submittedAttendance = req.body.attendance || {};
    if (!studentClass || !section || !terminal || !academicYear || !submittedAttendance || typeof submittedAttendance !== 'object') {
      return res.status(400).send('Select a class, section, terminal, and academic year before saving.');
    }

    const setup = await MarksheetSetup.findOne({ academicYear }).lean();
    const terminalSetup = setup?.terminals?.find((item) => normalize(item.name) === normalize(terminal));
    const workingDays = Number(terminalSetup?.workingDays) || 0;
    if (!workingDays) return res.status(400).send('Working days are not configured for this terminal.');

    const studentRecords = await StudentRecord.find({
      studentClass: exactRegex(studentClass),
      section: exactRegex(section),
      reg: { $in: Object.keys(submittedAttendance) }
    }).select('reg roll name gender').lean();
    const validRegs = new Set(studentRecords.map((student) => String(student.reg || '').trim()));
    const attendanceOps = [];
    const examOps = [];

    for (const student of studentRecords) {
      const reg = String(student.reg || '').trim();
      if (!validRegs.has(reg) || !Object.prototype.hasOwnProperty.call(submittedAttendance, reg)) continue;
      const presentDays = Number(submittedAttendance[reg]);
      if (!Number.isInteger(presentDays) || presentDays < 0 || presentDays > workingDays) {
        return res.status(400).send(`Enter attendance between 0 and ${workingDays} days for each student.`);
      }

      attendanceOps.push({
        updateOne: {
          filter: { academicYear, terminal: terminal.toUpperCase(), studentClass, section: section.toUpperCase(), reg },
          update: { $set: {
            academicYear,
            terminal: terminal.toUpperCase(),
            studentClass,
            section: section.toUpperCase(),
            reg,
            name: String(student.name || '').trim(),
            gender: String(student.gender || ''),
            totalDays: workingDays,
            presentDays,
            absentDays: workingDays - presentDays,
            attendanceMarks: calculateAttendanceMarks({ attendance: presentDays, workingDays, subject: 'NEPALI', theoryFullMarks: 50 }),
            updatedBy: String(req.user?.teacherName || req.user?.username || '').trim()
          } },
          upsert: true
        }
      });

      const examRecords = await ExamMarks.find({
        reg,
        academicYear,
        terminal: exactRegex(terminal),
        studentClass: exactRegex(studentClass),
        section: exactRegex(section)
      }).lean();
      examRecords.forEach((record) => {
        const attendanceMarks = calculateAttendanceMarks({
          attendance: presentDays,
          workingDays,
          subject: record.subject,
          theoryFullMarks: record.theoryfullmarks
        });
        const totalPracticalMarks = (Number(record.practicalmarks) || 0)
          + attendanceMarks
          + (Number(record.terminalmarks) || 0)
          + (Number(record.participationMarks) || 0);
        examOps.push({
          updateOne: {
            filter: { _id: record._id },
            update: { $set: { attendance: presentDays, attendanceMarks, totalpracticalmarks: totalPracticalMarks } }
          }
        });
      });
    }

    if (attendanceOps.length) await TotalAttendance.bulkWrite(attendanceOps, { ordered: true });
    if (examOps.length) await ExamMarks.bulkWrite(examOps, { ordered: true });
    return res.redirect(`/total-attendanceentry?studentClass=${encodeURIComponent(studentClass)}&section=${encodeURIComponent(section)}&terminal=${encodeURIComponent(terminal)}&academicYear=${encodeURIComponent(academicYear)}&saved=1`);
  } catch (error) {
    console.error('Unable to save total attendance:', error);
    return res.status(500).send('Unable to save total attendance.');
  }
};