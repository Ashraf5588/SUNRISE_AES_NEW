const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const roundMinor = value => Math.round(Number(value || 0) * 100);
const fromMinor = value => Number(value || 0) / 100;
const splitBalance = minor => ({
  debit: fromMinor(Math.max(0, minor)),
  credit: fromMinor(Math.max(0, -minor)),
});

function calculateTrialBalance(ledgers, aggregates, { includeZero = false, groupId = '' } = {}) {
  const totalsByLedger = new Map(aggregates.map(item => [String(item._id), item]));
  const rows = ledgers
    .filter(ledger => !groupId || String(ledger.group?._id || ledger.group) === String(groupId))
    .map(ledger => {
      const totals = totalsByLedger.get(String(ledger._id)) || {};
      const openingMinor = roundMinor(totals.openingDebit) - roundMinor(totals.openingCredit);
      const periodDebitMinor = roundMinor(totals.periodDebit);
      const periodCreditMinor = roundMinor(totals.periodCredit);
      const closingMinor = openingMinor + periodDebitMinor - periodCreditMinor;
      const opening = splitBalance(openingMinor);
      const closing = splitBalance(closingMinor);
      return {
        ledger,
        openingDebit: opening.debit,
        openingCredit: opening.credit,
        periodDebit: fromMinor(periodDebitMinor),
        periodCredit: fromMinor(periodCreditMinor),
        closingDebit: closing.debit,
        closingCredit: closing.credit,
        closingMinor,
      };
    })
    .filter(row => includeZero
      || row.openingDebit || row.openingCredit || row.periodDebit || row.periodCredit)
    .sort((a, b) => String(a.ledger.code).localeCompare(String(b.ledger.code), undefined, { numeric: true }));

  const sum = key => Math.round(rows.reduce((total, row) => total + roundMinor(row[key]), 0));
  const totals = {
    openingDebit: fromMinor(sum('openingDebit')),
    openingCredit: fromMinor(sum('openingCredit')),
    periodDebit: fromMinor(sum('periodDebit')),
    periodCredit: fromMinor(sum('periodCredit')),
    closingDebit: fromMinor(sum('closingDebit')),
    closingCredit: fromMinor(sum('closingCredit')),
  };
  totals.openingDifference = fromMinor(roundMinor(totals.openingDebit) - roundMinor(totals.openingCredit));
  totals.periodDifference = fromMinor(roundMinor(totals.periodDebit) - roundMinor(totals.periodCredit));
  totals.closingDifference = fromMinor(roundMinor(totals.closingDebit) - roundMinor(totals.closingCredit));
  return { rows, totals };
}

function calculateProfitAndLoss(ledgers, aggregates) {
  const totalsByLedger = new Map(aggregates.map(item => [String(item._id), item]));
  const rows = [];
  for (const ledger of ledgers) {
    if (!['INCOME', 'EXPENSE'].includes(ledger.nature)) continue;
    const totals = totalsByLedger.get(String(ledger._id)) || {};
    const debitMinor = roundMinor(totals.debit);
    const creditMinor = roundMinor(totals.credit);
    const amountMinor = ledger.nature === 'INCOME'
      ? creditMinor - debitMinor
      : debitMinor - creditMinor;
    if (!amountMinor) continue;
    rows.push({ ledger, amount: fromMinor(amountMinor), amountMinor });
  }
  rows.sort((a, b) => String(a.ledger.code).localeCompare(String(b.ledger.code), undefined, { numeric: true }));
  const totalIncomeMinor = rows
    .filter(row => row.ledger.nature === 'INCOME')
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const totalExpenseMinor = rows
    .filter(row => row.ledger.nature === 'EXPENSE')
    .reduce((sum, row) => sum + row.amountMinor, 0);
  return {
    rows,
    totalIncome: fromMinor(totalIncomeMinor),
    totalExpense: fromMinor(totalExpenseMinor),
    netProfit: fromMinor(totalIncomeMinor - totalExpenseMinor),
  };
}

