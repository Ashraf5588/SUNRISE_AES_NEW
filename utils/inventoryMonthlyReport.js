const BS_MONTH_NAMES = [
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

const getMonthForDate = (date, academicYear, selectedMonths) => {
    const match = String(date || '').trim().match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (!match || match[1] !== academicYear) return '';
    const month = BS_MONTH_NAMES[Number(match[2]) - 1];
    return selectedMonths.has(month) ? month : '';
};

const addValue = (totals, month, type, value) => {
    const number = Number(value);
    if (month && Number.isFinite(number) && number > 0) totals[month][type] += number;
};

const getVarietyKey = (record, fallbackPrefix) => {
    const productId = record?.product?._id || record?.product || record?._id;
    if (productId) return `id:${String(productId)}`;
    if (record?.sku) return `sku:${String(record.sku).trim().toLowerCase()}`;
    if (record?.productName || record?.name) {
        return `name:${String(record.productName || record.name).trim().toLowerCase()}`;
    }
    return `${fallbackPrefix}:${String(record?._id || '')}`;
};

const addVariety = (monthlyTotals, allVarieties, month, type, record, fallbackPrefix) => {
    if (!month) return;
    const key = getVarietyKey(record, fallbackPrefix);
    monthlyTotals[month][`${type}VarietyKeys`].add(key);
    allVarieties.add(key);
};

const getMonthQuantity = (monthlyTotals, month, type, quantity) => {
    const value = Number(quantity);
    if (!month || !Number.isFinite(value) || value <= 0) return false;
    monthlyTotals[month][`${type}Qty`] += value;
    return true;
};

function buildInventoryMonthlyReport({ academicYear, months, openingProducts = [], purchases, sales }) {
    const selectedMonths = new Set(months);
    const monthlyTotals = Object.fromEntries(months.map(month => [month, {
        purchaseVarietyKeys: new Set(),
        purchaseQty: 0,
        purchaseAmount: 0,
        salesVarietyKeys: new Set(),
        salesQty: 0,
        salesAmount: 0
    }]));
    const allPurchaseVarieties = new Set();
    const allSalesVarieties = new Set();

    openingProducts.forEach(product => {
        const month = getMonthForDate(product.entryDateNepali, academicYear, selectedMonths);
        const conversionFactor = Number(product.conversionFactor) || 1;
        const hasPurchaseQuantity = product.buyQuantity !== undefined && product.buyQuantity !== null;
        const baseQuantity = hasPurchaseQuantity
            ? Number(product.buyQuantity) * conversionFactor
            : Number(product.quantity) || 0;
        if (getMonthQuantity(monthlyTotals, month, 'purchase', baseQuantity)) {
            addVariety(monthlyTotals, allPurchaseVarieties, month, 'purchase', product, 'opening');
            const purchaseUnitQuantity = hasPurchaseQuantity
                ? Number(product.buyQuantity)
                : baseQuantity / conversionFactor;
            addValue(monthlyTotals, month, 'purchaseAmount', purchaseUnitQuantity * Number(product.price || 0));
        }
    });
    purchases.forEach(purchase => {
        const month = getMonthForDate(purchase.purchaseNepaliDate, academicYear, selectedMonths);
        if (getMonthQuantity(monthlyTotals, month, 'purchase', purchase.baseQuantity)) {
            addVariety(monthlyTotals, allPurchaseVarieties, month, 'purchase', purchase, 'receipt');
            addValue(monthlyTotals, month, 'purchaseAmount', purchase.totalCost);
        }
    });
    sales.forEach(transaction => {
        const month = getMonthForDate(transaction.assignedNepaliDate, academicYear, selectedMonths);
        if (!month) return;
        (Array.isArray(transaction.items) ? transaction.items : []).forEach(item => {
            if (!getMonthQuantity(monthlyTotals, month, 'sales', item.quantity)) return;
            addVariety(monthlyTotals, allSalesVarieties, month, 'sales', item, 'sale');
            const product = item.product && typeof item.product === 'object' ? item.product : {};
            const conversionFactor = Number(product.conversionFactor) || 1;
            const purchaseUnitQuantity = Number(item.quantity) / conversionFactor;
            addValue(monthlyTotals, month, 'salesAmount', purchaseUnitQuantity * Number(product.price || 0));
        });
    });

    const resultByMonth = Object.fromEntries(months.map(month => {
        const totals = monthlyTotals[month];
        return [month, {
            purchaseVarieties: totals.purchaseVarietyKeys.size,
            purchaseQty: totals.purchaseQty,
            purchaseAmount: totals.purchaseAmount,
            salesVarieties: totals.salesVarietyKeys.size,
            salesQty: totals.salesQty,
            salesAmount: totals.salesAmount
        }];
    }));
    const totals = Object.values(resultByMonth).reduce((result, monthTotal) => ({
        ...result,
        purchaseQty: result.purchaseQty + monthTotal.purchaseQty,
        purchaseAmount: result.purchaseAmount + monthTotal.purchaseAmount,
        salesQty: result.salesQty + monthTotal.salesQty,
        salesAmount: result.salesAmount + monthTotal.salesAmount
    }), {
        purchaseVarieties: allPurchaseVarieties.size,
        purchaseQty: 0,
        purchaseAmount: 0,
        salesVarieties: allSalesVarieties.size,
        salesQty: 0,
        salesAmount: 0
    });

    return { academicYear, months, monthlyTotals: resultByMonth, totals };
}

module.exports = { BS_MONTH_NAMES, buildInventoryMonthlyReport };
