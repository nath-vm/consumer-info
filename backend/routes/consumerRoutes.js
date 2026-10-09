const express = require('express');
const router = express.Router();
const cc = require('../controllers/consumerController');
const bc = require('../controllers/batchController');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');
const asyncHandler = require('../utils/asyncHandler');
const validateObjectId = require('../utils/validateObjectId');

// Body size limits: small by default, large ONLY for the batch import routes.
// Auth runs BEFORE the body parser, so anonymous callers can never make the server parse a big body.
const json = express.json({ limit: '100kb' });
const bigJson = express.json({ limit: '10mb' });

// Every :id route rejects malformed ids with 400 before reaching a controller.
router.param('id', validateObjectId);

// ── Logged-in users (shared password) AND admins ──────────────────────────────
router.get('/search', requireAuth, searchLimiter, asyncHandler(cc.searchConsumers));
router.get('/:id', requireAuth, searchLimiter, asyncHandler(cc.getConsumer));

// ── Admin only: batch imports (large body allowed) ────────────────────────────
router.post('/batch', requireAdmin, bigJson, asyncHandler(bc.batchAddConsumers));
router.post('/batch-upsert', requireAdmin, bigJson, asyncHandler(bc.batchUpsertConsumers));
router.post('/check-duplicates', requireAdmin, bigJson, asyncHandler(bc.checkDuplicates));
router.post('/batch-update', requireAdmin, bigJson, asyncHandler(bc.batchUpdateConsumers));
router.post('/normalize-account-numbers', requireAdmin, asyncHandler(bc.normalizeAccountNumbers));

// ── Admin only: single-record changes (small body) ────────────────────────────
router.post('/', requireAdmin, json, asyncHandler(cc.addConsumer));
router.put('/bulk-unhide', requireAdmin, asyncHandler(cc.bulkUnhideConsumers));
router.put('/bulk-hide', requireAdmin, asyncHandler(cc.bulkHideConsumers));
router.put('/:id/hide', requireAdmin, asyncHandler(cc.hideConsumer));
router.put('/:id/unhide', requireAdmin, asyncHandler(cc.unhideConsumer));
router.delete('/:id/permanent', requireAdmin, asyncHandler(cc.permanentDeleteConsumer));
router.put('/:id', requireAdmin, json, asyncHandler(cc.updateConsumer));

module.exports = router;
