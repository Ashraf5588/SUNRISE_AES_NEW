const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const MAX_STORED_DOCUMENT_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_EMPLOYEE_DOCUMENT_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

class EmployeeDocumentProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmployeeDocumentProcessingError';
    this.statusCode = 400;
  }
}

const compressImage = async buffer => {
  const attempts = [
    { quality: 82 },
    { quality: 72 },
    { quality: 62 },
    { quality: 52 },
    ...[4096, 3072, 2304, 1792].flatMap(size => [
      { size, quality: 72 },
      { size, quality: 58 }
    ])
  ];

  let smallestBuffer = buffer;
  for (const attempt of attempts) {
    try {
      let image = sharp(buffer, { animated: true, failOn: 'error', limitInputPixels: 100_000_000 }).rotate();
      if (attempt.size) {
        image = image.resize({
          width: attempt.size,
          height: attempt.size,
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      const output = await image.webp({ quality: attempt.quality, effort: 5, alphaQuality: 80 }).toBuffer();
      if (output.length < smallestBuffer.length) smallestBuffer = output;
      if (output.length <= MAX_STORED_DOCUMENT_SIZE_BYTES) return output;
    } catch (error) {
      throw new EmployeeDocumentProcessingError('This image could not be compressed. Please upload a supported image file.');
    }
  }
  return smallestBuffer;
};

const compressPdf = async buffer => {
  let pdf;
  try {
    pdf = await PDFDocument.load(buffer);
  } catch (error) {
    throw new EmployeeDocumentProcessingError('This PDF could not be optimized. Make sure it is a valid, unprotected PDF.');
  }

  try {
    return Buffer.from(await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50
    }));
  } catch (error) {
    throw new EmployeeDocumentProcessingError('This PDF could not be optimized. Make sure it is a valid, unprotected PDF.');
  }
};

const compressEmployeeDocument = async file => {
  const originalBuffer = file.buffer;
  const originalSizeBytes = originalBuffer.length;
  let buffer = originalBuffer;
  let mimeType = String(file.mimetype || '').toLowerCase();
  let extension = path.extname(file.originalname || '').toLowerCase();

  if (originalSizeBytes > MAX_STORED_DOCUMENT_SIZE_BYTES) {
    if (mimeType === 'application/pdf') {
      const optimizedBuffer = await compressPdf(originalBuffer);
      if (optimizedBuffer.length < buffer.length) buffer = optimizedBuffer;
    } else if (mimeType.startsWith('image/')) {
      buffer = await compressImage(originalBuffer);
      if (buffer !== originalBuffer) {
        mimeType = 'image/webp';
        extension = '.webp';
      }
    }
  }

  if (buffer.length > MAX_STORED_DOCUMENT_SIZE_BYTES) {
    throw new EmployeeDocumentProcessingError('The document is still larger than 8 MB after compression. Please upload a smaller or more optimized file.');
  }

  return {
    buffer,
    mimeType,
    extension,
    fileSizeBytes: buffer.length,
    originalSizeBytes
  };
};

module.exports = {
  compressEmployeeDocument,
  EmployeeDocumentProcessingError,
  MAX_STORED_DOCUMENT_SIZE_BYTES,
  MAX_EMPLOYEE_DOCUMENT_UPLOAD_SIZE_BYTES
};
