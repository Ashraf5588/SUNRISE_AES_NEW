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

const addQuantity = (totals, month, type, quantity) => {
    const value = Number(quantity);
    if (month && Number.isFinite(value) && value > 0) totals[month][type] += value;
};

function buildInventoryMonthlyReport({ academicYear, months, openingProducts = [], purchases, sales }) {
    const selectedMonths = new Set(months);
    const monthlyTotals = Object.fromEntries(months.map(month => [month, { purchase: 0, sales: 0 }]));

    openingProducts.forEach(product => {
        const month = getMonthForDate(product.entryDateNepali, academicYear, selectedMonths);
        const purchaseQuantity = product.buyQuantity === undefined || product.buyQuantity === null
            ? Number(product.quantity) || 0
            : Number(product.buyQuantity);
        const conversionFactor = Number(product.conversionFactor) || 1;
        addQuantity(monthlyTotals, month, 'purchase', purchaseQuantity * conversionFactor);
    });
    purchases.forEach(purchase => {
        const month = getMonthForDate(purchase.purchaseNepaliDate, academicYear, selectedMonths);
        addQuantity(monthlyTotals, month, 'purchase', purchase.baseQuantity);
    });
    sales.forEach(transaction => {
        const month = getMonthForDate(transaction.assignedNepaliDate, academicYear, selectedMonths);
        if (!month) return;
        (Array.isArray(transaction.items) ? transaction.items : []).forEach(item => {
            addQuantity(monthlyTotals, month, 'sales', item.quantity);
        });
    });

    const totals = Object.values(monthlyTotals).reduce((result, monthTotal) => ({
        purchase: result.purchase + monthTotal.purchase,
        sales: result.sales + monthTotal.sales
    }), { purchase: 0, sales: 0 });

    return { academicYear, months, monthlyTotals, totals };
}

module.exports = { BS_MONTH_NAMES, buildInventoryMonthlyReport };
