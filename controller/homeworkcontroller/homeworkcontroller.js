const mongoose = require('mongoose');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const bs = require('bikram-sambat-js');
const { BlobServiceClient } = require('@azure/storage-blob');
const { teacherSchema } = require('../../model/admin');
const { classSchema, newsubjectSchema } = require('../../model/adminschema');
const Homework = require('../../model/homeworkschema/homeworkschema');

const StudentClass = mongoose.models.studentClass || mongoose.model('studentClass', classSchema, 'classlist');
const Subject = mongoose.models.newsubject || mongoose.model('newsubject', newsubjectSchema, 'newsubject');
const User = mongoose.models.userlist || mongoose.model('userlist', teacherSchema, 'users');
const normalize = (value) => String(value ?? '').trim();
const normalizeKey = (value) => normalize(value).toLowerCase();
const isAdmin = (user) => String(user?.role || '').trim().toUpperCase() === 'ADMIN';
const renderPage = (res, data) => res.render('homework/homework', data);

const imageUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024, files: 5 },
	fileFilter: (req, file, callback) => {
		if (String(file.mimetype || '').startsWith('image/')) return callback(null, true);
		return callback(new Error('Upload image files only (JPG, PNG, WebP, or similar).'));
	}
});

exports.uploadHomeworkImages = (req, res, next) => imageUpload.array('homeworkImages', 5)(req, res, (error) => {
	if (!error) return next();
	if (error instanceof multer.MulterError) return res.status(400).send('Upload up to 5 images, each no larger than 5 MB.');
	return res.status(400).send(error.message || 'Unable to upload homework images.');
});

const getSubjectName = (subject) => normalize(subject?.newsubject || subject?.subject);

const buildClassOptions = async (user) => {
	const [classRows, subjectRows] = await Promise.all([
		StudentClass.find({}).select('studentClass section classorder').sort({ classorder: 1, studentClass: 1, section: 1 }).lean(),
		Subject.find({}).select('forClass subject newsubject').lean()
	]);
	const classMap = new Map();
	const ensureClass = (studentClass) => {
		const key = normalizeKey(studentClass);
		if (!classMap.has(key)) classMap.set(key, { studentClass: normalize(studentClass), classorder: Number.MAX_SAFE_INTEGER, sectionMap: new Map() });
		return classMap.get(key);
	};
	const ensureSection = (classOption, sectionName) => {
		const key = normalizeKey(sectionName);
		if (!classOption.sectionMap.has(key)) classOption.sectionMap.set(key, { name: normalize(sectionName), subjects: [] });
		return classOption.sectionMap.get(key);
	};

	if (isAdmin(user)) {
		for (const row of classRows) {
			const className = normalize(row.studentClass);
			const sectionName = normalize(row.section);
			if (!className || !sectionName) continue;
			const classOption = ensureClass(className);
			classOption.classorder = Number.isFinite(Number(row.classorder)) ? Number(row.classorder) : classOption.classorder;
			const sectionOption = ensureSection(classOption, sectionName);
			const subjectsForClass = subjectRows
				.filter((subject) => normalizeKey(subject.forClass) === normalizeKey(className))
				.map(getSubjectName)
				.filter(Boolean);
			sectionOption.subjects = [...new Set([...sectionOption.subjects, ...subjectsForClass])].sort((a, b) => a.localeCompare(b));
		}
	} else {
		const allowedSubjects = Array.isArray(user?.allowedSubjects) ? user.allowedSubjects : [];
		for (const access of allowedSubjects) {
			const className = normalize(access.studentClass);
			const sectionName = normalize(access.section);
			const subjectName = normalize(access.subject || access.newsubject);
			if (!className || !sectionName || !subjectName) continue;
			const matchingClass = classRows.find((row) => normalizeKey(row.studentClass) === normalizeKey(className) && normalizeKey(row.section) === normalizeKey(sectionName));
			if (!matchingClass) continue;
			const classOption = ensureClass(matchingClass.studentClass);
			classOption.classorder = Number.isFinite(Number(matchingClass.classorder)) ? Number(matchingClass.classorder) : classOption.classorder;
			const sectionOption = ensureSection(classOption, matchingClass.section);
			if (!sectionOption.subjects.some((subject) => normalizeKey(subject) === normalizeKey(subjectName))) sectionOption.subjects.push(subjectName);
		}
	}

	return [...classMap.values()]
		.sort((left, right) => left.classorder - right.classorder || left.studentClass.localeCompare(right.studentClass, undefined, { numeric: true, sensitivity: 'base' }))
		.map((classOption) => ({
			studentClass: classOption.studentClass,
			sections: [...classOption.sectionMap.values()]
				.map((section) => ({ ...section, subjects: section.subjects.sort((a, b) => a.localeCompare(b)) }))
				.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
		}));
};

