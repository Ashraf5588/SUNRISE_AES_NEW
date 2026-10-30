const mongoose = require('mongoose');
const multer = require('multer');
const bs = require('../../utils/bikramSambat');
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
	if (employeeCode) {
		return profiles.find(profile => String(profile.employeeCode || '').trim().toUpperCase() === employeeCode) || {};
	}
	return profiles.find(profile => String(profile.staffName || '').trim().toLowerCase() === String(user?.teacherName || '').trim().toLowerCase())
		|| {};
};

const getEmployeeLeaveFilter = (user, profile = {}, { includeName = false } = {}) => {
	const employeeCode = String(profile.employeeCode || user?.employeeCode || '').trim();
	if (employeeCode) return { employeeCode };
	if (user?._id) return { requester: user._id };
	const employeeName = includeName ? String(profile.staffName || '').trim() : '';
	return employeeName ? { employeeName } : { _id: null };
};

const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const getDepartmentAdmins = (users, profiles) => users.map(user => {
	const profile = findStaffProfile(user, profiles);
	return {
		id: String(user._id),
		name: String(profile.staffName || user.teacherName || user.username || '').trim(),
		username: String(user.username || '').trim(),
		role: getRole(user),
		employeeCode: String(profile.employeeCode || user.employeeCode || '').trim(),
		department: String(profile.department || user.department || '').trim()
	};
}).filter(admin => admin.name);
const getAdminDepartmentStaff = (users, profiles) => [...new Map(
	getDepartmentAdmins(users, profiles)
		.filter(admin => normalizeName(admin.department) === 'admin' || admin.role === 'ADMIN')
		.map(admin => [admin.id, admin])
).values()];
const resolveDepartmentAdmin = (value, users, profiles) => {
	const normalized = String(value || '').trim();
	if (!normalized) return null;
	const admins = getAdminDepartmentStaff(users, profiles);
	return admins.find(admin => admin.id === normalized)
		|| admins.find(admin => [admin.name, admin.username, admin.employeeCode]
			.some(candidate => normalizeName(candidate) === normalizeName(normalized)))
		|| null;
};
const getAssignedApprover = (application, admin, eligibleAdmins = [admin]) => {
	if (!admin?.id) return false;
	if (application.assignedApproverUserId) {
		return String(application.assignedApproverUserId) === admin.id;
	}
	const assignedCode = String(application.assignedApproverEmployeeCode || '').trim().toUpperCase();
	if (assignedCode) {
		const matches = eligibleAdmins.filter(candidate => candidate.employeeCode.toUpperCase() === assignedCode);
		return matches.length === 1 && matches[0].id === admin.id;
	}
	const assignedName = normalizeName(application.assignedApproverName || application.approverName);
	if (!assignedName) return false;
	const matches = eligibleAdmins.filter(candidate => [
		candidate.name,
		candidate.username,
		candidate.employeeCode
	].some(value => normalizeName(value) === assignedName));
	return matches.length === 1 && matches[0].id === admin.id;
};

