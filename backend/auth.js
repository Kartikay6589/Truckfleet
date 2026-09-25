const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET is not set in backend/.env — generate one and add it before starting the server.');
}
const TOKEN_TTL = '30d';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function checkPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}
function signToken(userId) {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: TOKEN_TTL });
}

/* Express middleware: requires "Authorization: Bearer <token>", verifies it,
   and attaches req.userId. Every route that reads/writes one user's data
   uses this so nobody can reach another account's records. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Please sign in.' });

  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.uid;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
  }
}

module.exports = { hashPassword, checkPassword, signToken, requireAuth };
