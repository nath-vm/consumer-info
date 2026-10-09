const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwtSecret');

// Pin the algorithm so a token can never be accepted under a different one.
const JWT_OPTIONS = { algorithms: ['HS256'] };

function getToken(req) {
  // Prefer httpOnly cookie (safer), fall back to Authorization header
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return null;
}

/**
 * Verifies the token and checks the role is one of `allowedRoles`.
 * On failure it responds and returns null. The `code` field lets the
 * frontend decide whether to silently refresh the session (see src/api.js).
 */
function authenticate(req, res, allowedRoles, forbiddenMessage) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ message: 'Not authenticated', code: 'NO_TOKEN' });
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
    if (!allowedRoles.includes(payload.role)) {
      res.status(403).json({ message: forbiddenMessage });
      return null;
    }
    return payload;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Session expired', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    return null;
  }
}

// Admin-only routes
function requireAdmin(req, res, next) {
  const payload = authenticate(req, res, ['admin'], 'Admin access required');
  if (!payload) return;
  req.role = payload.role;
  req.adminRole = payload.role;
  req.adminId = payload.sub;
  req.adminEmail = payload.email;
  next();
}

// Shared-password "user" routes only
function requireUser(req, res, next) {
  const payload = authenticate(req, res, ['user'], 'User access required');
  if (!payload) return;
  req.role = payload.role;
  req.userId = payload.sub;
  next();
}

// Any logged-in person: shared-password user OR admin.
// Use this for read-only data that both roles may see.
function requireAuth(req, res, next) {
  const payload = authenticate(req, res, ['admin', 'user'], 'Access denied');
  if (!payload) return;
  req.role = payload.role;
  if (payload.role === 'admin') {
    req.adminRole = payload.role;
    req.adminId = payload.sub;
    req.adminEmail = payload.email;
  } else {
    req.userId = payload.sub;
  }
  next();
}

// Never blocks. Attaches identity if a valid token is present (used for audit logging on /logout).
function attachAuthIfPresent(req, res, next) {
  const token = getToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
      req.role = payload.role;
      if (payload.role === 'admin') req.adminEmail = payload.email;
      else req.userId = payload.sub;
    } catch {
      /* invalid or expired: treat as anonymous */
    }
  }
  next();
}

module.exports = { requireAdmin, requireUser, requireAuth, attachAuthIfPresent, JWT_OPTIONS };
