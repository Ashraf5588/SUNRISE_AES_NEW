const bs = require('./bikramSambat');
const { getEmployeeAttendanceCodes, normalizeAttendancePin } = require('./employeeAttendanceSync');

const MONTHS = [
    'Baisakh',
    'Jestha',
    'Ashar',
    'Shrawan',
    'Bhadra',
    'Ashwin',
    'Kartik',
    'Mangsir',
    'Poush',
    'Magh',
    'Falgun',
    'Chaitra'
];

const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const DAY_MS = 24 * 60 * 60 * 1000;

const getKathmanduDateKey = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kathmandu',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const parseTimeMinutes = value => {
    const match = String(value || '').match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return null;
    const hours = Number(match[1]);
    if (hours > 23) return null;
    return hours * 60 + Number(match[2]);
};

const getPunchTimeParts = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kathmandu',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { minutes: Number(values.hour) * 60 + Number(values.minute), value: `${values.hour}:${values.minute}` };
};

const getMonthDateRange = (year, monthNumber) => {
    const startBs = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const nextMonthYear = monthNumber === 12 ? Number(year) + 1 : Number(year);
    const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
    const nextStartBs = `${nextMonthYear}-${String(nextMonthNumber).padStart(2, '0')}-01`;
    const startAd = String(bs.BSToAD(startBs) || '');
    const nextStartAd = String(bs.BSToAD(nextStartBs) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startAd) || !/^\d{4}-\d{2}-\d{2}$/.test(nextStartAd)) {
        throw new Error(`Invalid Bikram Sambat month ${startBs}.`);
    }

    const startParts = startAd.split('-').map(Number);
    const nextParts = nextStartAd.split('-').map(Number);
    return {
        startAd,
        endExclusiveAd: nextStartAd,
        startTimestamp: Date.UTC(startParts[0], startParts[1] - 1, startParts[2]),
        endTimestamp: Date.UTC(nextParts[0], nextParts[1] - 1, nextParts[2])
    };
};

