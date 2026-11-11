const assert = require('node:assert/strict');
const test = require('node:test');
const bs = require('../utils/bikramSambat');
const { buildEmployeeAttendanceRangeReport } = require('../utils/employeeAttendanceRangeReport');

const adDate = dateBs => String(bs.BSToAD(dateBs));
const kathmanduDateTime = (dateBs, time) => {
    const [year, month, day] = adDate(dateBs).split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 45));
};
const makeReport = (overrides = {}) => buildEmployeeAttendanceRangeReport({
    employees: [],
    punches: [],
    approvedLeaves: [],
    holidays: [],
    mode: 'range',
    startDateBs: '2083-01-01',
    endDateBs: '2083-01-01',
    now: kathmanduDateTime('2083-02-01', '18:00'),
    ...overrides
});

test('builds inclusive Bikram Sambat date ranges and rejects invalid or overlong ranges', () => {
    const report = makeReport({ endDateBs: '2083-01-03' });
    assert.deepEqual(report.days.map(day => day.nepaliDate), ['2083-01-01', '2083-01-02', '2083-01-03']);
    assert.throws(() => makeReport({ startDateBs: 'invalid' }), /valid Bikram Sambat dates/);
    assert.throws(() => makeReport({ endDateBs: '2084-05-01' }), /366 days or less/);
});

test('returns only selected noncontiguous Bikram Sambat months', () => {
    const report = makeReport({
        mode: 'months',
        year: '2083',
        monthNumbers: [1, 3]
    });
    const months = new Set(report.days.map(day => day.nepaliDate.slice(5, 7)));
    assert.deepEqual([...months], ['01', '03']);
    assert.equal(report.days[0].nepaliDate, '2083-01-01');
    assert.equal(report.days[report.days.length - 1].nepaliDate.slice(0, 7), '2083-03');
});

test('classifies attendance, partial misses, holidays, approved leave, and full absences', () => {
    const employee = {
        _id: 'staff-1',
        employeeCode: '14',
        deviceCode: 'device-14',
        staffName: 'Sample Staff',
        department: 'Teaching',
        midTime: '13:00',
        plannedIn: '09:00',
        plannedOut: '17:00'
    };
    const report = makeReport({
        employees: [employee],
        endDateBs: '2083-01-05',
        punches: [
            { _id: 'p1', pin: '14', punchTime: kathmanduDateTime('2083-01-01', '09:15') },
            { _id: 'p2', pin: 'device-14', punchTime: kathmanduDateTime('2083-01-01', '16:30') },
            { _id: 'p3', pin: '14', punchTime: kathmanduDateTime('2083-01-02', '09:00') }
        ],
        holidays: [{ dateBs: '2083-01-03', name: 'School holiday' }],
        approvedLeaves: [{
            employeeCode: '14',
            employeeName: 'Sample Staff',
            leaveTypeName: 'Casual leave',
            startDateNepali: '2083-01-04',
            endDateNepali: '2083-01-04'
        }]
    });
    const days = report.employees[0].days;
    assert.deepEqual(days.map(day => day.status), ['present', 'missed', 'holiday', 'leave', 'absent']);
    assert.equal(days[0].inTime, '09:15');
    assert.equal(days[0].outTime, '16:30');
    assert.equal(days[0].lateTime, '15 min');
    assert.equal(days[0].earlyOut, '30 min');
    assert.equal(days[1].remarks, 'Missed evening');
    assert.equal(days[2].remarks, 'School holiday');
    assert.equal(days[3].remarks, 'Casual leave');
    assert.equal(days[4].remarks, 'Absent');
});

test('assigns a punch at Kathmandu midnight to the correct BS report date', () => {
    const previousAdDay = new Date(`${adDate('2083-01-01')}T00:00:00.000Z`);
    previousAdDay.setUTCDate(previousAdDay.getUTCDate() - 1);
    const midnightPunch = new Date(previousAdDay);
    midnightPunch.setUTCHours(18, 15, 0, 0);
    const report = makeReport({
        employees: [{
            _id: 'staff-2',
            employeeCode: '22',
            staffName: 'Midnight Staff',
            midTime: '13:00'
        }],
        punches: [{ pin: '22', punchTime: midnightPunch }]
    });
    assert.equal(report.employees[0].days[0].inTime, '00:00');
    assert.equal(report.employees[0].days[0].status, 'missed');
});

test('does not mark future attendance or not-yet-due punches as missed', () => {
    const employee = {
        _id: 'staff-3',
        employeeCode: '30',
        staffName: 'Current Staff',
        midTime: '13:00',
        plannedOut: '17:00'
    };
    const report = makeReport({
        employees: [employee],
        endDateBs: '2083-01-02',
        now: kathmanduDateTime('2083-01-01', '10:00')
    });
    assert.deepEqual(report.employees[0].days.map(day => day.status), ['upcoming', 'upcoming']);

    const completedDayReport = makeReport({
        employees: [employee],
        now: kathmanduDateTime('2083-01-01', '18:00')
    });
    assert.equal(completedDayReport.employees[0].days[0].status, 'absent');
});
