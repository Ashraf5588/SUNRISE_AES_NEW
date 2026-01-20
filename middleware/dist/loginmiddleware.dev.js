"use strict";

var jwt = require("jsonwebtoken");

var authenticateToken = function authenticateToken(req, res, next) {
  var token = req.cookies.token;
  console.log(token);

  if (!token) {
    console.log("No token found in cookies");
    return res.redirect('/admin/login'); // Redirect to login if no token found
  }

  try {
    var verified = jwt.verify(token, "mynameisashraf!23_9&");
    console.log("Token verified successfully:", verified); // Log the verified token
    // Attach user details to request object for access in route handlers

    req.user = verified; // Check for the user’s role and current path
    // If the user is trying to access their designated page or any allowed page, proceed

    next();
  } catch (error) {
    console.log("Token verification failed:", error.message); // Log the error message

    res.redirect('/admin/login'); // Redirect to login if token verification fails
  }
};

var authenticateTokenTeacher = function authenticateTokenTeacher(req, res, next) {
  var teachertoken = req.cookies.teachertoken;

  if (!teachertoken) {
    console.log("No token found in cookies");
    return res.redirect('/teacher/login'); // Redirect to login if no token found
  }

  try {
    var verified = jwt.verify(teachertoken, "mynameisashrafteacher!23_9&");
    console.log("Token verified successfully:", verified); // Log the verified token
    // Attach user details to request object for access in route handlers

    req.user = verified; // Check for the user’s role and current path
    // If the user is trying to access their designated page or any allowed page, proceed

    next();
  } catch (error) {
    console.log("Token verification failed:", error.message); // Log the error message

    res.redirect('/teacher/login'); // Redirect to login if token verification fails
  }
};

module.exports = {
  authenticateTokenTeacher: authenticateTokenTeacher,
  authenticateToken: authenticateToken
};