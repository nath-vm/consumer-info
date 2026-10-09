const mongoose = require('mongoose');

const RefreshTokenSchema = new mongoose.Schema({
  token:      { type: String, required: true, unique: true },
  role:       { type: String },
  consumerId: { type: mongoose.Schema.Types.Mixed },
  expiresAt:  { type: Date, required: true },
  revoked:    { type: Boolean, default: false },
}, { versionKey: false });

// TTL index: MongoDB auto-deletes expired refresh tokens after 30 extra days
// (so 7-day tokens vanish ~37 days after creation at most)
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