function calculateBalanceSheet(ledgers, aggregates, currentProfitMinor) {
  const totalsByLedger = new Map(aggregates.map(item => [String(item._id), item]));
  const sections = ['ASSET', 'LIABILITY', 'EQUITY'].map(nature => {
    const groupsById = new Map();
    for (const ledger of ledgers) {
      if (ledger.nature !== nature) continue;
      const totals = totalsByLedger.get(String(ledger._id)) || {};
      const rawMinor = roundMinor(totals.debit) - roundMinor(totals.credit);
      const amountMinor = nature === 'ASSET' ? rawMinor : -rawMinor;
      const group = ledger.group && typeof ledger.group === 'object'
        ? ledger.group
        : { _id: 'ungrouped', name: 'Unassigned group', code: '' };
      const groupId = String(group._id);
      if (!groupsById.has(groupId)) {
        groupsById.set(groupId, {
          id: groupId,
          name: group.name || 'Unassigned group',
          code: group.code || '',
          ledgers: [],
          totalMinor: 0,
        });
      }
      const target = groupsById.get(groupId);
      target.ledgers.push({
        ledger,
        amount: fromMinor(amountMinor),
        amountMinor,
        ...splitBalance(amountMinor),
      });
      target.totalMinor += amountMinor;
    }
    const groups = [...groupsById.values()]
      .map(group => ({
        ...group,
        total: fromMinor(group.totalMinor),
        ledgers: group.ledgers.sort((a, b) => String(a.ledger.code).localeCompare(String(b.ledger.code), undefined, { numeric: true })),
      }))
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
    return {
      nature,
      groups,
      totalMinor: groups.reduce((sum, group) => sum + group.totalMinor, 0),
      total: fromMinor(groups.reduce((sum, group) => sum + group.totalMinor, 0)),
    };
  });
  const assets = sections.find(section => section.nature === 'ASSET');
  const liabilities = sections.find(section => section.nature === 'LIABILITY');
  const equity = sections.find(section => section.nature === 'EQUITY');
  equity.currentProfitMinor = currentProfitMinor;
  equity.currentProfit = fromMinor(currentProfitMinor);
  equity.totalMinor += currentProfitMinor;
  equity.total = fromMinor(equity.totalMinor);
  const differenceMinor = assets.totalMinor - liabilities.totalMinor - equity.totalMinor;
  return {
    sections,
    assets: assets.total,
    liabilities: liabilities.total,
    equity: equity.total,
    currentProfit: fromMinor(currentProfitMinor),
    difference: fromMinor(differenceMinor),
    isBalanced: differenceMinor === 0,
  };
}

function classifyCashFlowLedger(ledger) {
  if (!ledger) return '';
  const type = String(ledger.ledgerType || '').toUpperCase();
  const nature = String(ledger.nature || '').toUpperCase();
  if (nature === 'INCOME' || nature === 'EXPENSE') return 'operating';
  if (nature === 'ASSET' && type === 'FIXED_ASSET') return 'investing';
  if (nature === 'ASSET' && type === 'RECEIVABLE') return 'operating';
  if (nature === 'LIABILITY' && type === 'PAYABLE') return 'operating';
  if (nature === 'EQUITY' || type === 'CAPITAL') return 'financing';
  return '';
}

function openingBalanceDateBS(voucher) {
  if (!voucher) return '';
  const narrationDate = String(voucher.narration || '')
    .match(/\bopening\s+balances?\s+brought\s+forward\b[\s\S]*?\bas\s+of\s+(\d{4}-\d{2}-\d{2})\s+BS\b/i)?.[1];
  if (narrationDate) return narrationDate;
  return String(voucher.voucherType || '').toUpperCase() === 'OPENING_BALANCE'
    ? String(voucher.dateBS || '')
    : '';
}

function cashMovementMinorForVoucher(voucher, cashLedgers) {
  const cashIds = new Set(cashLedgers.map(ledger => String(ledger._id)));
  return (voucher.entries || []).reduce((sum, entry) => {
    const ledgerId = String(entry.ledger?._id || entry.ledger || '');
    if (!cashIds.has(ledgerId)) return sum;
    return sum + roundMinor(entry.debit) - roundMinor(entry.credit);
  }, 0);
}

