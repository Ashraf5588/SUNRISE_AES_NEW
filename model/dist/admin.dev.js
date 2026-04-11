"use strict";

var mongoose = require('mongoose');

var adminSchema = new mongoose.Schema({
  "username": String,
  "password": String,
  "role": String
});
module.exports = {
  adminSchema: adminSchema
};