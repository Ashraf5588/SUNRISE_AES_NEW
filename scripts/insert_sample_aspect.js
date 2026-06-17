const connectDB = require('../config/connection');
const mongoose = require('mongoose');
const AspectContainer = require('../model/aspectcontainerschema');

(async function(){
  try{
    await connectDB();

    const filter = { studentClass: 'Three', subject: 'NEPALI' };
    const doc = {
      studentClass: 'Three',
      subject: 'NEPALI',
      credit: 0,
      aspects: [
        {
          aspectName: 'dsfadfsdfsdf',
          tools: [
            {
              toolName: 'dfs',
              indicators: [
                { indicatorName: 'fds', maxMarks: 20 },
                { indicatorName: 'sdf', maxMarks: 10 }
              ],
              totalMax: 30
            }
          ],
          totalMarks: 30
        }
      ],
      updatedAt: Date.now()
    };

    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
    const saved = await AspectContainer.findOneAndUpdate(filter, { $set: doc }, opts);
    console.log('Upserted AspectContainer id:', saved._id.toString());
  } catch (err) {
    console.error('Error inserting sample aspectcontainer:', err);
  } finally {
    try { await mongoose.connection.close(); } catch(e){}
  }
})();
