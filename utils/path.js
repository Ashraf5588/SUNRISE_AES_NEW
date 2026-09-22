const path = require("path");

const appEntry = require.main && require.main.filename ? require.main.filename : __filename;

exports.rootDir = path.dirname(appEntry);