function calculateCashLedgerBalanceMinor(totals, cashLedgers) {
  const cashIds = new Set(cashLedgers.map(ledger => String(ledger._id)));
  return totals
    .filter(item => cashIds.has(String(item._id)))
    .reduce((sum, item) => sum + roundMinor(item.debit) - roundMinor(item.credit), 0);
}

function calculateOpeningCashMinor(totals, openingVouchers, cashLedgers, asOfExclusive) {
  let openingMinor = calculateCashLedgerBalanceMinor(totals, cashLedgers);
  for (const item of openingVouchers) {
    if (item.voucher.dateAD < asOfExclusive) continue;
    openingMinor += cashMovementMinorForVoucher(item.voucher, cashLedgers);
  }
  return openingMinor;
}

function calculateCashFlow(vouchers, cashLedgers, openingCash, closingCash, {
  activityFrom = null,
  openingBalanceDate = '',
} = {}) {
  const cashIds = new Set(cashLedgers.map(ledger => String(ledger._id)));
  const result = {
    operatingMinor: 0,
    investingMinor: 0,
    financingMinor: 0,
    unclassifiedMinor: 0,
    contraVouchersExcluded: 0,
    openingBalanceVouchersExcluded: 0,
  };
  for (const voucher of vouchers) {
    if (voucher.status && voucher.status !== 'POSTED') continue;
    if (openingBalanceDateBS(voucher)) {
      result.openingBalanceVouchersExcluded += 1;
      continue;
    }
    if (activityFrom && voucher.dateAD && new Date(voucher.dateAD) < activityFrom) continue;
    if (voucher.voucherType === 'CONTRA') {
      result.contraVouchersExcluded += 1;
      continue;
    }
    const entries = voucher.entries || [];
    const cashMovementMinor = cashMovementMinorForVoucher(voucher, cashLedgers);
    if (!cashMovementMinor) continue;

    const oppositeSide = cashMovementMinor > 0 ? 'credit' : 'debit';
    const counterparts = entries
      .filter(entry => !cashIds.has(String(entry.ledger?._id || entry.ledger || '')))
      .map(entry => ({
        ledger: entry.ledger && typeof entry.ledger === 'object' ? entry.ledger : null,
        weight: roundMinor(entry[oppositeSide]),
      }))
      .filter(entry => entry.weight > 0);
    const totalWeight = counterparts.reduce((sum, entry) => sum + entry.weight, 0);
    if (!totalWeight) {
      result.unclassifiedMinor += cashMovementMinor;
      continue;
    }

    let remaining = Math.abs(cashMovementMinor);
    counterparts.forEach((counterpart, index) => {
      const allocation = index === counterparts.length - 1
        ? remaining
        : Math.min(remaining, Math.round(Math.abs(cashMovementMinor) * counterpart.weight / totalWeight));
      remaining -= allocation;
      const signedAmount = Math.sign(cashMovementMinor) * allocation;
      const classification = classifyCashFlowLedger(counterpart.ledger);
      if (classification) result[`${classification}Minor`] += signedAmount;
      else result.unclassifiedMinor += signedAmount;
    });
    result.unclassifiedMinor += Math.sign(cashMovementMinor) * remaining;
  }

  const movementMinor = result.operatingMinor + result.investingMinor
    + result.financingMinor + result.unclassifiedMinor;
  const openingMinor = roundMinor(openingCash);
  const closingMinor = roundMinor(closingCash);
  return {
    operating: fromMinor(result.operatingMinor),
    investing: fromMinor(result.investingMinor),
    financing: fromMinor(result.financingMinor),
    unclassified: fromMinor(result.unclassifiedMinor),
    netIncrease: fromMinor(movementMinor),
    openingCash: fromMinor(openingMinor),
    closingCash: fromMinor(closingMinor),
    reconciliationDifference: fromMinor(closingMinor - openingMinor - movementMinor),
    contraVouchersExcluded: result.contraVouchersExcluded,
    openingBalanceVouchersExcluded: result.openingBalanceVouchersExcluded,
    openingBalanceDate,
    hasUnclassifiedMovements: result.unclassifiedMinor !== 0,
  };
}

const escapeXml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

