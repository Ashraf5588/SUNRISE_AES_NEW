const mongoose = require('mongoose');
require('./config/connection');
const newSubject = mongoose.model('newsubject');

async function findSubjects() {
  try {
    const subjects = await newSubject.find({});
    console.log("All subject configs:");
    console.log(JSON.stringify(subjects, null, 2));
    
    // Specifically check class 1 subjects
    const class1Subjects = await newSubject.find({forClass: '1'});
    console.log("\nClass 1 subjects:");
    console.log(JSON.stringify(class1Subjects, null, 2));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.connection.close();
  }
}

findSubjects();