const assert = require('node:assert/strict');
const test = require('node:test');
const { buildInventoryMonthlyReport } = require('../utils/inventoryMonthlyReport');

test('builds selected-month purchase and sales totals for the academic year', () => {
    const report = buildInventoryMonthlyReport({
        academicYear: '2083',
        months: ['Baisakh', 'Jestha', 'Asar'],
        purchases: [
            { purchaseNepaliDate: '2083-01-03', baseQuantity: 12 },
            { purchaseNepaliDate: '2083-03-15', baseQuantity: 2.5 },
            { purchaseNepaliDate: '2082-01-03', baseQuantity: 99 },
            { purchaseNepaliDate: '2083-04-03', baseQuantity: 50 }
        ],
        sales: [
            {
                assignedNepaliDate: '2083-01-06',
                items: [{ quantity: 3 }, { quantity: 2 }]
            },
            {
                assignedNepaliDate: '2083-03-20',
                items: [{ quantity: 1.5 }]
            },
            {
                assignedNepaliDate: '2082-01-06',
                items: [{ quantity: 99 }]
            }
        ]
    });

    assert.deepEqual(report.monthlyTotals, {
        Baisakh: { purchase: 12, sales: 5 },
        Jestha: { purchase: 0, sales: 0 },
        Asar: { purchase: 2.5, sales: 1.5 }
    });
    assert.deepEqual(report.totals, { purchase: 14.5, sales: 6.5 });
});
