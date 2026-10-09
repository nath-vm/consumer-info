const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Set it in your .env file (local) or Render environment variables (production).'
  );
}

module.exports = JWT_SECRET;
