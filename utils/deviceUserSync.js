const DEVICE_USER_QUERY_COMMAND = 'DATA QUERY USERINFO';
const ALLOWED_DEVICE_USER_PRIVILEGES = new Set([0, 2, 6, 14]);
const MAX_IMPORT_PINS = 500;

const normalizePin = value => String(value ?? '').trim();
const isValidDeviceUserPin = value => /^[A-Za-z0-9._-]{1,64}$/.test(normalizePin(value));
const isValidNumericDeviceUserPin = value => /^\d{1,64}$/.test(normalizePin(value));
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pinMatchesExactCaseInsensitive = value => new RegExp(`^${escapeRegExp(value)}$`, 'i');

function buildDeviceUserPushCommand({ pin: rawPin, name: rawName, privilege, isManager }) {
    const pin = normalizePin(rawPin);
    if (!isValidNumericDeviceUserPin(pin)) {
        throw new Error('The employee Device PIN must be a non-empty numeric string.');
    }

    const name = Array.from(
        String(rawName ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
    ).slice(0, 24).join('');
    if (!name) throw new Error('The employee name is required to send a user to the device.');

    const requestedPrivilege = typeof privilege === 'string' && /^\d+$/.test(privilege)
        ? Number(privilege)
        : privilege;
    const appliedPrivilege = Number.isInteger(requestedPrivilege)
        && ALLOWED_DEVICE_USER_PRIVILEGES.has(requestedPrivilege)
        ? requestedPrivilege
        : (isManager === true ? 14 : 0);

    return {
        pin,
        name,
        privilege: appliedPrivilege,
        command: `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${appliedPrivilege}\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000`
    };
}

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
    ALLOWED_DEVICE_USER_PRIVILEGES,
    MAX_IMPORT_PINS,
    normalizePin,
    isValidDeviceUserPin,
    isValidNumericDeviceUserPin,
    buildDeviceUserPushCommand,
    pinMatchesExactCaseInsensitive,
    parseDeviceUserLines,
    normalizeSelectedPins
};
