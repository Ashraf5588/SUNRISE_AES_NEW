const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const sharp = require('sharp');
const bs = require('bikram-sambat-js');
const { BlobServiceClient } = require('@azure/storage-blob');
const { teacherSchema } = require('../../model/admin');
const Notice = require('../../model/noticeschema/noticeschema');

const User = mongoose.models.userlist || mongoose.model('userlist', teacherSchema, 'users');
const ROLE_LABELS = {
	ADMIN: 'Admin',
	FRONTDESKOFFICER: 'Front Desk Officer',
	LIBRARY: 'Library Assistant',
	NURSE: 'Nurse',
	STAFF: 'Staff (non-student accounts)',
	STUDENT: 'Student',
	TEACHER: 'Teacher'
};
const DEFAULT_ROLES = ['TEACHER', 'ADMIN', 'NURSE', 'FRONTDESKOFFICER', 'LIBRARY', 'STUDENT', 'STAFF'];
const normalize = value => String(value ?? '').trim();
const normalizeRole = value => normalize(value).toUpperCase();
const isAdmin = user => normalizeRole(user?.role) === 'ADMIN';

const imageUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024, files: 5 },
	fileFilter: (req, file, callback) => {
		if (String(file.mimetype || '').startsWith('image/')) return callback(null, true);
		return callback(new Error('Upload image files only.'));
	}
});

exports.uploadNoticeImages = (req, res, next) => imageUpload.array('noticeImages', 5)(req, res, error => {
	if (!error) return next();
	const message = error instanceof multer.MulterError
		? 'Upload up to 5 images, each no larger than 5 MB.'
		: error.message || 'Unable to upload notice images.';
	return res.status(400).send(message);
});

const getTodayNepaliDate = () => String(bs.ADToBS(new Date()) || '').trim().slice(0, 10);

const isValidNepaliDate = value => {
	const date = normalize(value);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	try {
		const adDate = String(bs.BSToAD(date) || '').trim().slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(adDate)) return false;
		const convertedBack = String(bs.ADToBS(new Date(`${adDate}T00:00:00Z`)) || '').trim().slice(0, 10);
		return convertedBack === date;
	} catch (error) {
		return false;
	}
};

const parseNoticeForm = (body, roleOptions) => {
	const title = normalize(body.title);
	const description = normalize(body.description);
	const noticeDate = normalize(body.noticeDate);
	const allowedRoles = new Set(['ALL', ...roleOptions.map(role => role.value)]);
	const submittedRoles = (Array.isArray(body.recipientRoles) ? body.recipientRoles : [body.recipientRoles])
		.map(normalizeRole)
		.filter(role => role && allowedRoles.has(role));
	const recipientRoles = submittedRoles.includes('ALL') ? ['ALL'] : [...new Set(submittedRoles)];
	const shareToFacebook = ['on', 'true', '1'].includes(normalize(body.shareToFacebook).toLowerCase());
	let error = '';
	if (!title || title.length > 180) error = 'Enter a notice title up to 180 characters.';
	else if (description.length > 5000) error = 'The optional description must be 5000 characters or fewer.';
	else if (!isValidNepaliDate(noticeDate)) error = 'Select a valid Nepali date.';
	else if (!recipientRoles.length) error = 'Choose at least one recipient role or select All roles.';

	return { error, values: { title, description, noticeDate, recipientRoles, shareToFacebook } };
};

const getPublicBaseUrl = req => {
	const configuredBaseUrl = normalize(process.env.APP_BASE_URL).replace(/\/$/, '');
	const forwardedProtocol = normalize(req.get('x-forwarded-proto')).split(',')[0] || req.protocol;
	const forwardedHost = normalize(req.get('x-forwarded-host')).split(',')[0] || req.get('host');
	return configuredBaseUrl || `${forwardedProtocol}://${forwardedHost}`;
};