const validateHomeworkFields = (body, classOptions) => {
	const studentClass = normalize(body.studentClass);
	const subject = normalize(body.subject);
	const homeworkType = normalize(body.homeworkType).toLowerCase();
	const title = normalize(body.title);
	const givenDate = normalize(body.homeworkGivenDate);
	const dueDate = normalize(body.dueDate);
	const submittedSections = Array.isArray(body.sections) ? body.sections : [body.sections].filter(Boolean);
	const sections = [...new Set(submittedSections.map(normalize).filter(Boolean))];
	const estimatedTimeInput = normalize(body.estimatedMinutes);
	const estimatedMinutes = estimatedTimeInput ? Number(estimatedTimeInput) : null;
	const classOption = classOptions.find((option) => normalizeKey(option.studentClass) === normalizeKey(studentClass));
	if (!classOption) return { error: 'Choose a class you are permitted to assign homework to.' };
	if (!sections.length) return { error: 'Choose at least one section.' };
	const sectionOptions = sections.map((sectionName) => classOption.sections.find((option) => normalizeKey(option.name) === normalizeKey(sectionName)));
	if (sectionOptions.some((option) => !option)) return { error: 'One or more selected sections are not permitted for this class.' };
	if (!subject || sectionOptions.some((section) => !section.subjects.some((allowedSubject) => normalizeKey(allowedSubject) === normalizeKey(subject)))) {
		return { error: 'Choose a subject permitted for every selected section.' };
	}
	if (!['read', 'write'].includes(homeworkType)) return { error: 'Choose Read or Write as the homework type.' };
	if (!title || title.length > 180) return { error: 'Enter a homework title up to 180 characters.' };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(givenDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Choose valid Nepali given and due dates.' };

	let givenDateAd;
	let dueDateAd;
	try {
		givenDateAd = String(bs.BSToAD(givenDate) || '').trim();
		dueDateAd = String(bs.BSToAD(dueDate) || '').trim();
	} catch (error) {
		return { error: 'Choose valid Nepali given and due dates.' };
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(givenDateAd) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateAd) || dueDateAd < givenDateAd) {
		return { error: 'The due date must be valid and cannot be before the given date.' };
	}
	if (givenDate.slice(0, 10) !== String(bs.ADToBS(new Date(`${givenDateAd}T00:00:00Z`)) || '').slice(0, 10)
		|| dueDate.slice(0, 10) !== String(bs.ADToBS(new Date(`${dueDateAd}T00:00:00Z`)) || '').slice(0, 10)) {
		return { error: 'Choose valid Nepali given and due dates.' };
	}
	if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) {
		return { error: 'Estimated time must be a whole number of minutes from 1 to 1440.' };
	}

	const canonicalSubject = sectionOptions[0].subjects.find((allowedSubject) => normalizeKey(allowedSubject) === normalizeKey(subject));
	return { value: { studentClass: classOption.studentClass, sections: sectionOptions.map((section) => section.name), subject: canonicalSubject, homeworkType, title, homeworkGivenDate: givenDate, dueDate, estimatedMinutes } };
};

const uploadImagesToAzure = async (files) => {
	if (!files?.length) return [];
	const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
	if (!connectionString) throw new Error('Azure image storage is not configured.');
	const containerName = process.env.AZURE_HOMEWORK_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
	const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
	const uploadedImages = [];
	try {
		for (const file of files) {
			const imageBuffer = await sharp(file.buffer)
				.rotate()
				.resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 82 })
				.toBuffer();
			const blobName = `homework/${Date.now()}-${crypto.randomUUID()}.webp`;
			const blobClient = containerClient.getBlockBlobClient(blobName);
			await blobClient.uploadData(imageBuffer, { blobHTTPHeaders: { blobContentType: 'image/webp' } });
			uploadedImages.push({ url: blobClient.url, blobName, originalName: normalize(file.originalname).slice(0, 180) });
		}
		return uploadedImages;
	} catch (error) {
		await Promise.all(uploadedImages.map((image) => containerClient.getBlockBlobClient(image.blobName).deleteIfExists().catch(() => {})));
		throw error;
	}
};

