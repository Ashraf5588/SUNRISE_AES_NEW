const mongoose = require('mongoose');

const deviceUserSchema = new mongoose.Schema({
    organization_id: { type: String, required: true, trim: true },
    device_sn: { type: String, required: true, trim: true },
    pin: { type: String, required: true, trim: true, maxlength: 64 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['pending', 'imported'], default: 'pending', required: true },
    synced_at: { type: Date, default: Date.now, required: true }
}, { versionKey: false, collection: 'device_users' });

deviceUserSchema.index({ device_sn: 1, pin: 1 }, { unique: true });
deviceUserSchema.index({ organization_id: 1, device_sn: 1, status: 1 });

module.exports = mongoose.models.DeviceUser ||
    mongoose.model('DeviceUser', deviceUserSchema);
