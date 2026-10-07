const assert = require('node:assert/strict');
const test = require('node:test');
const { buildLeaveAllocations } = require('../utils/leaveCalculations');

const date = value => new Date(`${value}T00:00:00.000Z`);

test('allocates early or late leave as half a day', () => {
    const allocations = buildLeaveAllocations(date('2026-10-07'), date('2026-10-07'), { halfDay: true });

    assert.equal([...allocations.months.values()][0], 0.5);
    assert.equal([...allocations.years.values()][0], 0.5);
});

test('does not allow a half-day request to span multiple dates', () => {
    assert.throws(() => buildLeaveAllocations(date('2026-10-07'), date('2026-10-08'), { halfDay: true }));
});

test('excludes configured weekend and holiday dates when sandwich leave is off', () => {
    const allocations = buildLeaveAllocations(date('2026-10-09'), date('2026-10-12'), {
        excludedDates: ['2026-10-10', '2026-10-11']
    });

    assert.equal([...allocations.months.values()][0], 2);
    assert.equal([...allocations.years.values()][0], 2);
});