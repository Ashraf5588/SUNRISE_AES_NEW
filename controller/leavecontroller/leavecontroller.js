const mongoose = require('mongoose');
const multer = require('multer');
const bs = require('bikram-sambat-js');
const { leaveSchema, leaveApplicationSchema } = require('../../model/leaveschema/leavetypeschma');
const { teacherSchema } = require('../../model/admin');

const LeaveType = mongoose.models.LeaveType || mongoose.model('LeaveType', leaveSchema, 'leaveTypes');
const LeaveApplication = mongoose.models.LeaveApplication || mongoose.model('LeaveApplication', leaveApplicationSchema, 'leaveApplications');
const User = mongoose.models.userlist || mongoose.model('userlist', teacherSchema, 'users');
const DAY_MS = 24 * 60 * 60 * 1000;
const uploadLeaveDocument = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (req, file, callback) => {
		const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
		callback(allowed.includes(file.mimetype) ? null : new Error('Attach a PDF, JPG, PNG, or DOCX file.'), allowed.includes(file.mimetype));
	}
});

const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const renderPage = (res, view, data = {}) => {
	const userIsAdmin = typeof data.isAdmin !== 'undefined' ? data.isAdmin : isAdmin(res.req?.user);
	return res.render(`leave/${view}`, {
		isAdmin: userIsAdmin,
		...data,
		currentPath: res.req.path
	});
};

const parseNepaliDate = (value) => {
	const normalized = String(value || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
	const adValue = String(bs.BSToAD(normalized) || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(adValue)) return null;
	const [year, month, day] = adValue.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return bs.ADToBS(date) === normalized ? date : null;
};

const getDateAllocations = (startDate, endDate) => {
	const months = new Map();
	const years = new Map();
	for (let timestamp = startDate.getTime(); timestamp <= endDate.getTime(); timestamp += DAY_MS) {
		const nepaliDate = String(bs.ADToBS(new Date(timestamp)) || '');
		const yearKey = nepaliDate.slice(0, 4);
		const monthKey = nepaliDate.slice(0, 7);
		months.set(monthKey, (months.get(monthKey) || 0) + 1);
		years.set(yearKey, (years.get(yearKey) || 0) + 1);
	}
	return { months, years };
};

const getRole = (user) => String(user?.role || '').trim().toUpperCase();
const appliesToUser = (leaveType, user) => {
	const applicableTo = (leaveType.applicableTo || ['ALL']).map((role) => String(role).toUpperCase());
	return applicableTo.includes('ALL') || applicableTo.includes(getRole(user));
};

exports.isAdmin = (req, res, next) => isAdmin(req.user)
	? next()
	: res.status(403).send('Only administrators can manage leave policies and approvals.');

const handleLeaveDocumentUpload = (req, res, next) => uploadLeaveDocument.single('supportingDocument')(req, res, (error) => {
	if (!error) return next();
	if (error instanceof multer.MulterError) return res.status(400).send('The supporting document must be 5 MB or smaller.');
	return res.status(400).send(error.message || 'The supporting document could not be uploaded.');
});

exports.setupPage = async (req, res) => {
	try {
		const leaveTypes = await LeaveType.find().sort({ leavename: 1 }).lean();
		renderPage(res, 'leavesetup', {
			leaveTypes,
			isAdmin: isAdmin(req.user),
			message: req.query.saved ? 'Leave policy saved.' : ''
		});
	} catch (error) {
		console.error('Unable to load leave setup:', error);
		res.status(500).send('Unable to load leave setup.');
	}
};

exports.createLeaveType = async (req, res) => {
	try {
		const leavename = String(req.body.leavename || '').trim();
		const maxDaysPerYear = req.body.maxDaysPerYear === '' ? null : Number(req.body.maxDaysPerYear);
		const maxDaysPerMonth = req.body.maxDaysPerMonth === '' ? null : Number(req.body.maxDaysPerMonth);
		const applicableTo = Array.isArray(req.body.applicableTo) ? req.body.applicableTo : [req.body.applicableTo].filter(Boolean);
		if (!leavename || leavename.length > 80 || (maxDaysPerYear !== null && (!Number.isInteger(maxDaysPerYear) || maxDaysPerYear < 1)) || (maxDaysPerMonth !== null && (!Number.isInteger(maxDaysPerMonth) || maxDaysPerMonth < 1)) || (maxDaysPerYear !== null && maxDaysPerMonth !== null && maxDaysPerMonth > maxDaysPerYear)) {
			return res.status(400).send('Enter a leave name and valid monthly/yearly limits.');
		}
		await LeaveType.create({
			leavename,
			description: String(req.body.description || '').trim(),
			maxDaysPerYear,
			maxDaysPerMonth,
			requiresDocument: req.body.requiresDocument === 'on',
			isPaid: req.body.isPaid === 'on',
			applicableTo: applicableTo.length ? applicableTo : ['ALL']
		});
		return res.redirect('/leave/setup?saved=1');
	} catch (error) {
		if (error.code === 11000) return res.status(409).send('A leave type with that name already exists.');
		console.error('Unable to create leave type:', error);
		return res.status(400).send('Unable to create leave type. Check the entered values.');
	}
};

exports.updateLeaveType = async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).send('Invalid leave type.');
	const leavename = String(req.body.leavename || '').trim();
	const maxDaysPerYear = req.body.maxDaysPerYear === '' ? null : Number(req.body.maxDaysPerYear);
	const maxDaysPerMonth = req.body.maxDaysPerMonth === '' ? null : Number(req.body.maxDaysPerMonth);
	const applicableTo = Array.isArray(req.body.applicableTo) ? req.body.applicableTo : [req.body.applicableTo].filter(Boolean);
	if (!leavename || leavename.length > 80 || (maxDaysPerYear !== null && (!Number.isInteger(maxDaysPerYear) || maxDaysPerYear < 1)) || (maxDaysPerMonth !== null && (!Number.isInteger(maxDaysPerMonth) || maxDaysPerMonth < 1)) || (maxDaysPerYear !== null && maxDaysPerMonth !== null && maxDaysPerMonth > maxDaysPerYear)) {
		return res.status(400).send('Enter a leave name and valid monthly/yearly limits.');
	}
	try {
		await LeaveType.findByIdAndUpdate(req.params.id, { $set: {
			leavename,
			description: String(req.body.description || '').trim(),
			maxDaysPerYear,
			maxDaysPerMonth,
			requiresDocument: req.body.requiresDocument === 'on',
			isPaid: req.body.isPaid === 'on',
			applicableTo: applicableTo.length ? applicableTo : ['ALL'],
			isActive: req.body.isActive === 'on'
		} }, { runValidators: true });
		return res.redirect('/leave/setup?saved=1');
	} catch (error) {
		if (error.code === 11000) return res.status(409).send('A leave type with that name already exists.');
		console.error('Unable to update leave type:', error);
		return res.status(400).send('Unable to update leave type.');
	}
};

