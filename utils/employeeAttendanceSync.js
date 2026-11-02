const crypto = require('crypto');

const isValidDeviceSerial = value => /^[A-Za-z0-9._-]{1,64}$/.test(String(value || '').trim());

function parseAttendanceRow(line, serialNumber) {
    const trimmedLine = String(line || '').trim();
    if (!trimmedLine || !isValidDeviceSerial(serialNumber)) return null;

    const delimiter = trimmedLine.includes('\t') ? '\t' : ',';
    const values = trimmedLine.split(delimiter).map(value => value.trim());
    if (values.length < 2 || !values[0] || values[0].length > 64) return null;

    let pin;
    let name;
    let timestamp;
    let status;
    let verifyMode;

    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(values[1])) {
        [pin, timestamp, status, verifyMode] = values;
    } else if (values.length >= 3 && /^\d{4}-\d{2}-\d{2}[ T]/.test(values[2])) {
        [pin, name, timestamp, verifyMode, status] = values;
    } else {
        return null;
    }

    const timestampMatch = String(timestamp || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (!timestampMatch) return null;

    const [, year, month, day, hour, minute, second] = timestampMatch;
    const punchTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    if (
        Number.isNaN(punchTime.getTime()) ||
        punchTime.getFullYear() !== Number(year) ||
        punchTime.getMonth() + 1 !== Number(month) ||
        punchTime.getDate() !== Number(day) ||
        punchTime.getHours() !== Number(hour) ||
        punchTime.getMinutes() !== Number(minute) ||
        punchTime.getSeconds() !== Number(second)
    ) return null;

    const document = { sn: String(serialNumber).trim(), pin, punchTime };
    if (name) document.name = name;

    for (const [field, rawValue] of [['status', status], ['verifyMode', verifyMode]]) {
        if (rawValue === undefined || rawValue === '') continue;
        if (!/^\d{1,3}$/.test(rawValue) || Number(rawValue) > 255) return null;
        document[field] = Number(rawValue);
    }

    return document;
}

function getAttendanceEventKey(record) {
    return crypto.createHash('sha256').update(JSON.stringify([
        record.sn,
        record.pin,
        new Date(record.punchTime).toISOString(),
        record.status ?? null,
        record.verifyMode ?? null
    ])).digest('hex');
}

function getAttendanceLogicalKey(record) {
    return JSON.stringify([
        record.sn,
        record.pin,
        new Date(record.punchTime).toISOString(),
        record.status ?? null,
        record.verifyMode ?? null
    ]);
}

function getAttendanceSyncStatus(run, now = new Date()) {
    if (run.failedRecords > 0) {
        return run.savedRecords > 0 || run.duplicateRecords > 0 ? 'partial' : 'failed';
    }
    if (run.receivedRecords > 0) {
        const lastReceivedAt = run.lastReceivedAt ? new Date(run.lastReceivedAt) : null;
        return lastReceivedAt && now - lastReceivedAt < 90_000 ? 'receiving' : 'records_received';
    }
    return now - new Date(run.requestedAt) > 10 * 60_000 ? 'no_data' : 'waiting';
}

module.exports = {
    getAttendanceEventKey,
    getAttendanceLogicalKey,
    getAttendanceSyncStatus,
    isValidDeviceSerial,
    parseAttendanceRow
};
