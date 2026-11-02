const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getAttendanceEventKey,
    getAttendanceLogicalKey,
    getAttendanceSyncStatus,
    isValidDeviceSerial,
    parseAttendanceRow
} = require('../utils/employeeAttendanceSync');

test('parses valid old tab-separated punches without restricting punch dates', () => {
    const punch = parseAttendanceRow('0012\t2019-01-03 08:15:00\t0\t1', 'ZK-DEVICE-1');

    assert.equal(punch.pin, '0012');
    assert.equal(punch.status, 0);
    assert.equal(punch.verifyMode, 1);
    assert.equal(punch.punchTime.getFullYear(), 2019);
});

test('parses the legacy comma-separated attendance format', () => {
    const punch = parseAttendanceRow('0012,Example,2020-04-05 09:00:00,15,1', 'ZK.DEVICE_2');

    assert.equal(punch.name, 'Example');
    assert.equal(punch.status, 1);
    assert.equal(punch.verifyMode, 15);
});

test('rejects invalid timestamps, malformed fields, and invalid device serials', () => {
    assert.equal(parseAttendanceRow('1\t2026-02-30 08:15:00\t0\t1', 'ZK1'), null);
    assert.equal(parseAttendanceRow('1\t2026-11-02 08:15:00\tx\t1', 'ZK1'), null);
    assert.equal(parseAttendanceRow('1\t2026-11-02 08:15:00\t0\t1', 'SN/invalid'), null);
    assert.equal(isValidDeviceSerial(''), false);
    assert.equal(isValidDeviceSerial('valid-SN_01.2'), true);
});

test('event keys are stable and distinguish separate punch events', () => {
    const event = { sn: 'ZK1', pin: '0012', punchTime: new Date('2026-11-02T08:15:00'), status: 0, verifyMode: 1 };
    const repeated = { ...event, punchTime: new Date(event.punchTime) };

    assert.equal(getAttendanceEventKey(event), getAttendanceEventKey(repeated));
    assert.equal(getAttendanceLogicalKey(event), getAttendanceLogicalKey(repeated));
    assert.notEqual(getAttendanceEventKey(event), getAttendanceEventKey({ ...event, status: 1 }));
});

test('reports observation progress without implying an unconfirmed replay completed', () => {
    const now = new Date('2026-11-02T10:00:00Z');
    const run = { requestedAt: now, receivedRecords: 0, savedRecords: 0, duplicateRecords: 0, failedRecords: 0 };
    assert.equal(getAttendanceSyncStatus(run, now), 'waiting');
    assert.equal(getAttendanceSyncStatus({ ...run, receivedRecords: 1, savedRecords: 1, lastReceivedAt: now }, now), 'receiving');
    assert.equal(getAttendanceSyncStatus({ ...run, requestedAt: new Date(now - 11 * 60_000) }, now), 'no_data');
    assert.equal(getAttendanceSyncStatus({ ...run, failedRecords: 1 }, now), 'failed');
});
