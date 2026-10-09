/**
 * Express 4 does not catch rejected promises from async handlers. Without this
 * wrapper, an exception inside `await` (for example a database error) becomes
 * an unhandled rejection, which crashes the Node process on modern Node
 * versions. Wrapping forwards the error to the central error handler instead.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
