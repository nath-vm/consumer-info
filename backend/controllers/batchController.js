const AuditLog  = require('../models/AuditLog');
const Consumer  = require('../models/Consumer');
const mongoose  = require('mongoose');

const { sanitizeConsumer: sanitize, normalizeAccountNumber } = require('../utils/sanitizeConsumer');
const { serverError, writeError } = require('../utils/httpErrors');

const logBatchAction = async (action, req, detail = {}) => {
  try {
    await AuditLog.create({
      action,
      actor:  req.adminEmail || 'admin',
      target: null,
      detail,
      ip:     req.ip || req.headers['x-forwarded-for'] || null,
      success: true,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

const MAX_BATCH_SIZE = 5000;

exports.batchAddConsumers = async (req, res) => {
  try {
    const consumers = req.body;
    if (!Array.isArray(consumers) || consumers.length === 0) {
      return res.status(400).json({ message: 'No consumers provided.' });
    }
    if (consumers.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ message: `Batch too large. Maximum ${MAX_BATCH_SIZE} records per import.` });
    }
    // Drop rows that end up empty after sanitising (e.g. null, wrong types, unknown fields only).
    const clean = consumers.map(sanitize).filter((c) => Object.keys(c).length > 0);
    if (clean.length === 0) {
      return res.status(400).json({ message: 'No valid consumers provided.' });
    }
    const inserted = await Consumer.insertMany(clean);
    await logBatchAction('CONSUMER_BULK_IMPORT', req, { count: inserted.length });
    res.status(201).json(inserted);
  } catch (err) {
    writeError(req, res, err);
  }
};

// Check which account numbers already exist in the DB.
// Normalizes all incoming account numbers before the $in query so
// whitespace/case differences never cause a missed match.
exports.checkDuplicates = async (req, res) => {
  try {
    const { accountNumbers } = req.body;
    if (!Array.isArray(accountNumbers) || accountNumbers.length === 0) {
      return res.json({ matches: [] });
    }
    if (accountNumbers.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ message: `Too many account numbers. Maximum ${MAX_BATCH_SIZE} per check.` });
    }

    // Normalize every incoming account number the same way they're stored
    const normalized = accountNumbers.map(n => normalizeAccountNumber(n));

    const matches = await Consumer.find(
      { accountNumber: { $in: normalized } },
      { accountNumber: 1, accountName: 1, pelcoMeterNumber: 1, poleNumber: 1, pelcoSq: 1, roverBook: 1, sn: 1, address: 1, status: 1, _id: 1 }
    ).lean();

    res.json({ matches });
  } catch (err) {
    serverError(req, res, err);
  }
};

// Batch upsert — insert if accountNumber doesn't exist, update if it does.
// Uses MongoDB bulkWrite with upsert:true so it's atomic and never double-inserts.
exports.batchUpsertConsumers = async (req, res) => {
  try {
    const consumers = req.body;
    if (!Array.isArray(consumers) || consumers.length === 0) {
      return res.status(400).json({ message: 'No consumers provided.' });
    }
    if (consumers.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ message: `Batch too large. Maximum ${MAX_BATCH_SIZE} records per upsert.` });
    }

    // Guard: skip any record with no accountNumber
    const valid = consumers.filter(r => {
      const cleaned = sanitize(r);
      return cleaned.accountNumber && cleaned.accountNumber !== '';
    });

    if (valid.length === 0) {
      return res.status(400).json({ message: 'No records with a valid accountNumber provided.' });
    }

    const ops = valid.map(record => {
      const cleaned = sanitize(record); // accountNumber already normalized inside sanitize
      const { accountNumber, ...rest } = cleaned;
      return {
        updateOne: {
          filter: { accountNumber },          // normalized key — matches what's stored
          update: { $set: { accountNumber, ...rest } },
          upsert: true,
        },
      };
    });

    const result = await Consumer.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount || 0;
    const modified = result.modifiedCount || 0;
    await logBatchAction('CONSUMER_BULK_UPSERT', req, { inserted, modified });
    // Return total so frontend can calculate "overwritten" accurately
    res.status(200).json({ inserted, modified, total: valid.length });
  } catch (err) {
    serverError(req, res, err);
  }
};

exports.batchUpdateConsumers = async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'No updates provided.' });
    }
    if (updates.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ message: `Batch too large. Maximum ${MAX_BATCH_SIZE} records per update.` });
    }

    // Each row must be an object whose _id is a canonical 24-hex ObjectId string.
    const validUpdates = updates.filter(
      (u) => u && typeof u === 'object' && typeof u._id === 'string' && /^[a-f\d]{24}$/i.test(u._id) && mongoose.isValidObjectId(u._id)
    );
    if (validUpdates.length === 0) {
      return res.status(400).json({ message: 'No records with a valid ID provided.' });
    }

    const ops = validUpdates.map(({ _id, ...fields }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: sanitize(fields) },
      },
    }));

    const result = await Consumer.bulkWrite(ops);
    await logBatchAction('CONSUMER_BULK_UPDATE', req, { modifiedCount: result.modifiedCount });
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    serverError(req, res, err);
  }
};

// One-time migration: normalize all existing accountNumbers in the DB.
// Call POST /api/consumers/normalize-account-numbers (admin only).
// Safe to run multiple times — idempotent.
exports.normalizeAccountNumbers = async (req, res) => {
  try {
    const all = await Consumer.find({}, { accountNumber: 1 }).lean();
    const ops = [];
    for (const doc of all) {
      const norm = normalizeAccountNumber(doc.accountNumber || '');
      if (norm !== (doc.accountNumber || '')) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { accountNumber: norm } },
          },
        });
      }
    }
    if (ops.length === 0) {
      return res.json({ message: 'All account numbers already normalized.', updated: 0 });
    }
    const result = await Consumer.bulkWrite(ops, { ordered: false });
    await logBatchAction('ACCOUNT_NUMBER_NORMALIZATION', req, { updated: result.modifiedCount });
    res.json({ message: 'Normalization complete.', updated: result.modifiedCount, total: all.length });
  } catch (err) {
    serverError(req, res, err);
  }
};