function createExcelXml({ title, schoolName, periodLabel, columns, rows }) {
  const worksheetRows = [
    [schoolName],
    [title],
    [periodLabel],
    [],
    columns,
    ...rows,
  ].map((row, rowIndex) => {
    const cells = row.map(value => {
      const numeric = typeof value === 'number' && Number.isFinite(value);
      const type = numeric ? 'Number' : 'String';
      const style = rowIndex === 4
        ? ' ss:StyleID="Header"'
        : numeric
          ? ' ss:StyleID="Currency"'
          : '';
      return `<Cell${style}><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');
  const sheetName = escapeXml(String(title || 'Report').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#18345C" ss:Pattern="Solid"/></Style><Style ss:ID="Currency"><NumberFormat ss:Format="&quot;Rs. &quot;#,##0.00;[Red](&quot;Rs. &quot;#,##0.00)"/></Style></Styles><Worksheet ss:Name="${sheetName}"><Table>${worksheetRows}</Table></Worksheet></Workbook>`;
}

const pdfSafeText = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '?');

async function createReportPdf({ title, schoolName, periodLabel, columns, rows }) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [842, 595];
  const margin = 30;
  const tableWidth = pageSize[0] - margin * 2;
  const columnWidth = tableWidth / Math.max(columns.length, 1);
  const rowHeight = columns.length > 9 ? 15 : 18;
  let page;
  let y;
  let pageNumber = 0;

  const addPage = () => {
    page = document.addPage(pageSize);
    pageNumber += 1;
    page.drawText(pdfSafeText(schoolName), { x: margin, y: 565, size: 10, font: bold, color: rgb(.1, .2, .35) });
    page.drawText(pdfSafeText(title), { x: margin, y: 548, size: 12, font: bold, color: rgb(.1, .2, .35) });
    page.drawText(pdfSafeText(periodLabel), { x: margin, y: 533, size: 8, font: regular, color: rgb(.35, .4, .48) });
    y = 510;
    page.drawRectangle({ x: margin, y: y - 4, width: tableWidth, height: rowHeight, color: rgb(.09, .18, .31) });
    columns.forEach((column, index) => {
      page.drawText(pdfSafeText(column).slice(0, 24), {
        x: margin + index * columnWidth + 3,
        y,
        size: 6.5,
        font: bold,
        color: rgb(1, 1, 1),
        maxWidth: columnWidth - 5,
      });
    });
    y -= rowHeight;
  };
  addPage();
  for (const values of rows) {
    if (y < 38) addPage();
    values.forEach((value, index) => {
      const displayValue = typeof value === 'number' && Number.isFinite(value)
        ? `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : value;
      const text = pdfSafeText(displayValue);
      const size = 6.5;
      const textWidth = regular.widthOfTextAtSize(text, size);
      const numeric = typeof value === 'number' || /^-?[\d,]+(?:\.\d+)?$/.test(String(value ?? ''));
      const x = numeric
        ? margin + (index + 1) * columnWidth - textWidth - 4
        : margin + index * columnWidth + 3;
      page.drawText(text.slice(0, 80), {
        x: Math.max(margin + index * columnWidth + 2, x),
        y,
        size,
        font: regular,
        color: rgb(.16, .2, .27),
        maxWidth: columnWidth - 5,
      });
    });
    page.drawLine({
      start: { x: margin, y: y - 4 },
      end: { x: margin + tableWidth, y: y - 4 },
      thickness: .3,
      color: rgb(.87, .89, .92),
    });
    y -= rowHeight;
  }
  for (const [index, currentPage] of document.getPages().entries()) {
    currentPage.drawText(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC  |  Page ${index + 1} of ${pageNumber}`, {
      x: margin,
      y: 18,
      size: 6.5,
      font: regular,
      color: rgb(.45, .49, .56),
    });
  }
  return Buffer.from(await document.save());
}

module.exports = {
  calculateBalanceSheet,
  calculateCashFlow,
  calculateCashLedgerBalanceMinor,
  calculateOpeningCashMinor,
  calculateProfitAndLoss,
  calculateTrialBalance,
  cashMovementMinorForVoucher,
  classifyCashFlowLedger,
  createExcelXml,
  createReportPdf,
  fromMinor,
  openingBalanceDateBS,
  roundMinor,
  splitBalance,
};
