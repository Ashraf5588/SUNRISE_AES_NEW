const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
	title: { type: String, required: true, trim: true, maxlength: 180 },
	description: { type: String, default: '', trim: true, maxlength: 5000 },
	noticeDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
	recipientRoles: { type: [String], required: true, validate: roles => roles.length > 0 },
	images: [{
		url: { type: String, required: true },
		blobName: { type: String, required: true },
		originalName: { type: String, default: '' }
	}],
	addedBy: { type: String, required: true, trim: true, maxlength: 180 },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'userlist', required: true },
	shareToFacebook: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.Notice || mongoose.model('Notice', noticeSchema, 'notices');
