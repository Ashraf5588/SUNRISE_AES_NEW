const assert = require('node:assert/strict');
const test = require('node:test');
const { buildStudentCallReport } = require('../utils/frontdeskCallReport');

test('builds selected student/month call counts with reasons and parent responses', () => {
    const report = buildStudentCallReport({
        regs: ['student-1', 'student-2'],
        months: ['Baisakh', 'Asar'],
        academicYear: '2083',
        selectedStudents: [
            { reg: 'student-1', name: 'Arav', roll: 1, studentClass: '5', section: 'A' },
            { reg: 'student-2', name: 'Arohi', roll: 2, studentClass: '5', section: 'A' }
        ],
        attendanceDocs: [
            {
                reg: 'student-1',
                name: 'Arav',
                attendance: [
                    {
                        academicYear: '2083',
                        month: 'Baisakh',
                        day: '1',
                        callReason: 'Sick',
                        parentResponse: 'Will rest at home',
                        callLoggedAt: '2026-04-14T09:00:00.000Z'
                    },
                    {
                        academicYear: '2083',
                        month: 'Ashadh',
                        day: '5',
                        callReason: 'No answer',
                        parentResponse: '',
                        callLoggedAt: '2026-06-18T09:00:00.000Z'
                    },
                    {
                        academicYear: '2082',
                        month: 'Baisakh',
                        day: '2',
                        callReason: 'Prior year',
                        parentResponse: 'Ignored',
                        callLoggedAt: '2025-04-14T09:00:00.000Z'
                    },
                    {
                        academicYear: '2083',
                        month: 'Jestha',
                        day: '3',
                        callReason: '',
                        parentResponse: '',
                        callLoggedAt: ''
                    }
                ]
            },
            {
                reg: 'unselected',
                attendance: [{
                    academicYear: '2083',
                    month: 'Baisakh',
                    day: '1',
                    callReason: 'Not selected',
                    parentResponse: 'Ignored'
                }]
            }
        ]
    });

    assert.equal(report.totalStudents, 2);
    assert.equal(report.totalCalls, 2);
    assert.equal(report.students[0].months.Baisakh.count, 1);
    assert.equal(report.students[0].months.Baisakh.calls[0].callReason, 'Sick');
    assert.equal(report.students[0].months.Baisakh.calls[0].parentResponse, 'Will rest at home');
    assert.equal(report.students[0].months.Asar.count, 1);
    assert.equal(report.students[0].months.Asar.calls[0].callReason, 'No answer');
    assert.equal(report.students[1].months.Baisakh.count, 0);
    assert.deepEqual(report.months, ['Baisakh', 'Asar']);
});

test('sorts students by class, section, and roll and retains selected students without calls', () => {
    const report = buildStudentCallReport({
        regs: ['reg-b', 'reg-a'],
        months: ['Jestha'],
        academicYear: '2083',
        selectedStudents: [
            { reg: 'reg-b', name: 'Bina', roll: 10, studentClass: '6', section: 'B' },
            { reg: 'reg-a', name: 'Anu', roll: 2, studentClass: '6', section: 'A' }
        ],
        attendanceDocs: []
    });

    assert.deepEqual(report.students.map(student => student.name), ['Anu', 'Bina']);
    assert.equal(report.students[0].sn, 1);
    assert.equal(report.students[1].months.Jestha.count, 0);
    assert.equal(report.totalCalls, 0);
});
