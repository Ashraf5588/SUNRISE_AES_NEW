const bs = require('./bikramSambat');
const { formatFiscalYearBS } = require('./accounting');

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = date => date.toISOString().slice(0, 10);
const nextDate = date => new Date(date.getTime() + DAY_MS);

const parseDateInput = value => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
};

function fiscalYearBounds(fiscalYear) {
  const match = /^(\d{4})\/(\d{3})$/.exec(String(fiscalYear || ''));
  if (!match || String(Number(match[1]) + 1).slice(-3).padStart(3, '0') !== match[2]) {
    throw new Error('Choose a valid fiscal year in YYYY/YYY BS format.');
  }
  const startYear = Number(match[1]);
  const from = parseDateInput(bs.BSToAD(`${startYear}-04-01`));
  const toExclusive = parseDateInput(bs.BSToAD(`${startYear + 1}-04-01`));
  if (!from || !toExclusive || from >= toExclusive) {
    throw new Error(`The BS calendar for fiscal year ${fiscalYear} is unavailable.`);
  }
  return { from, toExclusive, fromBS: `${startYear}-04-01` };
}

function resolvePeriod(query, school) {
  const configuredFiscalYear = String(school.currentFiscalYearBS || '').trim();
  const requestedFiscalYear = query.fiscalYear === undefined
    ? configuredFiscalYear
    : String(query.fiscalYear || '').trim();
  const fiscalYear = requestedFiscalYear === 'ALL' ? '' : requestedFiscalYear;
  const hasCustomDates = Boolean(query.from || query.to);
  let from;
  let toExclusive;
  let fiscalBounds = null;
  if (fiscalYear) fiscalBounds = fiscalYearBounds(fiscalYear);

  if (hasCustomDates) {
    from = parseDateInput(query.from);
    const to = parseDateInput(query.to);
    if (!from || !to || from > to) throw new Error('Choose a valid start and end date.');
    toExclusive = nextDate(to);
    if (fiscalBounds && (from < fiscalBounds.from || toExclusive > fiscalBounds.toExclusive)) {
      throw new Error(`The selected dates must remain within fiscal year ${fiscalYear}. Choose All fiscal years to report across year boundaries.`);
    }
  } else if (fiscalBounds) {
    ({ from, toExclusive } = fiscalBounds);
  } else {
    throw new Error('Choose start and end dates when reporting across all fiscal years.');
  }

  const lastDay = new Date(toExclusive.getTime() - DAY_MS);
  const fromBS = String(bs.ADToBS(from) || '').slice(0, 10);
  const toBS = String(bs.ADToBS(lastDay) || '').slice(0, 10);
  if (!fromBS || !toBS) throw new Error('The selected AD date range could not be converted to BS dates.');
  return {
    fiscalYear: fiscalYear || 'ALL',
    from,
    toExclusive,
    fromText: dateOnly(from),
    toText: dateOnly(lastDay),
    fromBS,
    toBS,
    label: `${fromBS} BS – ${toBS} BS  |  ${dateOnly(from)} – ${dateOnly(lastDay)} AD`,
    days: Math.round((toExclusive - from) / DAY_MS),
  };
}

function resolveAsOf(query, school) {
  const configuredFiscalYear = String(school.currentFiscalYearBS || '').trim();
  const requested = query.fiscalYear === undefined ? configuredFiscalYear : String(query.fiscalYear || '').trim();
  const fiscalYear = requested === 'ALL' ? '' : requested;
  const bounds = fiscalYear ? fiscalYearBounds(fiscalYear) : null;
  const today = parseDateInput(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()));
  if (!today) throw new Error('The current date could not be resolved in the configured time zone.');
  let asOf = parseDateInput(query.asOf);
  if (query.asOf && !asOf) throw new Error('Choose a valid balance sheet date.');
  if (!asOf) {
    if (!bounds) asOf = today;
    else if (today < bounds.from) asOf = bounds.from;
    else if (today >= bounds.toExclusive) asOf = new Date(bounds.toExclusive.getTime() - DAY_MS);
    else asOf = today;
  }
  if (bounds && (asOf < bounds.from || asOf >= bounds.toExclusive)) {
    throw new Error(`The balance sheet date must be within fiscal year ${fiscalYear}.`);
  }
  const asOfExclusive = nextDate(asOf);
  const asOfBS = String(bs.ADToBS(asOf) || '').slice(0, 10);
  if (!asOfBS) throw new Error('The balance sheet date could not be converted to a BS date.');
  const resultFiscalYear = fiscalYear || formatFiscalYearBS(asOfBS);
  const resultBounds = fiscalYearBounds(resultFiscalYear);
  return {
    fiscalYear: fiscalYear || 'ALL',
    asOf,
    asOfExclusive,
    asOfText: dateOnly(asOf),
    asOfBS,
    earningsFrom: resultBounds.from,
    earningsToExclusive: resultBounds.toExclusive,
    label: `As of ${asOfBS} BS  |  ${dateOnly(asOf)} AD`,
  };
}

module.exports = {
  DAY_MS,
  dateOnly,
  fiscalYearBounds,
  nextDate,
  parseDateInput,
  resolveAsOf,
  resolvePeriod,
};
