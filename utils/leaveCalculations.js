const bs = require('bikram-sambat-js');
const DAY_MS = 24 * 60 * 60 * 1000;

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

module.exports = { buildLeaveAllocations };