exports.leavePage = async (req, res) => {
	try {
		const admin = isAdmin(req.user);
		const userFilter = admin ? {} : { requester: req.user._id };
		const [allLeaveTypes, applications, employees] = await Promise.all([
			LeaveType.find({ isActive: true }).sort({ leavename: 1 }).lean(),
			LeaveApplication.find(userFilter).sort({ createdAt: -1 }).limit(admin ? 200 : 100).lean(),
			admin ? User.find({}).select('teacherName username role').sort({ teacherName: 1, username: 1 }).lean() : Promise.resolve([])
		]);
		renderPage(res, 'leaveform', {
			leaveTypes: admin ? allLeaveTypes : allLeaveTypes.filter((type) => appliesToUser(type, req.user)),
			applications,
			employees: employees.map((employee) => ({
				id: String(employee._id),
				name: String(employee.teacherName || employee.username || '').trim(),
				username: String(employee.username || '').trim(),
				role: getRole(employee)
			})),
			isAdmin: admin,
			username: String(req.user.username || '').trim(),
			employeeName: String(req.user.teacherName || req.user.username || '').trim(),
			employeeRole: getRole(req.user),
			selectedEmployeeId: String(req.user._id),
			todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
			message: req.query.saved ? 'Leave application submitted.' : req.query.reviewed ? 'Leave decision saved.' : ''
		});
	} catch (error) {
		console.error('Unable to load leave applications:', error);
		res.status(500).send('Unable to load leave applications.');
	}
};