const getFacebookShareUrl = (baseUrl, noticeId) =>
	`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${baseUrl}/notice/share/${noticeId}`)}`;

const getRoleOptions = async () => {
	const storedRoles = await User.distinct('role');
	const roles = new Set(DEFAULT_ROLES);
	storedRoles.map(normalizeRole).filter(role => role && role !== 'ALL').forEach(role => roles.add(role));
	return [...roles].map(value => ({
		value,
		label: ROLE_LABELS[value] || value.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
	}));
};

const uploadImagesToAzure = async files => {
	if (!files?.length) return [];
	const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
	if (!connectionString) throw new Error('Azure image storage is not configured.');

	const containerName = process.env.AZURE_NOTICE_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
	const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
	const uploadedImages = [];
	try {
		for (const file of files) {
			const imageBuffer = await sharp(file.buffer)
				.rotate()
				.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 84 })
				.toBuffer();
			const blobName = `notices/${Date.now()}-${crypto.randomUUID()}.webp`;
			const blobClient = containerClient.getBlockBlobClient(blobName);
			await blobClient.uploadData(imageBuffer, { blobHTTPHeaders: { blobContentType: 'image/webp' } });
			uploadedImages.push({ url: blobClient.url, blobName, originalName: normalize(file.originalname).slice(0, 180) });
		}
		return uploadedImages;
	} catch (error) {
		await Promise.all(uploadedImages.map(image => containerClient.getBlockBlobClient(image.blobName).deleteIfExists().catch(() => {})));
		throw error;
	}
};

const deleteNoticeImages = async images => {
	const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
	if (!connectionString || !images?.length) return;
	try {
		const containerName = process.env.AZURE_NOTICE_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
		const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
		await Promise.all(images.filter(image => image.blobName).map(image => containerClient.getBlockBlobClient(image.blobName).deleteIfExists()));
	} catch (error) {
		console.error('Unable to delete uploaded notice images:', error.message);
	}
};

const canReceiveAsStaff = role => !['STUDENT', 'PARENT'].includes(normalizeRole(role));

const noticeAudienceFilter = recipientRoles => {
	if (recipientRoles.includes('ALL')) return {};
	const clauses = [];
	const explicitRoles = recipientRoles.filter(role => role !== 'STAFF');
	if (explicitRoles.length) clauses.push({ role: { $in: explicitRoles } });
	if (recipientRoles.includes('STAFF')) clauses.push({ role: { $exists: true, $nin: ['STUDENT', 'PARENT'] } });
	return clauses.length ? { $or: clauses } : { _id: null };
};

const isNoticeVisibleToUser = (notice, user) => {
	if (isAdmin(user)) return true;
	const roles = (notice.recipientRoles || []).map(normalizeRole);
	const userRole = normalizeRole(user?.role);
	return roles.includes('ALL') || roles.includes(userRole) || (roles.includes('STAFF') && canReceiveAsStaff(userRole));
};

const getNoticesForUser = (user, limit = 100) => {
	const role = normalizeRole(user?.role);
	const audiences = ['ALL', role];
	if (canReceiveAsStaff(role)) audiences.push('STAFF');
	const filter = isAdmin(user) ? {} : { recipientRoles: { $in: audiences } };
	return Notice.find(filter).sort({ noticeDate: -1, createdAt: -1 }).limit(limit).lean().then(notices => {
		const newNoticeCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
		return notices.map(notice => ({
			...notice,
			isNew: notice.createdAt && new Date(notice.createdAt).getTime() >= newNoticeCutoff
		}));
	});
};

exports.unreadNoticeCount = async (req, res) => {
	try {
		const userRole = normalizeRole(req.user?.role);
		const audiences = ['ALL', userRole];
		if (canReceiveAsStaff(userRole)) audiences.push('STAFF');
		const filter = isAdmin(req.user) ? {} : { recipientRoles: { $in: audiences } };
		const sinceValue = normalize(req.query.since);
		const since = sinceValue ? new Date(sinceValue) : null;
		if (since && !Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
		const count = await Notice.countDocuments(filter);
		return res.json({ count });
	} catch (error) {
		console.error('Unable to count unread notices:', error);
		return res.status(500).json({ count: 0 });
	}
};

const sendNoticePush = async notice => {
	try {
		const audience = noticeAudienceFilter(notice.recipientRoles || []);
		const users = await User.find({
			...audience,
			fcmTokens: { $exists: true, $ne: [] }
		}).select('fcmTokens').lean();
		const tokens = [...new Set(users.flatMap(user => user.fcmTokens || []).filter(Boolean))];
		if (!tokens.length) return;

		const admin = require('../../firebase');
		const baseUrl = normalize(process.env.APP_BASE_URL).replace(/\/$/, '');
		const link = baseUrl ? `${baseUrl}/notice/${notice._id}` : `/notice/${notice._id}`;
		for (let index = 0; index < tokens.length; index += 500) {
			const response = await admin.messaging().sendEachForMulticast({
				notification: {
					title: `New notice: ${notice.title}`,
					body: normalize(notice.description).slice(0, 180) || `A new notice has been added for ${notice.noticeDate}.`
				},
				data: { url: link, noticeId: String(notice._id) },
				tokens: tokens.slice(index, index + 500)
			});
			console.log(`Notice push sent to ${response.successCount}; failed for ${response.failureCount}.`);
		}
	} catch (error) {
		console.error('Unable to send notice push notification:', error.message);
	}
};

const renderAddNotice = async (req, res, extra = {}) => {
	const [roleOptions, notices] = await Promise.all([
		getRoleOptions(),
		Notice.find({}).sort({ createdAt: -1 }).limit(50).lean()
	]);
	return res.render('notice/addnotice', {
		roleOptions,
		notices,
		todayNepaliDate: getTodayNepaliDate(),
		addedBy: normalize(req.user?.teacherName || req.user?.username),
		formValues: null,
		editingNotice: null,
		error: '',
		message: req.query.saved ? 'Notice published.' : '',
		...extra
	});
};

exports.addNoticePage = async (req, res) => {
	try {
		return await renderAddNotice(req, res);
	} catch (error) {
		console.error('Unable to load the notice form:', error);
		return res.status(500).send('Unable to load the notice form.');
	}
};

exports.editNoticePage = async (req, res) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Notice not found.');
		const notice = await Notice.findById(req.params.id).lean();
		if (!notice) return res.status(404).send('Notice not found.');
		const updatedNotice = req.query.enableFacebook === '1' ? { ...notice, shareToFacebook: true } : notice;
		return await renderAddNotice(req, res, { editingNotice: updatedNotice, message: '' });
	} catch (error) {
		console.error('Unable to load notice for editing:', error);
		return res.status(500).send('Unable to load notice for editing.');
	}
};

exports.createNotice = async (req, res) => {
	let uploadedImages = [];
	try {
		const title = normalize(req.body.title);
		const description = normalize(req.body.description);
		const noticeDate = normalize(req.body.noticeDate);
		const roleOptions = await getRoleOptions();
		const allowedRoles = new Set(['ALL', ...roleOptions.map(role => role.value)]);
		const submittedRoles = (Array.isArray(req.body.recipientRoles) ? req.body.recipientRoles : [req.body.recipientRoles])
			.map(normalizeRole)
			.filter(role => role && allowedRoles.has(role));
		const recipientRoles = submittedRoles.includes('ALL') ? ['ALL'] : [...new Set(submittedRoles)];
		const shareToFacebook = ['on', 'true', '1'].includes(normalize(req.body.shareToFacebook).toLowerCase());

		let error = '';
		if (!title || title.length > 180) error = 'Enter a notice title up to 180 characters.';
		else if (description.length > 5000) error = 'The optional description must be 5000 characters or fewer.';
		else if (!isValidNepaliDate(noticeDate)) error = 'Select a valid Nepali date.';
		else if (!recipientRoles.length) error = 'Choose at least one recipient role or select All roles.';

		if (error) {
			return res.status(400).render('notice/addnotice', {
				roleOptions,
				notices: await Notice.find({}).sort({ createdAt: -1 }).limit(50).lean(),
				todayNepaliDate: getTodayNepaliDate(),
				addedBy: normalize(req.user?.teacherName || req.user?.username),
				editingNotice: null,
				message: '',
				error,
				formValues: { title, description, noticeDate, recipientRoles, shareToFacebook }
			});
		}

		uploadedImages = await uploadImagesToAzure(req.files || []);
		const notice = await Notice.create({
			title,
			description,
			noticeDate,
			recipientRoles,
			images: uploadedImages,
			addedBy: normalize(req.user?.teacherName || req.user?.username),
			createdBy: req.user._id,
			shareToFacebook
		});

		await sendNoticePush(notice);
		return res.redirect(`/notice/${notice._id}?created=1`);
	} catch (error) {
		await deleteNoticeImages(uploadedImages);
		console.error('Unable to publish notice:', error);
		return res.status(400).send(error.message || 'Unable to publish the notice.');
	}
};

exports.updateNotice = async (req, res) => {
	let uploadedImages = [];
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Notice not found.');
		const notice = await Notice.findById(req.params.id);
		if (!notice) return res.status(404).send('Notice not found.');

		const roleOptions = await getRoleOptions();
		const validation = parseNoticeForm(req.body, roleOptions);
		if (validation.error) {
			return await renderAddNotice(req, res, {
				editingNotice: notice.toObject(),
				formValues: validation.values,
				error: validation.error,
				message: ''
			});
		}

		uploadedImages = await uploadImagesToAzure(req.files || []);
		if ((notice.images || []).length + uploadedImages.length > 5) {
			await deleteNoticeImages(uploadedImages);
			uploadedImages = [];
			return await renderAddNotice(req, res, {
				editingNotice: notice.toObject(),
				formValues: validation.values,
				error: 'A notice can contain up to 5 images total.',
				message: ''
			});
		}

		notice.set({ ...validation.values, images: [...(notice.images || []), ...uploadedImages] });
		await notice.save();
		return res.redirect('/notice?updated=1');
	} catch (error) {
		await deleteNoticeImages(uploadedImages);
		console.error('Unable to update notice:', error);
		return res.status(400).send(error.message || 'Unable to update the notice.');
	}
};

exports.deleteNotice = async (req, res) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Notice not found.');
		const notice = await Notice.findById(req.params.id);
		if (!notice) return res.status(404).send('Notice not found.');
		const images = notice.images || [];
		await Notice.deleteOne({ _id: notice._id });
		await deleteNoticeImages(images);
		return res.redirect('/notice?deleted=1');
	} catch (error) {
		console.error('Unable to delete notice:', error);
		return res.status(500).send('Unable to delete the notice.');
	}
};

exports.noticeList = async (req, res) => {
	try {
		const baseUrl = getPublicBaseUrl(req);
		const notices = await getNoticesForUser(req.user, isAdmin(req.user) ? 300 : 100);
		const noticesForView = notices.map(notice => ({ ...notice, facebookShareUrl: getFacebookShareUrl(baseUrl, notice._id) }));
		const message = req.query.updated ? 'Notice updated.' : req.query.deleted ? 'Notice deleted.' : '';
		return res.render('notice/noticedescription', { notices: noticesForView, notice: null, isAdmin: isAdmin(req.user), isPublicShare: false, message });
	} catch (error) {
		console.error('Unable to load notices:', error);
		return res.status(500).send('Unable to load notices.');
	}
};

const renderNotice = async (req, res, isPublicShare) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Notice not found.');
	const notice = await Notice.findById(req.params.id).lean();
	if (!notice) return res.status(404).send('Notice not found.');
	if (isPublicShare && !notice.shareToFacebook) return res.status(404).send('Notice not found.');
	if (!isPublicShare && !isNoticeVisibleToUser(notice, req.user)) return res.status(403).send('This notice is not available to your account.');

	const baseUrl = getPublicBaseUrl(req);
	const shareUrl = `${baseUrl}/notice/share/${notice._id}`;
	const ogImageUrl = notice.images?.[0]?.url || `${baseUrl}/image.png`;
	return res.render('notice/noticedescription', {
		notices: [],
		notice,
		isAdmin: isAdmin(req.user),
		isPublicShare,
		shareUrl,
		ogImageUrl,
		facebookShareUrl: getFacebookShareUrl(baseUrl, notice._id),
		message: req.query.created ? 'Notice published successfully.' : ''
	});
};

exports.noticeDescription = async (req, res) => {
	try {
		return await renderNotice(req, res, false);
	} catch (error) {
		console.error('Unable to load notice:', error);
		return res.status(500).send('Unable to load notice.');
	}
};

exports.publicNoticeShare = async (req, res) => {
	try {
		return await renderNotice(req, res, true);
	} catch (error) {
		console.error('Unable to load public notice preview:', error);
		return res.status(500).send('Unable to load notice preview.');
	}
};

exports.getRecentNotices = getNoticesForUser;
