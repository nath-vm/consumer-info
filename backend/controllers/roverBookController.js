const RoverBook = require('../models/RoverBook');
const Consumer  = require('../models/Consumer');
const AuditLog  = require('../models/AuditLog');

const escapeRegex = require('../utils/escapeRegex');
const { serverError } = require('../utils/httpErrors');

// ── Cascade: when a rover book address changes, update all matching consumers ──
// Mirrors AT's propagateToAssemblies pattern.
// Matches on Consumer.roverBook (rover number string, case-insensitive).
// Updates Consumer.address with the new address value.
async function propagateToConsumers(roverNumber, newAddress) {
  try {
    const escaped = escapeRegex(roverNumber.trim());
    const regex   = new RegExp('^' + escaped + '$', 'i');
    const result  = await Consumer.updateMany(
      { roverBook: regex },
      { $set: { address: newAddress } }
    );
    return result.modifiedCount || 0;
  } catch (err) {
    console.error('propagateToConsumers error:', err.message);
    return 0;
  }
}

async function audit(action, req, detail = {}) {
  try {
    await AuditLog.create({
      action,
      actor:   req.adminEmail || 'admin',
      target:  null,
      detail,
      ip:      req.ip || req.headers['x-forwarded-for'] || null,
      success: true,
    });
  } catch (e) {
    console.error('RoverBook audit error:', e.message);
  }
}

// GET all rover book entries
exports.getAll = async (req, res) => {
  try {
    const entries = await RoverBook.find().collation({ locale: "en", numericOrdering: true }).sort({ roverNumber: 1 }).lean();
    res.json(entries);
  } catch (err) {
    serverError(req, res, err);
  }
};

// GET single entry by rover number — used for auto-fill lookup
exports.getByRoverNumber = async (req, res) => {
  try {
    const entry = await RoverBook.findOne({
      roverNumber: { $regex: new RegExp('^' + escapeRegex(req.params.roverNumber.trim()) + '$', 'i') },
    }).lean();
    if (!entry) return res.status(404).json({ message: 'Rover number not found' });
    res.json(entry);
  } catch (err) {
    serverError(req, res, err);
  }
};

// POST /bulk-lookup — given array of rover numbers, return all matching entries.
// Used by the import flow to resolve addresses in bulk without N+1 requests.
exports.bulkLookup = async (req, res) => {
  try {
    const { roverNumbers } = req.body || {};
    if (!Array.isArray(roverNumbers) || roverNumbers.length === 0) {
      return res.json({ entries: [] });
    }
    if (roverNumbers.length > 500) {
      return res.status(400).json({ message: 'Maximum 500 rover numbers per lookup.' });
    }
    // Normalize to uppercase (matches how DB stores them) for exact index lookup
    const normalised = roverNumbers.map(n => String(n).trim().toUpperCase());
    const entries = await RoverBook.find({ roverNumber: { $in: normalised } }).lean();
    res.json({ entries });
  } catch (err) {
    serverError(req, res, err);
  }
};

