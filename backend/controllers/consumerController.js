const { sendServerError } = require('../utils/errors');
const AuditLog  = require('../models/AuditLog');
const Consumer  = require('../models/Consumer');

// Helper — write a consumer-action audit entry
const logConsumerAction = async (action, req, target = null, detail = {}, success = true) => {
  try {
    await AuditLog.create({
      action,
      actor:   req.adminEmail || req.userId || 'unknown',
      target,
      detail,
      ip:      req.ip || req.headers['x-forwarded-for'] || null,
      success,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

// Escape special regex characters from user input to prevent ReDoS
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Allowed fields for single-record add/update (mirrors batchController ALLOWED_FIELDS)
const ALLOWED_FIELDS = [
  'sn', 'pelcoMeterNumber', 'accountNumber', 'poleNumber',
  'pelcoSq', 'roverBook', 'accountName', 'status', 'address', 'isHidden',
];

// Max character length for any string field — prevents oversized payloads
// bloating the DB or causing out-of-memory errors on the server.
const MAX_FIELD_LENGTH = 200;

const SEARCHABLE_FIELDS = [
  'sn', 'pelcoMeterNumber', 'accountNumber', 'poleNumber',
  'pelcoSq', 'roverBook', 'accountName', 'status', 'address',
];

function sanitize(obj) {
  const clean = {};
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      // Cap string fields; pass booleans (e.g. isHidden) through unchanged
      clean[key] = typeof val === 'string'
        ? val.trim().slice(0, MAX_FIELD_LENGTH)
        : val;
    }
  }
  return clean;
}

const mongoose = require('mongoose');
function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

// Search consumers with server-side pagination
exports.searchConsumers = async (req, res) => {
  const { includeHidden, page = 1, limit = 50, allPages } = req.query;
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const field = typeof req.query.field === 'string' ? req.query.field : '';

  // Only admins (verified by JWT) may request hidden consumers.
  // Regular users and unauthenticated callers always see active records only.
  const isAdmin = req.adminEmail != null;
  const showHidden = isAdmin && includeHidden === 'true';

  try {
    // Use $ne: true for the active filter so records where isHidden is null,
    // undefined, or missing (e.g. imported before the field existed) are
    // treated as active rather than silently disappearing from all queries.
    const filter = showHidden ? { isHidden: true } : { isHidden: { $ne: true } };

    if (query.trim()) {
      if (query.length > 100) return res.status(400).json({ message: 'Search query is too long.' });
      const safe  = escapeRegex(query.trim());
      const regex = new RegExp(safe, 'i');
      // `field` limits the search to one column (allow-listed); otherwise search all.
      if (field && SEARCHABLE_FIELDS.includes(field)) {
        filter[field] = regex;
      } else {
        filter.$or = SEARCHABLE_FIELDS.map((f) => ({ [f]: regex }));
      }
    }

    const pageNum  = Math.max(parseInt(page)  || 1, 1);
    const limitNum = allPages === 'true'
      ? Math.min(parseInt(limit) || 500, 500)
      : Math.min(parseInt(limit) || 50,  200);

    const skip  = (pageNum - 1) * limitNum;
    const total = await Consumer.countDocuments(filter);

    const consumers = await Consumer.find(filter)
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      consumers,
      total,
      page:       pageNum,
      limit:      limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore:    skip + consumers.length < total,
    });
  } catch (err) {
    console.error('Error in searchConsumers:', err);
    return sendServerError(res, err, 'consumerController');
  }
};

// Admin: Bulk unhide all consumers
exports.bulkUnhideConsumers = async (req, res) => {
  try {
    const result = await Consumer.updateMany({}, { $set: { isHidden: false } });
    await logConsumerAction('CONSUMER_BULK_UNHIDDEN', req, null, { modifiedCount: result.modifiedCount });
    res.json({ message: 'All consumers unhidden', modifiedCount: result.modifiedCount });
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};

// Admin: Bulk hide all consumers
exports.bulkHideConsumers = async (req, res) => {
  try {
    const result = await Consumer.updateMany({}, { $set: { isHidden: true } });
    await logConsumerAction('CONSUMER_BULK_HIDDEN', req, null, { modifiedCount: result.modifiedCount });
    res.json({ message: 'All consumers hidden', modifiedCount: result.modifiedCount });
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};

// Add new consumer (admin only — sanitized)
exports.addConsumer = async (req, res) => {
  try {
    const consumer = new Consumer(sanitize(req.body));
    await consumer.save();
    await logConsumerAction('CONSUMER_ADDED', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.status(201).json(consumer);
  } catch (err) {
    console.error('[consumerController]', err); return res.status(400).json({ message: 'Invalid data.' });
  }
};

// Admin: Hide consumer (soft delete)
exports.hideConsumer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid consumer ID.' });
    const consumer = await Consumer.findByIdAndUpdate(req.params.id, { isHidden: true }, { new: true });
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_HIDDEN', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.json({ message: 'Consumer hidden', consumer });
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};

// Admin: Unhide consumer
exports.unhideConsumer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid consumer ID.' });
    const consumer = await Consumer.findByIdAndUpdate(req.params.id, { isHidden: false }, { new: true });
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_UNHIDDEN', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.json({ message: 'Consumer unhidden', consumer });
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};

// Admin: Permanently delete consumer
exports.permanentDeleteConsumer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid consumer ID.' });
    const consumer = await Consumer.findByIdAndDelete(req.params.id);
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_DELETED', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.json({ message: 'Consumer permanently deleted' });
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};

// Get a single consumer by ID — admin only, respects isHidden
exports.getConsumer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid consumer ID.' });
    const consumer = await Consumer.findById(req.params.id);
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    if (consumer.isHidden === true && !req.adminEmail)
      return res.status(404).json({ message: 'Consumer not found' });
    res.json(consumer);
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};

// Admin: Update consumer (sanitized)
exports.updateConsumer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid consumer ID.' });
    const consumer = await Consumer.findByIdAndUpdate(req.params.id, sanitize(req.body), { new: true });
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_UPDATED', req, consumer.accountNumber, {
      accountName: consumer.accountName,
      fields: Object.keys(req.body),
    });
    res.json(consumer);
  } catch (err) {
    return sendServerError(res, err, 'consumerController');
  }
};