const assert = require('node:assert/strict');
const test = require('node:test');
const {
    allocateAbsentDaysToQuotas,
    buildLeaveAllocations,
    getAttendanceAbsenceDates
} = require('../utils/leaveCalculations');
const bs = require('../utils/bikramSambat');

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

test('identifies full-day absences while excluding leave, holidays, Saturdays, and employee punches', () => {
    const adDate = value => new Date(`${value}T12:00:00.000Z`);
    const attendanceRecords = [];
    for (let day = 5; day <= 11; day += 1) {
        const key = `2026-10-${String(day).padStart(2, '0')}`;
        attendanceRecords.push({
            pin: 'OTHER-EMPLOYEE',
            punchTime: day === 5 ? new Date('2026-10-05T00:30:00+05:45') : adDate(key),
            source: 'Device'
        });
    }
    attendanceRecords.push({
        pin: 'EMP-1',
        punchTime: adDate('2026-10-06'),
        source: 'Device'
    });

    const holidayBs = String(bs.ADToBS(adDate('2026-10-07'))).slice(0, 10);
    const leaveStartBs = String(bs.ADToBS(adDate('2026-10-08'))).slice(0, 10);
    const absences = getAttendanceAbsenceDates({
        startDate: date('2026-10-05'),
        endDate: date('2026-10-12'),
        employeePins: ['EMP-1'],
        attendanceRecords,
        holidayDates: [holidayBs],
        leaveRecords: [{
            status: 'pending',
            startDateNepali: leaveStartBs,
            endDateNepali: leaveStartBs
        }],
        now: adDate('2026-10-12')
    });

    assert.deepEqual(absences.map(absence => absence.adDate), ['2026-10-05', '2026-10-09', '2026-10-11']);
});

test('identifies an absent day even when no device punches were uploaded that day', () => {
    const dateRecords = ['2026-10-12', '2026-10-13', '2026-10-14'].map(adDate => ({
        pin: 'OTHER-EMPLOYEE',
        punchTime: new Date(`${adDate}T12:00:00.000Z`),
        source: 'Device'
    }));
    const options = {
        startDate: date('2026-10-12'),
        endDate: date('2026-10-15'),
        employeePins: ['EMP-1'],
        attendanceRecords: dateRecords,
        now: new Date('2026-10-13T12:00:00.000Z')
    };

    assert.deepEqual(
        getAttendanceAbsenceDates(options).map(absence => absence.adDate),
        ['2026-10-12']
    );
    assert.deepEqual(
        getAttendanceAbsenceDates({
            ...options,
            attendanceRecords: []
        }),
        [{
            adDate: '2026-10-12',
            nepaliDate: String(bs.ADToBS(date('2026-10-12'))).slice(0, 10),
            year: String(bs.ADToBS(date('2026-10-12'))).slice(0, 4),
            month: String(bs.ADToBS(date('2026-10-12'))).slice(0, 7)
        }]
    );
});

test('counts Ashraf example date BS 2083-05-15 as absent without a submitted leave form', () => {
    const absences = getAttendanceAbsenceDates({
        startDate: date('2026-08-31'),
        endDate: date('2026-09-01'),
        employeePins: ['134'],
        attendanceRecords: [],
        now: date('2026-11-10')
    });

    assert.deepEqual(absences.map(absence => absence.nepaliDate), ['2083-05-15']);
});

test('allocates absent days across available quotas without exceeding limits', () => {
    const absences = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(adDate => ({
        adDate,
        nepaliDate: '2083-06-19',
        year: '2083',
        month: '2083-06'
    }));
    const result = allocateAbsentDaysToQuotas(absences, [
        {
            key: 'annual',
            name: 'Annual',
            yearlyLimit: 5,
            monthlyLimit: null,
            usedYears: new Map([['2083', 4]]),
            usedMonths: new Map()
        },
        {
            key: 'sick',
            name: 'Sick',
            yearlyLimit: null,
            monthlyLimit: 2,
            usedYears: new Map(),
            usedMonths: new Map()
        }
    ]);

    assert.equal(result.allocations.get('annual').years.get('2083'), 1);
    assert.equal(result.allocations.get('sick').months.get('2083-06'), 2);
    assert.equal(result.allocations.get('annual').days + result.allocations.get('sick').days, 3);
    assert.equal(result.unallocatedDays, 1);
});