const deleteHomeworkImages = async (images = []) => {
	const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
	if (!connectionString || !images.length) return;
	try {
		const containerName = process.env.AZURE_HOMEWORK_CONTAINER_NAME || process.env.AZURE_CONTAINER_NAME || 'sunriseimages';
		const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
		await Promise.all(images.filter((image) => image.blobName).map((image) => containerClient.getBlockBlobClient(image.blobName).deleteIfExists()));
	} catch (error) {
		console.error('Unable to delete homework images from Azure:', error.message);
	}
};

const canManageHomework = (user, homework) => isAdmin(user) || String(homework.createdBy) === String(user?._id);

const renderHomeworkPage = async (req, res, editingHomework = null) => {
	const admin = isAdmin(req.user);
	const [classOptions, homeworks] = await Promise.all([
		buildClassOptions(req.user),
		Homework.find(admin ? {} : { createdBy: req.user._id }).sort({ homeworkGivenDate: -1, createdAt: -1 }).limit(300).lean()
	]);
	return renderPage(res, {
		classOptions,
		homeworks,
		editingHomework,
		isAdmin: admin,
		currentUserId: String(req.user._id),
		givenBy: normalize(req.user.username || req.user.teacherName),
		todayNepaliDate: String(bs.ADToBS(new Date()) || '').trim(),
		message: req.query.saved ? 'Homework saved.' : req.query.updated ? 'Homework updated.' : req.query.deleted ? 'Homework deleted.' : ''
	});
};

exports.homeworkPage = async (req, res) => {
	try {
		return await renderHomeworkPage(req, res);
	} catch (error) {
		console.error('Unable to load homework:', error);
		return res.status(500).send('Unable to load homework.');
	}
};

exports.createHomework = async (req, res) => {
	let uploadedImages = [];
	try {
		const classOptions = await buildClassOptions(req.user);
		const validation = validateHomeworkFields(req.body, classOptions);
		if (validation.error) return res.status(400).send(validation.error);
		uploadedImages = await uploadImagesToAzure(req.files || []);
		await Homework.create({
			...validation.value,
			givenBy: normalize(req.user.username || req.user.teacherName),
			createdBy: req.user._id,
			images: uploadedImages
		});
		return res.redirect('/homework?saved=1');
	} catch (error) {
		await deleteHomeworkImages(uploadedImages);
		console.error('Unable to create homework:', error);
		return res.status(400).send(error.message || 'Unable to save homework.');
	}
};

exports.editHomeworkPage = async (req, res) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Homework not found.');
		const homework = await Homework.findById(req.params.id).lean();
		if (!homework) return res.status(404).send('Homework not found.');
		if (!canManageHomework(req.user, homework)) return res.status(403).send('You cannot edit this homework.');
		return await renderHomeworkPage(req, res, homework);
	} catch (error) {
		console.error('Unable to load homework for editing:', error);
		return res.status(500).send('Unable to load homework for editing.');
	}
};

exports.updateHomework = async (req, res) => {
	let uploadedImages = [];
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Homework not found.');
		const homework = await Homework.findById(req.params.id);
		if (!homework) return res.status(404).send('Homework not found.');
		if (!canManageHomework(req.user, homework)) return res.status(403).send('You cannot edit this homework.');
		const classOptions = await buildClassOptions(req.user);
		const validation = validateHomeworkFields(req.body, classOptions);
		if (validation.error) return res.status(400).send(validation.error);
		uploadedImages = await uploadImagesToAzure(req.files || []);
		homework.set({
			...validation.value,
			images: [...(homework.images || []), ...uploadedImages]
		});
		await homework.save();
		return res.redirect('/homework?updated=1');
	} catch (error) {
		await deleteHomeworkImages(uploadedImages);
		console.error('Unable to update homework:', error);
		return res.status(400).send(error.message || 'Unable to update homework.');
	}
};

exports.deleteHomework = async (req, res) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Homework not found.');
		const homework = await Homework.findById(req.params.id);
		if (!homework) return res.status(404).send('Homework not found.');
		if (!canManageHomework(req.user, homework)) return res.status(403).send('You cannot delete this homework.');
		const images = homework.images || [];
		await Homework.deleteOne({ _id: homework._id });
		await deleteHomeworkImages(images);
		return res.redirect('/homework?deleted=1');
	} catch (error) {
		console.error('Unable to delete homework:', error);
		return res.status(500).send('Unable to delete homework.');
	}
};