const buildMonthWiseAttendanceReport = ({
    employees,
    punches,
    approvedLeaves,
    holidays,
    year,
    monthNumbers,
    now = new Date()
}) => {
    const selectedMonths = [...new Set(monthNumbers.map(Number))]
        .filter(month => Number.isInteger(month) && month >= 1 && month <= 12)
        .sort((first, second) => first - second);
    if (!/^\d{4}$/.test(String(year)) || !selectedMonths.length) {
        throw new Error('Choose a valid Bikram Sambat year and at least one month.');
    }

    const currentBs = String(bs.ADToBS(now) || '');
    const currentBsYear = Number(currentBs.slice(0, 4));
    const currentBsMonth = Number(currentBs.slice(5, 7));
    const latestMonth = Number(year) === currentBsYear ? currentBsMonth : 12;
    if (Number(year) > currentBsYear || selectedMonths.some(month => month > latestMonth)) {
        throw new Error('Future months are not available in the attendance report.');
    }
    const todayAd = getKathmanduDateKey(now);

    const attendanceByDateAndCode = new Map();
    punches.forEach(punch => {
        const dateKey = getKathmanduDateKey(punch.punchTime);
        const pin = normalizeAttendancePin(punch.pin);
        if (!dateKey || !pin) return;
        const key = `${dateKey}|${pin}`;
        if (!attendanceByDateAndCode.has(key)) attendanceByDateAndCode.set(key, []);
        attendanceByDateAndCode.get(key).push(punch);
    });

    const holidayNames = new Map(holidays.map(item => [
        String(item.dateBs || '').slice(0, 10),
        String(item.name || 'Holiday')
    ]));
    const leaveRangesByCode = new Map();
    const leaveRangesByName = new Map();
    approvedLeaves.forEach(leave => {
        const range = {
            startDate: String(leave.startDateNepali || '').slice(0, 10),
            endDate: String(leave.endDateNepali || '').slice(0, 10)
        };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(range.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(range.endDate)) return;
        const code = normalizeAttendancePin(leave.employeeCode);
        const name = normalizeName(leave.employeeName);
        if (code) {
            if (!leaveRangesByCode.has(code)) leaveRangesByCode.set(code, []);
            leaveRangesByCode.get(code).push(range);
        }
        if (name) {
            if (!leaveRangesByName.has(name)) leaveRangesByName.set(name, []);
            leaveRangesByName.get(name).push(range);
        }
    });

    const monthReports = selectedMonths.map(monthNumber => {
        const range = getMonthDateRange(year, monthNumber);
        const days = [];
        for (let timestamp = range.startTimestamp; timestamp < range.endTimestamp; timestamp += DAY_MS) {
            const date = new Date(timestamp);
            const adDate = date.toISOString().slice(0, 10);
            const nepaliDate = String(bs.ADToBS(new Date(`${adDate}T12:00:00Z`)) || '').slice(0, 10);
            days.push({ adDate, nepaliDate });
        }
        const holidayDates = new Set(days
            .filter(day => holidayNames.has(day.nepaliDate))
            .map(day => day.nepaliDate));
        return {
            key: `${year}-${String(monthNumber).padStart(2, '0')}`,
            name: MONTHS[monthNumber - 1],
            monthNumber,
            holidayCount: holidayDates.size,
            days,
            holidayDates
        };
    });

    const employeeRows = employees.map(employee => {
        const codes = getEmployeeAttendanceCodes(employee);
        const primaryCode = String(employee.employeeCode || employee.deviceCode || '').trim();
        const normalizedCodes = codes.map(normalizeAttendancePin);
        const employeeName = String(employee.staffName || '').trim();
        const nameKey = normalizeName(employeeName);
        const joinedDate = employee.dateOfJoining ? getKathmanduDateKey(employee.dateOfJoining) : '';
        const midTime = parseTimeMinutes(employee.midTime) ?? 13 * 60;
        const plannedIn = parseTimeMinutes(employee.plannedIn || '09:00');
        const plannedOut = parseTimeMinutes(employee.plannedOut || '17:00');

        const monthly = monthReports.map(month => {
            const counts = {
                present: 0,
                absent: 0,
                leave: 0,
                lateIn: 0,
                earlyOut: 0,
                missed: 0
            };
            month.days.forEach(day => {
                if (joinedDate && day.adDate < joinedDate) return;
                if (day.adDate >= todayAd) return;
                if (month.holidayDates.has(day.nepaliDate)) return;

                const approvedLeave = [...normalizedCodes.flatMap(code => leaveRangesByCode.get(code) || []),
                    ...(leaveRangesByName.get(nameKey) || [])]
                    .some(range => range.startDate <= day.nepaliDate && range.endDate >= day.nepaliDate);
                if (approvedLeave) {
                    counts.leave += 1;
                    return;
                }

                const punchesForDay = [...new Map(normalizedCodes
                    .flatMap(code => attendanceByDateAndCode.get(`${day.adDate}|${code}`) || [])
                    .map(punch => [
                        String(punch._id || `${punch.pin}|${punch.punchTime}|${punch.status}|${punch.manualPunchType}`),
                        punch
                    ])).values()]
                    .map(punch => ({ punch, time: getPunchTimeParts(punch.punchTime) }))
                    .filter(item => item.time && item.time.value !== '00:00')
                    .sort((first, second) => first.time.minutes - second.time.minutes);
                const morning = punchesForDay.find(({ punch, time }) =>
                    punch.manualPunchType === 'Check-in'
                        || (!['Check-in', 'Check-out'].includes(punch.manualPunchType) && time.minutes < midTime)
                );
                const evening = punchesForDay.find(({ punch, time }) =>
                    punch.manualPunchType === 'Check-out'
                        || (!['Check-in', 'Check-out'].includes(punch.manualPunchType) && time.minutes >= midTime)
                );

                if (morning || evening) counts.present += 1;
                if (!morning && !evening) {
                    counts.absent += 1;
                    return;
                }
                if (!morning || !evening) counts.missed += 1;
                if (morning && (
                    morning.punch.isLate === true
                    || Number(morning.punch.lateMinutes) > 0
                    || (plannedIn !== null && morning.time.minutes > plannedIn)
                )) counts.lateIn += 1;
                if (evening && (
                    evening.punch.isEarly === true
                    || Number(evening.punch.earlyMinutes) > 0
                    || (plannedOut !== null && evening.time.minutes < plannedOut)
                )) counts.earlyOut += 1;
            });
            return { ...month, counts };
        });

        const totalCounts = monthly.reduce((total, month) => {
            Object.keys(total).forEach(key => {
                total[key] += month.counts[key];
            });
            return total;
        }, { present: 0, absent: 0, leave: 0, lateIn: 0, earlyOut: 0, missed: 0 });

        return {
            id: String(employee._id),
            code: primaryCode,
            name: employeeName,
            department: String(employee.department || ''),
            monthly,
            totalCounts
        };
    });

    const totals = monthReports.map((month, monthIndex) => employeeRows.reduce((total, employee) => {
        Object.keys(total).forEach(key => {
            total[key] += employee.monthly[monthIndex].counts[key];
        });
        return total;
    }, { present: 0, absent: 0, leave: 0, lateIn: 0, earlyOut: 0, missed: 0 }));
    const totalCounts = totals.reduce((total, month) => {
        Object.keys(total).forEach(key => {
            total[key] += month[key];
        });
        return total;
    }, { present: 0, absent: 0, leave: 0, lateIn: 0, earlyOut: 0, missed: 0 });

    return {
        year: String(year),
        months: monthReports.map(({ key, name, monthNumber, holidayCount }) => ({ key, name, monthNumber, holidayCount })),
        employees: employeeRows,
        totals,
        totalCounts
    };
};

const getMonthWiseReportMonthOptions = (year, now = new Date()) => {
    const currentBs = String(bs.ADToBS(now) || '');
    const currentYear = Number(currentBs.slice(0, 4));
    const currentMonth = Number(currentBs.slice(5, 7));
    const numericYear = Number(year);
    const maximumMonth = numericYear === currentYear ? currentMonth : 12;
    return MONTHS.slice(0, numericYear <= currentYear ? maximumMonth : 0)
        .map((name, index) => ({ number: index + 1, name }));
};

module.exports = {
    MONTHS,
    buildMonthWiseAttendanceReport,
    getKathmanduDateKey,
    getMonthDateRange,
    getMonthWiseReportMonthOptions
};
