const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const {
  compressEmployeeDocument,
  EmployeeDocumentProcessingError,
  MAX_STORED_DOCUMENT_SIZE_BYTES
} = require('../utils/employeeDocumentCompression');

test('keeps small documents unchanged and records their size', async () => {
  const buffer = Buffer.from('small employee document');
  const result = await compressEmployeeDocument({
    buffer,
    mimetype: 'application/pdf',
    originalname: 'document.pdf'
  });

  assert.equal(result.buffer, buffer);
  assert.equal(result.fileSizeBytes, buffer.length);
  assert.equal(result.originalSizeBytes, buffer.length);
});

test('compresses oversized images and stores their optimized size', async () => {
  const dimension = 2100;
  const pixels = crypto.randomBytes(dimension * dimension * 3);
  const buffer = await sharp(pixels, {
    raw: { width: dimension, height: dimension, channels: 3 }
  }).png().toBuffer();
  assert.ok(buffer.length > MAX_STORED_DOCUMENT_SIZE_BYTES);

  const result = await compressEmployeeDocument({
    buffer,
    mimetype: 'image/png',
    originalname: 'scan.png'
  });

  assert.ok(result.fileSizeBytes <= MAX_STORED_DOCUMENT_SIZE_BYTES);
  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.extension, '.webp');
  assert.ok(result.originalSizeBytes > result.fileSizeBytes);
});

test('optimizes oversized PDFs before applying the stored-size limit', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Employee document compression test');
  const validPdf = Buffer.from(await pdf.save());
  const buffer = Buffer.concat([
    validPdf,
    Buffer.alloc(MAX_STORED_DOCUMENT_SIZE_BYTES + 1024, 0x20)
  ]);

  const result = await compressEmployeeDocument({
    buffer,
    mimetype: 'application/pdf',
    originalname: 'padded.pdf'
  });

  assert.ok(result.fileSizeBytes <= MAX_STORED_DOCUMENT_SIZE_BYTES);
  assert.equal(result.mimeType, 'application/pdf');
  assert.ok(result.originalSizeBytes > result.fileSizeBytes);
});

test('rejects documents that cannot be optimized below 8 MB', async () => {
  const buffer = Buffer.alloc(MAX_STORED_DOCUMENT_SIZE_BYTES + 1, 0x41);

  await assert.rejects(
    compressEmployeeDocument({
      buffer,
      mimetype: 'application/pdf',
      originalname: 'invalid.pdf'
    }),
    EmployeeDocumentProcessingError
  );
});
