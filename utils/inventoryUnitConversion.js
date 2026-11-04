const roundQuantity = value => Math.round((Number(value) + Number.EPSILON) * 1e6) / 1e6;

function getProductUnits(product = {}) {
  const baseUnit = String(product.baseUnit || product.quantityTypeName || 'Unit').trim() || 'Unit';
  const purchaseUnit = String(product.purchaseUnit || baseUnit).trim() || baseUnit;
  const conversionFactor = Number(product.conversionFactor);
  return {
    baseUnit,
    purchaseUnit,
    conversionFactor: Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1
  };
}

function convertToBaseQuantity(quantity, unit, product) {
  const enteredQuantity = Number(quantity);
  const { baseUnit, purchaseUnit, conversionFactor } = getProductUnits(product);
  if (!Number.isFinite(enteredQuantity) || enteredQuantity <= 0) return null;
  const normalizedUnit = String(unit || 'base').trim().toLowerCase();
  const selectedUnit = normalizedUnit === 'purchase' || normalizedUnit === purchaseUnit.toLowerCase()
    ? 'purchase'
    : normalizedUnit === 'base' || normalizedUnit === baseUnit.toLowerCase()
      ? 'base'
      : null;
  if (!selectedUnit) return null;
  const baseQuantity = roundQuantity(enteredQuantity * (selectedUnit === 'purchase' ? conversionFactor : 1));
  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return null;
  return {
    enteredQuantity: roundQuantity(enteredQuantity),
    unitName: selectedUnit === 'purchase' ? purchaseUnit : baseUnit,
    conversionFactor: selectedUnit === 'purchase' ? conversionFactor : 1,
    baseQuantity,
    baseUnit
  };
}

function describeEquivalentStock(quantity, product) {
  const stock = Math.max(0, Number(quantity) || 0);
  const { baseUnit, purchaseUnit, conversionFactor } = getProductUnits(product);
  if (conversionFactor <= 1 || purchaseUnit.toLowerCase() === baseUnit.toLowerCase()) {
    return `${roundQuantity(stock)} ${baseUnit}`;
  }
  const purchaseUnits = Math.floor((stock + 1e-9) / conversionFactor);
  const remainder = roundQuantity(stock - purchaseUnits * conversionFactor);
  return remainder > 0
    ? `${purchaseUnits} ${purchaseUnit} + ${remainder} ${baseUnit}`
    : `${purchaseUnits} ${purchaseUnit}`;
}

function hasSufficientStock(availableQuantity, requiredQuantity) {
  const available = Number(availableQuantity);
  const required = Number(requiredQuantity);
  return Number.isFinite(available) && Number.isFinite(required) && available >= 0 && required > 0 && available >= required;
}

module.exports = { roundQuantity, getProductUnits, convertToBaseQuantity, describeEquivalentStock, hasSufficientStock };
