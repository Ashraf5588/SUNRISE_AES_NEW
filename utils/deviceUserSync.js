const DEVICE_USER_QUERY_COMMAND = 'DATA QUERY USERINFO';
const MAX_IMPORT_PINS = 500;

const normalizePin = value => String(value ?? '').trim();
const isValidDeviceUserPin = value => /^[A-Za-z0-9._-]{1,64}$/.test(normalizePin(value));
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pinMatchesExactCaseInsensitive = value => new RegExp(`^${escapeRegExp(value)}$`, 'i');

function parseDeviceUserLines(payload) {
    const users = new Map();
    String(payload || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
        const row = line.trim();
        if (!/^USER(?:\s|$)/i.test(row)) return;
        const fields = {};
        row.slice(4).split('\t').forEach(part => {
            const separator = part.indexOf('=');
            if (separator <= 0) return;
            fields[part.slice(0, separator).trim().toLowerCase()] = part.slice(separator + 1).trim();
        });
        const pin = normalizePin(fields.pin);
        const name = String(fields.name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!isValidDeviceUserPin(pin) || !name || name.length > 120) return;
        users.set(pin, { pin, name });
    });
    return [...users.values()];
}

function normalizeSelectedPins(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMPORT_PINS) return null;
    const pins = [...new Set(value.map(normalizePin))];
    if (pins.some(pin => !isValidDeviceUserPin(pin))) return null;
    return pins;
}

module.exports = {
    DEVICE_USER_QUERY_COMMAND,
    MAX_IMPORT_PINS,
    normalizePin,
    isValidDeviceUserPin,
    pinMatchesExactCaseInsensitive,
    parseDeviceUserLines,
    normalizeSelectedPins
};
