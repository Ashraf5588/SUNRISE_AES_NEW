const assert = require('node:assert/strict');
const test = require('node:test');
const {
  convertToBaseQuantity,
  describeEquivalentStock,
  getProductUnits,
  hasSufficientStock
} = require('../utils/inventoryUnitConversion');

test('preserves legacy products as base-unit stock with factor one', () => {
  const product = { quantityTypeName: 'Pieces', quantity: 8 };
  assert.deepEqual(getProductUnits(product), {
    baseUnit: 'Pieces',
    purchaseUnit: 'Pieces',
    conversionFactor: 1
  });
  assert.equal(product.quantity, 8);
  assert.equal(describeEquivalentStock(product.quantity, product), '8 Pieces');
});

test('converts marker purchases and sales using the product-specific factor', () => {
  const marker = { baseUnit: 'Pieces', purchaseUnit: 'Packet', conversionFactor: 12 };
  const purchase = convertToBaseQuantity(2, 'purchase', marker);
  assert.equal(purchase.baseQuantity, 24);
  const piecesSold = convertToBaseQuantity(5, 'base', marker);
  assert.equal(24 - piecesSold.baseQuantity, 19);
  const packetSold = convertToBaseQuantity(1, 'purchase', marker);
  assert.equal(19 - packetSold.baseQuantity, 7);
  assert.equal(describeEquivalentStock(19, marker), '1 Packet + 7 Pieces');
});

test('converts duster receipts and issues in base units', () => {
  const duster = { baseUnit: 'Piece', purchaseUnit: 'Packet', conversionFactor: 4 };
  const received = convertToBaseQuantity(2, 'purchase', duster).baseQuantity;
  assert.equal(received, 8);
  assert.equal(describeEquivalentStock(received, duster), '2 Packet');
  const remaining = received - convertToBaseQuantity(3, 'base', duster).baseQuantity;
  assert.equal(remaining, 5);
  assert.equal(describeEquivalentStock(remaining, duster), '1 Packet + 1 Piece');
});

test('converts fractional purchase units without integer-only rounding', () => {
  const product = { baseUnit: 'ml', purchaseUnit: 'Litre', conversionFactor: 1000 };
  assert.equal(convertToBaseQuantity(1.25, 'purchase', product).baseQuantity, 1250);
  assert.equal(convertToBaseQuantity(0.5, 'purchase', { baseUnit: 'kg', purchaseUnit: 'Tonne', conversionFactor: 1000 }).baseQuantity, 500);
});

test('rejects invalid quantities and units', () => {
  const product = { baseUnit: 'Piece', purchaseUnit: 'Box', conversionFactor: 20 };
  assert.equal(convertToBaseQuantity(0, 'purchase', product), null);
  assert.equal(convertToBaseQuantity(2, 'carton', product), null);
});

test('compares converted sales against base stock to reject insufficient stock', () => {
  const product = { baseUnit: 'Piece', purchaseUnit: 'Packet', conversionFactor: 12 };
  const sale = convertToBaseQuantity(1, 'purchase', product);
  assert.equal(hasSufficientStock(5, sale.baseQuantity), false);
  assert.equal(hasSufficientStock(5, convertToBaseQuantity(5, 'base', product).baseQuantity), true);
});