exports.leaveUsage = async (req, res) => {
	try {
		const admin = isAdmin(req.user);
		let applicant = req.user;
		if (admin) {
			const employeeId = String(req.query.employeeId || '').trim();
			if (!mongoose.isValidObjectId(employeeId)) return res.status(400).json({ message: 'Choose an employee.' });
			applicant = await User.findById(employeeId).select('teacherName username role').lean();
			if (!applicant) return res.status(404).json({ message: 'Employee not found.' });
		}

		const leaveTypeId = String(req.query.leaveType || '').trim();
		const leaveType = mongoose.isValidObjectId(leaveTypeId)
			? await LeaveType.findOne({ _id: leaveTypeId, isActive: true }).lean()
			: null;
		if (!leaveType || !appliesToUser(leaveType, applicant)) return res.status(400).json({ message: 'Choose a leave type available to this employee.' });

		const startDateNepali = String(req.query.startDateNepali || '').trim();
		const endDateNepali = String(req.query.endDateNepali || '').trim();
		const startDate = parseNepaliDate(startDateNepali);
		const endDate = parseNepaliDate(endDateNepali);
		if (!startDate || !endDate || endDate < startDate || (endDate.getTime() - startDate.getTime()) / DAY_MS + 1 > 366) {
			return res.status(400).json({ message: 'Choose valid Nepali dates.' });
		}

		const allocations = getDateAllocations(startDate, endDate);
		const activeStatuses = ['pending', 'approved'];
		const quotaRecords = await LeaveApplication.find({
			requester: applicant._id,
			leaveType: leaveType._id,
			status: { $in: activeStatuses },
			startDateNepali: { $lte: endDateNepali },
			endDateNepali: { $gte: startDateNepali }
		}).select('startDateNepali endDateNepali').lean();
		const usedMonths = new Map();
		const usedYears = new Map();
		quotaRecords.forEach((record) => {
			const previousStart = parseNepaliDate(record.startDateNepali);
			const previousEnd = parseNepaliDate(record.endDateNepali);
			if (!previousStart || !previousEnd) return;
			const previousAllocation = getDateAllocations(previousStart, previousEnd);
			previousAllocation.months.forEach((days, key) => usedMonths.set(key, (usedMonths.get(key) || 0) + days));
			previousAllocation.years.forEach((days, key) => usedYears.set(key, (usedYears.get(key) || 0) + days));
		});

		const monthly = [...allocations.months].map(([period, requestedDays]) => {
			const usedDays = usedMonths.get(period) || 0;
			const limit = Number(leaveType.maxDaysPerMonth) || null;
			return { period, requestedDays, usedDays, limit, remainingDays: limit ? Math.max(0, limit - usedDays) : null, exceeds: Boolean(limit && usedDays + requestedDays > limit) };
		});
		const yearly = [...allocations.years].map(([period, requestedDays]) => {
			const usedDays = usedYears.get(period) || 0;
			const limit = Number(leaveType.maxDaysPerYear) || null;
			return { period, requestedDays, usedDays, limit, remainingDays: limit ? Math.max(0, limit - usedDays) : null, exceeds: Boolean(limit && usedDays + requestedDays > limit) };
		});
		return res.json({ monthly, yearly, exceedsLimits: monthly.some((entry) => entry.exceeds) || yearly.some((entry) => entry.exceeds) });
	} catch (error) {
		console.error('Unable to calculate leave usage:', error);
		return res.status(500).json({ message: 'Unable to calculate leave availability.' });
	}
};

