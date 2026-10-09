const { sendServerError } = require('../utils/errors');
require('dotenv').config();
const jwt              = require('jsonwebtoken');
const { randomUUID: uuidv4 } = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { sendMail }     = require('../utils/mailer');
const bcrypt           = require('bcryptjs');

const AuditLog    = require('../models/AuditLog');
const AdminConfig = require('../models/AdminConfig');
const RefreshToken = require('../models/RefreshToken');
const { calcNextRotation } = require('../utils/rotationUtils');

const JWT_SECRET     = require('../config/jwtSecret');
const ACCESS_TTL     = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'lax',
  path:     '/',
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken',  accessToken,  { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken',  { ...COOKIE_OPTS });
  res.clearCookie('refreshToken', { ...COOKIE_OPTS });
}

async function sendNotification(subject, text) {
  try {
    const config = await AdminConfig.findOne();
    if (!config || !config.notificationEmails?.length) return;
    await sendMail({ to: config.notificationEmails, subject, text });
    console.log(`[MAIL] Sent "${subject}"`);
  } catch (e) {
    console.error('[MAIL] Failed to send notification:', e.message);
  }
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

async function issueTokens(role, sub, email = null) {
  const jwtPayload   = { role, sub, ...(email ? { email } : {}) };
  const accessToken  = signAccess(jwtPayload);
  const refreshToken = uuidv4();
  await RefreshToken.create({
    token:      refreshToken,
    role,
    consumerId: sub,
    expiresAt:  new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken, refreshToken };
}

// ── Audit log helper ──────────────────────────────────────────────────────────
async function audit(action, { actor = 'system', target = null, detail = {}, ip = null, success = true } = {}) {
  try {
    await AuditLog.create({ action, actor, target, detail, ip, success });
  } catch (e) {
    console.error('[AUDIT] Failed to write log:', e.message);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Get real client IP ────────────────────────────────────────────────────────
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  const ip = req.ip || '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

// ── Ensure AdminConfig exists ─────────────────────────────────────────────────
async function getOrCreateConfig() {
  const config = await AdminConfig.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return config;
}

// ═════════════════════════════════════════════════════════════════════════════
//  AUTH CONTROLLERS
// ═════════════════════════════════════════════════════════════════════════════

exports.checkAuth = (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  let token = req.cookies?.accessToken;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1];
  }
  if (!token) return res.json({ authenticated: false });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    return res.json({ authenticated: true, role: p.role });
  } catch {
    return res.json({ authenticated: false });
  }
};

exports.adminLogin = async (req, res) => {
  const { credential } = req.body;
  const ip = getClientIp(req);

  if (!credential || typeof credential !== 'string') return res.status(400).json({ message: 'Google credential required.' });

  let email;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const googlePayload = ticket.getPayload();
    if (!googlePayload.email || googlePayload.email_verified !== true) {
      await audit('ADMIN_LOGIN_FAILED', { actor: 'unknown', ip, success: false, detail: { reason: 'email_not_verified' } });
      return res.status(401).json({ message: 'Google account email is not verified.' });
    }
    email = googlePayload.email.toLowerCase().trim();
  } catch (e) {
    await audit('ADMIN_LOGIN_FAILED', { actor: 'unknown', ip, success: false, detail: { reason: 'invalid_google_token' } });
    return res.status(401).json({ message: 'Invalid Google token.' });
  }

  const config = await getOrCreateConfig();

  if (config.adminGmails.length === 0 && process.env.BOOTSTRAP_ADMIN_EMAIL) {
    const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
    if (email.toLowerCase() === bootstrap) {
      config.adminGmails.push(bootstrap);
      await config.save();
      console.log(`[BOOTSTRAP] First admin auto-approved: ${bootstrap}`);
    }
  }

  if (!config.adminGmails.includes(email)) {
    await audit('ADMIN_LOGIN_FAILED', { actor: email, ip, success: false, detail: { reason: 'gmail_not_approved' } });
    return res.status(403).json({ message: 'Your Google account is not approved for admin access.' });
  }

  const tokens = await issueTokens('admin', email, email);
  await audit('ADMIN_LOGIN_SUCCESS', { actor: email, ip, detail: { email } });
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  return res.json({ message: 'Login successful.', role: 'admin' });
};

