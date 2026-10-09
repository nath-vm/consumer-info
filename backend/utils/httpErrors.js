/**
 * Central place for turning an internal error into a safe client response.
 *
 * The real error is logged on the server (visible in the Render logs).
 * The client only ever receives a generic message, because raw error
 * messages can reveal database structure, file paths or library internals.
 */
function serverError(req, res, err, message = 'Internal server error') {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({ message });
}

/**
 * For write endpoints: a Mongoose validation/cast problem is the caller's
 * fault (400); anything else is ours (500). Neither leaks err.message.
 */
function writeError(req, res, err, badRequestMessage = 'Invalid data provided.') {
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).json({ message: badRequestMessage });
  }
  return serverError(req, res, err);
}

module.exports = { serverError, writeError };
