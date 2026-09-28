const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ParentPortalAccount = require('../../model/parentPortalAccount');
const { studentrecordschema } = require('../../model/adminschema');
const { examSchema } = require('../../model/examschema');
const { onlineAttendanceSchema } = require('../../model/onlineattendanceschema');
const { newsschema } = require('../../model/newsschema');
const StudentRecord = mongoose.models.studentRecord || mongoose.model('studentRecord', studentrecordschema, 'studentrecord');
const ExamMarks = mongoose.models.exam_marks || mongoose.model('exam_marks', examSchema, 'exam_marks');
const OnlineAttendance = mongoose.models.onlineAttendance || mongoose.model('onlineAttendance', onlineAttendanceSchema, 'onlineAttendance');
const News = mongoose.models.news || mongoose.model('news', newsschema, 'news');
const Event = require('../../model/eventmodel');
const Portfolio = require('../../model/portfolio');
const BillingStudent = require('../../model/billingschema/Student');
const Invoice = require('../../model/billingschema/Invoice');
const LibraryMember = require('../../model/library/memberSchema');
const BookIssue = require('../../model/library/bookIssueSchema');

const parentSecret = () => process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET || 'aas_amedtech_solutions_789';

const formatInitials = (name) => {
	const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return 'P';
	return `${parts[0][0]}${parts.length > 1 ? ` ${parts[parts.length - 1][0]}` : ''}`.toUpperCase();
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
		const token = req.cookies?.parentPortalToken;
		if (!token) return res.redirect('/parents/login');

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
		const student = await StudentRecord.findOne({ reg: studentReg }).lean();
		if (!student) {
			res.clearCookie('parentPortalToken');
			return res.status(404).render('parentsportal/parentslogin', { error: 'The linked student record could not be found. Contact the school office.' });
		}

		const [examResults, attendanceDocs, portfolio, events, notices, libraryMember, billingStudent] = await Promise.all([
			ExamMarks.find({ reg: studentReg }).sort({ academicYear: -1, terminal: -1 }).limit(30).lean(),
			OnlineAttendance.find({ reg: studentReg, studentClass: student.studentClass, section: student.section }).lean(),
			Portfolio.findOne({ reg: studentReg }).lean(),
			Event.find({ forClass: student.studentClass, status: { $nin: ['cancelled'] } }).sort({ date: -1 }).limit(8).lean(),
			News.find({}).sort({ date: -1 }).limit(8).lean(),
			LibraryMember.findOne({ studentReg, memberType: 'student' }).lean(),
			BillingStudent.findOne({ studentCode: studentReg }).lean()
		]);

		const libraryLoans = libraryMember
			? await BookIssue.find({ memberId: libraryMember._id }).sort({ issuedAt: -1 }).limit(8).lean()
			: [];
		const invoices = billingStudent
			? await Invoice.find({ student: billingStudent._id, isCancelled: false }).sort({ billDateAD: -1 }).limit(8).lean()
			: [];

		const attendance = attendanceDocs.flatMap((doc) => Array.isArray(doc.attendance) ? doc.attendance : [])
			.slice(-20)
			.reverse();
		const nameParts = String(student.name || '').trim().split(/\s+/).filter(Boolean);
		const parentName = req.parentAccount.displayName || student.fatherName || student.motherName || 'Parent';

		return res.render('parentsportal/parentspage', {
			student,
			parentName,
			parentInitials: formatInitials(parentName),
			examResults,
			attendance,
			portfolio: portfolio || {},
			events,
			notices,
			libraryLoans,
			invoices,
			homework: [],
			studentFirstName: nameParts[0] || 'Student',
			complaintSent: req.query.sent === 'true'
		});
	} catch (error) {
		console.error('Error loading parent dashboard:', error);
		return res.status(500).send('Unable to load the parent portal.');
	}
};

exports.logout = (req, res) => {
	res.clearCookie('parentPortalToken');
	return res.redirect('/parents/login');
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
		const [students, accounts] = await Promise.all([
			StudentRecord.find({}).sort({ studentClass: 1, section: 1, roll: 1 }).limit(1500).lean(),
			ParentPortalAccount.find({}).select('username displayName studentReg active').lean()
		]);
		const accountByReg = new Map(accounts.map((account) => [String(account.studentReg), account]));
		const rows = students.map((student) => ({
			...student,
			parentAccount: accountByReg.get(String(student.reg)) || null
		}));
		return res.render('parentsportal/parentaccounts', { rows, saved: req.query.saved === 'true', error: '' });
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
		const student = await StudentRecord.findOne({ reg: studentReg }).select('reg').lean();
		if (!student) return res.status(404).send('Student registration not found.');

		const existing = await ParentPortalAccount.findOne({ studentReg });
		if (!existing && password.length < 8) {
			return res.status(400).send('New parent account passwords must be at least 8 characters.');
		}
		if (password && password.length < 8) {
			return res.status(400).send('Passwords must be at least 8 characters.');
		}

		const conflictingUsername = await ParentPortalAccount.findOne({ username, studentReg: { $ne: studentReg } }).select('_id').lean();
		if (conflictingUsername) return res.status(409).send('That username is already assigned to another parent account.');

		const update = { username, studentReg, active, displayName: String(req.body.displayName || '').trim() };
		if (password) update.passwordHash = await bcrypt.hash(password, 12);
		if (existing && !active) update.tokenVersion = existing.tokenVersion + 1;
		if (existing && password) update.tokenVersion = existing.tokenVersion + 1;

		await ParentPortalAccount.findOneAndUpdate(
			{ studentReg },
			{ $set: update },
			{ upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
		);
		return res.redirect('/parents/admin/accounts?saved=true');
	} catch (error) {
		console.error('Error saving parent account:', error);
		if (error.code === 11000) return res.status(409).send('Username or student registration is already linked to another parent account.');
		return res.status(500).send('Unable to save parent account.');
	}
};
