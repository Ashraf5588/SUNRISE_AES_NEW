const { toMinorUnits } = require('./journalVoucher');

function buildFeeHeadIncomeEntries(invoiceItems, feeHeads, ledgers) {
  const feeHeadsById = new Map(feeHeads.map(feeHead => [String(feeHead._id), feeHead]));
  const ledgersById = new Map(ledgers.map(ledger => [String(ledger._id), ledger]));
  const incomeAmounts = new Map();

  for (const item of invoiceItems || []) {
    const feeHeadId = String(item.feeCategory || '');
    const feeHead = feeHeadsById.get(feeHeadId);
    const feeHeadName = String(feeHead?.feehead || feeHead?.name || item.label || 'Unknown fee head').trim();

    if (!feeHead) {
      throw new Error(`Fee head "${feeHeadName}" is unavailable. Verify the fee-head configuration before generating the invoice.`);
    }

    const ledgerId = String(feeHead.incomeLedger?._id || feeHead.incomeLedger || '');
    if (!ledgerId) {
      throw new Error(`Fee head "${feeHeadName}" has no income ledger mapping. Configure an active income ledger before generating the invoice.`);
    }

    const ledger = ledgersById.get(ledgerId);
    if (!ledger || ledger.isActive === false) {
      throw new Error(`Fee head "${feeHeadName}" is mapped to an inactive or unavailable income ledger.`);
    }
    if (ledger.nature !== 'INCOME') {
      throw new Error(`Fee head "${feeHeadName}" must be mapped to an active income ledger.`);
    }

    const amountMinor = toMinorUnits(item.amount);
    if (amountMinor === null || amountMinor < 0) {
      throw new Error(`Fee head "${feeHeadName}" has an invalid invoice amount.`);
    }
    if (amountMinor === 0) continue;

    incomeAmounts.set(
      ledgerId,
      (incomeAmounts.get(ledgerId) || 0) + amountMinor
    );
  }

  return [...incomeAmounts].map(([ledger, amountMinor]) => ({
    ledger,
    debit: 0,
    credit: amountMinor / 100,
  }));
}

module.exports = { buildFeeHeadIncomeEntries };