exports.userLogin = async (req, res) => {
  const { password } = req.body;
  const ip = getClientIp(req);

  if (!password || typeof password !== 'string') return res.status(400).json({ message: 'Password required.' });

  try {
    const config = await getOrCreateConfig();

    if (!config.userAccessEnabled) {
      await audit('USER_LOGIN_BLOCKED', { actor: 'user', ip, success: false, detail: { reason: 'access_disabled' } });
      return res.status(403).json({ message: 'System currently unavailable. Contact your administrator.', code: 'ACCESS_DISABLED' });
    }

    if (!config.userPassword || config.userPassword.trim() === '') {
      return res.status(403).json({ message: 'User access is not configured yet. Contact your administrator.' });
    }

    const match = await bcrypt.compare(password, config.userPassword);

    if (!match) {
      await audit('USER_LOGIN_FAILED', { actor: 'user', ip, success: false, detail: { reason: 'wrong_password' } });
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    const tokens = await issueTokens('user', 'user-session');
    await audit('USER_LOGIN_SUCCESS', { actor: 'user', ip });
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return res.json({ message: 'Login successful.', role: 'user' });
  } catch (err) {
    console.error('[USER_LOGIN ERROR]', err);
    return sendServerError(res, err, 'authController', 'Login failed.');
  }
};

exports.refreshToken = async (req, res) => {
  try {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token required.' });

  const record = await RefreshToken.findOne({ token: refreshToken, revoked: false });
  if (!record || record.expiresAt < new Date())
    return res.status(401).json({ message: 'Invalid or expired refresh token.' });

  if (record.role === 'user') {
    const config = await getOrCreateConfig();
    if (!config.userAccessEnabled) {
      await RefreshToken.updateOne({ token: refreshToken }, { revoked: true });
      return res.status(403).json({ message: 'System currently unavailable. Contact your administrator.', code: 'ACCESS_DISABLED' });
    }
  }

  if (record.role === 'admin') {
    const config = await getOrCreateConfig();
    if (!config.adminGmails.includes(record.consumerId)) {
      await RefreshToken.updateOne({ token: refreshToken }, { revoked: true });
      return res.status(401).json({ message: 'Admin access revoked.' });
    }
  }

  const accessToken = signAccess({ role: record.role, sub: record.consumerId, ...(record.role === 'admin' ? { email: record.consumerId } : {}) });
  res.cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
  return res.json({ accessToken });
  } catch (err) {
    return sendServerError(res, err, 'refreshToken', 'Could not refresh session.');
  }
};

exports.logout = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (refreshToken) await RefreshToken.updateOne({ token: refreshToken }, { revoked: true });
  clearAuthCookies(res);
  await audit('LOGOUT', { actor: req.adminEmail || 'user', ip: req.ip });
  return res.json({ message: 'Logged out.' });
};

exports.sessionInfo = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ message: 'Not authenticated.' });
    const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    return res.json({ role: payload.role, email: payload.email || null, sub: payload.sub });
  } catch {
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  ADMIN CONFIG
// ═════════════════════════════════════════════════════════════════════════════

exports.getAppConfig = async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json({
      userAccessEnabled:  config.userAccessEnabled,
      userPasswordSet:    !!(config.userPassword && config.userPassword.trim()),
      passwordRotation:   config.passwordRotation,
      lastPasswordChange: config.lastPasswordChange,
      nextPasswordChange: config.nextPasswordChange,
      adminGmails:        config.adminGmails,
      notificationEmails: config.notificationEmails,
    });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to load config.');
  }
};

