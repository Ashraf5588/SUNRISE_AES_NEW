require('dotenv').config();

const mongoose = require('mongoose');
const url = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aes';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 10s
    });
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Please make sure MongoDB is running on your system');
    process.exit(1);
  }
}
module.exports = connectDB;