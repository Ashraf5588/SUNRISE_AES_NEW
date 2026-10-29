const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { verifytoken } = require('../middleware/auth');

test('clears the stale login cookie and redirects when the account no longer exists', async () => {
  const userlist = mongoose.model('userlist');
  const originalFindById = userlist.findById;
  const token = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString() },
    process.env.JWT_SECRET || 'aas_amedtech_solutions_789'
  );
  const clearedCookies = [];
  const redirects = [];
  const res = {
    clearCookie(name) {
      clearedCookies.push(name);
      return this;
    },
    redirect(path) {
      redirects.push(path);
      return this;
    }
  };
  let nextCalled = false;

  userlist.findById = async () => null;
  try {
    await verifytoken({ cookies: { token }, headers: {} }, res, () => {
      nextCalled = true;
    });
  } finally {
    userlist.findById = originalFindById;
  }

  assert.deepEqual(clearedCookies, ['token']);
  assert.deepEqual(redirects, ['/admin/login']);
  assert.equal(nextCalled, false);
});
