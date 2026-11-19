const mongoose = require('mongoose');

const deviceCommandSchema = new mongoose.Schema({
    organization_id: { type: String, required: true, trim: true },
    device_sn: { type: String, required: true, trim: true },
    cmd_id: { type: Number, required: true, min: 1 },
    command: { type: String, required: true, trim: true, maxlength: 200 },
    active_key: { type: String, trim: true, default: undefined },
    status: { type: String, enum: ['pending', 'sent', 'completed'], default: 'pending', required: true },
    created_at: { type: Date, default: Date.now, required: true },
    sent_at: { type: Date },
    completed_at: { type: Date },
    return_code: { type: Number }
}, { versionKey: false, collection: 'device_commands' });

deviceCommandSchema.index(
    { organization_id: 1, device_sn: 1, cmd_id: 1 },
    { unique: true }
);
deviceCommandSchema.index({ organization_id: 1, device_sn: 1, status: 1, created_at: 1 });
deviceCommandSchema.index({ active_key: 1 }, { unique: true, sparse: true });

module.exports = {
    DeviceCommand: mongoose.models.DeviceCommand ||
        mongoose.model('DeviceCommand', deviceCommandSchema)
};
