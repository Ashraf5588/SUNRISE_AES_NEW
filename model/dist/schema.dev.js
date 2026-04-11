"use strict";

var mongoose = require('mongoose');

var studentSchema = new mongoose.Schema({
  "name": {
    type: String,
    required: false
  },
  "roll": {
    type: Number,
    required: false
  },
  "studentClass": {
    type: String,
    required: false
  },
  "section": {
    type: String,
    required: false
  },
  "subject": {
    type: String,
    required: false
  },
  "terminal": {
    type: String,
    required: false
  },
  // Questions q1 to q25 with options from 'a' to 'j'
  "q1a": {
    type: String,
    required: false
  },
  "q1b": {
    type: String,
    required: false
  },
  "q1c": {
    type: String,
    required: false
  },
  "q1d": {
    type: String,
    required: false
  },
  "q1e": {
    type: String,
    required: false
  },
  "q1f": {
    type: String,
    required: false
  },
  "q1g": {
    type: String,
    required: false
  },
  "q1h": {
    type: String,
    required: false
  },
  "q1i": {
    type: String,
    required: false
  },
  "q1j": {
    type: String,
    required: false
  },
  "q2a": {
    type: String,
    required: false
  },
  "q2b": {
    type: String,
    required: false
  },
  "q2c": {
    type: String,
    required: false
  },
  "q2d": {
    type: String,
    required: false
  },
  "q2e": {
    type: String,
    required: false
  },
  "q2f": {
    type: String,
    required: false
  },
  "q2g": {
    type: String,
    required: false
  },
  "q2h": {
    type: String,
    required: false
  },
  "q2i": {
    type: String,
    required: false
  },
  "q2j": {
    type: String,
    required: false
  },
  "q3a": {
    type: String,
    required: false
  },
  "q3b": {
    type: String,
    required: false
  },
  "q3c": {
    type: String,
    required: false
  },
  "q3d": {
    type: String,
    required: false
  },
  "q3e": {
    type: String,
    required: false
  },
  "q3f": {
    type: String,
    required: false
  },
  "q3g": {
    type: String,
    required: false
  },
  "q3h": {
    type: String,
    required: false
  },
  "q3i": {
    type: String,
    required: false
  },
  "q3j": {
    type: String,
    required: false
  },
  "q4a": {
    type: String,
    required: false
  },
  "q4b": {
    type: String,
    required: false
  },
  "q4c": {
    type: String,
    required: false
  },
  "q4d": {
    type: String,
    required: false
  },
  "q4e": {
    type: String,
    required: false
  },
  "q4f": {
    type: String,
    required: false
  },
  "q4g": {
    type: String,
    required: false
  },
  "q4h": {
    type: String,
    required: false
  },
  "q4i": {
    type: String,
    required: false
  },
  "q4j": {
    type: String,
    required: false
  },
  "q5a": {
    type: String,
    required: false
  },
  "q5b": {
    type: String,
    required: false
  },
  "q5c": {
    type: String,
    required: false
  },
  "q5d": {
    type: String,
    required: false
  },
  "q5e": {
    type: String,
    required: false
  },
  "q5f": {
    type: String,
    required: false
  },
  "q5g": {
    type: String,
    required: false
  },
  "q5h": {
    type: String,
    required: false
  },
  "q5i": {
    type: String,
    required: false
  },
  "q5j": {
    type: String,
    required: false
  },
  "q6a": {
    type: String,
    required: false
  },
  "q6b": {
    type: String,
    required: false
  },
  "q6c": {
    type: String,
    required: false
  },
  "q6d": {
    type: String,
    required: false
  },
  "q6e": {
    type: String,
    required: false
  },
  "q6f": {
    type: String,
    required: false
  },
  "q6g": {
    type: String,
    required: false
  },
  "q6h": {
    type: String,
    required: false
  },
  "q6i": {
    type: String,
    required: false
  },
  "q6j": {
    type: String,
    required: false
  },
  "q7a": {
    type: String,
    required: false
  },
  "q7b": {
    type: String,
    required: false
  },
  "q7c": {
    type: String,
    required: false
  },
  "q7d": {
    type: String,
    required: false
  },
  "q7e": {
    type: String,
    required: false
  },
  "q7f": {
    type: String,
    required: false
  },
  "q7g": {
    type: String,
    required: false
  },
  "q7h": {
    type: String,
    required: false
  },
  "q7i": {
    type: String,
    required: false
  },
  "q7j": {
    type: String,
    required: false
  },
  "q8a": {
    type: String,
    required: false
  },
  "q8b": {
    type: String,
    required: false
  },
  "q8c": {
    type: String,
    required: false
  },
  "q8d": {
    type: String,
    required: false
  },
  "q8e": {
    type: String,
    required: false
  },
  "q8f": {
    type: String,
    required: false
  },
  "q8g": {
    type: String,
    required: false
  },
  "q8h": {
    type: String,
    required: false
  },
  "q8i": {
    type: String,
    required: false
  },
  "q8j": {
    type: String,
    required: false
  },
  "q9a": {
    type: String,
    required: false
  },
  "q9b": {
    type: String,
    required: false
  },
  "q9c": {
    type: String,
    required: false
  },
  "q9d": {
    type: String,
    required: false
  },
  "q9e": {
    type: String,
    required: false
  },
  "q9f": {
    type: String,
    required: false
  },
  "q9g": {
    type: String,
    required: false
  },
  "q9h": {
    type: String,
    required: false
  },
  "q9i": {
    type: String,
    required: false
  },
  "q9j": {
    type: String,
    required: false
  },
  "q10a": {
    type: String,
    required: false
  },
  "q10b": {
    type: String,
    required: false
  },
  "q10c": {
    type: String,
    required: false
  },
  "q10d": {
    type: String,
    required: false
  },
  "q10e": {
    type: String,
    required: false
  },
  "q10f": {
    type: String,
    required: false
  },
  "q10g": {
    type: String,
    required: false
  },
  "q10h": {
    type: String,
    required: false
  },
  "q10i": {
    type: String,
    required: false
  },
  "q10j": {
    type: String,
    required: false
  },
  // Repeat the same pattern for questions q11 to q25
  // For brevity, only q11 to q15 are listed here as an example
  "q11a": {
    type: String,
    required: false
  },
  "q11b": {
    type: String,
    required: false
  },
  "q11c": {
    type: String,
    required: false
  },
  "q11d": {
    type: String,
    required: false
  },
  "q11e": {
    type: String,
    required: false
  },
  "q11f": {
    type: String,
    required: false
  },
  "q11g": {
    type: String,
    required: false
  },
  "q11h": {
    type: String,
    required: false
  },
  "q11i": {
    type: String,
    required: false
  },
  "q11j": {
    type: String,
    required: false
  },
  "q12a": {
    type: String,
    required: false
  },
  "q12b": {
    type: String,
    required: false
  },
  "q12c": {
    type: String,
    required: false
  },
  "q12d": {
    type: String,
    required: false
  },
  "q12e": {
    type: String,
    required: false
  },
  "q12f": {
    type: String,
    required: false
  },
  "q12g": {
    type: String,
    required: false
  },
  "q12h": {
    type: String,
    required: false
  },
  "q12i": {
    type: String,
    required: false
  },
  "q12j": {
    type: String,
    required: false
  },
  "q13a": {
    type: String,
    required: false
  },
  "q13b": {
    type: String,
    required: false
  },
  "q13c": {
    type: String,
    required: false
  },
  "q13d": {
    type: String,
    required: false
  },
  "q13e": {
    type: String,
    required: false
  },
  "q13f": {
    type: String,
    required: false
  },
  "q13g": {
    type: String,
    required: false
  },
  "q13h": {
    type: String,
    required: false
  },
  "q13i": {
    type: String,
    required: false
  },
  "q13j": {
    type: String,
    required: false
  },
  "q14a": {
    type: String,
    required: false
  },
  "q14b": {
    type: String,
    required: false
  },
  "q14c": {
    type: String,
    required: false
  },
  "q14d": {
    type: String,
    required: false
  },
  "q14e": {
    type: String,
    required: false
  },
  "q14f": {
    type: String,
    required: false
  },
  "q14g": {
    type: String,
    required: false
  },
  "q14h": {
    type: String,
    required: false
  },
  "q14i": {
    type: String,
    required: false
  },
  "q14j": {
    type: String,
    required: false
  },
  "q15a": {
    type: String,
    required: false
  },
  "q15b": {
    type: String,
    required: false
  },
  "q15c": {
    type: String,
    required: false
  },
  "q15d": {
    type: String,
    required: false
  },
  "q15e": {
    type: String,
    required: false
  },
  "q15f": {
    type: String,
    required: false
  },
  "q15g": {
    type: String,
    required: false
  },
  "q15h": {
    type: String,
    required: false
  },
  "q15i": {
    type: String,
    required: false
  },
  "q15j": {
    type: String,
    required: false
  },
  "q16a": {
    type: String,
    required: false
  },
  "q16b": {
    type: String,
    required: false
  },
  "q16c": {
    type: String,
    required: false
  },
  "q16d": {
    type: String,
    required: false
  },
  "q16e": {
    type: String,
    required: false
  },
  "q16f": {
    type: String,
    required: false
  },
  "q16g": {
    type: String,
    required: false
  },
  "q16h": {
    type: String,
    required: false
  },
  "q16i": {
    type: String,
    required: false
  },
  "q16j": {
    type: String,
    required: false
  },
  "q17a": {
    type: String,
    required: false
  },
  "q17b": {
    type: String,
    required: false
  },
  "q17c": {
    type: String,
    required: false
  },
  "q17d": {
    type: String,
    required: false
  },
  "q17e": {
    type: String,
    required: false
  },
  "q17f": {
    type: String,
    required: false
  },
  "q17g": {
    type: String,
    required: false
  },
  "q17h": {
    type: String,
    required: false
  },
  "q17i": {
    type: String,
    required: false
  },
  "q17j": {
    type: String,
    required: false
  },
  "q18a": {
    type: String,
    required: false
  },
  "q18b": {
    type: String,
    required: false
  },
  "q18c": {
    type: String,
    required: false
  },
  "q18d": {
    type: String,
    required: false
  },
  "q18e": {
    type: String,
    required: false
  },
  "q18f": {
    type: String,
    required: false
  },
  "q18g": {
    type: String,
    required: false
  },
  "q18h": {
    type: String,
    required: false
  },
  "q18i": {
    type: String,
    required: false
  },
  "q18j": {
    type: String,
    required: false
  },
  "q19a": {
    type: String,
    required: false
  },
  "q19b": {
    type: String,
    required: false
  },
  "q19c": {
    type: String,
    required: false
  },
  "q19d": {
    type: String,
    required: false
  },
  "q19e": {
    type: String,
    required: false
  },
  "q19f": {
    type: String,
    required: false
  },
  "q19g": {
    type: String,
    required: false
  },
  "q19h": {
    type: String,
    required: false
  },
  "q19i": {
    type: String,
    required: false
  },
  "q19j": {
    type: String,
    required: false
  },
  "q20a": {
    type: String,
    required: false
  },
  "q20b": {
    type: String,
    required: false
  },
  "q20c": {
    type: String,
    required: false
  },
  "q20d": {
    type: String,
    required: false
  },
  "q20e": {
    type: String,
    required: false
  },
  "q20f": {
    type: String,
    required: false
  },
  "q20g": {
    type: String,
    required: false
  },
  "q20h": {
    type: String,
    required: false
  },
  "q20i": {
    type: String,
    required: false
  },
  "q20j": {
    type: String,
    required: false
  },
  "q21a": {
    type: String,
    required: false
  },
  "q21b": {
    type: String,
    required: false
  },
  "q21c": {
    type: String,
    required: false
  },
  "q21d": {
    type: String,
    required: false
  },
  "q21e": {
    type: String,
    required: false
  },
  "q21f": {
    type: String,
    required: false
  },
  "q21g": {
    type: String,
    required: false
  },
  "q21h": {
    type: String,
    required: false
  },
  "q21i": {
    type: String,
    required: false
  },
  "q21j": {
    type: String,
    required: false
  },
  "q22a": {
    type: String,
    required: false
  },
  "q22b": {
    type: String,
    required: false
  },
  "q22c": {
    type: String,
    required: false
  },
  "q22d": {
    type: String,
    required: false
  },
  "q22e": {
    type: String,
    required: false
  },
  "q22f": {
    type: String,
    required: false
  },
  "q22g": {
    type: String,
    required: false
  },
  "q22h": {
    type: String,
    required: false
  },
  "q22i": {
    type: String,
    required: false
  },
  "q22j": {
    type: String,
    required: false
  },
  "q23a": {
    type: String,
    required: false
  },
  "q23b": {
    type: String,
    required: false
  },
  "q23c": {
    type: String,
    required: false
  },
  "q23d": {
    type: String,
    required: false
  },
  "q23e": {
    type: String,
    required: false
  },
  "q23f": {
    type: String,
    required: false
  },
  "q23g": {
    type: String,
    required: false
  },
  "q23h": {
    type: String,
    required: false
  },
  "q23i": {
    type: String,
    required: false
  },
  "q23j": {
    type: String,
    required: false
  },
  "q24a": {
    type: String,
    required: false
  },
  "q24b": {
    type: String,
    required: false
  },
  "q24c": {
    type: String,
    required: false
  },
  "q24d": {
    type: String,
    required: false
  },
  "q24e": {
    type: String,
    required: false
  },
  "q24f": {
    type: String,
    required: false
  },
  "q24g": {
    type: String,
    required: false
  },
  "q24h": {
    type: String,
    required: false
  },
  "q24i": {
    type: String,
    required: false
  },
  "q24j": {
    type: String,
    required: false
  },
  "q25a": {
    type: String,
    required: false
  },
  "q25b": {
    type: String,
    required: false
  },
  "q25c": {
    type: String,
    required: false
  },
  "q25d": {
    type: String,
    required: false
  },
  "q25e": {
    type: String,
    required: false
  },
  "q25f": {
    type: String,
    required: false
  },
  "q25g": {
    type: String,
    required: false
  },
  "q25h": {
    type: String,
    required: false
  },
  "q25i": {
    type: String,
    required: false
  },
  "q25j": {
    type: String,
    required: false
  }
},{strict: false});
const model = mongoose.model = ('Math',studentSchema,'Math');
module.exports = model;