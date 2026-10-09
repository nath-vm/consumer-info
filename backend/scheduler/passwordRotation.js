/**
 * Password Rotation Scheduler
 */

const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const AdminConfig  = require('../models/AdminConfig');
const RefreshToken = require('../models/RefreshToken');
const AuditLog     = require('../models/AuditLog');
const { BrevoClient } = require('@getbrevo/brevo');
const { calcNextRotation } = require('../utils/rotationUtils');

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function getBrevo() {
  return new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
}

async function sendRotationNotification(newPassword, nextDate) {
  try {
    const config = await AdminConfig.findOne();
    if (!config || !config.notificationEmails?.length) return;
    const brevo = getBrevo();
    await brevo.transactionalEmails.sendTransacEmail({
      sender:      { email: process.env.SMTP_USER, name: 'Consumer Info System' },
      to:          config.notificationEmails.map(e => ({ email: e })),
      subject:     'Consumer System — Scheduled Password Rotation',
      textContent: [
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
  } catch (e) {
    console.error('[SCHEDULER] Failed to send rotation email:', e.message);
  }
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

    const newPassword = generatePassword();
    config.userPassword       = await bcrypt.hash(newPassword, 10);
    config.lastPasswordChange = now;
    config.nextPasswordChange = calcNextRotation(config.passwordRotation);
    await config.save();

    await RefreshToken.updateMany({ role: 'user', revoked: false }, { revoked: true });
    await AuditLog.create({
      action: 'USER_PASSWORD_AUTO_ROTATED', actor: 'system', target: null,
      detail: { rotation: config.passwordRotation }, ip: null, success: true, timestamp: now,
    });

    console.log(`[SCHEDULER] Password auto-rotated. Next: ${config.nextPasswordChange?.toISOString() ?? 'manual'}`);
    await sendRotationNotification(newPassword, config.nextPasswordChange);
  } catch (err) {
    console.error('[SCHEDULER] Password rotation check failed:', err.message);
  }
}

function startPasswordRotationScheduler() {
  console.log('[SCHEDULER] Password rotation scheduler started.');
  runRotationCheck();
  setInterval(runRotationCheck, CHECK_INTERVAL_MS);
}

module.exports = { startPasswordRotationScheduler, runRotationCheck, generatePassword };