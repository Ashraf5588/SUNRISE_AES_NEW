const NepaliDate = require('nepali-date-converter');
const nepaliMonthNames = [
	'Baisakh',
	'Jestha',
	'Asar',
	'Shrawan',
	'Bhadra',
	'Aswin',
	'Kartik',
	'Mangsir',
	'Poush',
	'Magh',
	'Falgun',
	'Chaitra'
];

const getKathmanduDate = value => {
	if (!(value instanceof Date) && /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())) {
		return String(value).trim();
	}
	const date = value instanceof Date ? value : new Date(value);
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

const formatDate = ({ year, month, date }) =>
	`${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

const ADToBS = value => {
	const adDate = getKathmanduDate(value);
	if (!adDate) return '';
	const [year, month, date] = adDate.split('-').map(Number);
	return new NepaliDate(Date.UTC(year, month - 1, date, 12)).format('YYYY-MM-DD');
};

const BSToAD = value => {
	const bsDate = String(value || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(bsDate)) return '';
	const [year, month, date] = bsDate.split('-').map(Number);
	const daysInMonth = NepaliDate.dateConfigMap[String(year)]?.[nepaliMonthNames[month - 1]];
	if (!daysInMonth || date < 1 || date > daysInMonth || month < 1 || month > 12) return '';
	const parsedDate = new NepaliDate(bsDate);
	if (parsedDate.format('YYYY-MM-DD') !== bsDate) return '';
	return formatDate(parsedDate.getAD());
};

module.exports = {
	ADToBS,
	BSToAD,
	toBS: ADToBS,
	default: NepaliDate,
	NepaliDate
};
