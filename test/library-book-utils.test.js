const assert = require('assert');
const {
  buildBookCodePrefix,
  generateBookCopyCodes,
  calculateLateFine,
  normalizeBookIsbn
} = require('../model/library/libraryBookUtils');

const prefix = buildBookCodePrefix({
  title: 'Science and Technology',
  author: 'John Smith',
  publisherName: 'Green Press'
});

assert.strictEqual(prefix, 'SAT', 'Title initials should form the book code prefix');
assert.strictEqual(prefix.length <= 8, true, 'Book code prefix should be compact');

const duplicatePrefix = buildBookCodePrefix({
  title: 'Jiban Kada Ki Phool',
  existingPrefixes: ['JKKP']
});
assert.strictEqual(duplicatePrefix, 'JKKP-A', 'Duplicate initial prefix should add an extra unique letter');

const copyCodes = generateBookCopyCodes(prefix, 3);
assert.strictEqual(copyCodes.length, 3, 'Should generate requested copy count');
assert.ok(copyCodes.every((code) => /^SAT-/.test(code)), 'Each copy code should use the title-initial prefix');
assert.strictEqual(new Set(copyCodes).size, copyCodes.length, 'Generated codes should be unique');

assert.strictEqual(normalizeBookIsbn(''), undefined, 'Blank ISBN should be treated as absent for sparse unique index');
assert.strictEqual(normalizeBookIsbn('  978-1-2345-6789-0  '), '978-1-2345-6789-0', 'ISBN should be trimmed');

const fine = calculateLateFine({
  dueDate: '2026-09-10',
  returnDate: '2026-09-15',
  finePerDay: 10,
  quantity: 2
});

assert.strictEqual(fine.daysLate, 5, 'Late days should be calculated correctly');
assert.strictEqual(fine.fineAmount, 100, 'Fine should be based on days late and quantity');

console.log('Library book utility tests passed.');