// POST /batch-upsert — insert if roverNumber doesn't exist, update address if it does.
// Uses MongoDB bulkWrite with upsert:true — atomic, no N+1, handles any size file.
exports.batchUpsert = async (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: 'No entries provided.' });
    }
    if (entries.length > 10000) {
      return res.status(400).json({ message: 'Batch too large. Maximum 10,000 entries per import.' });
    }

    // Validate and normalise — roverNumber is the unique key, address is required
    const valid = [];
    const invalid = [];
    for (const e of entries) {
      if (!e || typeof e !== 'object') { invalid.push(e); continue; }
      const roverNumber = String(e.roverNumber || '').trim().slice(0, 200);
      const address     = String(e.address     || '').trim().slice(0, 200);
      if (!roverNumber || !address) {
        invalid.push(e);
      } else {
        valid.push({ roverNumber, address });
      }
    }

    if (valid.length === 0) {
      return res.status(400).json({ message: 'No valid entries found. Each row needs a rover number and address.' });
    }

    // Normalise roverNumber to UPPERCASE so the unique index can do an exact-match lookup.
    // Regex filters on upsert bypass the index and can cause duplicate-key errors.
    const ops = valid.map(({ roverNumber, address }) => ({
      updateOne: {
        filter: { roverNumber: roverNumber.toUpperCase() },
        update: { $set: { roverNumber: roverNumber.toUpperCase(), address } },
        upsert: true,
      },
    }));

    const result = await RoverBook.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount  || 0;
    const modified = result.modifiedCount  || 0;

    // Cascade address changes to consumers for every successfully upserted rover number
    let consumersUpdated = 0;
    for (const { roverNumber, address } of valid) {
      consumersUpdated += await propagateToConsumers(roverNumber, address);
    }

    await audit('ROVERBOOK_BULK_UPSERT', req, { inserted, modified, invalid: invalid.length, consumersUpdated });
    res.status(200).json({ inserted, modified, invalid: invalid.length, total: valid.length, consumersUpdated });
  } catch (err) {
    serverError(req, res, err);
  }
};

// POST — add a new entry
exports.create = async (req, res) => {
  try {
    const { roverNumber, address } = req.body || {};
    if (typeof roverNumber !== 'string' || !roverNumber.trim()) return res.status(400).json({ message: 'Rover number is required.' });
    if (typeof address !== 'string' || !address.trim())         return res.status(400).json({ message: 'Address is required.' });
    if (roverNumber.length > 200 || address.length > 200)       return res.status(400).json({ message: 'Value too long (max 200 characters).' });

    // Case-insensitive duplicate check
    const exists = await RoverBook.findOne({
      roverNumber: { $regex: new RegExp('^' + escapeRegex(roverNumber.trim()) + '$', 'i') },
    });
    if (exists) return res.status(409).json({ message: `Rover number "${roverNumber.trim()}" already exists.` });

    const entry = await RoverBook.create({
      roverNumber: roverNumber.trim().toUpperCase(),
      address:     address.trim(),
    });
    await audit('ROVERBOOK_ADDED', req, { roverNumber: entry.roverNumber });
    res.status(201).json(entry);
  } catch (err) {
    serverError(req, res, err);
  }
};

// PUT /:id — update an entry
exports.update = async (req, res) => {
  try {
    const { roverNumber, address } = req.body || {};
    if (typeof roverNumber !== 'string' || !roverNumber.trim()) return res.status(400).json({ message: 'Rover number is required.' });
    if (typeof address !== 'string' || !address.trim())         return res.status(400).json({ message: 'Address is required.' });
    if (roverNumber.length > 200 || address.length > 200)       return res.status(400).json({ message: 'Value too long (max 200 characters).' });

    const existing = await RoverBook.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Entry not found.' });

    // Duplicate check (exclude self)
    if (existing.roverNumber.toLowerCase() !== roverNumber.trim().toLowerCase()) {
      const dupe = await RoverBook.findOne({
        roverNumber: { $regex: new RegExp('^' + escapeRegex(roverNumber.trim()) + '$', 'i') },
      });
      if (dupe) return res.status(409).json({ message: `Rover number "${roverNumber.trim()}" already exists.` });
    }

    existing.roverNumber = roverNumber.trim().toUpperCase();
    existing.address     = address.trim();
    await existing.save();

    // Cascade address change to all consumers with this rover number
    const consumersUpdated = await propagateToConsumers(existing.roverNumber, existing.address);
    await audit('ROVERBOOK_UPDATED', req, { roverNumber: existing.roverNumber, consumersUpdated });
    res.json({ ...existing.toObject(), consumersUpdated });
  } catch (err) {
    serverError(req, res, err);
  }
};

// DELETE /:id
exports.remove = async (req, res) => {
  try {
    const entry = await RoverBook.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Entry not found.' });
    await audit('ROVERBOOK_DELETED', req, { roverNumber: entry.roverNumber });
    res.json({ message: 'Deleted.' });
  } catch (err) {
    serverError(req, res, err);
  }
};