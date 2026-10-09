const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bs = require('bikram-sambat-js');
const ParentPortalAccount = require('../../model/parentPortalAccount');
const { teacherSchema } = require('../../model/admin');
const { studentrecordschema, newsubjectSchema } = require('../../model/adminschema');
const { examSchema } = require('../../model/examschema');
const { onlineAttendanceSchema } = require('../../model/onlineattendanceschema');
const { marksheetsetupschemaForAdmin, routineSchema } = require('../../model/masrksheetschema');
const { staffSchema } = require('../../model/staffschema');
const { holiday } = require('../../model/holidayschema');
const { getRecentNotices } = require('../noticecontroller/noticecontroller');
const StudentRecord = mongoose.models.studentRecord || mongoose.model('studentRecord', studentrecordschema, 'studentrecord');
const ExamMarks = mongoose.models.exam_marks || mongoose.model('exam_marks', examSchema, 'exam_marks');
const OnlineAttendance = mongoose.models.onlineAttendance || mongoose.model('onlineAttendance', onlineAttendanceSchema, 'onlineAttendance');
const MarksheetSetup = mongoose.models.marksheetSetup || mongoose.model('marksheetSetup', marksheetsetupschemaForAdmin, 'marksheetSetup');
const ExamRoutine = mongoose.models.routine || mongoose.model('routine', routineSchema, 'routine');
const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');
const Event = require('../../model/eventmodel');
const Portfolio = require('../../model/portfolio');
const BillingStudent = require('../../model/billingschema/Student');
const Invoice = require('../../model/billingschema/Invoice');
const LibraryMember = require('../../model/library/memberSchema');
const BookIssue = require('../../model/library/bookIssueSchema');
const HealthRecord = require('../../model/nurseschema');
const Homework = require('../../model/homeworkschema/homeworkschema');
const User = mongoose.models.userlist || mongoose.model('userlist', teacherSchema, 'users');
const Subject = mongoose.models.newsubject || mongoose.model('newsubject', newsubjectSchema, 'newsubject');

const parentSecret = () => process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET || 'aas_amedtech_solutions_789';

const formatInitials = (name) => {
	const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return 'P';
	return `${parts[0][0]}${parts.length > 1 ? ` ${parts[parts.length - 1][0]}` : ''}`.toUpperCase();
};