exports.submitLeaveApplication = [handleLeaveDocumentUpload, async (req, res) => {
	try {
		const admin = isAdmin(req.user);
		let applicant = req.user;
		if (admin) {
			const employeeId = String(req.body.employeeId || '').trim();
			if (!mongoose.isValidObjectId(employeeId)) return res.status(400).send('Choose an applicant.');
			applicant = await User.findById(employeeId).select('teacherName username role').lean();
			if (!applicant) return res.status(404).send('Selected applicant was not found.');
		}
		const leaveType = mongoose.isValidObjectId(req.body.leaveType)
			? await LeaveType.findOne({ _id: req.body.leaveType, isActive: true }).lean()
			: null;
		if (!leaveType || !appliesToUser(leaveType, applicant)) return res.status(400).send('Choose an active leave type available to the applicant.');

		const startDateNepali = String(req.body.startDateNepali || '').trim();
		const endDateNepali = String(req.body.endDateNepali || '').trim();
		const startDate = parseNepaliDate(startDateNepali);
		const endDate = parseNepaliDate(endDateNepali);
		const reason = String(req.body.reason || '').trim();
		if (!startDate || !endDate || endDate < startDate || !reason || reason.length > 1000) {
			return res.status(400).send('Choose valid Nepali dates and enter a reason. The end date must not precede the start date.');
		}
		if ((endDate.getTime() - startDate.getTime()) / DAY_MS + 1 > 366) return res.status(400).send('A single leave application cannot exceed 366 days.');
		if (leaveType.requiresDocument && !req.file) return res.status(400).send('A supporting document is required for this leave type.');

		const allocations = getDateAllocations(startDate, endDate);
		const requestedDays = [...allocations.years.values()].reduce((sum, days) => sum + days, 0);
		const activeStatuses = ['pending', 'approved'];
		const overlapping = await LeaveApplication.find({
			requester: applicant._id,
			status: { $in: activeStatuses },
			startDateNepali: { $lte: endDateNepali },
			endDateNepali: { $gte: startDateNepali }
		}).select('startDateNepali endDateNepali').lean();
		if (overlapping.length) return res.status(409).send('You already have a pending or approved leave request that overlaps these dates.');

		if (!admin && (leaveType.maxDaysPerYear || leaveType.maxDaysPerMonth)) {
			const quotaRecords = await LeaveApplication.find({
				requester: applicant._id,
				leaveType: leaveType._id,
				status: { $in: activeStatuses },
				startDateNepali: { $lte: endDateNepali },
				endDateNepali: { $gte: `${startDateNepali.slice(0, 4)}-01-01` }
			}).select('startDateNepali endDateNepali').lean();
			const usedMonths = new Map();
			const usedYears = new Map();
			quotaRecords.forEach((record) => {
				const previousStart = parseNepaliDate(record.startDateNepali);
				const previousEnd = parseNepaliDate(record.endDateNepali);
				if (!previousStart || !previousEnd) return;
				const previousAllocation = getDateAllocations(previousStart, previousEnd);
				previousAllocation.months.forEach((days, key) => usedMonths.set(key, (usedMonths.get(key) || 0) + days));
				previousAllocation.years.forEach((days, key) => usedYears.set(key, (usedYears.get(key) || 0) + days));
			});
			for (const [year, days] of allocations.years) {
				if (leaveType.maxDaysPerYear && (usedYears.get(year) || 0) + days > leaveType.maxDaysPerYear) {
					return res.status(409).send(`This request exceeds the ${leaveType.maxDaysPerYear}-day yearly limit for ${year}.`);
				}
			}
			for (const [month, days] of allocations.months) {
				if (leaveType.maxDaysPerMonth && (usedMonths.get(month) || 0) + days > leaveType.maxDaysPerMonth) {
					return res.status(409).send(`This request exceeds the ${leaveType.maxDaysPerMonth}-day monthly limit for ${month}.`);
				}
			}
		}

		await LeaveApplication.create({
			requester: applicant._id,
			username: String(applicant.username || '').trim(),
			employeeName: String(applicant.teacherName || applicant.username || '').trim(),
			employeeRole: getRole(applicant),
			status: admin ? 'approved' : 'pending',
			reviewedBy: admin ? String(req.user.username || req.user.teacherName || '').trim() : '',
			reviewedAt: admin ? new Date() : null,
			leaveType: leaveType._id,
			leaveTypeName: leaveType.leavename,
			isPaid: leaveType.isPaid,
			requiresDocument: leaveType.requiresDocument,
			startDateNepali,
			endDateNepali,
			requestedDays,
			reason,
			supportingDocument: req.file?.buffer,
			supportingDocumentName: req.file?.originalname || '',
			supportingDocumentMimeType: req.file?.mimetype || ''
		});
		return res.redirect('/leave?saved=1');
	} catch (error) {
		if (error instanceof multer.MulterError) return res.status(400).send('The supporting document must be 5 MB or smaller.');
		console.error('Unable to submit leave application:', error);
		return res.status(400).send('Unable to submit leave application. Check the form and try again.');
	}
}];

exports.reviewLeaveApplication = async (req, res) => {
	const status = String(req.body.status || '').trim().toLowerCase();
	const reviewReason = String(req.body.reviewReason || '').trim();
	if (!mongoose.isValidObjectId(req.params.id) || !['approved', 'rejected'].includes(status) || (status === 'rejected' && !reviewReason) || reviewReason.length > 1000) {
		return res.status(400).send('Choose approve or reject. A reason is required when rejecting.');
	}
	try {
		const application = await LeaveApplication.findById(req.params.id);
		if (!application) return res.status(404).send('Leave application not found.');
		if (application.status !== 'pending') return res.status(409).send('This leave application has already been reviewed.');
		const result = await LeaveApplication.updateOne(
			{ _id: application._id, status: 'pending' },
			{ $set: {
				status,
				reviewReason: status === 'rejected' ? reviewReason : '',
				reviewedBy: String(req.user.username || req.user.teacherName || '').trim(),
				reviewedAt: new Date()
			} }
		);
		if (!result.modifiedCount) return res.status(409).send('This leave application has already been reviewed.');
		return res.redirect('/leave?reviewed=1');
	} catch (error) {
		console.error('Unable to review leave application:', error);
		return res.status(400).send('Unable to save the leave decision.');
	}
};

exports.downloadSupportingDocument = async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Document not found.');
	try {
		const application = await LeaveApplication.findById(req.params.id).select('requester supportingDocument supportingDocumentName supportingDocumentMimeType').lean();
		if (!application?.supportingDocument) return res.status(404).send('Document not found.');
		if (!isAdmin(req.user) && String(application.requester) !== String(req.user._id)) return res.status(403).send('You cannot access this document.');
		res.type(application.supportingDocumentMimeType || 'application/octet-stream');
		res.setHeader('Content-Disposition', `inline; filename="${String(application.supportingDocumentName || 'leave-document').replace(/[\\"\r\n]/g, '_')}"`);
		return res.send(application.supportingDocument);
	} catch (error) {
		console.error('Unable to load leave document:', error);
		return res.status(500).send('Unable to load supporting document.');
	}
};
