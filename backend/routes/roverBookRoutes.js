const express = require('express');
const router  = express.Router();
const rb      = require('../controllers/roverBookController');
const { requireAdmin } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');
const validateObjectId = require('../middleware/validateObjectId');

// Lookups feed the auto-fill in the admin add/edit forms, so they are admin-only
// (previously public, which exposed the rover-book address list to anyone).
router.get('/lookup/:roverNumber', requireAdmin, searchLimiter, rb.getByRoverNumber);
router.post('/bulk-lookup',        requireAdmin, searchLimiter, rb.bulkLookup);

// Admin-only CRUD
router.get('/',             requireAdmin, rb.getAll);
router.post('/batch-upsert',requireAdmin, rb.batchUpsert);
router.post('/',            requireAdmin, rb.create);
router.put('/:id',          requireAdmin, validateObjectId(), rb.update);
router.delete('/:id',       requireAdmin, validateObjectId(), rb.remove);

module.exports = router;
