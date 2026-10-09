const mongoose = require('mongoose');

// Rejects malformed ids with a 400 instead of letting Mongoose throw a CastError (500).
// Usage: router.put('/:id', validateObjectId(), handler)
function validateObjectId(param = 'id') {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[param])) {
      return res.status(400).json({ message: 'Invalid id.' });
    }
    next();
  };
}

module.exports = validateObjectId;
