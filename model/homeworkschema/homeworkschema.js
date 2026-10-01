const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema({
	studentClass: { type: String, required: true, trim: true },
	sections: [{ type: String, required: true, trim: true }],
	subject: { type: String, required: true, trim: true },
	homeworkGivenDate: { type: String, required: true, trim: true },
	dueDate: { type: String, required: true, trim: true },
	homeworkType: { type: String, enum: ['read', 'write'], required: true },
	estimatedMinutes: { type: Number, min: 1, default: null },
	title: { type: String, required: true, trim: true, maxlength: 180 },
	givenBy: { type: String, required: true, trim: true },
	createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
	images: [{
		url: { type: String, required: true },
		blobName: { type: String, required: true },
		originalName: { type: String, trim: true, default: '' }
	}]
}, { timestamps: true });

homeworkSchema.index({ homeworkGivenDate: -1, createdAt: -1 });
homeworkSchema.index({ studentClass: 1, sections: 1, subject: 1 });

module.exports = mongoose.models.Homework || mongoose.model('Homework', homeworkSchema, 'homeworks');