exports.updateUserPassword = async (req, res) => {
  try {
    const { userPassword } = req.body;
    const ip = getClientIp(req);
    if (!userPassword || userPassword.trim() === '')
      return res.status(400).json({ message: 'Password cannot be empty.' });

    const config = await getOrCreateConfig();
    const newPassword = userPassword.trim();
    config.userPassword       = await bcrypt.hash(newPassword, 10);
    config.lastPasswordChange = new Date();
    config.nextPasswordChange = calcNextRotation(config.passwordRotation);
    await config.save();

    await RefreshToken.updateMany({ role: 'user', revoked: false }, { revoked: true });
    await audit('USER_PASSWORD_CHANGED', { actor: req.adminEmail, ip, detail: { rotation: config.passwordRotation } });
    await sendNotification(
      'Consumer System — User Password Changed',
      `The shared user password was changed by ${req.adminEmail} on ${new Date().toLocaleString()}.\n\nAll active user sessions have been logged out.\n\nNext scheduled rotation: ${config.nextPasswordChange ? config.nextPasswordChange.toLocaleDateString() : 'Manual only'}.`
    );

    res.json({ message: 'User password updated. All user sessions have been logged out.', lastPasswordChange: config.lastPasswordChange, nextPasswordChange: config.nextPasswordChange });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to update password.');
  }
};

exports.updatePasswordRotation = async (req, res) => {
  try {
    const { passwordRotation } = req.body;
    const ip = getClientIp(req);
    if (!['daily', 'weekly', 'monthly', 'manual'].includes(passwordRotation))
      return res.status(400).json({ message: 'Invalid rotation value.' });

    const config = await getOrCreateConfig();
    config.passwordRotation = passwordRotation;
    if (passwordRotation !== 'manual') {
      if (!config.lastPasswordChange) config.lastPasswordChange = new Date();
      config.nextPasswordChange = calcNextRotation(passwordRotation);
    } else {
      config.nextPasswordChange = null;
    }
    await config.save();
    await audit('PASSWORD_ROTATION_UPDATED', { actor: req.adminEmail, ip, detail: { passwordRotation } });
    res.json({ message: 'Password rotation updated.', nextPasswordChange: config.nextPasswordChange });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to update rotation.');
  }
};

exports.toggleUserAccess = async (req, res) => {
  try {
    const { userAccessEnabled } = req.body;
    const ip = getClientIp(req);
    if (typeof userAccessEnabled !== 'boolean')
      return res.status(400).json({ message: 'userAccessEnabled must be boolean.' });

    const config = await getOrCreateConfig();
    config.userAccessEnabled = userAccessEnabled;
    await config.save();
    if (!userAccessEnabled) await RefreshToken.updateMany({ role: 'user', revoked: false }, { revoked: true });

    await audit('USER_ACCESS_TOGGLED', { actor: req.adminEmail, ip, detail: { userAccessEnabled } });
    const status = userAccessEnabled ? 'ENABLED' : 'DISABLED';
    await sendNotification(
      `Consumer System — User Access ${status}`,
      `User access was ${status.toLowerCase()} by ${req.adminEmail} on ${new Date().toLocaleString()}.`
    );
    res.json({ message: `User access ${userAccessEnabled ? 'enabled' : 'disabled'}.`, userAccessEnabled });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to toggle user access.');
  }
};

exports.addAdminGmail = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = getClientIp(req);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) return res.status(400).json({ message: 'Valid email address required.' });
    const normalized = email.trim().toLowerCase();

    const config = await getOrCreateConfig();
    if (config.adminGmails.includes(normalized))
      return res.status(409).json({ message: 'Gmail already in approved list.' });

    config.adminGmails.push(normalized);
    await config.save();
    await audit('ADMIN_GMAIL_ADDED', { actor: req.adminEmail, ip, detail: { email: normalized } });
    await sendNotification(
      'Consumer System — Admin Gmail Added',
      `${normalized} was added to the admin approved list by ${req.adminEmail} on ${new Date().toLocaleString()}.`
    );
    res.json({ message: `${normalized} added to admin list.`, adminGmails: config.adminGmails });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to add Gmail.');
  }
};

