const mongoose = require('mongoose');
const multer = require('multer');
const bs = require('bikram-sambat-js');
const { leaveSchema, leaveApplicationSchema } = require('../../model/leaveschema/leavetypeschma');
const { teacherSchema } = require('../../model/admin');
const { staffSchema } = require('../../model/staffschema');
const { Branch } = require('../../model/employeeSchema/employeeSetupSchema');
const EmployeeWeekend = require('../../model/employeeSchema/employeeWeekendSchema');
const { buildLeaveAllocations } = require('../../utils/leaveCalculations');

const LeaveType = mongoose.models.LeaveType || mongoose.model('LeaveType', leaveSchema, 'leaveTypes');
const LeaveApplication = mongoose.models.LeaveApplication || mongoose.model('LeaveApplication', leaveApplicationSchema, 'leaveApplications');
const User = mongoose.models.userlist || mongoose.model('userlist', teacherSchema, 'users');
const Staff = mongoose.models.staff || mongoose.model('staff', staffSchema, 'staff');
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

const parseAdDate = value => {
	const normalized = String(value || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
	const [year, month, day] = normalized.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.toISOString().slice(0, 10) === normalized ? date : null;
};

const getDateAllocations = async (startDate, endDate, { halfDay = false, sandwichLeave = true } = {}) => {
	const excludedDates = new Set();
	if (!sandwichLeave && !halfDay) {
		const dates = [];
		for (let timestamp = startDate.getTime(); timestamp <= endDate.getTime(); timestamp += DAY_MS) {
			const date = new Date(timestamp);
			const adKey = date.toISOString().slice(0, 10);
			if (date.getUTCDay() === 6) excludedDates.add(adKey);
			dates.push({ adKey, nepaliDate: String(bs.ADToBS(date) || '').slice(0, 10) });
		}
		const holidays = await EmployeeWeekend.find({ dateBs: { $in: dates.map(date => date.nepaliDate) } }).select('dateBs').lean();
		const holidayDates = new Set(holidays.map(holiday => holiday.dateBs));
		dates.filter(date => holidayDates.has(date.nepaliDate)).forEach(date => excludedDates.add(date.adKey));
	}
	return buildLeaveAllocations(startDate, endDate, { halfDay, excludedDates });
};

const totalAllocations = allocations => [...allocations.values()].reduce((sum, days) => sum + days, 0);
const toAllocationRecords = allocations => [...allocations].map(([period, days]) => ({ period, days }));

const addStoredUsage = async (records, usedMonths, usedYears) => {
	for (const record of records) {
		if (record.monthlyAllocations?.length || record.yearlyAllocations?.length) {
			(record.monthlyAllocations || []).forEach(({ period, days }) => usedMonths.set(period, (usedMonths.get(period) || 0) + days));
			(record.yearlyAllocations || []).forEach(({ period, days }) => usedYears.set(period, (usedYears.get(period) || 0) + days));
			continue;
		}
		const previousStart = parseNepaliDate(record.startDateNepali);
		const previousEnd = parseNepaliDate(record.endDateNepali);
		if (!previousStart || !previousEnd) continue;
		const allocations = await getDateAllocations(previousStart, previousEnd, {
			halfDay: record.leaveDay && record.leaveDay !== 'Full day',
			sandwichLeave: record.sandwichLeave !== false
		});
		allocations.months.forEach((days, key) => usedMonths.set(key, (usedMonths.get(key) || 0) + days));
		allocations.years.forEach((days, key) => usedYears.set(key, (usedYears.get(key) || 0) + days));
	}
};

const findStaffProfile = (user, profiles) => {
	const employeeCode = String(user?.employeeCode || '').trim().toUpperCase();
	return profiles.find(profile => employeeCode && String(profile.employeeCode || '').trim().toUpperCase() === employeeCode)
		|| profiles.find(profile => String(profile.staffName || '').trim().toLowerCase() === String(user?.teacherName || user?.username || '').trim().toLowerCase())
		|| {};
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
		const [allLeaveTypes, applicationRecords, users, profiles, branches, adminUsers, holidays] = await Promise.all([
			LeaveType.find({ isActive: true }).sort({ leavename: 1 }).lean(),
			LeaveApplication.find(userFilter).sort({ createdAt: -1 }).limit(admin ? 200 : 100).lean(),
			admin ? User.find({}).select('teacherName username role employeeCode department').sort({ teacherName: 1, username: 1 }).lean() : Promise.resolve([req.user]),
			Staff.find({}).select('employeeCode staffName companyName branchName designation department section employeePhoto').lean(),
			Branch.find({}).select('name').sort({ name: 1 }).lean(),
			User.find({ role: { $in: ['ADMIN', 'DEPARTMENT_ADMIN'] } }).select('teacherName username employeeCode department').lean(),
			EmployeeWeekend.find({}).select('dateBs').lean()
		]);
		const applications = applicationRecords.map(application => ({
			...application,
			startDateAd: application.startDateAd || parseNepaliDate(application.startDateNepali)?.toISOString().slice(0, 10) || '',
			endDateAd: application.endDateAd || parseNepaliDate(application.endDateNepali)?.toISOString().slice(0, 10) || ''
		}));
		const employees = users.map(user => {
			const profile = findStaffProfile(user, profiles);
			return {
				id: String(user._id),
				name: String(profile.staffName || user.teacherName || user.username || '').trim(),
				username: String(user.username || '').trim(),
				role: getRole(user),
				employeeCode: profile.employeeCode || user.employeeCode || '',
				companyName: profile.companyName || 'United English Boarding School',
				branchName: profile.branchName || '',
				designation: profile.designation || '',
				department: profile.department || user.department || '',
				section: profile.section || '',
				photoUrl: profile.employeePhoto?.url || ''
			};
		});
		const departmentAdmins = adminUsers.map(user => {
			const profile = findStaffProfile(user, profiles);
			return {
				name: String(profile.staffName || user.teacherName || user.username || '').trim(),
				department: String(profile.department || user.department || '').trim()
			};
		}).filter(adminUser => adminUser.name);
		const editingApplication = admin && mongoose.isValidObjectId(req.query.edit)
			? applications.find(application => String(application._id) === String(req.query.edit) && application.status === 'pending') || null
			: null;
		const selectedEmployeeId = editingApplication ? String(editingApplication.requester) : String(req.user._id);
		const currentEmployee = employees.find(employee => employee.id === selectedEmployeeId) || {};
		const branchNames = [...new Set([...branches.map(branch => branch.name), ...profiles.map(profile => profile.branchName)].filter(Boolean))].sort();
		const holidayDatesAd = holidays.map(holiday => parseNepaliDate(holiday.dateBs))
			.filter(Boolean).map(date => date.toISOString().slice(0, 10));
		renderPage(res, 'leaveform', {
			leaveTypes: admin ? allLeaveTypes : allLeaveTypes.filter((type) => appliesToUser(type, req.user)),
			applications,
			editingApplication,
			employees,
			branches: branchNames,
			departmentAdmins,
			holidayDatesAd,
			currentEmployee,
			isAdmin: admin,
			username: String(req.user.username || '').trim(),
			employeeName: currentEmployee.name || String(req.user.teacherName || req.user.username || '').trim(),
			employeeRole: getRole(req.user),
			selectedEmployeeId,
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
			applicant = await User.findById(employeeId).select('teacherName username role employeeCode department').lean();
			if (!applicant) return res.status(404).json({ message: 'Employee not found.' });
		}

		const leaveTypeId = String(req.query.leaveType || '').trim();
		const leaveType = mongoose.isValidObjectId(leaveTypeId)
			? await LeaveType.findOne({ _id: leaveTypeId, isActive: true }).lean()
			: null;
		if (!leaveType || !appliesToUser(leaveType, applicant)) return res.status(400).json({ message: 'Choose a leave type available to this employee.' });

		const startValue = String(req.query.startDateAd || req.query.startDateNepali || '').trim();
		const endValue = String(req.query.endDateAd || req.query.endDateNepali || '').trim();
		const startDate = req.query.startDateAd ? parseAdDate(startValue) : startValue ? parseNepaliDate(startValue) : null;
		const endDate = req.query.endDateAd ? parseAdDate(endValue) : endValue ? parseNepaliDate(endValue) : null;
		const hasRequestedDates = Boolean(startValue || endValue);
		if (hasRequestedDates && (!startDate || !endDate || endDate < startDate || (endDate.getTime() - startDate.getTime()) / DAY_MS + 1 > 366)) {
			return res.status(400).json({ message: 'Choose valid dates.' });
		}
		const halfDay = ['Early leave', 'Late leave'].includes(String(req.query.leaveDay || ''));
		if (halfDay && startDate && endDate && startDate.getTime() !== endDate.getTime()) {
			return res.status(400).json({ message: 'Early or late leave must use the same date.' });
		}
		const allocations = startDate && endDate
			? await getDateAllocations(startDate, endDate, { halfDay, sandwichLeave: req.query.sandwichLeave !== 'false' })
			: { months: new Map(), years: new Map() };
		const activeStatuses = ['pending', 'approved'];
		const quotaRecords = await LeaveApplication.find({
			requester: applicant._id,
			leaveType: leaveType._id,
			status: { $in: activeStatuses }
		}).select('startDateNepali endDateNepali leaveDay sandwichLeave monthlyAllocations yearlyAllocations').lean();
		const usedMonths = new Map();
		const usedYears = new Map();
		await addStoredUsage(quotaRecords, usedMonths, usedYears);

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
		const currentPeriod = String(bs.ADToBS(new Date()) || '').slice(0, 7);
		const summary = {
			month: {
				period: currentPeriod,
				usedDays: usedMonths.get(currentPeriod) || 0,
				limit: Number(leaveType.maxDaysPerMonth) || null
			},
			year: {
				period: currentPeriod.slice(0, 4),
				usedDays: usedYears.get(currentPeriod.slice(0, 4)) || 0,
				limit: Number(leaveType.maxDaysPerYear) || null
			}
		};
		Object.values(summary).forEach(balance => {
			balance.remainingDays = balance.limit === null ? null : Math.max(0, balance.limit - balance.usedDays);
		});
		return res.json({ summary, monthly, yearly, exceedsLimits: monthly.some((entry) => entry.exceeds) || yearly.some((entry) => entry.exceeds) });
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
			applicant = await User.findById(employeeId).select('teacherName username role employeeCode department').lean();
			if (!applicant) return res.status(404).send('Selected applicant was not found.');
		}
		const leaveType = mongoose.isValidObjectId(req.body.leaveType)
			? await LeaveType.findOne({ _id: req.body.leaveType, isActive: true }).lean()
			: null;
		if (!leaveType || !appliesToUser(leaveType, applicant)) return res.status(400).send('Choose an active leave type available to the applicant.');

		const startDateAd = String(req.body.startDateAd || '').trim();
		const endDateAd = String(req.body.endDateAd || '').trim();
		const startDate = parseAdDate(startDateAd);
		const endDate = parseAdDate(endDateAd);
		const startDateNepali = startDate ? String(bs.ADToBS(startDate) || '').trim() : '';
		const endDateNepali = endDate ? String(bs.ADToBS(endDate) || '').trim() : '';
		const leaveDay = String(req.body.leaveDay || 'Full day').trim();
		const halfDay = ['Early leave', 'Late leave'].includes(leaveDay);
		const sandwichLeave = req.body.sandwichLeave === 'on';
		const reason = String(req.body.reason || '').trim();
		if (!startDate || !endDate || endDate < startDate || !['Full day', 'Early leave', 'Late leave'].includes(leaveDay) || !reason || reason.length > 1000) {
			return res.status(400).send('Choose valid dates and leave type, and enter a reason. The end date must not precede the start date.');
		}
		if (halfDay && startDate.getTime() !== endDate.getTime()) return res.status(400).send('Early or late leave must use the same From and To date.');
		if ((endDate.getTime() - startDate.getTime()) / DAY_MS + 1 > 366) return res.status(400).send('A single leave application cannot exceed 366 days.');
		if (leaveType.requiresDocument && !req.file) return res.status(400).send('A supporting document is required for this leave type.');

		const allocations = await getDateAllocations(startDate, endDate, { halfDay, sandwichLeave });
		const requestedDays = totalAllocations(allocations.years);
		if (!requestedDays) return res.status(400).send('The selected dates contain no chargeable leave days.');
		const profiles = await Staff.find({}).select('employeeCode staffName companyName branchName designation department section employeePhoto').lean();
		const profile = findStaffProfile(applicant, profiles);
		const department = String(profile.department || applicant.department || '').trim();
		const departmentAdminNames = new Set((await User.find({ role: { $in: ['ADMIN', 'DEPARTMENT_ADMIN'] } }).select('teacherName username employeeCode department').lean())
			.filter(user => String(user.department || findStaffProfile(user, profiles).department || '').trim().toLowerCase() === department.toLowerCase())
			.map(user => String(findStaffProfile(user, profiles).staffName || user.teacherName || user.username || '').trim()));
		const approverName = String(req.body.approverName || '').trim();
		const recommendedBy = String(req.body.recommendedBy || '').trim();
		if ((approverName && !departmentAdminNames.has(approverName)) || (recommendedBy && !departmentAdminNames.has(recommendedBy))) {
			return res.status(400).send('Choose approver and recommender names from the applicant department administrators.');
		}
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
			}).select('startDateNepali endDateNepali leaveDay sandwichLeave monthlyAllocations yearlyAllocations').lean();
			const usedMonths = new Map();
			const usedYears = new Map();
			await addStoredUsage(quotaRecords, usedMonths, usedYears);
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
			employeeName: String(profile.staffName || applicant.teacherName || applicant.username || '').trim(),
			employeeRole: getRole(applicant),
			companyName: profile.companyName || 'United English Boarding School',
			branchName: profile.branchName || '',
			employeeCode: profile.employeeCode || applicant.employeeCode || '',
			designation: profile.designation || '',
			department,
			section: profile.section || '',
			status: admin ? 'approved' : 'pending',
			reviewedBy: admin ? String(req.user.username || req.user.teacherName || '').trim() : '',
			reviewedAt: admin ? new Date() : null,
			leaveType: leaveType._id,
			leaveTypeName: leaveType.leavename,
			isPaid: leaveType.isPaid,
			requiresDocument: leaveType.requiresDocument,
			startDateNepali,
			endDateNepali,
			startDateAd: startDateAd,
			endDateAd: endDateAd,
			leaveDay,
			sandwichLeave,
			requestedDays,
			monthlyAllocations: toAllocationRecords(allocations.months),
			yearlyAllocations: toAllocationRecords(allocations.years),
			reason,
			approverName,
			recommendedBy,
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

