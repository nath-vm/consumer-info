/**
 * Single source of truth for cleaning consumer input.
 * Previously duplicated in consumerController and batchController (and the two
 * copies had drifted apart: only the batch copy normalised account numbers).
 *
 * - Only whitelisted fields are kept (everything else is dropped).
 * - Text fields must be strings (numbers are converted; objects/arrays are dropped,
 *   which also blocks NoSQL operator objects such as {"$gt": ""}).
 * - isHidden must be a real boolean.
 */
const ALLOWED_TEXT_FIELDS = [
  'sn',
  'pelcoMeterNumber',
  'accountNumber',
  'poleNumber',
  'pelcoSq',
  'roverBook',
  'accountName',
  'status',
  'address',
];

const MAX_FIELD_LENGTH = 200;

/** "050 110 90", " 05011090 " -> "05011090" */
function normalizeAccountNumber(raw) {
  return String(raw).trim().replace(/\s+/g, '').toUpperCase();
}

function sanitizeConsumer(obj) {
  const clean = {};
  if (!obj || typeof obj !== 'object') return clean;

  for (const key of ALLOWED_TEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      clean[key] = String(val).slice(0, MAX_FIELD_LENGTH);
    } else if (typeof val === 'string') {
      let s = val.trim().slice(0, MAX_FIELD_LENGTH);
      if (key === 'accountNumber') s = normalizeAccountNumber(s);
      clean[key] = s;
    }
    // any other type (object, array, null, boolean) is ignored
  }

  if (typeof obj.isHidden === 'boolean') clean.isHidden = obj.isHidden;
  return clean;
}

module.exports = { sanitizeConsumer, normalizeAccountNumber, ALLOWED_TEXT_FIELDS, MAX_FIELD_LENGTH };
