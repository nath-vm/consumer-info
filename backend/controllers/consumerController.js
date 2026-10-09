const AuditLog = require('../models/AuditLog');
const Consumer = require('../models/Consumer');
const { sanitizeConsumer } = require('../utils/sanitizeConsumer');
const escapeRegex = require('../utils/escapeRegex');
const { serverError, writeError } = require('../utils/httpErrors');

// Helper: write a consumer-action audit entry
const logConsumerAction = async (action, req, target = null, detail = {}, success = true) => {
  try {
    await AuditLog.create({
      action,
      actor: req.adminEmail || req.userId || 'unknown',
      target,
      detail,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      success,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

// Fields the UI's "search in" dropdown may restrict a search to.
const SEARCHABLE_FIELDS = [
  'sn', 'pelcoMeterNumber', 'accountNumber', 'poleNumber', 'pelcoSq',
  'roverBook', 'accountName', 'status', 'address',
];
const MAX_QUERY_LENGTH = 100;

// Search consumers with server-side pagination.
// Route is protected by requireAuth (user or admin), so req.adminEmail is set only for admins.
exports.searchConsumers = async (req, res) => {
  const { includeHidden, page = 1, limit, allPages, field } = req.query;
  // Query-string values can be arrays/objects (?query[]=a); only accept a plain string.
  const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, MAX_QUERY_LENGTH) : '';

  // Only admins may see hidden consumers, request huge pages, or export everything.
  const isAdmin = req.role === 'admin';
  const showHidden = isAdmin && includeHidden === 'true';

  try {
    // $ne: true so records where isHidden is null/missing still count as active.
    const filter = showHidden ? { isHidden: true } : { isHidden: { $ne: true } };

    if (query) {
      const regex = new RegExp(escapeRegex(query), 'i');
      const fields = SEARCHABLE_FIELDS.includes(field) ? [field] : SEARCHABLE_FIELDS;
      filter.$or = fields.map((f) => ({ [f]: regex }));
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    let limitNum;
    if (isAdmin) {
      limitNum = allPages === 'true'
        ? Math.min(parseInt(limit, 10) || 500, 500)
        : Math.min(parseInt(limit, 10) || 50, 200);
    } else {
      // Shared-password users get small pages only: limits how fast the whole table can be scraped.
      limitNum = Math.min(parseInt(limit, 10) || 25, 50);
    }

    const skip = (pageNum - 1) * limitNum;
    const total = await Consumer.countDocuments(filter);

    // Stable sort: without it, MongoDB may return overlapping/missing rows between pages.
    const consumers = await Consumer.find(filter).sort({ _id: 1 }).skip(skip).limit(limitNum).lean();

    res.json({
      consumers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore: skip + consumers.length < total,
    });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Admin: bulk unhide all consumers
exports.bulkUnhideConsumers = async (req, res) => {
  try {
    const result = await Consumer.updateMany({}, { $set: { isHidden: false } });
    await logConsumerAction('CONSUMER_BULK_UNHIDDEN', req, null, { modifiedCount: result.modifiedCount });
    res.json({ message: 'All consumers unhidden', modifiedCount: result.modifiedCount });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Admin: bulk hide all consumers
exports.bulkHideConsumers = async (req, res) => {
  try {
    const result = await Consumer.updateMany({}, { $set: { isHidden: true } });
    await logConsumerAction('CONSUMER_BULK_HIDDEN', req, null, { modifiedCount: result.modifiedCount });
    res.json({ message: 'All consumers hidden', modifiedCount: result.modifiedCount });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Admin: add a new consumer (sanitized)
exports.addConsumer = async (req, res) => {
  try {
    const consumer = new Consumer(sanitizeConsumer(req.body));
    await consumer.save();
    await logConsumerAction('CONSUMER_ADDED', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.status(201).json(consumer);
  } catch (err) {
    writeError(req, res, err);
  }
};

// Admin: hide consumer (soft delete). :id is validated by router.param
exports.hideConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findByIdAndUpdate(req.params.id, { isHidden: true }, { new: true });
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_HIDDEN', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.json({ message: 'Consumer hidden', consumer });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Admin: unhide consumer
exports.unhideConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findByIdAndUpdate(req.params.id, { isHidden: false }, { new: true });
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_UNHIDDEN', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.json({ message: 'Consumer unhidden', consumer });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Admin: permanently delete consumer
exports.permanentDeleteConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findByIdAndDelete(req.params.id);
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_DELETED', req, consumer.accountNumber, {
      accountName: consumer.accountName,
    });
    res.json({ message: 'Consumer permanently deleted' });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Get a single consumer by ID: any logged-in role; hidden records are admin-only.
exports.getConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findById(req.params.id);
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    if (consumer.isHidden === true && req.role !== 'admin') {
      return res.status(404).json({ message: 'Consumer not found' });
    }
    res.json(consumer);
  } catch (err) {
    serverError(req, res, err);
  }
};

// Admin: update consumer (sanitized)
exports.updateConsumer = async (req, res) => {
  try {
    const consumer = await Consumer.findByIdAndUpdate(req.params.id, sanitizeConsumer(req.body), {
      new: true,
      runValidators: true,
    });
    if (!consumer) return res.status(404).json({ message: 'Consumer not found' });
    await logConsumerAction('CONSUMER_UPDATED', req, consumer.accountNumber, {
      accountName: consumer.accountName,
      fields: Object.keys(sanitizeConsumer(req.body)),
    });
    res.json(consumer);
  } catch (err) {
    writeError(req, res, err);
  }
};
