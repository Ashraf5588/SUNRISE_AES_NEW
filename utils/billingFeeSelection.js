const monthAliases = {
  baishakh: 'baisakh',
  baishak: 'baisakh',
  ashadh: 'ashad',
  asadh: 'ashad',
  asar: 'ashad',
  ashar: 'ashad',
  ashad: 'ashad',
  aswin: 'ashwin',
  ashoj: 'ashwin',
  aasoj: 'ashwin',
  aashwin: 'ashwin',
  bhadra: 'bhadra',
  bhaadra: 'bhadra',
  mangsir: 'mangsir',
  magsir: 'mangsir',
  poush: 'poush',
  poosh: 'poush',
  magh: 'magh',
  falgun: 'falgun',
  chaitra: 'chaitra',
  chait: 'chaitra',
  jestha: 'jestha',
  jeth: 'jestha',
  shrawan: 'shrawan',
  shrwan: 'shrawan',
  kartik: 'kartik',
};
const billingMonths = new Set([
  'baisakh',
  'jestha',
  'ashad',
  'shrawan',
  'bhadra',
  'ashwin',
  'kartik',
  'mangsir',
  'poush',
  'magh',
  'falgun',
  'chaitra',
]);
const MAX_INVOICE_AMOUNT_MINOR = 99999999999999;

