const mongoose = require('mongoose');

/**
 * router.param handler: rejects malformed ids with a 400 before any
 * controller or database call runs.
 * Usage: router.param('id', validateObjectId);
 */
function validateObjectId(req, res, next, value) {
  // isValidObjectId also accepts 12-char strings; require the canonical 24-hex form.
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value) || !mongoose.isValidObjectId(value)) {
    return res.status(400).json({ message: 'Invalid ID.' });
  }
  return next();
}

module.exports = validateObjectId;