exports.editLeaveApplication = async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Leave application not found.');
	const application = await LeaveApplication.findById(req.params.id).select('status').lean();
	if (!application || application.status !== 'pending') return res.status(404).send('Pending leave application not found.');
	req.query.edit = String(req.params.id);
	return exports.leavePage(req, res);
};

exports.updateLeaveApplication = [handleLeaveDocumentUpload, async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Leave application not found.');
	try {
		const application = await LeaveApplication.findById(req.params.id);
		if (!application || application.status !== 'pending') return res.status(404).send('Pending leave application not found.');
		const employeeId = String(req.body.employeeId || '').trim();
		const applicant = mongoose.isValidObjectId(employeeId)
			? await User.findById(employeeId).select('teacherName username role employeeCode department').lean()
			: null;
		if (!applicant) return res.status(400).send('Choose a valid employee.');
		const leaveType = mongoose.isValidObjectId(req.body.leaveType)
			? await LeaveType.findOne({ _id: req.body.leaveType, isActive: true }).lean()
			: null;
		if (!leaveType || !appliesToUser(leaveType, applicant)) return res.status(400).send('Choose an active leave type available to the employee.');
		const startDateAd = String(req.body.startDateAd || '').trim();
		const endDateAd = String(req.body.endDateAd || '').trim();
		const startDate = parseAdDate(startDateAd);
		const endDate = parseAdDate(endDateAd);
		const leaveDay = String(req.body.leaveDay || 'Full day').trim();
		const halfDay = ['Early leave', 'Late leave'].includes(leaveDay);
		const sandwichLeave = req.body.sandwichLeave === 'on';
		const reason = String(req.body.reason || '').trim();
		if (!startDate || !endDate || endDate < startDate || !['Full day', 'Early leave', 'Late leave'].includes(leaveDay)
			|| !reason || reason.length > 1000 || (halfDay && startDate.getTime() !== endDate.getTime())
			|| (endDate.getTime() - startDate.getTime()) / DAY_MS + 1 > 366) {
			return res.status(400).send('Enter valid dates, leave day, and description. Early or late leave must use one date.');
		}
		if (leaveType.requiresDocument && !req.file && !application.supportingDocument) return res.status(400).send('A supporting document is required for this leave type.');
		const startDateNepali = String(bs.ADToBS(startDate) || '').trim();
		const endDateNepali = String(bs.ADToBS(endDate) || '').trim();
		const overlapping = await LeaveApplication.findOne({
			_id: { $ne: application._id }, requester: applicant._id, status: { $in: ['pending', 'approved'] },
			startDateNepali: { $lte: endDateNepali }, endDateNepali: { $gte: startDateNepali }
		}).select('_id').lean();
		if (overlapping) return res.status(409).send('This employee already has a pending or approved leave request that overlaps these dates.');
		const allocations = await getDateAllocations(startDate, endDate, { halfDay, sandwichLeave });
		const requestedDays = totalAllocations(allocations.years);
		if (!requestedDays) return res.status(400).send('The selected dates contain no chargeable leave days.');
		const profiles = await Staff.find({}).select('employeeCode staffName companyName branchName designation department section').lean();
		const profile = findStaffProfile(applicant, profiles);
		const department = String(profile.department || applicant.department || '').trim();
		const departmentAdmins = await User.find({ role: { $in: ['ADMIN', 'DEPARTMENT_ADMIN'] } }).select('teacherName username employeeCode department').lean();
		const departmentAdminNames = new Set(departmentAdmins.filter(user => String(user.department || findStaffProfile(user, profiles).department || '').trim().toLowerCase() === department.toLowerCase())
			.map(user => String(findStaffProfile(user, profiles).staffName || user.teacherName || user.username || '').trim()));
		const approverName = String(req.body.approverName || '').trim();
		const recommendedBy = String(req.body.recommendedBy || '').trim();
		if ((approverName && !departmentAdminNames.has(approverName)) || (recommendedBy && !departmentAdminNames.has(recommendedBy))) {
			return res.status(400).send('Choose approver and recommender names from the applicant department administrators.');
		}
		const update = {
			requester: applicant._id,
			username: String(applicant.username || '').trim(),
			employeeName: String(profile.staffName || applicant.teacherName || applicant.username || '').trim(),
			employeeRole: getRole(applicant),
			companyName: profile.companyName || 'United English Boarding School',
			branchName: profile.branchName || '',
			employeeCode: profile.employeeCode || applicant.employeeCode || '',
			designation: profile.designation || '',
			department,
			section: profile.section || '',
			leaveType: leaveType._id,
			leaveTypeName: leaveType.leavename,
			isPaid: leaveType.isPaid,
			requiresDocument: leaveType.requiresDocument,
			startDateNepali,
			endDateNepali,
			startDateAd,
			endDateAd,
			leaveDay,
			sandwichLeave,
			requestedDays,
			monthlyAllocations: toAllocationRecords(allocations.months),
			yearlyAllocations: toAllocationRecords(allocations.years),
			reason,
			approverName,
			recommendedBy
		};
		if (req.file) {
			update.supportingDocument = req.file.buffer;
			update.supportingDocumentName = req.file.originalname;
			update.supportingDocumentMimeType = req.file.mimetype;
		}
		await LeaveApplication.updateOne({ _id: application._id, status: 'pending' }, { $set: update }, { runValidators: true });
		return res.redirect('/leave?saved=1');
	} catch (error) {
		if (error instanceof multer.MulterError) return res.status(400).send('The supporting document must be 5 MB or smaller.');
		console.error('Unable to update leave application:', error);
		return res.status(400).send('Unable to update leave application. Check the form and try again.');
	}
}];

