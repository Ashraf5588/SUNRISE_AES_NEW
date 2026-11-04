require('dotenv').config({ path: ['.env.local', '.env'] });

const mongoose = require('mongoose');

async function migrateProductUnits() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aes';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const result = await mongoose.connection.collection('inventoryProducts').updateMany(
      {},
      [{
        $set: {
          baseUnit: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ['$baseUnit', ''] } }, 0] },
              '$baseUnit',
              '$quantityTypeName'
            ]
          },
          purchaseUnit: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ['$purchaseUnit', ''] } }, 0] },
              '$purchaseUnit',
              {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$baseUnit', ''] } }, 0] },
                  '$baseUnit',
                  '$quantityTypeName'
                ]
              }
            ]
          },
          conversionFactor: {
            $cond: [
              { $gt: [{ $ifNull: ['$conversionFactor', 0] }, 0] },
              '$conversionFactor',
              1
            ]
          }
        }
      }]
    );
    console.log(`Updated unit settings on ${result.modifiedCount} product records. Existing quantity values were not changed.`);
  } finally {
    await mongoose.disconnect();
  }
}

migrateProductUnits().catch((error) => {
  console.error('Unable to migrate inventory product units:', error);
  process.exitCode = 1;
});
