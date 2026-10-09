const express = require('express');
const router = express.Router();
const rb = require('../controllers/roverBookController');
const { requireAdmin } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');
const asyncHandler = require('../utils/asyncHandler');
const validateObjectId = require('../utils/validateObjectId');

const json = express.json({ limit: '100kb' });
const bigJson = express.json({ limit: '10mb' });

router.param('id', validateObjectId);

// The rover book is only used by the admin screens (auto-fill in add/edit forms and
// the import flow), so every route is admin-only. It used to be public.
router.get('/lookup/:roverNumber', requireAdmin, searchLimiter, asyncHandler(rb.getByRoverNumber));
router.post('/bulk-lookup', requireAdmin, searchLimiter, json, asyncHandler(rb.bulkLookup));

router.get('/', requireAdmin, asyncHandler(rb.getAll));
router.post('/batch-upsert', requireAdmin, bigJson, asyncHandler(rb.batchUpsert));
router.post('/', requireAdmin, json, asyncHandler(rb.create));
router.put('/:id', requireAdmin, json, asyncHandler(rb.update));
router.delete('/:id', requireAdmin, asyncHandler(rb.remove));

module.exports = router;