const normalizeBillingMonth = month => {
  const normalized = String(month || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return monthAliases[normalized] || normalized;
};
const createInvoiceGenerationKey = (studentId, academicSession, billDateBS, billMonthBS) =>
  `${studentId}:${academicSession}:${String(billDateBS || '').slice(0, 4)}:${normalizeBillingMonth(billMonthBS)}`;
const isValidBillingMonth = month => billingMonths.has(normalizeBillingMonth(month));

const isSameUtcMonth = (first, second) => first instanceof Date
  && second instanceof Date
  && first.getUTCFullYear() === second.getUTCFullYear()
  && first.getUTCMonth() === second.getUTCMonth();

function buildFeeHeadOptions(structures, options = {}) {
  const {
    feeHeads,
    billMonthBS,
    billDateAD,
    admissionDateAD,
    discounts = [],
    transport = null,
  } = options || {};
  const month = normalizeBillingMonth(billMonthBS);
  const admissionMonth = isSameUtcMonth(billDateAD, admissionDateAD);
  const safeStructures = Array.isArray(structures) ? structures : [];
  const structureByFeeHeadId = new Map(safeStructures
    .filter(structure => structure.feeCategory)
    .map(structure => [String(structure.feeCategory._id || structure.feeCategory), structure]));
  const normalizedFeeHeads = Array.isArray(feeHeads) ? feeHeads : [];
  const configuredFeeHeads = normalizedFeeHeads.length
    ? normalizedFeeHeads
    : [...structureByFeeHeadId.values()].map(structure => structure.feeCategory);

  return (configuredFeeHeads || []).flatMap(feeHead => {
    if (!feeHead) return [];
    const structure = structureByFeeHeadId.get(String(feeHead._id));
    const feeHeadName = String(feeHead.feehead || feeHead.name || 'Fee').trim();
    const isTransportFee = [feeHeadName, feeHead.reportname, feeHead.group]
      .filter(Boolean)
      .some(value => /transport|\bbus\b/i.test(String(value)));
    const frequency = String(feeHead.frequency || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const appliedMonths = Array.isArray(feeHead.appliedmonth)
      ? feeHead.appliedmonth.map(normalizeBillingMonth).filter(Boolean)
      : [];
    const isOneTime = ['one_time', 'onetime'].includes(frequency);
    let scheduled = appliedMonths.length
      ? appliedMonths.includes(month)
      : frequency === 'monthly' || (isOneTime && admissionMonth);

    let amountMinor = structure ? Math.round(Number(structure.amount || 0) * 100) : null;
    const hasTransportRoute = isTransportFee
      && transport
      && (transport.routeSpecific === true
        || (Number.isFinite(Number(transport.fee)) && Number(transport.fee) > 0));
    if (isTransportFee) {
      scheduled = Boolean(hasTransportRoute);
      if (hasTransportRoute) {
        amountMinor = transport.routeSpecific
          ? null
          : Math.round(Number(transport.fee) * 100);
      }
    }
    const matchingDiscount = discounts.find(entry => String(entry.feehead) === String(feeHead._id));
    if (!isTransportFee && matchingDiscount && amountMinor !== null) {
      amountMinor = Math.round(matchingDiscount.discountType === 'PERCENTAGE'
        ? amountMinor - (amountMinor * Number(matchingDiscount.value || 0)) / 100
        : amountMinor - Number(matchingDiscount.value || 0) * 100);
    }

    return [{
      feeCategory: String(feeHead._id),
      feeStructureId: structure && !hasTransportRoute ? String(structure._id || '') : '',
      feeHeadName,
      frequency: String(feeHead.frequency || ''),
      label: `${feeHeadName}${appliedMonths.length > 1 || frequency === 'monthly' ? ` - ${billMonthBS}` : ''}`,
      amount: amountMinor === null ? null : Math.max(0, amountMinor) / 100,
      hasStructure: Boolean(structure || hasTransportRoute),
      scheduled,
      applicable: scheduled && (Boolean(structure) || Boolean(hasTransportRoute)),
      appliedMonths,
      isTransportFee,
      routeSpecific: Boolean(transport && transport.routeSpecific && isTransportFee),
      transportRouteName: hasTransportRoute ? String(transport.routeName || '') : '',
      incomeLedger: feeHead.incomeLedger || null,
    }];
  });
}

function selectInvoiceFeeItems(options, selectedFeeHeadIds, feeHeadAmounts, settings = {}) {
  const {
    skipUnavailableTransportFeeHeadIds = [],
  } = settings || {};
  if (selectedFeeHeadIds === undefined) {
    return (options || []).filter(option => option.applicable).map(option => toInvoiceSnapshot(option));
  }

  if (feeHeadAmounts !== undefined && (!feeHeadAmounts || typeof feeHeadAmounts !== 'object' || Array.isArray(feeHeadAmounts))) {
    throw new Error('Invoice fee amounts are invalid. Reload the fee selection and try again.');
  }

  const selectedIds = [...new Set((Array.isArray(selectedFeeHeadIds) ? selectedFeeHeadIds : [selectedFeeHeadIds])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
  if (!selectedIds.length) throw new Error('Select at least one configured fee head before generating the invoice.');

  const optionById = new Map((options || []).map(option => [String(option.feeCategory), option]));
  const unavailable = selectedIds.find(id => !optionById.has(id));
  if (unavailable) throw new Error('One or more selected fee heads are unavailable. Reload the fee selection.');
  const routeSpecificIds = new Set((Array.isArray(skipUnavailableTransportFeeHeadIds)
    ? skipUnavailableTransportFeeHeadIds
    : [skipUnavailableTransportFeeHeadIds]
  )
    .map(value => String(value || '').trim())
    .filter(Boolean));

  return selectedIds.flatMap(id => {
    const option = optionById.get(id);
    if (routeSpecificIds.has(id) && option.isTransportFee && !option.applicable) return [];
    const hasSubmittedAmount = feeHeadAmounts
      && Object.prototype.hasOwnProperty.call(feeHeadAmounts, id);
    const amount = hasSubmittedAmount
      ? parseInvoiceAmount(feeHeadAmounts[id], option.feeHeadName)
      : option.amount;
    if (option.routeSpecific && amount === null) {
      throw new Error(`The saved route fare for fee head "${option.feeHeadName}" must be applied per student.`);
    }
    if (amount === null || amount === undefined) {
      throw new Error(`Enter an amount for fee head "${option.feeHeadName}" before generating the invoice.`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Amount for fee head "${option.feeHeadName}" must be greater than zero.`);
    }
    return [toInvoiceSnapshot(option, amount)];
  });
}

function parseInvoiceAmount(value, feeHeadName) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error(`Enter a valid amount with no more than two decimal places for fee head "${feeHeadName}".`);
  }
  const amountMinor = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_INVOICE_AMOUNT_MINOR) {
    throw new Error(`Amount for fee head "${feeHeadName}" must be greater than zero and within the supported range.`);
  }
  return amountMinor / 100;
}

function toInvoiceSnapshot(option, amount = option.amount) {
  return {
    feeCategory: option.feeCategory,
    feeStructureId: option.feeStructureId || null,
    feeHeadName: option.feeHeadName,
    frequency: option.frequency,
    label: option.label,
    amount,
    routeSpecific: Boolean(option.routeSpecific),
    transportRouteName: option.transportRouteName || '',
  };
}

module.exports = {
  buildFeeHeadOptions,
  createInvoiceGenerationKey,
  isValidBillingMonth,
  normalizeBillingMonth,
  parseInvoiceAmount,
  selectInvoiceFeeItems,
};
