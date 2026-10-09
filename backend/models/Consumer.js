const mongoose = require('mongoose');

const ConsumerSchema = new mongoose.Schema({
  // ── Core consumer data ─────────────────────────────────────────────────────
  sn:               String,
  pelcoMeterNumber: String,
  accountNumber:    String,
  poleNumber:       String,
  pelcoSq:          String,
  roverBook:        String,
  accountName:      String,
  status:           String,
  address:          String,

  // ── Visibility ─────────────────────────────────────────────────────────────
  isHidden:  { type: Boolean, default: false },

}, { timestamps: true, versionKey: false });

// ── Indexes ────────────────────────────────────────────────────────────────────
// isHidden is used in every query filter
ConsumerSchema.index({ isHidden: 1 });
// Compound index: covers the most common query pattern (filter by visibility + sort/search)
ConsumerSchema.index({ isHidden: 1, accountNumber: 1 });
ConsumerSchema.index({ isHidden: 1, accountName: 1 });
// Individual indexes for fields used in $or regex searches
ConsumerSchema.index({ accountNumber: 1 });
ConsumerSchema.index({ accountName: 1 });
ConsumerSchema.index({ pelcoMeterNumber: 1 });

module.exports = mongoose.model('Consumer', ConsumerSchema);