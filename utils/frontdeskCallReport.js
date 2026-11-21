const MONTH_ALIASES = {
    ashar: 'asar',
    ashadh: 'asar',
    ashoj: 'ashwin'
};

const normalizeMonth = value => {
    const month = String(value || '').trim().toLowerCase();
    return MONTH_ALIASES[month] || month;
};

function buildStudentCallReport({ regs, months, academicYear, selectedStudents, attendanceDocs }) {
    const studentByReg = new Map(selectedStudents.map(student => [String(student.reg || '').trim(), student]));
    const monthAliases = new Map();
    months.forEach(month => monthAliases.set(normalizeMonth(month), month));
    if (months.includes('Asar')) {
        ['ashar', 'ashadh'].forEach(alias => monthAliases.set(alias, 'Asar'));
    }
    if (months.includes('Ashwin')) monthAliases.set('ashoj', 'Ashwin');
    const entriesByReg = new Map(regs.map(reg => [reg, new Map(months.map(month => [month, []]))]));
    const attendanceByReg = new Map();

    attendanceDocs.forEach(doc => {
        const reg = String(doc.reg || '').trim();
        const monthlyEntries = entriesByReg.get(reg);
        if (!monthlyEntries) return;
        if (!attendanceByReg.has(reg)) attendanceByReg.set(reg, doc);
        (Array.isArray(doc.attendance) ? doc.attendance : []).forEach(entry => {
            if (String(entry?.academicYear || '').trim() !== academicYear) return;
            if (!entry || !(entry.callReason || entry.parentResponse || entry.callLoggedAt)) return;
            const month = monthAliases.get(normalizeMonth(entry.month));
            if (!month) return;
            monthlyEntries.get(month).push({
                day: String(entry.day || ''),
                callReason: String(entry.callReason || ''),
                parentResponse: String(entry.parentResponse || ''),
                callLoggedAt: String(entry.callLoggedAt || '')
            });
        });
    });

    const students = regs.map(reg => {
        const student = studentByReg.get(reg) || {};
        const attendance = attendanceByReg.get(reg) || {};
        const monthlyEntries = entriesByReg.get(reg);
        const studentMonths = {};
        months.forEach(month => {
            const calls = monthlyEntries.get(month).sort((a, b) =>
                Number(a.day || 0) - Number(b.day || 0)
            );
            studentMonths[month] = { count: calls.length, calls };
        });
        return {
            reg,
            name: String(student.name || attendance.name || ''),
            roll: student.roll === undefined || student.roll === null ? '' : String(student.roll),
            studentClass: String(student.studentClass || ''),
            section: String(student.section || ''),
            months: studentMonths
        };
    }).sort((a, b) => {
        const classOrder = a.studentClass.localeCompare(b.studentClass, 'en', { numeric: true });
        if (classOrder) return classOrder;
        const sectionOrder = a.section.localeCompare(b.section, 'en', { numeric: true });
        if (sectionOrder) return sectionOrder;
        const rollOrder = a.roll.localeCompare(b.roll, 'en', { numeric: true });
        return rollOrder || a.name.localeCompare(b.name);
    }).map((student, index) => ({ ...student, sn: index + 1 }));

    const totalCalls = students.reduce((total, student) =>
        total + months.reduce((monthTotal, month) => monthTotal + student.months[month].count, 0), 0);
    return {
        academicYear,
        months,
        students,
        totalStudents: students.length,
        totalCalls
    };
}

module.exports = { buildStudentCallReport };
