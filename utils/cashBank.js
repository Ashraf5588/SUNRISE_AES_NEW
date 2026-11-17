const classifyCashBankLedger = ledger => {
  const type = String(ledger?.ledgerType || '').trim().toUpperCase();
  if (type === 'CASH') return 'cash';
  if (type === 'BANK') return 'bank';

  const groupName = String(ledger?.group?.name || '').trim().toLowerCase();
  if (/\bcash\b/.test(groupName)) return 'cash';
  if (/\bbank\b/.test(groupName)) return 'bank';
  return '';
};

const calculateLedgerBalances = totals => {
  const balances = new Map();
  for (const total of totals) {
    const debitMinor = Math.round(Number(total.debit || 0) * 100);
    const creditMinor = Math.round(Number(total.credit || 0) * 100);
    balances.set(String(total._id), (debitMinor - creditMinor) / 100);
  }
  return balances;
};

const getNormalBalanceLabel = (balance, normalBalance) => {
  if (!balance) return normalBalance;
  const isDebit = balance > 0;
  return isDebit ? 'DEBIT' : 'CREDIT';
};

module.exports = {
  calculateLedgerBalances,
  classifyCashBankLedger,
  getNormalBalanceLabel,
};
