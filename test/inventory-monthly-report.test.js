const assert = require('node:assert/strict');
const test = require('node:test');
const { buildInventoryMonthlyReport } = require('../utils/inventoryMonthlyReport');

test('builds selected-month purchase and sales totals for the academic year', () => {
    const report = buildInventoryMonthlyReport({
        academicYear: '2083',
        months: ['Baisakh', 'Jestha', 'Asar'],
        openingProducts: [
            { _id: 'p1', entryDateNepali: '2083-01-02', buyQuantity: 25, quantity: 25, conversionFactor: 1, price: 200 },
            { _id: 'p2', entryDateNepali: '2083-03-08', buyQuantity: 2, quantity: 4, conversionFactor: 2, price: 50 },
            { _id: 'p0', entryDateNepali: '2082-01-02', buyQuantity: 99, conversionFactor: 1, price: 10 },
            { _id: 'p4', entryDateNepali: '2083-04-04', buyQuantity: 100, conversionFactor: 1, price: 10 }
        ],
        purchases: [
            { purchaseNepaliDate: '2083-01-03', product: 'p1', baseQuantity: 12, totalCost: 1200 },
            { purchaseNepaliDate: '2083-03-15', product: 'p2', baseQuantity: 2.5, totalCost: 75 },
            { purchaseNepaliDate: '2082-01-03', product: 'p0', baseQuantity: 99, totalCost: 990 },
            { purchaseNepaliDate: '2083-04-03', product: 'p4', baseQuantity: 50, totalCost: 500 }
        ],
        sales: [
            {
                assignedNepaliDate: '2083-01-06',
                items: [
                    { product: { _id: 'p1', price: 200, conversionFactor: 1 }, quantity: 3 },
                    { product: { _id: 'p2', price: 50, conversionFactor: 2 }, quantity: 2 }
                ]
            },
            {
                assignedNepaliDate: '2083-03-20',
                items: [{ product: { _id: 'p2', price: 50, conversionFactor: 2 }, quantity: 2 }]
            },
            {
                assignedNepaliDate: '2082-01-06',
                items: [{ product: { _id: 'p0', price: 10, conversionFactor: 1 }, quantity: 99 }]
            }
        ]
    });

    assert.deepEqual(report.monthlyTotals, {
        Baisakh: {
            purchaseVarieties: 1,
            purchaseQty: 37,
            purchaseAmount: 6200,
            salesVarieties: 2,
            salesQty: 5,
            salesAmount: 650
        },
        Jestha: {
            purchaseVarieties: 0,
            purchaseQty: 0,
            purchaseAmount: 0,
            salesVarieties: 0,
            salesQty: 0,
            salesAmount: 0
        },
        Asar: {
            purchaseVarieties: 1,
            purchaseQty: 6.5,
            purchaseAmount: 175,
            salesVarieties: 1,
            salesQty: 2,
            salesAmount: 50
        }
    });
    assert.deepEqual(report.totals, {
        purchaseVarieties: 2,
        purchaseQty: 43.5,
        purchaseAmount: 6375,
        salesVarieties: 2,
        salesQty: 7,
        salesAmount: 700
    });
});
