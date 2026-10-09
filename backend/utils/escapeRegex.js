// Escape regex metacharacters so user input is matched literally (prevents ReDoS / regex injection).
module.exports = function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
