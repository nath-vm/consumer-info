const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { requireAdmin, attachAuthIfPresent } = require('../middleware/auth');
const { authLimiter, strictLimiter } = require('../middleware/rateLimiter');
const asyncHandler = require('../utils/asyncHandler');

// Auth payloads are tiny (a password, a Google token, an email list), so keep the limit small.
router.use(express.json({ limit: '10kb' }));

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/check-auth', asyncHandler(auth.checkAuth));
router.post('/admin-login', strictLimiter, asyncHandler(auth.adminLogin));
// Redirect-mode Google sign-in: Google posts an urlencoded form here (see AdminLogin.js).
router.post('/admin-login-redirect', strictLimiter, express.urlencoded({ extended: false, limit: '10kb' }), asyncHandler(auth.adminLoginRedirect));
router.post('/user-login', authLimiter, asyncHandler(auth.userLogin));
router.post('/refresh', authLimiter, asyncHandler(auth.refreshToken));
router.post('/logout', attachAuthIfPresent, asyncHandler(auth.logout));

// ── Admin-protected ───────────────────────────────────────────────────────────
router.get('/app-config', requireAdmin, asyncHandler(auth.getAppConfig));
router.post('/user-password', requireAdmin, strictLimiter, asyncHandler(auth.updateUserPassword));
router.post('/password-rotation', requireAdmin, strictLimiter, asyncHandler(auth.updatePasswordRotation));
router.post('/toggle-user-access', requireAdmin, strictLimiter, asyncHandler(auth.toggleUserAccess));
router.post('/admin-gmails', requireAdmin, strictLimiter, asyncHandler(auth.addAdminGmail));
router.delete('/admin-gmails/:email', requireAdmin, strictLimiter, asyncHandler(auth.removeAdminGmail));
router.put('/notification-emails', requireAdmin, asyncHandler(auth.updateNotificationEmails));
router.post('/test-notification', requireAdmin, strictLimiter, asyncHandler(auth.sendTestNotification));
router.get('/audit-log', requireAdmin, asyncHandler(auth.getAuditLog));

module.exports = router;
