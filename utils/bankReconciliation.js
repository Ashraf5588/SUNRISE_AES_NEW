const crypto = require('crypto');
const { toMinorUnits } = require('./journalVoucher');

const parseCsvRows = input => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const text = String(input || '');

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(value.trim());
      value = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(value.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
};

const parseBankStatementCsv = input => {
  const rows = parseCsvRows(input);
  if (rows.length < 2) throw new Error('Add a CSV header and at least one bank statement row.');
  const headers = rows[0].map(header => header.toLowerCase().replace(/[\s_-]+/g, ''));
  const indexOf = name => headers.indexOf(name);
  const dateIndex = indexOf('date');
  const descriptionIndex = indexOf('description');
  const referenceIndex = indexOf('reference');
  const debitIndex = indexOf('debit');
  const creditIndex = indexOf('credit');
  const amountIndex = indexOf('amount');
  const typeIndex = indexOf('type');
  if (dateIndex < 0 || (debitIndex < 0 || creditIndex < 0) && (amountIndex < 0 || typeIndex < 0)) {
    throw new Error('CSV headers must include Date and either Debit/Credit or Amount/Type columns.');
  }

  return rows.slice(1).map((cells, rowIndex) => {
    const dateText = cells[dateIndex] || '';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
      ? new Date(`${dateText}T00:00:00.000Z`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateText) {
      throw new Error(`CSV row ${rowIndex + 2} must use an AD date in YYYY-MM-DD format.`);
    }
    let debitMinor = 0;
    let creditMinor = 0;
    if (debitIndex >= 0 && creditIndex >= 0) {
      debitMinor = toMinorUnits(cells[debitIndex] || '0');
      creditMinor = toMinorUnits(cells[creditIndex] || '0');
    } else {
      const amountMinor = toMinorUnits(cells[amountIndex] || '');
      const type = String(cells[typeIndex] || '').trim().toLowerCase();
      if (amountMinor === null || amountMinor <= 0 || !['debit', 'credit'].includes(type)) {
        throw new Error(`CSV row ${rowIndex + 2} must have a positive Amount and Type of Debit or Credit.`);
      }
      if (type === 'debit') debitMinor = amountMinor;
      else creditMinor = amountMinor;
    }
    if (debitMinor === null || creditMinor === null || debitMinor < 0 || creditMinor < 0
      || (debitMinor > 0) === (creditMinor > 0)) {
      throw new Error(`CSV row ${rowIndex + 2} must contain a positive value on exactly one of Debit or Credit.`);
    }

    return {
      dateAD: new Date(`${dateText}T00:00:00.000Z`),
      description: String(cells[descriptionIndex] || '').slice(0, 500),
      reference: String(cells[referenceIndex] || '').slice(0, 100),
      debit: debitMinor / 100,
      credit: creditMinor / 100,
    };
  });
};

const hashStatement = ({ ledgerId, from, to, openingBalance, csv }) => crypto
  .createHash('sha256')
  .update([ledgerId, from, to, openingBalance, csv].join('|'))
  .digest('hex');

module.exports = { hashStatement, parseBankStatementCsv };
