const mongoose = require('mongoose');

const AdminConfigSchema = new mongoose.Schema({
  // ── User access ────────────────────────────────────────────────────────────
  userAccessEnabled: { type: Boolean, default: true },
  userPassword:      { type: String,  default: '' },

  // ── Password rotation ──────────────────────────────────────────────────────
  passwordRotation:   { type: String, enum: ['daily', 'weekly', 'monthly', 'manual'], default: 'manual' },
  lastPasswordChange: { type: Date,   default: null },
  nextPasswordChange:  { type: Date,   default: null },

  // ── Admin Gmail whitelist ──────────────────────────────────────────────────
  adminGmails: { type: [String], default: [] },

  // ── Email notifications ────────────────────────────────────────────────────
  notificationEmails: { type: [String], default: [] },

}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('AdminConfig', AdminConfigSchema);