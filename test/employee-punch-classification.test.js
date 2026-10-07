const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyPunchesByMidTime } = require('../utils/employeePunchClassification');

const punchAt = (time, status) => ({
    punchTime: new Date(`2026-10-07T${time}:00`),
    status
});

test('classifies an early device OUT as IN when no IN exists', () => {
    const { checkIn, checkOut } = classifyPunchesByMidTime([punchAt('08:02', 1)], '13:00');

    assert.equal(checkIn.punchTime.getHours(), 8);
    assert.equal(checkOut, null);
});

test('uses the employee mid-time and assigns the first punch at or after it as OUT', () => {
    const punches = [punchAt('11:30', 0), punchAt('12:00', 1), punchAt('12:15', 0)];
    const { checkIn, checkOut } = classifyPunchesByMidTime(punches, '12:00');

    assert.equal(checkIn.punchTime.getHours(), 11);
    assert.equal(checkOut.punchTime.getHours(), 12);
    assert.equal(checkOut.punchTime.getMinutes(), 0);
});

test('keeps a late-only punch as OUT and ignores subsequent punches in either slot', () => {
    const punches = [punchAt('14:00', 0), punchAt('14:10', 1), punchAt('08:00', 1), punchAt('08:05', 0)];
    const { checkIn, checkOut } = classifyPunchesByMidTime(punches, '13:00');

    assert.equal(checkIn.punchTime.getHours(), 8);
    assert.equal(checkOut.punchTime.getHours(), 14);
    assert.equal(checkOut.punchTime.getMinutes(), 0);
});