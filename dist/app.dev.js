"use strict";

var express = require('express');

var student = require('./routers/mainpage');

var app = express();

var connection = require('./config/connection');

var path = require('path');

var jwt = require("jsonwebtoken");

var cookieParser = require("cookie-parser");

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express["static"](path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({
  extended: true
}));
connection();
app.use(student);
app.listen(80, function () {
  console.log('Server is running on port 80');
});