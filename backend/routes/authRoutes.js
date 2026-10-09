const express = require('express');
const router  = express.Router();
const auth    = require('../controllers/authController');
const { requireAdmin, requireUser } = require('../middleware/auth');
const { authLimiter, strictLimiter } = require('../middleware/rateLimiter');

// ── Public ────────────────────────────────────────────────────────────────────
router.get ('/check-auth',   auth.checkAuth);
router.post('/admin-login',  strictLimiter, auth.adminLogin);
router.post('/user-login',   authLimiter,   auth.userLogin);
router.post('/refresh',      authLimiter,   auth.refreshToken);
router.post('/logout',       auth.logout);
router.get ('/session-info', auth.sessionInfo);

// ── Admin-protected ───────────────────────────────────────────────────────────
router.get ('/app-config',              requireAdmin, auth.getAppConfig);
router.post('/user-password',           requireAdmin, strictLimiter, auth.updateUserPassword);
router.post('/password-rotation',       requireAdmin, strictLimiter, auth.updatePasswordRotation);
router.post('/toggle-user-access',      requireAdmin, strictLimiter, auth.toggleUserAccess);
router.post('/admin-gmails',            requireAdmin, strictLimiter, auth.addAdminGmail);
router.delete('/admin-gmails/:email',   requireAdmin, strictLimiter, auth.removeAdminGmail);
router.put('/notification-emails',      requireAdmin, auth.updateNotificationEmails);
router.post('/test-notification',       requireAdmin, strictLimiter, auth.sendTestNotification);
router.get ('/audit-log',              requireAdmin, auth.getAuditLog);

module.exports = router;