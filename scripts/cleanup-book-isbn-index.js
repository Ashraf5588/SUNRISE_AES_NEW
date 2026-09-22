const { MongoClient } = require('mongodb');

(async () => {
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017');
  const db = client.db('aes');
  const books = db.collection('books');

  try {
    const before = await books.countDocuments({ $or: [{ isbn: null }, { isbn: '' }] });
    console.log('blankOrNullISBNBefore', before);

    await books.updateMany(
      { $or: [{ isbn: null }, { isbn: '' }] },
      { $unset: { isbn: 1 } }
    );

    try {
      await books.dropIndex('isbn_1');
      console.log('dropped index isbn_1');
    } catch (dropError) {
      console.log('dropIndexSkipped', dropError.message);
    }

    await books.createIndex({ isbn: 1 }, { unique: true, sparse: true });
    console.log('created sparse unique index on isbn');

    const after = await books.countDocuments({ $or: [{ isbn: null }, { isbn: '' }] });
    console.log('blankOrNullISBNAfter', after);

    const indexes = await books.listIndexes().toArray();
    console.log('booksIndexes', JSON.stringify(indexes, null, 2));
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error('cleanup failed:', error);
  process.exit(1);
});