exports.removeAdminGmail = async (req, res) => {
  try {
    const { email } = req.params;
    const ip = getClientIp(req);
    const normalized = decodeURIComponent(email).trim().toLowerCase();

    const config = await getOrCreateConfig();
    if (normalized === req.adminEmail)
      return res.status(400).json({ message: 'You cannot remove your own Gmail.' });
    if (!config.adminGmails.includes(normalized))
      return res.status(404).json({ message: 'Gmail not found in approved list.' });

    config.adminGmails = config.adminGmails.filter(g => g !== normalized);
    await config.save();
    await RefreshToken.updateMany({ role: 'admin', consumerId: normalized, revoked: false }, { revoked: true });
    await audit('ADMIN_GMAIL_REMOVED', { actor: req.adminEmail, ip, detail: { email: normalized } });
    await sendNotification(
      'Consumer System — Admin Gmail Removed',
      `${normalized} was removed from the admin approved list by ${req.adminEmail} on ${new Date().toLocaleString()}.`
    );
    res.json({ message: `${normalized} removed from admin list.`, adminGmails: config.adminGmails });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to remove Gmail.');
  }
};

exports.updateNotificationEmails = async (req, res) => {
  try {
    const { notificationEmails } = req.body;
    const ip = getClientIp(req);
    if (!Array.isArray(notificationEmails))
      return res.status(400).json({ message: 'notificationEmails must be an array.' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleaned = notificationEmails.map(e => e.trim().toLowerCase()).filter(Boolean);
    const invalid = cleaned.filter(e => !emailRegex.test(e));
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Invalid email address(es): ${invalid.join(', ')}` });
    }
    if (cleaned.length > 20) {
      return res.status(400).json({ message: 'Maximum 20 notification emails allowed.' });
    }
    const config = await getOrCreateConfig();
    config.notificationEmails = cleaned;
    await config.save();
    await audit('NOTIFICATION_EMAILS_UPDATED', { actor: req.adminEmail, ip, detail: { count: config.notificationEmails.length } });
    res.json({ message: 'Notification emails updated.', notificationEmails: config.notificationEmails });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to update notification emails.');
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit   || '50'), 200);
    const page    = Math.max(parseInt(req.query.page    || '1'),  1);
    const action  = req.query.action  || '';
    const actor   = req.query.actor   || '';
    const success = req.query.success;

    const filter = {};
    if (action)              filter.action  = new RegExp(escapeRegex(String(action)), 'i');
    if (actor)               filter.actor   = new RegExp(escapeRegex(String(actor)), 'i');
    if (success === 'true')  filter.success = true;
    if (success === 'false') filter.success = false;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendServerError(res, err, 'authController', 'Failed to fetch audit logs.');
  }
};

exports.sendTestNotification = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config || !config.notificationEmails?.length) {
      return res.status(400).json({ message: 'No notification emails configured. Add at least one email in the Notifications tab first.' });
    }

    await sendMail({
      to:      config.notificationEmails,
      subject: 'Consumer Info System — Test Notification',
      text: [
        'This is a test notification from your Consumer Information System.',
        '',
        `Sent at:    ${new Date().toLocaleString()}`,
        `Sent by:    ${req.adminEmail}`,
        `Recipients: ${config.notificationEmails.join(', ')}`,
        '',
        'If you received this, your notification emails are configured correctly.',
      ].join('\n'),
    });

    await AuditLog.create({
      action:  'NOTIFICATION_TEST_SENT',
      actor:   req.adminEmail,
      ip:      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
      success: true,
    });

    res.json({ message: `Test email sent to: ${config.notificationEmails.join(', ')}` });
  } catch (err) {
    console.error('[MAIL] Test notification failed:', err.message);
    const hint = err.status === 403
      ? 'Resend rejected the email. With the default test sender it can only deliver to the email address that owns your Resend account; verify a domain and set MAIL_FROM to send to others.'
      : err.message === 'RESEND_API_KEY is not set'
        ? 'Email is not configured on the server (RESEND_API_KEY is missing).'
        : 'Failed to send test email.';
    return sendServerError(res, err, 'authController', hint);
  }
};