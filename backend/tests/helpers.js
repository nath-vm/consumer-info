const jwt = require('jsonwebtoken');

const sign = (payload, opts = {}) =>
  jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m', ...opts });

const userToken = () => sign({ role: 'user', sub: 'user-session' });
const adminToken = (email = 'admin@example.com') => sign({ role: 'admin', sub: email, email });
const expiredToken = () => sign({ role: 'admin', sub: 'a@example.com', email: 'a@example.com' }, { expiresIn: -60 });
const asCookie = (token) => [`accessToken=${token}`];

// Mimics Mongoose's chainable query: find().sort().skip().limit().lean() -> Promise
function queryChain(result) {
  const chain = {};
  ['sort', 'skip', 'limit', 'collation'].forEach((m) => { chain[m] = jest.fn(() => chain); });
  chain.lean = jest.fn(() => Promise.resolve(result));
  return chain;
}

module.exports = { sign, userToken, adminToken, expiredToken, asCookie, queryChain };
