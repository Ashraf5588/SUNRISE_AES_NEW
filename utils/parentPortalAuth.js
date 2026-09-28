const jwt = require('jsonwebtoken');

const parentSecret = () => process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET || 'aas_amedtech_solutions_789';

function issueParentSession(res, account) {
  const token = jwt.sign({
    sub: String(account._id),
    type: 'parent',
    tokenVersion: account.tokenVersion || 0
  }, parentSecret(), { expiresIn: '7d' });

  res.cookie('parentPortalToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

module.exports = { issueParentSession };
