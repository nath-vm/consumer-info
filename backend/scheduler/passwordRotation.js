/**
 * Password Rotation Scheduler
 */

const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const AdminConfig  = require('../models/AdminConfig');
const RefreshToken = require('../models/RefreshToken');
const AuditLog     = require('../models/AuditLog');
const { sendMail, isMailConfigured } = require('../utils/mailer');
const { calcNextRotation } = require('../utils/rotationUtils');

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

// Throws if the email cannot be sent: the caller must NOT rotate the password in that case,
// otherwise the new password would be lost.
async function sendRotationNotification(config, newPassword, nextDate) {
  await sendMail({
    to:      config.notificationEmails,
    subject: 'Consumer System — Scheduled Password Rotation',
    text: [
      'The shared user password was automatically rotated by the scheduled rotation policy.',
      '',
      `New Password: ${newPassword}`,
      '',
      `Rotated at: ${new Date().toLocaleString()}`,
      `Next rotation: ${nextDate ? nextDate.toLocaleDateString() : 'Manual only'}`,
      '',
      'All active user sessions have been logged out.',
    ].join('\n'),
  });
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

async function runRotationCheck() {
  try {
    const config = await AdminConfig.findOne();
    if (!config || config.passwordRotation === 'manual' || !config.nextPasswordChange) return;

    const now = new Date();
    if (now < config.nextPasswordChange) return;

    // Safety: rotating without a working way to tell the admins the new password
    // would lock everyone out, so skip (and retry at the next check) unless email is ready.
    if (!isMailConfigured() || !config.notificationEmails?.length) {
      console.warn('[SCHEDULER] Rotation due, but email is not configured or no notification recipients are set. Skipping so the new password is not lost.');
      return;
    }

    const newPassword = generatePassword();
    const nextDate    = calcNextRotation(config.passwordRotation);

    try {
      await sendRotationNotification(config, newPassword, nextDate);
    } catch (mailErr) {
      console.error('[SCHEDULER] Could not email the new password; rotation skipped:', mailErr.message);
      return;
    }

    config.userPassword       = await bcrypt.hash(newPassword, 10);
    config.lastPasswordChange = now;
    config.nextPasswordChange = nextDate;
    await config.save();

    await RefreshToken.updateMany({ role: 'user', revoked: false }, { revoked: true });
    await AuditLog.create({
      action: 'USER_PASSWORD_AUTO_ROTATED', actor: 'system', target: null,
      detail: { rotation: config.passwordRotation }, ip: null, success: true, timestamp: now,
    });

    console.log(`[SCHEDULER] Password auto-rotated. Next: ${config.nextPasswordChange?.toISOString() ?? 'manual'}`);
  } catch (err) {
    console.error('[SCHEDULER] Password rotation check failed:', err.message);
  }
}

function startPasswordRotationScheduler() {
  console.log('[SCHEDULER] Password rotation scheduler started.');
  runRotationCheck();
  setInterval(runRotationCheck, CHECK_INTERVAL_MS);
}

module.exports = { startPasswordRotationScheduler, runRotationCheck };