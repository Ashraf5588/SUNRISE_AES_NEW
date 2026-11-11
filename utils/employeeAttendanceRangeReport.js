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
const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

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

const getPunchDateKey = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getPunchTime = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return { value: `${hour}:${minute}`, minutes: Number(hour) * 60 + Number(minute) };
};

const getKathmanduTimeMinutes = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 0;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kathmandu',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
};

const parseTimeMinutes = value => {
    const match = String(value || '').match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match || Number(match[1]) > 23) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

const toDateKey = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const getBsDateKey = date => String(bs.ADToBS(date) || '').slice(0, 10);

const getDateRange = ({ mode, startDateBs, endDateBs, year, monthNumbers }) => {
    let start;
    let end;
    let selectedMonthNumbers = [];
    if (mode === 'months') {
        selectedMonthNumbers = [...new Set((monthNumbers || []).map(Number))]
            .filter(month => Number.isInteger(month) && month >= 1 && month <= 12)
            .sort((first, second) => first - second);
        if (!/^\d{4}$/.test(String(year || '')) || !selectedMonthNumbers.length) {
            throw new Error('Choose a Bikram Sambat year and at least one month.');
        }
        const firstMonth = selectedMonthNumbers[0];
        const lastMonth = selectedMonthNumbers[selectedMonthNumbers.length - 1];
        start = `${year}-${String(firstMonth).padStart(2, '0')}-01`;
        const nextYear = lastMonth === 12 ? Number(year) + 1 : Number(year);
        const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
        const nextStart = bs.BSToAD(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
        if (!nextStart) throw new Error('The selected month range is not valid.');
        const nextParts = nextStart.split('-').map(Number);
        const previousDay = new Date(Date.UTC(nextParts[0], nextParts[1] - 1, nextParts[2]) - DAY_MS);
        end = getBsDateKey(previousDay);
    } else {
        start = String(startDateBs || '').trim();
        end = String(endDateBs || '').trim();
    }

    const startAd = bs.BSToAD(start);
    const endAd = bs.BSToAD(end);
    if (!startAd || !endAd || start > end) {
        throw new Error('Enter valid Bikram Sambat dates and ensure the start date is not after the end date.');
    }
    const startParts = startAd.split('-').map(Number);
    const endParts = endAd.split('-').map(Number);
    const startTimestamp = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
    const endTimestamp = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
    const dayCount = Math.floor((endTimestamp - startTimestamp) / DAY_MS) + 1;
    if (dayCount > 366) throw new Error('Choose a date range of 366 days or less.');

    const days = [];
    const timestamps = mode === 'months'
        ? selectedMonthNumbers.flatMap(month => {
            const monthStartBs = `${year}-${String(month).padStart(2, '0')}-01`;
            const monthStartAd = bs.BSToAD(monthStartBs);
            const nextYear = month === 12 ? Number(year) + 1 : Number(year);
            const nextMonth = month === 12 ? 1 : month + 1;
            const nextMonthAd = bs.BSToAD(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
            if (!monthStartAd || !nextMonthAd) throw new Error(`Invalid Bikram Sambat month ${monthStartBs}.`);
            const monthStartParts = monthStartAd.split('-').map(Number);
            const nextMonthParts = nextMonthAd.split('-').map(Number);
            const monthStart = Date.UTC(monthStartParts[0], monthStartParts[1] - 1, monthStartParts[2]);
            const nextMonthStart = Date.UTC(nextMonthParts[0], nextMonthParts[1] - 1, nextMonthParts[2]);
            const monthTimestamps = [];
            for (let timestamp = monthStart; timestamp < nextMonthStart; timestamp += DAY_MS) {
                monthTimestamps.push(timestamp);
            }
            return monthTimestamps;
        })
        : Array.from({ length: dayCount }, (_, index) => startTimestamp + index * DAY_MS);
    if (timestamps.length > 366) throw new Error('Choose a date range of 366 days or less.');
    timestamps.forEach(timestamp => {
        const date = new Date(timestamp);
        const adDate = toDateKey(date);
        const nepaliDate = getBsDateKey(date);
        const weekday = new Intl.DateTimeFormat('en', {
            timeZone: 'Asia/Kathmandu',
            weekday: 'long'
        }).format(new Date(`${adDate}T12:00:00Z`));
        days.push({ adDate, nepaliDate, weekday });
    });
    return { startDateBs: days[0].nepaliDate, endDateBs: days[days.length - 1].nepaliDate, days };
};

const buildEmployeeAttendanceRangeReport = ({
    employees,
    punches,
    approvedLeaves,
    holidays,
    mode,
    startDateBs,
    endDateBs,
    year,
    monthNumbers,
    now = new Date()
}) => {
    const dateRange = getDateRange({ mode, startDateBs, endDateBs, year, monthNumbers });
    const todayAd = getKathmanduDateKey(now);
    const currentTimeMinutes = getKathmanduTimeMinutes(now);
    const punchMap = new Map();
    punches.forEach(punch => {
        const adDate = getPunchDateKey(punch.punchTime);
        const pin = normalizeAttendancePin(punch.pin);
        if (!adDate || !pin) return;
        const key = `${adDate}|${pin}`;
        if (!punchMap.has(key)) punchMap.set(key, []);
        punchMap.get(key).push(punch);
    });

    const holidaysByDate = new Map(holidays.map(holiday => [
        String(holiday.dateBs || '').slice(0, 10),
        String(holiday.name || 'Holiday')
    ]));
    const leaveRangesByCode = new Map();
    const leaveRangesByName = new Map();
    approvedLeaves.forEach(leave => {
        const range = {
            startDate: String(leave.startDateNepali || '').slice(0, 10),
            endDate: String(leave.endDateNepali || '').slice(0, 10),
            name: String(leave.leaveTypeName || 'Approved leave')
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

    const employeeReports = employees.map(employee => {
        const codes = getEmployeeAttendanceCodes(employee);
        const normalizedCodes = codes.map(normalizeAttendancePin);
        const employeeCode = String(employee.employeeCode || employee.deviceCode || '').trim();
        const employeeName = String(employee.staffName || '').trim();
        const nameKey = normalizeName(employeeName);
        const midTime = parseTimeMinutes(employee.midTime) ?? 13 * 60;
        const plannedIn = parseTimeMinutes(employee.plannedIn || '09:00');
        const plannedOut = parseTimeMinutes(employee.plannedOut || '17:00');
        const days = dateRange.days.map(day => {
            const holidayName = holidaysByDate.get(day.nepaliDate) || '';
            if (holidayName) {
                return {
                    ...day,
                    inTime: '',
                    outTime: '',
                    lateTime: '',
                    earlyOut: '',
                    remarks: holidayName,
                    status: 'holiday',
                    holidayName
                };
            }

            const leave = [
                ...normalizedCodes.flatMap(code => leaveRangesByCode.get(code) || []),
                ...(leaveRangesByName.get(nameKey) || [])
            ].find(range => range.startDate <= day.nepaliDate && range.endDate >= day.nepaliDate);
            if (leave) {
                return {
                    ...day,
                    inTime: '',
                    outTime: '',
                    lateTime: '',
                    earlyOut: '',
                    remarks: leave.name,
                    status: 'leave',
                    holidayName: ''
                };
            }

            const punchesForDay = [...new Map(normalizedCodes
                .flatMap(code => punchMap.get(`${day.adDate}|${code}`) || [])
                .map(punch => [
                    String(punch._id || `${punch.pin}|${punch.punchTime}|${punch.status}|${punch.manualPunchType}`),
                    punch
                ])).values()]
                .map(punch => ({ punch, time: getPunchTime(punch.punchTime) }))
                .filter(item => item.time)
                .sort((first, second) => first.time.minutes - second.time.minutes);
            const morning = punchesForDay.find(({ punch, time }) =>
                punch.manualPunchType === 'Check-in'
                    || (!['Check-in', 'Check-out'].includes(punch.manualPunchType) && time.minutes < midTime)
            );
            const evening = punchesForDay.find(({ punch, time }) =>
                punch.manualPunchType === 'Check-out'
                    || (!['Check-in', 'Check-out'].includes(punch.manualPunchType) && time.minutes >= midTime)
            );
            const lateMinutes = morning
                ? Math.max(Number(morning.punch.lateMinutes) || 0, plannedIn === null ? 0 : morning.time.minutes - plannedIn)
                : 0;
            const earlyMinutes = evening
                ? Math.max(Number(evening.punch.earlyMinutes) || 0, plannedOut === null ? 0 : plannedOut - evening.time.minutes)
                : 0;
            const isFuture = day.adDate > todayAd;
            const morningIsDue = day.adDate < todayAd || (day.adDate === todayAd && currentTimeMinutes >= midTime);
            const eveningIsDue = day.adDate < todayAd || (day.adDate === todayAd
                && currentTimeMinutes >= (plannedOut ?? 17 * 60));
            const missing = [];
            if (!morning && morningIsDue) missing.push('Missed morning');
            if (!evening && eveningIsDue) missing.push('Missed evening');
            if (isFuture || (!morning && !evening && !missing.length)) {
                return {
                    ...day,
                    inTime: '',
                    outTime: '',
                    lateTime: '',
                    earlyOut: '',
                    remarks: 'Upcoming',
                    status: 'upcoming',
                    holidayName: ''
                };
            }
            const absent = missing.length === 2;
            const status = absent ? 'absent' : missing.length ? 'missed' : morning && evening ? 'present' : 'in-progress';

            return {
                ...day,
                inTime: morning ? morning.time.value : '',
                outTime: evening ? evening.time.value : '',
                lateTime: morning && lateMinutes > 0 ? `${lateMinutes} min` : '',
                earlyOut: evening && earlyMinutes > 0 ? `${earlyMinutes} min` : '',
                remarks: absent ? 'Absent' : missing.length ? missing.join('; ') : status === 'present' ? 'Present' : 'In progress',
                status,
                holidayName: ''
            };
        });

        return {
            id: String(employee._id),
            name: employeeName,
            code: employeeCode,
            department: String(employee.department || ''),
            days
        };
    });

    return {
        ...dateRange,
        employees: employeeReports,
        monthLabel: mode === 'months'
            ? [...new Set((monthNumbers || []).map(Number))]
                .filter(month => month >= 1 && month <= 12)
                .sort((first, second) => first - second)
                .map(month => MONTHS[month - 1])
                .join(', ')
            : ''
    };
};

module.exports = {
    MONTHS,
    buildEmployeeAttendanceRangeReport,
    getDateRange
};
