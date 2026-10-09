/**
 * Shared utility — calculates the next password rotation date.
 * Used by both authController.js and passwordRotation.js.
 * Single source of truth: edit here only.
 */

function calcNextRotation(rotation) {
  if (rotation === 'manual') return null;
  const now = new Date();
  if (rotation === 'daily')   return new Date(now.getTime() + 1  * 24 * 60 * 60 * 1000);
  if (rotation === 'weekly')  return new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000);
  if (rotation === 'monthly') return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return null;
}

module.exports = { calcNextRotation };