const BS_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const BS_MONTH_ALIASES = { ashar: 'asar', ashadh: 'asar', ashoj: 'ashwin', ashwin: 'ashwin' };
const canonicalBsMonth = value => {
	const key = String(value || '').trim().toLowerCase();
	return BS_MONTH_ALIASES[key] || key;
};
const getBsMonthNumber = value => BS_MONTHS.findIndex(month => canonicalBsMonth(month) === canonicalBsMonth(value)) + 1;
const getBsMonthLength = (year, month) => {
	const startDate = String(bs.BSToAD(`${year}-${String(month).padStart(2, '0')}-01`) || '').trim().slice(0, 10);
	const nextYear = month === 12 ? Number(year) + 1 : Number(year);
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextDate = String(bs.BSToAD(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`) || '').trim().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return 30;
	return Math.round((Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
};

const normalizeAttendanceMonth = (value, todayBs) => {
	const candidate = String(value || '').trim();
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)) return todayBs.slice(0, 7);
	const firstDayAd = String(bs.BSToAD(`${candidate}-01`) || '').trim().slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(firstDayAd) ? candidate : todayBs.slice(0, 7);
};

const buildAttendanceMonth = (attendanceDocs, attendanceMonth, todayBs, holidayDoc, academicYear) => {
	const [year, monthText] = attendanceMonth.split('-');
	const monthNumber = Number(monthText);
	const monthName = BS_MONTHS[monthNumber - 1];
	const matchingYearDocs = academicYear
		? attendanceDocs.filter(doc => String(doc.academicYear || '') === academicYear)
		: [];
	const sourceDocs = matchingYearDocs.length ? matchingYearDocs : attendanceDocs;
	const absencesByDay = new Map();
	sourceDocs.forEach(doc => {
		(Array.isArray(doc.attendance) ? doc.attendance : []).forEach(entry => {
			if (getBsMonthNumber(entry.month) !== monthNumber) return;
			const day = Number.parseInt(entry.day, 10);
			if (day > 0) absencesByDay.set(day, entry);
		});
	});
	const holidayMonth = (Array.isArray(holidayDoc?.month) ? holidayDoc.month : [])
		.find(item => canonicalBsMonth(item.monthName) === canonicalBsMonth(monthName));
	const holidays = new Set((holidayMonth?.holidayDays || []).map(Number));
	const todayKey = todayBs.slice(0, 7);
	const maxDay = attendanceMonth > todayKey
		? 0
		: attendanceMonth === todayKey
			? Number(todayBs.slice(8, 10))
			: getBsMonthLength(year, monthNumber);
	const rows = [];
	let presentCount = 0;
	let absentCount = 0;
	for (let day = 1; day <= maxDay; day += 1) {
		if (holidays.has(day)) {
			rows.push({ day, status: 'Holiday', reason: '' });
			continue;
		}
		const entry = absencesByDay.get(day);
		const statusValue = String(entry?.status || '').trim().toLowerCase();
		const isAbsent = ['absent', 'a', 'false'].includes(statusValue);
		if (isAbsent) absentCount += 1;
		else presentCount += 1;
		rows.push({ day, status: isAbsent ? 'Absent' : 'Present', reason: isAbsent ? String(entry?.reason || '').trim() : '' });
	}
	return { monthName, monthNumber, year, presentCount, absentCount, rows };
};

const normalizeBsDate = (value) => {
	const dateBs = String(value || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateBs)) return '';
	try {
		const dateAd = String(bs.BSToAD(dateBs) || '').trim().slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateAd)) return '';
		const roundTrip = String(bs.ADToBS(new Date(`${dateAd}T00:00:00Z`)) || '').trim().slice(0, 10);
		return roundTrip === dateBs ? dateBs : '';
	} catch (error) {
		return '';
	}
};

exports.loginPage = (req, res) => {
	res.render('parentsportal/parentslogin', { error: '' });
};

exports.login = async (req, res) => {
	try {
		const username = String(req.body.username || '').trim().toLowerCase();
		const password = String(req.body.password || '');
		const account = await ParentPortalAccount.findOne({ username, active: true });
		const passwordMatches = account && await bcrypt.compare(password, account.passwordHash);

		if (!passwordMatches) {
			return res.status(401).render('parentsportal/parentslogin', { error: 'Username or password is incorrect.' });
		}

		const token = jwt.sign({
			sub: String(account._id),
			type: 'parent',
			tokenVersion: account.tokenVersion
		}, parentSecret(), { expiresIn: '365d' });

		res.cookie('parentPortalToken', token, {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 7 * 24 * 60 * 60 * 1000
		});
		return res.redirect('/parents');
	} catch (error) {
		console.error('Parent portal login failed:', error);
		return res.status(500).render('parentsportal/parentslogin', { error: 'Unable to sign in right now.' });
	}
};

exports.requireParent = async (req, res, next) => {
	try {
		const sharedToken = req.cookies?.token;
		if (sharedToken) {
			try {
				const payload = jwt.verify(sharedToken, process.env.JWT_SECRET || 'aas_amedtech_solutions_789');
				const user = payload.id ? await User.findById(payload.id).lean() : null;
				if (user?.role === 'STUDENT' && user.active !== false
					&& (!user.tokenVersion || !payload.tokenVersion || user.tokenVersion === payload.tokenVersion)) {
					req.parentAccount = {
						studentReg: user.reg,
						displayName: user.displayName || '',
						username: user.username
					};
					return next();
				}
			} catch (error) {
				console.warn('Shared student session is invalid:', error.message);
			}
			res.clearCookie('token');
			return res.redirect('/admin/login');
		}

		const token = req.cookies?.parentPortalToken;
		if (!token) return res.redirect('/admin/login');

		const payload = jwt.verify(token, parentSecret());
		if (payload.type !== 'parent' || !payload.sub) return res.redirect('/parents/login');

		const account = await ParentPortalAccount.findOne({ _id: payload.sub, active: true }).lean();
		if (!account || account.tokenVersion !== payload.tokenVersion) {
			res.clearCookie('parentPortalToken');
			return res.redirect('/parents/login');
		}

		req.parentAccount = account;
		return next();
	} catch (error) {
		res.clearCookie('parentPortalToken');
		return res.redirect('/parents/login');
	}
};

exports.dashboard = async (req, res) => {
	try {
		const studentReg = String(req.parentAccount.studentReg || '').trim();
		const todayNepaliDate = String(bs.ADToBS(new Date()) || '').trim().slice(0, 10);
		const selectedHomeworkDate = normalizeBsDate(req.query.homeworkDate) || todayNepaliDate;
		const attendanceMonth = normalizeAttendanceMonth(req.query.attendanceMonth, todayNepaliDate);
		const student = await StudentRecord.findOne({ reg: studentReg }).lean();
		if (!student) {
			res.clearCookie('parentPortalToken');
			return res.status(404).render('parentsportal/parentslogin', { error: 'The linked student record could not be found. Contact the school office.' });
		}

		const [examResults, attendanceDocs, portfolio, events, notices, libraryMember, billingStudent, homeworkForDate, todayHomeworkCount, schoolSetup, holidayDocs, examRoutines, teacherUsers] = await Promise.all([
			ExamMarks.find({ reg: studentReg }).select('subject terminal academicYear totalWorksheet worksheetGrades').sort({ academicYear: -1, terminal: -1 }).limit(30).lean(),
			OnlineAttendance.find({ reg: studentReg, studentClass: student.studentClass, section: student.section }).lean(),
			Portfolio.findOne({ reg: studentReg }).select('parentMeetings').lean(),
			Event.find({ forClass: student.studentClass, status: { $nin: ['cancelled'] } }).sort({ date: -1 }).limit(8).lean(),
			getRecentNotices({ role: 'STUDENT' }, 12),
			LibraryMember.findOne({ studentReg, memberType: 'student' }).lean(),
			BillingStudent.findOne({ studentCode: studentReg }).lean(),
			String(student.studentClass || '').trim() && String(student.section || '').trim()
				? Homework.find({
					studentClass: student.studentClass,
					sections: student.section,
					homeworkGivenDate: { $lte: selectedHomeworkDate },
					dueDate: { $gte: selectedHomeworkDate }
				}).select('subject title estimatedMinutes givenBy homeworkGivenDate dueDate homeworkType').sort({ subject: 1, homeworkGivenDate: -1 }).lean()
				: Promise.resolve([]),
			selectedHomeworkDate === todayNepaliDate || !String(student.studentClass || '').trim() || !String(student.section || '').trim()
				? Promise.resolve(null)
				: Homework.countDocuments({
					studentClass: student.studentClass,
					sections: student.section,
					homeworkGivenDate: { $lte: todayNepaliDate },
					dueDate: { $gte: todayNepaliDate }
				}),
			MarksheetSetup.findOne().select('schoolName phone address academicYear').lean(),
			holiday.find({}).lean(),
			ExamRoutine.find({ studentClass: student.studentClass }).select('nepalidate subject terminal').sort({ nepalidate: 1 }).limit(50).lean(),
			String(student.studentClass || '').trim() && String(student.section || '').trim()
				? User.find({
					role: 'TEACHER',
					allowedSubjects: { $elemMatch: { studentClass: student.studentClass, section: student.section } }
				}).select('teacherName employeeCode username mobileNumber phone').lean()
				: Promise.resolve([])
		]);

		const libraryLoans = libraryMember
			? await BookIssue.find({ memberId: libraryMember._id }).sort({ issuedAt: -1 }).limit(8).lean()
			: [];
		const invoices = billingStudent
			? await Invoice.find({ student: billingStudent._id, isCancelled: false }).sort({ billDateAD: -1 }).limit(8).lean()
			: [];
		const teacherCodes = teacherUsers.map(user => String(user.employeeCode || '').trim()).filter(Boolean);
		const teacherNames = teacherUsers.map(user => String(user.teacherName || '').trim()).filter(Boolean);
		const staffFilters = [
			...(teacherCodes.length ? [{ employeeCode: { $in: teacherCodes } }] : []),
			...(teacherNames.length ? [{ staffName: { $in: teacherNames } }] : [])
		];
		const staffContacts = staffFilters.length
			? await Staff.find({ $or: staffFilters }).select('employeeCode staffName mobileNumber email').lean()
			: [];
		const contactByCode = new Map(staffContacts.map(contact => [String(contact.employeeCode || '').trim().toUpperCase(), contact]));
		const contactByName = new Map(staffContacts.map(contact => [String(contact.staffName || '').trim().toLowerCase(), contact]));
		const teacherContacts = teacherUsers.map(user => {
			const teacherName = String(user.teacherName || '').trim();
			const staffContact = contactByCode.get(String(user.employeeCode || '').trim().toUpperCase())
				|| contactByName.get(teacherName.toLowerCase());
			return {
				name: teacherName || staffContact?.staffName || user.username || 'Class teacher',
				phone: String(staffContact?.mobileNumber || user.mobileNumber || user.phone || '').trim(),
				email: String(staffContact?.email || '').trim()
			};
		}).filter((contact, index, contacts) => contacts.findIndex(item => item.name === contact.name) === index);
		const schoolSetupSafe = schoolSetup || {};
		const selectedHoliday = holidayDocs.find(item => String(item.academicYear || '') === String(schoolSetupSafe.academicYear || ''))
			|| holidayDocs[0]
			|| null;
		const attendanceMonthData = buildAttendanceMonth(
			attendanceDocs,
			attendanceMonth,
			todayNepaliDate,
			selectedHoliday,
			String(schoolSetupSafe.academicYear || '')
		);
		const attendanceMonthOptions = BS_MONTHS.map((name, index) => ({
			name,
			value: `${attendanceMonthData.year}-${String(index + 1).padStart(2, '0')}`
		}));

		const attendance = attendanceDocs.flatMap((doc) => Array.isArray(doc.attendance) ? doc.attendance : [])
			.slice(-20)
			.reverse();
		const nameParts = String(student.name || '').trim().split(/\s+/).filter(Boolean);
		const parentName = req.parentAccount.displayName || student.fatherName || student.motherName || 'Parent';

		return res.render('parentsportal/parentspage', {
			student,
			schoolName: schoolSetupSafe.schoolName || 'School',
			schoolPhone: schoolSetupSafe.phone || '',
			parentName,
			parentInitials: formatInitials(parentName),
			examResults,
			attendance,
			portfolio: portfolio || { parentMeetings: [] },
			events,
			notices,
			teacherContacts,
			examRoutines,
			attendanceMonth: attendanceMonthData,
			attendanceMonthOptions,
			libraryLoans,
			invoices,
			homework: homeworkForDate,
			homeworkDate: selectedHomeworkDate,
			todayHomeworkCount: todayHomeworkCount ?? homeworkForDate.length,
			studentFirstName: nameParts[0] || 'Student',
			complaintSent: req.query.sent === 'true'
		});
	} catch (error) {
		console.error('Error loading parent dashboard:', error);
		return res.status(500).send('Unable to load the parent portal.');
	}
};

exports.portfolioPage = async (req, res) => {
	try {
		const studentReg = String(req.parentAccount.studentReg || '').trim();
		if (!studentReg) return res.status(403).send('No student is linked to this account.');

		const [student, portfolio, attendanceDocs, healthVisits] = await Promise.all([
			StudentRecord.findOne({ reg: studentReg }).select('reg name studentClass section roll').lean(),
			Portfolio.findOne({ reg: studentReg }).select('complaints parentMeetings participations awards scholarships').lean(),
			OnlineAttendance.find({ reg: studentReg }).select('attendance').lean(),
			HealthRecord.find({ reg: studentReg }).select('createdAt nepaliDate diagnosis treatment remarks').sort({ createdAt: -1 }).lean()
		]);
		if (!student) return res.status(404).send('The linked student record could not be found.');

		const attendanceEntries = attendanceDocs.flatMap(doc => Array.isArray(doc.attendance) ? doc.attendance : []);
		const absentEntries = attendanceEntries.filter(entry => {
			const status = String(entry?.status || '').trim().toLowerCase();
			return status === 'absent' || status === 'a' || status === 'false';
		});
		const absentMonths = {};
		absentEntries.forEach(entry => {
			const month = String(entry.month || 'Unknown');
			absentMonths[month] = (absentMonths[month] || 0) + 1;
		});
		const absenceReasons = absentEntries.filter(entry => String(entry.reason || '').trim()).map(entry => ({
			date: [entry.academicYear, entry.month, entry.day].filter(Boolean).join(' ') || '-',
			reason: String(entry.reason).trim()
		}));
		const callLogs = attendanceEntries
			.filter(entry => entry && (entry.callReason || entry.parentResponse || entry.callLoggedAt))
			.map(entry => ({
				academicYear: String(entry.academicYear || ''),
				month: String(entry.month || ''),
				day: String(entry.day || ''),
				callReason: String(entry.callReason || ''),
				parentResponse: String(entry.parentResponse || ''),
				callBy: String(entry.callBy || ''),
				callLoggedAt: entry.callLoggedAt ? new Date(entry.callLoggedAt) : null
			}))
			.sort((first, second) => (second.callLoggedAt?.getTime() || 0) - (first.callLoggedAt?.getTime() || 0));

		return res.render('parentsportal/parentportfolio', {
			student,
			studentInitials: formatInitials(student.name),
			complaints: Array.isArray(portfolio?.complaints) ? portfolio.complaints : [],
			parentMeetings: Array.isArray(portfolio?.parentMeetings) ? portfolio.parentMeetings : [],
			absentSummary: { totalAbsent: absentEntries.length, monthCounts: absentMonths, reasons: absenceReasons },
			healthVisits,
			callLogs,
			participations: Array.isArray(portfolio?.participations) ? portfolio.participations : [],
			awards: Array.isArray(portfolio?.awards) ? portfolio.awards : [],
			scholarships: Array.isArray(portfolio?.scholarships) ? portfolio.scholarships : []
		});
	} catch (error) {
		console.error('Unable to load parent portfolio:', error);
		return res.status(500).send('Unable to load the student portfolio.');
	}
};

exports.internalMarksPage = async (req, res) => {
	try {
		const studentReg = String(req.parentAccount.studentReg || '').trim();
		if (!studentReg) return res.status(403).send('No student is linked to this account.');

		const [student, setup] = await Promise.all([
			StudentRecord.findOne({ reg: studentReg }).select('reg name studentClass section roll').lean(),
			MarksheetSetup.findOne().select('schoolName academicYear terminals').lean()
		]);
		if (!student) return res.status(404).send('The linked student record could not be found.');

		const studentClass = String(student.studentClass || '').trim();
		const section = String(student.section || '').trim();
		const classNumberByWord = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
		const classNumber = Number.parseInt(studentClass, 10) || classNumberByWord[studentClass.toLowerCase()] || 0;
		const academicYear = String(setup?.academicYear || '');
		const isPrimary = classNumber >= 1 && classNumber <= 5;
		let primaryRows = [];
		let middleSubjects = [];
		let unitOptions = [];
		let terminalOptions = [];
		let selectedUnit = String(req.query.unit || 'all');
		let selectedTerminal = String(req.query.terminal || 'all');

		if (isPrimary && academicYear) {
			const collectionName = `themeForStudent-${studentClass}-${academicYear}`;
			const identityClauses = [{ reg: studentReg }];
			if (student.roll !== undefined && student.roll !== null && String(student.roll).trim()) {
				identityClauses.push({ roll: String(student.roll), name: String(student.name || '') });
			}
			const records = await mongoose.connection.collection(collectionName)
				.find({ studentClass, section, $or: identityClauses }).toArray();

			const addPrimaryRow = record => {
				const marksBefore = Number(record.obtainedMarksBefore ?? record.totalMarksBeforeIntervention ?? 0);
				const marksAfter = Number(record.obtainedMarksAfter ?? record.totalMarksAfterIntervention ?? 0);
				const indicatorsBefore = Array.isArray(record.indicatorBefore) ? record.indicatorBefore.map(String) : [];
				const indicatorsAfter = Array.isArray(record.indicatorAfter) ? record.indicatorAfter.map(String) : [];
				const nestedIndicators = Array.isArray(record.indicators) ? record.indicators : [];
				const indicatorBefore = indicatorsBefore.length ? indicatorsBefore : nestedIndicators.map(item => item.indicatorName || item.name).filter(Boolean);
				const indicatorAfter = indicatorsAfter.length ? indicatorsAfter : nestedIndicators.map(item => item.indicatorName || item.name).filter(Boolean);
				const remark = [marksBefore, marksAfter].some(mark => mark > 0 && mark <= 2) ? 'Needs improvement' : 'On track';
				primaryRows.push({
					subject: String(record.subject || record.subjectName || '').trim(),
					unitName: String(record.themeName || record.unitName || '').trim(),
					learningOutcomeName: String(record.learningOutcomeName || record.name || '').trim(),
					indicatorBefore,
					indicatorAfter,
					marksBefore,
					marksAfter,
					remark,
					evaluationDateBefore: String(record.evalDateBefore || record.evaluationDateBefore || '').trim(),
					evaluationDateAfter: String(record.evalDateAfter || record.evaluationDateAfter || '').trim()
				});
			};

			records.forEach(record => {
				if (record.themeName || record.learningOutcomeName) {
					addPrimaryRow(record);
					return;
				}
				(Array.isArray(record.subjects) ? record.subjects : []).forEach(subjectRecord => {
					(Array.isArray(subjectRecord.themes) ? subjectRecord.themes : []).forEach(theme => {
						const outcomes = theme.learningOutcomes || theme.learningOutcome || [];
						outcomes.forEach(outcome => {
							const indicators = Array.isArray(outcome.indicators) ? outcome.indicators : [];
							const beforeTotal = Number(outcome.totalMarksBeforeIntervention ?? indicators.reduce((sum, item) => sum + Number(item.marksBeforeIntervention || 0), 0));
							const afterTotal = Number(outcome.totalMarksAfterIntervention ?? indicators.reduce((sum, item) => sum + Number(item.marksAfterIntervention || 0), 0));
							addPrimaryRow({
								subject: subjectRecord.name,
								themeName: theme.themeName,
								learningOutcomeName: outcome.name || outcome.learningOutcomeName,
								indicators,
								obtainedMarksBefore: beforeTotal,
								obtainedMarksAfter: afterTotal
							});
						});
					});
				});
			});
			unitOptions = [...new Set(primaryRows.map(row => row.unitName).filter(Boolean))].sort((first, second) => first.localeCompare(second));
			if (selectedUnit !== 'all' && !unitOptions.includes(selectedUnit)) selectedUnit = 'all';
			if (selectedUnit !== 'all') primaryRows = primaryRows.filter(row => row.unitName === selectedUnit);
		} else if (classNumber >= 6 && studentClass && section && academicYear) {
			const subjectRows = await Subject.find({ forClass: studentClass }).select('subject newsubject').lean();
			const subjectNames = [...new Set(subjectRows.map(row => String(row.newsubject || row.subject || '').trim()).filter(Boolean))];
			const subjectDocuments = await Promise.all(subjectNames.map(async subject => {
				const collectionName = `Practicalproject_${subject}_${studentClass}_${section}_${academicYear}`;
				const documents = await mongoose.connection.collection(collectionName)
					.find({ reg: studentReg, studentClass, section, subject }).toArray();
				return documents.map(document => {
					const units = (Array.isArray(document.unit) ? document.unit : []).map(unit => ({
						unitName: String(unit.unitName || '').trim(),
						activities: [
							...(Array.isArray(unit.practicals) ? unit.practicals.map(activity => ({
								name: activity.practicalName || 'Practical', type: 'Practical', marks: Number(activity.practicalMarks || 0),
								criteria: (activity.criteria || []).map(item => ({ name: item.practicalIndicator || '', area: item.practicalAdhar || '', marks: Number(item.practicalIndicatorMarks || 0) }))
							})) : []),
							...(Array.isArray(unit.projectWorks) ? unit.projectWorks.map(activity => ({
								name: activity.projectName || 'Project', type: 'Project', marks: Number(activity.projectMarks || 0),
								criteria: (activity.criteria || []).map(item => ({ name: item.projectIndicator || '', area: item.projectAdhar || '', marks: Number(item.projectIndicatorMarks || 0) }))
							})) : [])
						]
					}));
					const totalMarks = units.flatMap(unit => unit.activities).reduce((sum, activity) => sum + activity.marks, 0);
					return { subject, terminal: String(document.terminalName || 'Unspecified terminal'), totalMarks, units };
				});
			}));
			const bySubject = new Map();
			subjectDocuments.flat().forEach(record => {
				if (!bySubject.has(record.subject)) bySubject.set(record.subject, []);
				bySubject.get(record.subject).push(record);
			});
			middleSubjects = [...bySubject.entries()].map(([subject, recordsForSubject]) => ({ subject, terminals: recordsForSubject.sort((a, b) => a.terminal.localeCompare(b.terminal, undefined, { numeric: true })) }));
			terminalOptions = [...new Set(middleSubjects.flatMap(subject => subject.terminals.map(record => record.terminal)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
			if (selectedTerminal !== 'all' && !terminalOptions.includes(selectedTerminal)) selectedTerminal = 'all';
			if (selectedTerminal !== 'all') middleSubjects.forEach(subject => { subject.terminals = subject.terminals.filter(record => record.terminal === selectedTerminal); });
		}

		return res.render('parentsportal/parentinternalmarks', {
			student,
			studentInitials: formatInitials(student.name),
			schoolName: String(setup?.schoolName || 'School'),
			academicYear,
			isPrimary,
			primaryRows,
			unitOptions,
			selectedUnit,
			middleSubjects,
			terminalOptions,
			selectedTerminal
		});
	} catch (error) {
		console.error('Unable to load parent internal marks:', error);
		return res.status(500).send('Unable to load internal assessment marks.');
	}
};

exports.logout = (req, res) => {
	res.clearCookie('parentPortalToken');
	res.clearCookie('token');
	return res.redirect('/admin/login');
};

exports.submitComplaint = async (req, res) => {
	const parentComplaint = String(req.body.complaint || '').trim();
	if (!parentComplaint || parentComplaint.length > 2000) {
		return res.status(400).send('Please enter a message of no more than 2000 characters.');
	}

	try {
		const student = await StudentRecord.findOne({ reg: req.parentAccount.studentReg }).select('reg name studentClass section').lean();
		if (!student) return res.status(404).send('Linked student record not found.');

		await Portfolio.findOneAndUpdate(
			{ reg: student.reg },
			{
				$setOnInsert: { reg: student.reg, name: student.name, studentClass: student.studentClass, section: student.section },
				$push: { parentMeetings: { parentComplaint, by: 'Parent Portal', createdAt: new Date() } }
			},
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);
		return res.redirect('/parents?tab=complaints&sent=true');
	} catch (error) {
		console.error('Error submitting parent message:', error);
		return res.status(500).send('Unable to send your message right now.');
	}
};

exports.adminAccountsPage = async (req, res) => {
	try {
		const [students, userAccounts, legacyAccounts] = await Promise.all([
			StudentRecord.find({}).sort({ studentClass: 1, section: 1, roll: 1 }).limit(1500).lean(),
			User.find({ role: 'STUDENT' }).select('username displayName reg active').lean(),
			ParentPortalAccount.find({}).select('username displayName studentReg active').lean()
		]);
		const userByReg = new Map(userAccounts.map((account) => [String(account.reg), account]));
		const legacyByReg = new Map(legacyAccounts.map((account) => [String(account.studentReg), account]));
		const rows = students.map((student) => ({
			...student,
			parentAccount: userByReg.get(String(student.reg)) || legacyByReg.get(String(student.reg)) || null,
			isSharedAccount: userByReg.has(String(student.reg))
		}));
		return res.render('parentsportal/parentaccounts', { rows, saved: req.query.saved === 'true', error: String(req.query.error || '') });
	} catch (error) {
		console.error('Error loading parent accounts:', error);
		return res.status(500).send('Unable to load parent accounts.');
	}
};

exports.saveParentAccount = async (req, res) => {
	const studentReg = String(req.body.studentReg || '').trim();
	const username = String(req.body.username || '').trim().toLowerCase();
	const password = String(req.body.password || '');
	const active = req.body.active === 'on';

	try {
		if (!studentReg || username.length < 3) {
			return res.status(400).send('Student registration and a username of at least 3 characters are required.');
		}
		const student = await StudentRecord.findOne({ reg: studentReg }).select('reg name fatherName motherName').lean();
		if (!student) return res.status(404).send('Student registration not found.');

		const existing = await User.findOne({ role: 'STUDENT', reg: studentReg });
		if (!existing && password.length < 8) {
			return res.status(400).send('New student account passwords must be at least 8 characters.');
		}
		if (password && password.length < 8) {
			return res.status(400).send('Passwords must be at least 8 characters.');
		}

		const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const conflictingUsername = await User.findOne({
			username: { $regex: `^${escapedUsername}$`, $options: 'i' },
			...(existing ? { _id: { $ne: existing._id } } : {})
		}).select('_id').lean();
		if (conflictingUsername) return res.status(409).send('That username is already assigned to another account.');

		const update = {
			username,
			role: 'STUDENT',
			reg: studentReg,
			name: student.name || '',
			displayName: String(req.body.displayName || student.fatherName || student.motherName || '').trim(),
			active,
			allowedSubjects: []
		};
		if (password) update.password = await bcrypt.hash(password, 12);
		if (existing) {
			const accountChanged = password || username !== existing.username || active !== (existing.active !== false);
			update.tokenVersion = (existing.tokenVersion || 1) + (accountChanged ? 1 : 0);
		} else {
			update.tokenVersion = 1;
		}

		await User.findOneAndUpdate(
			{ role: 'STUDENT', reg: studentReg },
			{ $set: update },
			{ upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
		);
		return res.redirect('/parents/admin/accounts/create?saved=true');
	} catch (error) {
		console.error('Error saving parent account:', error);
		if (error.code === 11000) return res.status(409).send('Username or student registration is already linked to another account.');
		return res.status(500).send('Unable to save student account.');
	}
};
