"use strict";

var mongoose = require('mongoose');

url = "mongodb://0.0.0.0/aes";

var connectDB = function connectDB() {
  var conn;
  return regeneratorRuntime.async(function connectDB$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          _context.next = 3;
          return regeneratorRuntime.awrap(mongoose.connect(url));

        case 3:
          conn = _context.sent;
          console.log("MongoDB Connected: ".concat(conn.connection.host));
          _context.next = 11;
          break;

        case 7:
          _context.prev = 7;
          _context.t0 = _context["catch"](0);
          console.error(_context.t0);
          process.exit(1);

        case 11:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 7]]);
};

module.exports = connectDB;