const formatVoucherType = type => String(type || '')
  .trim()
  .toLowerCase()
  .split('_')
  .filter(Boolean)
  .map(word => `${word[0].toUpperCase()}${word.slice(1)}`)
  .join(' ');

const getVoucherDisplayStatus = voucher => voucher?.reversedBy
  ? 'REVERSED'
  : String(voucher?.status || 'UNKNOWN').trim().toUpperCase();

const formatFiscalYearBS = dateBS => {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateBS || '').trim());
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return '';

  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}/${String(endYear).slice(-3).padStart(3, '0')}`;
};

const calculateStudentPaymentAdvance = ({ amountMinor, totalAllocatedMinor, postedReceivableMinor }) => {
  const amounts = [amountMinor, totalAllocatedMinor, postedReceivableMinor];
  if (!amounts.every(Number.isSafeInteger)
    || amountMinor <= 0
    || totalAllocatedMinor < 0
    || postedReceivableMinor < 0
    || totalAllocatedMinor > amountMinor
    || postedReceivableMinor > totalAllocatedMinor) {
    throw new Error('Student payment allocations are inconsistent.');
  }
  return {
    advanceMinor: amountMinor - totalAllocatedMinor,
    unmappedReceivableMinor: totalAllocatedMinor - postedReceivableMinor,
  };
};

const choosePostingStatus = (role, threshold, amount) => {
  if (role === 'ADMIN') return 'POSTED';
  if (role === 'CASHIER') return 'PENDING_ACCOUNTANT_REVIEW';
  if (role === 'ACCOUNTANT') {
    const approvalLimit = Number(threshold || 0);
    return approvalLimit > 0 && Number(amount) >= approvalLimit
      ? 'PENDING_ADMIN_APPROVAL'
      : 'POSTED';
  }
  throw new Error('You are not authorized to create accounting transactions.');
};

const accountingVoucherNumber = (type, sequence) => {
  const prefixes = {
    JOURNAL: 'JV',
    RECEIPT: 'RV',
    PAYMENT: 'PV',
    CONTRA: 'CV',
    FEE_INVOICE: 'FI',
    FEE_RECEIPT: 'FR',
    REVERSAL: 'RV',
    OPENING_BALANCE: 'OB',
    CLOSING: 'CL',
  };
  const prefix = prefixes[type];
  if (!prefix) throw new Error('Unsupported accounting voucher type.');
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
};

module.exports = {
  accountingVoucherNumber,
  calculateStudentPaymentAdvance,
  choosePostingStatus,
  formatVoucherType,
  getVoucherDisplayStatus,
  formatFiscalYearBS,
};
