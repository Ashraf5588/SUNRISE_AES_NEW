const { classifyCashBankLedger } = require('./cashBank');

const MAX_AMOUNT = 999999999999.99;

const toMinorUnits = value => {
  if (value === '' || value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount > MAX_AMOUNT) return null;
  return Math.round(amount * 100);
};

const validateJournalEntries = (submittedEntries, ledgers) => {
  if (!Array.isArray(submittedEntries)) {
    return { error: 'Add at least two debit or credit entries.' };
  }

  const ledgerIds = new Set(ledgers.map(ledger => String(ledger._id)));
  const entries = [];

  for (const [index, submitted] of submittedEntries.entries()) {
    const accountId = String(submitted?.ledger || '').trim();
    const debitText = String(submitted?.debit ?? '').trim();
    const creditText = String(submitted?.credit ?? '').trim();
    if (!accountId && !debitText && !creditText) continue;
    if (!accountId) return { error: `Choose an account for entry ${index + 1}.` };
    if (!ledgerIds.has(accountId)) return { error: `The account selected for entry ${index + 1} is unavailable.` };

    const debitMinor = toMinorUnits(debitText);
    const creditMinor = toMinorUnits(creditText);
    if (debitMinor === null || creditMinor === null) {
      return { error: `Enter a valid amount with no more than two decimal places for entry ${index + 1}.` };
    }
    if ((debitMinor > 0) === (creditMinor > 0)) {
      return { error: `Entry ${index + 1} must have an amount on exactly one side.` };
    }

    entries.push({
      ledger: accountId,
      debitMinor,
      creditMinor,
    });
  }

  if (entries.length < 2) return { error: 'A journal voucher requires at least two entries.' };

  const totalDebitMinor = entries.reduce((sum, entry) => sum + entry.debitMinor, 0);
  const totalCreditMinor = entries.reduce((sum, entry) => sum + entry.creditMinor, 0);
  if (!Number.isSafeInteger(totalDebitMinor) || !Number.isSafeInteger(totalCreditMinor)) {
    return { error: 'The voucher total exceeds the supported amount.' };
  }
  if (totalDebitMinor <= 0 || totalCreditMinor <= 0) {
    return { error: 'A journal voucher must include both debit and credit amounts.' };
  }
  if (totalDebitMinor !== totalCreditMinor) {
    return { error: 'The voucher is not balanced. Total debit must equal total credit.' };
  }

  return {
    entries: entries.map(({ ledger, debitMinor, creditMinor }) => ({
      ledger,
      debit: debitMinor / 100,
      credit: creditMinor / 100,
    })),
    totalDebit: totalDebitMinor / 100,
    totalCredit: totalCreditMinor / 100,
  };
};

const formatVoucherNumber = sequence => `JV-${String(sequence).padStart(4, '0')}`;

const buildContraVoucherData = ({
  fromLedger,
  toLedger,
  amountMinor,
  referenceNumber = '',
}) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Enter a valid positive transfer amount.');
  }
  const fromType = classifyCashBankLedger(fromLedger);
  const toType = classifyCashBankLedger(toLedger);
  if (fromLedger?.isActive === false || toLedger?.isActive === false
    || !fromType || !toType || String(fromLedger?._id) === String(toLedger?._id)) {
    throw new Error('Choose two different active cash or bank accounts for the transfer.');
  }
  const amount = amountMinor / 100;
  return {
    voucherType: 'CONTRA',
    entries: [
      { ledger: toLedger._id, debit: amount, credit: 0 },
      { ledger: fromLedger._id, debit: 0, credit: amount },
    ],
    transactionDetails: {
      amount,
      fromLedger: fromLedger._id,
      toLedger: toLedger._id,
      referenceNumber: String(referenceNumber || '').trim(),
    },
  };
};

module.exports = {
  buildContraVoucherData,
  formatVoucherNumber,
  toMinorUnits,
  validateJournalEntries,
};
