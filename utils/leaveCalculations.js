const bs = require('./bikramSambat');
const DAY_MS = 24 * 60 * 60 * 1000;

const normalizePin = value => String(value || '').trim().toUpperCase();
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

const buildLeaveAllocations = (startDate, endDate, options = {}) => {
    const halfDay = Boolean(options.halfDay);
    const excludedDates = new Set(options.excludedDates || []);
    if (halfDay && startDate.getTime() !== endDate.getTime()) {
        throw new Error('Early or late leave must use the same start and end date.');
    }

    const months = new Map();
    const years = new Map();
    for (let timestamp = startDate.getTime(); timestamp <= endDate.getTime(); timestamp += DAY_MS) {
        const date = new Date(timestamp);
        const nepaliDate = String(bs.ADToBS(date) || '');
        if (!nepaliDate) continue;
        const adKey = date.toISOString().slice(0, 10);
        if (!halfDay && excludedDates.has(adKey)) continue;
        const allocation = halfDay ? 0.5 : 1;
        const yearKey = nepaliDate.slice(0, 4);
        const monthKey = nepaliDate.slice(0, 7);
        months.set(monthKey, (months.get(monthKey) || 0) + allocation);
        years.set(yearKey, (years.get(yearKey) || 0) + allocation);
    }
    return { months, years };
};

const getAttendanceAbsenceDates = ({
    startDate,
    endDate,
    employeePins = [],
    attendanceRecords = [],
    holidayDates = [],
    leaveRecords = [],
    additionalCoveredRanges = [],
    now = new Date()
}) => {
    const firstDay = new Date(startDate);
    const lastDay = new Date(endDate);
    if (Number.isNaN(firstDay.getTime()) || Number.isNaN(lastDay.getTime()) || lastDay <= firstDay) return [];

    const targetPins = new Set(employeePins.map(normalizePin).filter(Boolean));
    if (!targetPins.size) return [];
    const deviceActivityDates = new Set();
    const employeePunchDates = new Set();
    attendanceRecords.forEach(record => {
        const adDate = getKathmanduDateKey(record.punchTime);
        if (!adDate) return;
        if (record.source !== 'Manual') deviceActivityDates.add(adDate);
        if (targetPins.has(normalizePin(record.pin))) employeePunchDates.add(adDate);
    });

    const holidays = new Set(holidayDates.map(value => String(value || '').slice(0, 10)));
    const coveredRanges = [...leaveRecords, ...additionalCoveredRanges]
        .filter(record => ['pending', 'approved'].includes(String(record.status || 'approved').toLowerCase())
            || !Object.prototype.hasOwnProperty.call(record, 'status'))
        .map(record => ({
            startDate: String(record.startDateNepali || '').slice(0, 10),
            endDate: String(record.endDateNepali || '').slice(0, 10)
        }))
        .filter(range => /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate));
    const todayAd = getKathmanduDateKey(now);
    const absences = [];

    for (let timestamp = Date.UTC(
        firstDay.getUTCFullYear(),
        firstDay.getUTCMonth(),
        firstDay.getUTCDate()
    ); timestamp < lastDay.getTime(); timestamp += DAY_MS) {
        const date = new Date(timestamp);
        const adDate = date.toISOString().slice(0, 10);
        if (adDate >= todayAd || date.getUTCDay() === 6) continue;
        if (!deviceActivityDates.has(adDate) || employeePunchDates.has(adDate)) continue;

        const nepaliDate = String(bs.ADToBS(date) || '').slice(0, 10);
        if (!nepaliDate || holidays.has(nepaliDate)) continue;
        if (coveredRanges.some(range => range.startDate <= nepaliDate && range.endDate >= nepaliDate)) continue;
        absences.push({
            adDate,
            nepaliDate,
            year: nepaliDate.slice(0, 4),
            month: nepaliDate.slice(0, 7)
        });
    }

    return absences;
};

const allocateAbsentDaysToQuotas = (absenceDates, quotaTypes) => {
    const allocations = new Map(quotaTypes.map(type => [
        String(type.key),
        { years: new Map(), months: new Map(), days: 0 }
    ]));
    let unallocatedDays = 0;

    for (const absence of absenceDates) {
        let remaining = 1;
        while (remaining > 0.000001) {
            const candidates = quotaTypes.map(type => {
                const yearlyLimit = type.yearlyLimit == null ? null : Number(type.yearlyLimit);
                const monthlyLimit = type.monthlyLimit == null ? null : Number(type.monthlyLimit);
                if (!(yearlyLimit > 0) && !(monthlyLimit > 0)) return null;

                const allocated = allocations.get(String(type.key));
                const yearlyUsed = (type.usedYears?.get(absence.year) || 0) + (allocated.years.get(absence.year) || 0);
                const monthlyUsed = (type.usedMonths?.get(absence.month) || 0) + (allocated.months.get(absence.month) || 0);
                const yearlyRemaining = yearlyLimit > 0 ? Math.max(0, yearlyLimit - yearlyUsed) : Infinity;
                const monthlyRemaining = monthlyLimit > 0 ? Math.max(0, monthlyLimit - monthlyUsed) : Infinity;
                const capacity = Math.min(yearlyRemaining, monthlyRemaining);
                return capacity > 0
                    ? { type, allocated, capacity }
                    : null;
            }).filter(Boolean).sort((first, second) =>
                second.capacity - first.capacity || String(first.type.name).localeCompare(String(second.type.name))
            );

            const selected = candidates[0];
            if (!selected) {
                unallocatedDays += remaining;
                break;
            }

            const amount = Math.min(remaining, selected.capacity);
            const yearlyLimit = selected.type.yearlyLimit == null ? null : Number(selected.type.yearlyLimit);
            const monthlyLimit = selected.type.monthlyLimit == null ? null : Number(selected.type.monthlyLimit);
            if (yearlyLimit > 0) {
                selected.allocated.years.set(
                    absence.year,
                    (selected.allocated.years.get(absence.year) || 0) + amount
                );
            }
            if (monthlyLimit > 0) {
                selected.allocated.months.set(
                    absence.month,
                    (selected.allocated.months.get(absence.month) || 0) + amount
                );
            }
            selected.allocated.days += amount;
            remaining -= amount;
        }
    }

    return { allocations, unallocatedDays };
};

module.exports = {
    allocateAbsentDaysToQuotas,
    buildLeaveAllocations,
    getAttendanceAbsenceDates
};