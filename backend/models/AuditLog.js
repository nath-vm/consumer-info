const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action:    { type: String, required: true },
  actor:     { type: String, default: 'system' },
  target:    { type: String, default: null },
  detail:    { type: Object, default: {} },
  ip:        { type: String, default: null },
  success:   { type: Boolean, default: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false, versionKey: false });

// TTL index: auto-delete audit logs older than 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
