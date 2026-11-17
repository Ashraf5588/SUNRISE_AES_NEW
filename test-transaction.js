
const mongoose = require('mongoose');

async function testTransaction() {
  const uri = 'mongodb://127.0.0.1:27017/aes?replicaSet=rs0';

  try {
    await mongoose.connect(uri);

    console.log('MongoDB connected:', mongoose.connection.name);

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const testCollection = mongoose.connection.collection(
        'replica_set_transaction_test'
      );

      const testId = new mongoose.Types.ObjectId();

      await testCollection.insertOne(
        {
          _id: testId,
          message: 'Temporary transaction test'
        },
        { session }
      );

      console.log('Document inserted inside transaction.');

      await session.abortTransaction();

      console.log('Transaction aborted successfully.');

      const document = await testCollection.findOne({ _id: testId });

      if (document === null) {
        console.log('SUCCESS: Rollback verified. No test document remains.');
      } else {
        console.log('FAILED: Test document still exists.');
      }
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('TRANSACTION TEST FAILED:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testTransaction();