exports.transferLeaveApplication = async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.body.employeeId)) return res.status(400).send('Choose a valid employee.');
	try {
		const [application, applicant] = await Promise.all([
			LeaveApplication.findOne({ _id: req.params.id, status: 'pending' }),
			User.findById(req.body.employeeId).select('teacherName username role employeeCode department').lean()
		]);
		if (!application) return res.status(404).send('Pending leave application not found.');
		if (!applicant) return res.status(404).send('Employee not found.');
		const profiles = await Staff.find({}).select('employeeCode staffName companyName branchName designation department section').lean();
		const profile = findStaffProfile(applicant, profiles);
		const previousEmployeeName = application.employeeName;
		const result = await LeaveApplication.updateOne({ _id: application._id, status: 'pending' }, { $set: {
			requester: applicant._id,
			username: String(applicant.username || '').trim(),
			employeeName: String(profile.staffName || applicant.teacherName || applicant.username || '').trim(),
			employeeRole: getRole(applicant),
			companyName: profile.companyName || 'United English Boarding School',
			branchName: profile.branchName || '',
			employeeCode: profile.employeeCode || applicant.employeeCode || '',
			designation: profile.designation || '',
			department: profile.department || applicant.department || '',
			section: profile.section || '',
			transferredFrom: previousEmployeeName,
			transferredBy: String(req.user.teacherName || req.user.username || '').trim(),
			transferredAt: new Date()
		} });
		if (!result.modifiedCount) return res.status(409).send('The leave application could not be transferred.');
		return res.redirect('/leave?saved=1');
	} catch (error) {
		console.error('Unable to transfer leave application:', error);
		return res.status(400).send('Unable to transfer leave application.');
	}
};

exports.deleteLeaveApplication = async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Leave application not found.');
	try {
		const result = await LeaveApplication.deleteOne({ _id: req.params.id });
		return result.deletedCount ? res.redirect('/leave?saved=1') : res.status(404).send('Leave application not found.');
	} catch (error) {
		console.error('Unable to delete leave application:', error);
		return res.status(400).send('Unable to delete leave application.');
	}
};

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
