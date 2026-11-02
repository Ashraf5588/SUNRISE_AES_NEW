const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getAttendanceEventKey,
    getAttendanceLogicalKey,
    getAttendanceRequestSource,
    getAttendanceSyncStatus,
    getDeviceOnlineTimeoutMs,
    isValidDeviceSerial,
    isAttendanceDeviceOnline,
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

test('marks command-line requests as simulated or unknown without asserting device identity', () => {
    assert.equal(getAttendanceRequestSource('curl/8.1.0'), 'likely_simulated');
    assert.equal(getAttendanceRequestSource('ZKTeco'), 'unverified');
    assert.equal(getAttendanceRequestSource(''), 'unverified');
});

test('calculates device online status using a configurable timeout', () => {
    const now = new Date('2026-11-02T10:00:00Z');

    assert.equal(getDeviceOnlineTimeoutMs('60000'), 60_000);
    assert.equal(getDeviceOnlineTimeoutMs('invalid'), 5 * 60_000);
    assert.equal(isAttendanceDeviceOnline(new Date(now - 30_000), now, 60_000), true);
    assert.equal(isAttendanceDeviceOnline(new Date(now - 61_000), now, 60_000), false);
    assert.equal(isAttendanceDeviceOnline(null, now, 60_000), false);
});
