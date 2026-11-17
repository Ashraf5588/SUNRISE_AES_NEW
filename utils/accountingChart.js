const ACCOUNT_NATURES = [
  { value: 'ASSET', label: 'Assets', normalBalance: 'DEBIT' },
  { value: 'LIABILITY', label: 'Liabilities', normalBalance: 'CREDIT' },
  { value: 'EQUITY', label: 'Equity', normalBalance: 'CREDIT' },
  { value: 'INCOME', label: 'Income', normalBalance: 'CREDIT' },
  { value: 'EXPENSE', label: 'Expenses', normalBalance: 'DEBIT' },
];

const LEDGER_TYPES = [
  { value: 'GENERAL', label: 'General ledger', nature: null },
  { value: 'CASH', label: 'Cash', nature: 'ASSET' },
  { value: 'BANK', label: 'Bank', nature: 'ASSET' },
  { value: 'RECEIVABLE', label: 'Accounts receivable', nature: 'ASSET' },
  { value: 'PAYABLE', label: 'Accounts payable', nature: 'LIABILITY' },
  { value: 'FIXED_ASSET', label: 'Fixed asset', nature: 'ASSET' },
  { value: 'CAPITAL', label: 'Capital', nature: 'EQUITY' },
  { value: 'INCOME', label: 'Income', nature: 'INCOME' },
  { value: 'EXPENSE', label: 'Expense', nature: 'EXPENSE' },
];

const normalizeAccountName = value => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeAccountCode = value => String(value || '').trim().toUpperCase();
const getNormalBalance = nature => ['ASSET', 'EXPENSE'].includes(nature) ? 'DEBIT' : 'CREDIT';

const validateLedgerNature = (ledgerType, groupNature) => {
  const type = LEDGER_TYPES.find(item => item.value === ledgerType);
  if (!type) return 'Choose a valid ledger type.';
  if (type.nature && type.nature !== groupNature) {
    return `${type.label} ledgers must belong to a ${type.nature.toLowerCase()} group.`;
  }
  return '';
};

module.exports = {
  ACCOUNT_NATURES,
  LEDGER_TYPES,
  getNormalBalance,
  normalizeAccountCode,
  normalizeAccountName,
  validateLedgerNature,
};