const authorizeAssignedApprover = async (req, res, application) => {
	const users = await User.find({}).select('teacherName username role employeeCode department').lean();
	const user = users.find(candidate => String(candidate._id) === String(req.user?._id));
	if (!user) {
		res.status(403).send('Only the assigned leave approver can perform this action.');
		return false;
	}
	const profiles = await Staff.find({}).select('employeeCode staffName department').lean();
	const eligibleAdmins = getAdminDepartmentStaff(users, profiles);
	const admin = eligibleAdmins.find(candidate => candidate.id === String(user._id));
	if (!admin || !getAssignedApprover(application, admin, eligibleAdmins)) {
		res.status(403).send('Only the assigned leave approver can perform this action.');
		return false;
	}
	req.leaveApprover = admin;
	return true;
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
		const profiles = await Staff.find({}).select('employeeCode staffName companyName branchName designation department section employeePhoto').lean();
		const approverUsers = await User.find({}).select('teacherName username role employeeCode department').sort({ teacherName: 1, username: 1 }).lean();
		const currentUser = approverUsers.find(user => String(user._id) === String(req.user._id));
		const eligibleApprovers = getAdminDepartmentStaff(approverUsers, profiles);
		const currentApprover = eligibleApprovers.find(candidate => candidate.id === String(currentUser?._id)) || null;
		const leavePageUser = currentUser || req.user;
		const leavePageProfile = findStaffProfile(leavePageUser, profiles);
		const userFilter = admin ? {} : getEmployeeLeaveFilter(leavePageUser, leavePageProfile);
		const visibleApplicationFilter = admin || currentApprover
			? {}
			: userFilter;
		const currentBsYear = String(bs.ADToBS(new Date()) || '').slice(0, 4);
		const yearSetup = await mongoose.connection.collection('marksheetSetup').findOne({}, { projection: { academicYear: 1 } });
		const currentAcademicYear = String(yearSetup?.academicYear || currentBsYear);
		const storedYears = await LeaveApplication.aggregate([
			{ $match: { ...visibleApplicationFilter, startDateNepali: /^\d{4}-/ } },
			{ $project: { year: { $substrBytes: ['$startDateNepali', 0, 4] } } },
			{ $group: { _id: '$year' } }
		]);
		const academicYearOptions = [...new Set([currentAcademicYear, ...storedYears.map(item => String(item._id))])]
			.filter(year => /^\d{4}$/.test(year))
			.sort((yearA, yearB) => Number(yearB) - Number(yearA));
		const requestedAcademicYear = String(req.query.academicYear || '');
		const academicYear = academicYearOptions.includes(requestedAcademicYear) ? requestedAcademicYear : currentAcademicYear;
		const yearFilter = { startDateNepali: { $regex: `^${academicYear}-` } };
		const applicationFilter = { $and: [visibleApplicationFilter, yearFilter] };
		const [summaryResult] = await LeaveApplication.aggregate([
			{ $match: applicationFilter },
			{ $group: {
				_id: null,
				totalRequests: { $sum: 1 },
				totalApproved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
				totalRejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } }
			} }
		]);
		const applicationCount = summaryResult?.totalRequests || 0;
		const pageSize = ['50', '100', 'all'].includes(String(req.query.perPage || '')) ? String(req.query.perPage) : '50';
		const pageSizeNumber = pageSize === 'all' ? applicationCount : Number(pageSize);
		const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(applicationCount / pageSizeNumber));
		const page = pageSize === 'all' ? 1 : Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), pageCount);
		const applicationQuery = LeaveApplication.find(applicationFilter)
			.sort({ startDateNepali: -1, createdAt: -1 })
			.skip((page - 1) * pageSizeNumber);
		if (pageSize !== 'all') applicationQuery.limit(pageSizeNumber);
		else if (applicationCount) applicationQuery.limit(applicationCount);
		const [allLeaveTypes, applicationRecords, users, branches, holidays] = await Promise.all([
			LeaveType.find({ isActive: true }).sort({ leavename: 1 }).lean(),
			applicationQuery.lean(),
			admin || currentApprover ? Promise.resolve(approverUsers) : Promise.resolve([req.user]),
			Branch.find({}).select('name').sort({ name: 1 }).lean(),
			EmployeeWeekend.find({}).select('dateBs').lean()
		]);
		const reviewerNames = new Map();
		approverUsers.forEach(user => {
			const profileName = findStaffProfile(user, profiles).staffName;
			const displayName = String(profileName || user.teacherName || user.username || '').trim();
			if (user._id) reviewerNames.set(normalizeName(user._id), displayName);
			if (user.username) reviewerNames.set(normalizeName(user.username), displayName);
			if (user.teacherName) reviewerNames.set(normalizeName(user.teacherName), displayName);
		});
		const applications = applicationRecords.map(application => ({
			...application,
			startDateAd: application.startDateAd || parseNepaliDate(application.startDateNepali)?.toISOString().slice(0, 10) || '',
			endDateAd: application.endDateAd || parseNepaliDate(application.endDateNepali)?.toISOString().slice(0, 10) || '',
			reviewedByDisplay: reviewerNames.get(normalizeName(application.reviewedBy)) || application.reviewedBy,
			canManage: Boolean(currentApprover && getAssignedApprover(application, currentApprover, eligibleApprovers))
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
		const availableLeaveTypes = admin || currentApprover ? allLeaveTypes : allLeaveTypes.filter(type => appliesToUser(type, req.user));
		let leaveBalances = [];
		if (!admin) {
			const balanceRecords = await LeaveApplication.find({
				$and: [userFilter, yearFilter, { status: { $in: ['pending', 'approved'] } }]
			}).select('leaveType leaveTypeName startDateNepali endDateNepali leaveDay sandwichLeave monthlyAllocations yearlyAllocations').lean();
			const currentBsMonth = String(bs.ADToBS(new Date()) || '').slice(5, 7);
			const selectedMonthPeriod = `${academicYear}-${currentBsMonth}`;
			leaveBalances = await Promise.all(availableLeaveTypes.map(async type => {
				const typeRecords = balanceRecords.filter(record =>
					String(record.leaveType || '') === String(type._id)
					|| normalizeName(record.leaveTypeName) === normalizeName(type.leavename)
				);
				const usedMonths = new Map();
				const usedYears = new Map();
				await addStoredUsage(typeRecords, usedMonths, usedYears);
				const yearlyLimit = Number(type.maxDaysPerYear) || null;
				const monthlyLimit = Number(type.maxDaysPerMonth) || null;
				const yearlyRemaining = yearlyLimit === null ? null : Math.max(0, yearlyLimit - (usedYears.get(academicYear) || 0));
				const monthlyRemaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - (usedMonths.get(selectedMonthPeriod) || 0));
				return {
					name: type.leavename,
					yearlyLimit,
					yearlyRemaining,
					monthlyLimit,
					monthlyRemaining,
					monthlyPeriod: selectedMonthPeriod,
					remainingDays: yearlyRemaining ?? monthlyRemaining
				};
			}));
		}
		const remainingQuotaTypeCount = leaveBalances.filter(balance => balance.remainingDays !== null).length;
		const totalRemainingLeave = leaveBalances.reduce((total, balance) => total + (balance.remainingDays || 0), 0);
		const departmentAdmins = getAdminDepartmentStaff(approverUsers, profiles);
		const editingApplication = currentApprover && mongoose.isValidObjectId(req.query.edit)
			? applications.find(application => String(application._id) === String(req.query.edit) && application.status === 'pending' && application.canManage) || null
			: null;
		const selectedEmployeeId = editingApplication ? String(editingApplication.requester) : String(req.user._id);
		const currentEmployee = employees.find(employee => employee.id === selectedEmployeeId) || {};
		const branchNames = [...new Set([...branches.map(branch => branch.name), ...profiles.map(profile => profile.branchName)].filter(Boolean))].sort();
		const holidayDatesAd = holidays.map(holiday => parseNepaliDate(holiday.dateBs))
			.filter(Boolean).map(date => date.toISOString().slice(0, 10));
		renderPage(res, 'leaveform', {
			leaveTypes: availableLeaveTypes,
			leaveBalances,
			remainingQuotaTypeCount,
			totalRemainingLeave,
			applications,
			applicationCount,
			academicYear,
			academicYearOptions,
			totalApproved: summaryResult?.totalApproved || 0,
			totalRejected: summaryResult?.totalRejected || 0,
			page,
			pageCount,
			pageSize,
			firstApplication: applicationCount ? (page - 1) * pageSizeNumber + 1 : 0,
			lastApplication: (page - 1) * pageSizeNumber + applications.length,
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
		let admin = isAdmin(req.user);
		if (!admin && req.query.excludeApplicationId) {
			if (!mongoose.isValidObjectId(req.query.excludeApplicationId)) return res.status(400).json({ message: 'Invalid leave application.' });
			const application = await LeaveApplication.findOne({ _id: req.query.excludeApplicationId, status: 'pending' }).lean();
			if (!application || !await authorizeAssignedApprover(req, res, application)) return;
			admin = true;
		}
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
		const profiles = await Staff.find({}).select('employeeCode staffName').lean();
		const applicantProfile = findStaffProfile(applicant, profiles);
		const applicantLeaveFilter = getEmployeeLeaveFilter(applicant, applicantProfile);

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
		const quotaFilters = [
			applicantLeaveFilter,
			{ $or: [{ leaveType: leaveType._id }, { leaveTypeName: leaveType.leavename }] },
			{ status: { $in: activeStatuses } }
		];
		if (admin && mongoose.isValidObjectId(req.query.excludeApplicationId)) {
			quotaFilters.push({ _id: { $ne: req.query.excludeApplicationId } });
		}
		const quotaRecords = await LeaveApplication.find({ $and: quotaFilters })
			.select('startDateNepali endDateNepali leaveDay sandwichLeave monthlyAllocations yearlyAllocations').lean();
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

exports.leaveReport = async (req, res) => {
	try {
		const [users, profiles, leaveTypes] = await Promise.all([
			User.find({}).select('teacherName username role employeeCode department').lean(),
			Staff.find({}).select('employeeCode staffName companyName branchName designation department section').lean(),
			LeaveType.find({}).sort({ leavename: 1 }).lean()
		]);
		const employees = [];
		profiles.forEach(profile => {
			const profileCode = normalizeName(profile.employeeCode).toUpperCase();
			const profileName = normalizeName(profile.staffName);
			const user = profileCode
				? users.find(candidate => normalizeName(candidate.employeeCode).toUpperCase() === profileCode)
				: users.find(candidate => profileName && normalizeName(candidate.teacherName) === profileName);
			employees.push({
				id: user ? String(user._id) : `staff:${profile._id}`,
				userId: user ? String(user._id) : '',
				profileId: String(profile._id),
				name: String(profile.staffName || user?.teacherName || user?.username || '').trim(),
				role: user ? getRole(user) : 'STAFF',
				employeeCode: String(profile.employeeCode || user?.employeeCode || '').trim(),
				department: String(profile.department || user?.department || '').trim(),
				companyName: String(profile.companyName || '').trim(),
				branchName: String(profile.branchName || '').trim(),
				designation: String(profile.designation || '').trim()
			});
		});
		employees.sort((first, second) => first.name.localeCompare(second.name));
		const reviewerNames = new Map();
		users.forEach(user => {
			const profileName = findStaffProfile(user, profiles).staffName;
			const displayName = String(profileName || user.teacherName || user.username || '').trim();
			if (user.username) reviewerNames.set(normalizeName(user.username), displayName);
			if (user.teacherName) reviewerNames.set(normalizeName(user.teacherName), displayName);
		});
		const currentBsYear = String(bs.ADToBS(new Date()) || '').slice(0, 4);
		const requestedEmployeeIds = (Array.isArray(req.query.employeeId) ? req.query.employeeId : [req.query.employeeId])
			.map(value => String(value || '').trim())
			.filter(Boolean);
		const selectedEmployeeIds = [...new Set(requestedEmployeeIds)];
		const selectedYear = String(req.query.year || currentBsYear).trim();
		let reportData = [];
		let errorMessage = '';

		if (!/^\d{4}$/.test(selectedYear)) {
			errorMessage = 'Choose a valid Nepali year.';
		} else if (selectedEmployeeIds.some(id => !employees.some(employee => employee.id === id))) {
			errorMessage = 'One or more selected employees are invalid.';
		} else if (selectedEmployeeIds.length) {
			const selectedEmployees = employees.filter(employee => selectedEmployeeIds.includes(employee.id));
			reportData = await Promise.all(selectedEmployees.map(async selectedEmployee => {
				const user = users.find(candidate => String(candidate._id) === selectedEmployee.userId);
				const profile = profiles.find(candidate => String(candidate._id) === selectedEmployee.profileId)
					|| findStaffProfile(user, profiles);
				const employeeFilter = getEmployeeLeaveFilter(user, profile, { includeName: true });
				const records = await LeaveApplication.find({ ...employeeFilter, status: 'approved' })
					.sort({ startDateNepali: 1, createdAt: 1 })
					.select('employeeName employeeCode department designation branchName leaveType leaveTypeName isPaid startDateNepali endDateNepali leaveDay sandwichLeave requestedDays yearlyAllocations reason status reviewedBy assignedApproverName approverName')
					.lean();
				const leaveTypeById = new Map(leaveTypes.map(type => [String(type._id), type]));
				const leaveTypeByName = new Map(leaveTypes.map(type => [normalizeName(type.leavename), type]));
				const takenByLeaveType = new Map();
				let totalTakenDays = 0;
				const applications = [];

				for (const record of records) {
					const savedDays = (record.yearlyAllocations || [])
						.filter(allocation => String(allocation.period) === selectedYear)
						.reduce((total, allocation) => total + Number(allocation.days || 0), 0);
					let daysInYear = savedDays;
					if (!daysInYear) {
						const startDate = parseNepaliDate(record.startDateNepali);
						const endDate = parseNepaliDate(record.endDateNepali);
						if (startDate && endDate) {
							const allocations = await getDateAllocations(startDate, endDate, {
								halfDay: record.leaveDay && record.leaveDay !== 'Full day',
								sandwichLeave: record.sandwichLeave !== false
							});
							daysInYear = allocations.years.get(selectedYear) || 0;
						} else if (String(record.startDateNepali || '').startsWith(`${selectedYear}-`)) {
							daysInYear = Number(record.requestedDays || 0);
						}
					}
					if (!daysInYear) continue;

					const leaveType = leaveTypeById.get(String(record.leaveType || ''))
						|| leaveTypeByName.get(normalizeName(record.leaveTypeName));
					const leaveTypeName = String(record.leaveTypeName || leaveType?.leavename || 'Other leave');
					const balanceKey = leaveType ? String(leaveType._id) : normalizeName(leaveTypeName);
					if (record.status !== 'approved') continue;
					takenByLeaveType.set(balanceKey, (takenByLeaveType.get(balanceKey) || 0) + daysInYear);
					totalTakenDays += daysInYear;
					applications.push({
						...record,
						leaveTypeName,
						daysInYear,
						balanceKey,
						approvedBy: record.status === 'approved'
							? reviewerNames.get(normalizeName(record.reviewedBy))
								|| reviewerNames.get(normalizeName(record.assignedApproverName))
								|| reviewerNames.get(normalizeName(record.approverName))
								|| record.assignedApproverName
								|| record.approverName
								|| record.reviewedBy
								|| ''
								: '',
						statusLabel: String(record.status || 'pending').replace(/^\w/, letter => letter.toUpperCase())
					});
				}

				const applicableTypes = leaveTypes.filter(type => appliesToUser(type, user));
				const balanceTypes = new Map(applicableTypes.map(type => [String(type._id), {
					name: type.leavename,
					allocatedDays: Number(type.maxDaysPerYear) || null,
					takenDays: takenByLeaveType.get(String(type._id)) || 0
				}]));
				applications.forEach(application => {
					if (!balanceTypes.has(application.balanceKey)) {
						balanceTypes.set(application.balanceKey, {
							name: application.leaveTypeName,
							allocatedDays: null,
							takenDays: takenByLeaveType.get(application.balanceKey) || 0
						});
					}
				});
				const leaveBalances = [...balanceTypes.values()]
					.map(balance => ({
						...balance,
						remainingDays: balance.allocatedDays === null
							? null
							: Math.max(0, balance.allocatedDays - balance.takenDays)
					}))
					.sort((first, second) => first.name.localeCompare(second.name));
				return { employee: selectedEmployee, applications, leaveBalances, totalTakenDays };
			}));
		}

		return renderPage(res, 'leavereport', {
			isAdmin: true,
			employees,
			selectedEmployeeIds,
			selectedYear,
			currentBsYear,
			reportData,
			errorMessage
		});
	} catch (error) {
		console.error('Unable to generate leave report:', error);
		return res.status(500).send('Unable to generate leave report.');
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
		const sandwichLeave = admin || req.body.sandwichLeave === 'on';
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
		const applicantLeaveFilter = getEmployeeLeaveFilter(applicant, profile);
		const department = String(profile.department || applicant.department || '').trim();
		const approverUsers = await User.find({}).select('teacherName username role employeeCode department').lean();
		const requestedApproverName = String(req.body.approverName || '').trim();
		const requestedRecommendedBy = String(req.body.recommendedBy || '').trim();
		const assignedApprover = resolveDepartmentAdmin(requestedApproverName, approverUsers, profiles);
		const recommendedByAdmin = resolveDepartmentAdmin(requestedRecommendedBy, approverUsers, profiles);
		const approverName = assignedApprover?.name || '';
		const recommendedBy = recommendedByAdmin?.name || '';
		if ((!admin && !assignedApprover) || (requestedApproverName && !assignedApprover) || (requestedRecommendedBy && !recommendedByAdmin)) {
			return res.status(400).send('Choose an assigned administrator and a valid recommender from the administrator list.');
		}
		const activeStatuses = ['pending', 'approved'];
		const overlapping = await LeaveApplication.find({
			$and: [applicantLeaveFilter, {
				status: { $in: activeStatuses },
				startDateNepali: { $lte: endDateNepali },
				endDateNepali: { $gte: startDateNepali }
			}]
		}).select('startDateNepali endDateNepali').lean();
		if (overlapping.length) return res.status(409).send('You already have a pending or approved leave request that overlaps these dates.');

		if (!admin && (leaveType.maxDaysPerYear || leaveType.maxDaysPerMonth)) {
			const quotaRecords = await LeaveApplication.find({
				$and: [applicantLeaveFilter, {
					$or: [{ leaveType: leaveType._id }, { leaveTypeName: leaveType.leavename }]
				}, {
					status: { $in: activeStatuses },
					startDateNepali: { $lte: endDateNepali },
					endDateNepali: { $gte: `${startDateNepali.slice(0, 4)}-01-01` }
				}]
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
			reviewedBy: admin ? String(req.user.teacherName || req.user.username || '').trim() : '',
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
			assignedApproverUserId: assignedApprover?.id || null,
			assignedApproverEmployeeCode: assignedApprover?.employeeCode || '',
			assignedApproverName: assignedApprover?.name || '',
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
	const application = await LeaveApplication.findById(req.params.id).lean();
	if (!application || application.status !== 'pending') return res.status(404).send('Pending leave application not found.');
	try {
		if (!await authorizeAssignedApprover(req, res, application)) return;
	} catch (error) {
		console.error('Unable to authorize leave edit:', error);
		return res.status(500).send('Unable to authorize leave edit.');
	}
	req.query.edit = String(req.params.id);
	return exports.leavePage(req, res);
};

exports.updateLeaveApplication = [handleLeaveDocumentUpload, async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Leave application not found.');
	try {
		const application = await LeaveApplication.findById(req.params.id);
		if (!application || application.status !== 'pending') return res.status(404).send('Pending leave application not found.');
		if (!await authorizeAssignedApprover(req, res, application)) return;
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
		const profiles = await Staff.find({}).select('employeeCode staffName companyName branchName designation department section').lean();
		const profile = findStaffProfile(applicant, profiles);
		const applicantLeaveFilter = getEmployeeLeaveFilter(applicant, profile);
		const overlapping = await LeaveApplication.findOne({
			$and: [
				{ _id: { $ne: application._id } },
				applicantLeaveFilter,
				{ status: { $in: ['pending', 'approved'] }, startDateNepali: { $lte: endDateNepali }, endDateNepali: { $gte: startDateNepali } }
			]
		}).select('_id').lean();
		if (overlapping) return res.status(409).send('This employee already has a pending or approved leave request that overlaps these dates.');
		const allocations = await getDateAllocations(startDate, endDate, { halfDay, sandwichLeave });
		const requestedDays = totalAllocations(allocations.years);
		if (!requestedDays) return res.status(400).send('The selected dates contain no chargeable leave days.');
		const department = String(profile.department || applicant.department || '').trim();
		const approverUsers = await User.find({}).select('teacherName username role employeeCode department').lean();
		const requestedApproverName = String(req.body.approverName || '').trim();
		const requestedRecommendedBy = String(req.body.recommendedBy || '').trim();
		const assignedApprover = resolveDepartmentAdmin(requestedApproverName, approverUsers, profiles);
		const recommendedByAdmin = resolveDepartmentAdmin(requestedRecommendedBy, approverUsers, profiles);
		const approverName = assignedApprover?.name || '';
		const recommendedBy = recommendedByAdmin?.name || '';
		if (!assignedApprover || (requestedApproverName && !assignedApprover) || (requestedRecommendedBy && !recommendedByAdmin)) {
			return res.status(400).send('Choose an assigned administrator and a valid recommender from the administrator list.');
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
			assignedApproverUserId: assignedApprover.id,
			assignedApproverEmployeeCode: assignedApprover.employeeCode,
			assignedApproverName: assignedApprover.name,
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
		const application = await LeaveApplication.findOne({ _id: req.params.id, status: 'pending' });
		if (!application) return res.status(404).send('Pending leave application not found.');
		if (!await authorizeAssignedApprover(req, res, application)) return;
		const profiles = await Staff.find({}).select('employeeCode staffName companyName branchName designation department section').lean();
		const approverUsers = await User.find({}).select('teacherName username role employeeCode department').lean();
		const transferredApprover = resolveDepartmentAdmin(req.body.employeeId, approverUsers, profiles);
		if (!transferredApprover) return res.status(400).send('Choose another eligible administrator to receive this leave approval.');
		if (transferredApprover.id === req.leaveApprover.id) return res.status(400).send('Choose a different administrator to receive this leave approval.');
		const result = await LeaveApplication.updateOne(
			{ _id: application._id, status: 'pending' },
			{ $set: {
			approverName: transferredApprover.name,
			assignedApproverUserId: transferredApprover.id,
			assignedApproverEmployeeCode: transferredApprover.employeeCode,
			assignedApproverName: transferredApprover.name,
			transferredFrom: String(application.assignedApproverName || application.approverName || '').trim(),
			transferredBy: String(req.user.teacherName || req.user.username || '').trim(),
			transferredAt: new Date()
			} }
		);
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
		const application = await LeaveApplication.findById(req.params.id);
		if (!application) return res.status(404).send('Leave application not found.');
		if (!await authorizeAssignedApprover(req, res, application)) return;
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
		if (!await authorizeAssignedApprover(req, res, application)) return;
		if (application.status !== 'pending') return res.status(409).send('This leave application has already been reviewed.');
		const result = await LeaveApplication.updateOne(
			{ _id: application._id, status: 'pending' },
			{ $set: {
				status,
				reviewReason: status === 'rejected' ? reviewReason : '',
				reviewedBy: String(req.user.teacherName || req.user.username || '').trim(),
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
		const application = await LeaveApplication.findById(req.params.id).select('requester assignedApproverUserId assignedApproverEmployeeCode assignedApproverName approverName supportingDocument supportingDocumentName supportingDocumentMimeType').lean();
		if (!application?.supportingDocument) return res.status(404).send('Document not found.');
		if (String(application.requester) !== String(req.user._id) && !await authorizeAssignedApprover(req, res, application)) return;
		res.type(application.supportingDocumentMimeType || 'application/octet-stream');
		res.setHeader('Content-Disposition', `inline; filename="${String(application.supportingDocumentName || 'leave-document').replace(/[\\"\r\n]/g, '_')}"`);
		return res.send(application.supportingDocument);
	} catch (error) {
		console.error('Unable to load leave document:', error);
		return res.status(500).send('Unable to load supporting document.');
	}
};
