const assert = require('node:assert/strict');
const test = require('node:test');
const bs = require('../utils/bikramSambat');
const {
    buildMonthWiseAttendanceReport,
    getMonthWiseReportMonthOptions
} = require('../utils/monthWiseAttendanceReport');

const utcDate = value => new Date(value.includes('T') ? value : `${value}T12:00:00.000Z`);
const adDateForBs = value => new Date(`${bs.BSToAD(value)}T12:00:00.000Z`);

test('defaults month options through the current Bikram Sambat month', () => {
    const now = adDateForBs('2083-03-10');
    assert.deepEqual(
        getMonthWiseReportMonthOptions('2083', now).map(month => month.number),
        [1, 2, 3]
    );
    assert.equal(getMonthWiseReportMonthOptions('2082', now).length, 12);
});

test('counts monthly attendance, partial misses, full absences, approved leave, holidays, and lateness', () => {
    const year = '2083';
    const month = 1;
    const firstAd = String(bs.BSToAD('2083-01-01'));
    const firstDate = new Date(`${firstAd}T12:00:00.000Z`);
    const dayKey = offset => {
        const date = new Date(firstDate);
        date.setUTCDate(date.getUTCDate() + offset);
        return date.toISOString().slice(0, 10);
    };
    const employee = {
        _id: 'staff-1',
        employeeCode: '102',
        deviceCode: 'PIN-102',
        staffName: 'Sample Staff',
        midTime: '13:00',
        plannedIn: '09:00',
        plannedOut: '17:00'
    };
    const attendancePunches = [
        { _id: 'p1', pin: '102', punchTime: utcDate(`${dayKey(0)}T03:30:00Z`), isLate: true, lateMinutes: 15 },
        { _id: 'p2', pin: '102', punchTime: utcDate(`${dayKey(0)}T11:30:00Z`), isEarly: true, earlyMinutes: 30 },
        { _id: 'p3', pin: 'PIN-102', punchTime: utcDate(`${dayKey(1)}T03:00:00Z`) },
        { _id: 'p4', pin: 'PIN-102', punchTime: utcDate(`${dayKey(3)}T03:30:00Z`) }
    ];
    const report = buildMonthWiseAttendanceReport({
        employees: [employee],
        punches: attendancePunches,
        approvedLeaves: [{
            employeeCode: '102',
            employeeName: 'Sample Staff',
            startDateNepali: String(bs.ADToBS(dayKey(3))).slice(0, 10),
            endDateNepali: String(bs.ADToBS(dayKey(3))).slice(0, 10)
        }],
        holidays: [{ dateBs: String(bs.ADToBS(dayKey(2))).slice(0, 10), name: 'Weekend' }],
        year,
        monthNumbers: [month],
        now: adDateForBs('2083-02-01')
    });

    assert.equal(report.months[0].name, 'Baisakh');
    assert.equal(report.months[0].holidayCount, 1);
    assert.equal(report.employees[0].monthly[0].counts.present, 2);
    assert.equal(report.employees[0].monthly[0].counts.missed, 1);
    assert.equal(
        report.employees[0].monthly[0].counts.absent,
        report.employees[0].monthly[0].days.length - 4
    );
    assert.equal(report.employees[0].monthly[0].counts.leave, 1);
    assert.equal(report.employees[0].monthly[0].counts.lateIn, 1);
    assert.equal(report.employees[0].monthly[0].counts.earlyOut, 1);
    assert.deepEqual(report.totals[0], report.employees[0].monthly[0].counts);
});

test('rejects future months and invalid report parameters', () => {
    assert.throws(() => buildMonthWiseAttendanceReport({
        employees: [],
        punches: [],
        approvedLeaves: [],
        holidays: [],
        year: '2083',
        monthNumbers: [4],
        now: adDateForBs('2083-03-10')
    }), /Future months/);
    assert.throws(() => buildMonthWiseAttendanceReport({
        employees: [],
        punches: [],
        approvedLeaves: [],
        holidays: [],
        year: 'bad',
        monthNumbers: [1]
    }), /valid Bikram Sambat year/);
});

test('does not count the current or future dates as attendance absences', () => {
    const now = adDateForBs('2083-01-03');
    const report = buildMonthWiseAttendanceReport({
        employees: [{
            _id: 'staff-2',
            employeeCode: '200',
            staffName: 'Current Staff',
            midTime: '13:00'
        }],
        punches: [],
        approvedLeaves: [],
        holidays: [],
        year: '2083',
        monthNumbers: [1],
        now
    });

    assert.equal(report.employees[0].monthly[0].counts.absent, 2);
});
