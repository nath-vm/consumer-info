/**
 * Fail-fast environment validation.
 *
 * Called once at startup (server.js). If anything required is missing the
 * process exits immediately with a clear message instead of running in a
 * half-broken state (e.g. a server that starts but can't sign tokens).
 */
const REQUIRED = ['JWT_SECRET', 'MONGO_URI', 'GOOGLE_CLIENT_ID'];

function validateEnv(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in backend/.env (local) or in the Render dashboard (production). ' +
        'See backend/.env.example.'
    );
  }
  if (String(env.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 32');
  }
  return true;
}

module.exports = { validateEnv, REQUIRED };
