const express    = require('express');
const router     = express.Router();
const cc         = require('../controllers/consumerController');
const bc         = require('../controllers/batchController');
const { requireAdmin, requireAnyAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');
const validateObjectId = require('../middleware/validateObjectId');

// Read access — requires a logged-in user OR admin (enforced on the server, not just in the UI).
// Admins additionally may request hidden records (checked inside the controller).
router.get('/search', searchLimiter, requireAnyAuth, cc.searchConsumers);
router.get('/:id',    validateObjectId(), requireAnyAuth, cc.getConsumer);

// Admin-only
router.post('/batch',                       requireAdmin, bc.batchAddConsumers);
router.post('/batch-upsert',                requireAdmin, bc.batchUpsertConsumers);
router.post('/check-duplicates',            requireAdmin, bc.checkDuplicates);
router.post('/batch-update',                requireAdmin, bc.batchUpdateConsumers);
router.post('/normalize-account-numbers',   requireAdmin, bc.normalizeAccountNumbers);
router.post('/',                  requireAdmin, cc.addConsumer);
router.put('/bulk-unhide',        requireAdmin, cc.bulkUnhideConsumers);
router.put('/bulk-hide',          requireAdmin, cc.bulkHideConsumers);
router.put('/:id/hide',           requireAdmin, validateObjectId(), cc.hideConsumer);
router.put('/:id/unhide',         requireAdmin, validateObjectId(), cc.unhideConsumer);
router.delete('/:id/permanent',   requireAdmin, validateObjectId(), cc.permanentDeleteConsumer);
router.put('/:id',                requireAdmin, validateObjectId(), cc.updateConsumer);

module.exports = router;
