const jwt        = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwtSecret');

function getToken(req) {
  // Prefer httpOnly cookie (more secure), fall back to Authorization header
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return null;
}

// Verifies the token and checks the role against `allowedRoles`.
// Responds with 401 (not logged in / expired) or 403 (wrong role) and returns null on failure.
function authenticate(req, res, allowedRoles, forbiddenMessage) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ message: 'Not authenticated' });
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!allowedRoles.includes(payload.role)) {
      res.status(403).json({ message: forbiddenMessage });
      return null;
    }
    return payload;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Session expired', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ message: 'Invalid token' });
    }
    return null;
  }
}

// For admin routes — requires role: 'admin'
function requireAdmin(req, res, next) {
  const payload = authenticate(req, res, ['admin'], 'Admin access required');
  if (!payload) return;
  req.adminRole  = payload.role;
  req.adminId    = payload.sub;
  req.adminEmail = payload.email;
  next();
}

// For user routes — requires role: 'user'
function requireUser(req, res, next) {
  const payload = authenticate(req, res, ['user'], 'User access required');
  if (!payload) return;
  req.userId = payload.sub;
  next();
}

// For read access to consumer data — any logged-in person (shared-password user OR admin).
// Sets req.adminEmail only for admins, so controllers can still tell them apart.
function requireAnyAuth(req, res, next) {
  const payload = authenticate(req, res, ['user', 'admin'], 'Access denied');
  if (!payload) return;
  if (payload.role === 'admin') {
    req.adminRole  = payload.role;
    req.adminId    = payload.sub;
    req.adminEmail = payload.email;
  } else {
    req.userId = payload.sub;
  }
  next();
}

module.exports = { requireAdmin, requireUser, requireAnyAuth };
