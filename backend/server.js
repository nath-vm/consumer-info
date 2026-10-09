require('dotenv').config();
const mongoose = require('mongoose');

// ─── Startup guard — fail fast if critical config is missing ──────────────────
const required = ['JWT_SECRET', 'MONGO_URI', 'GOOGLE_CLIENT_ID'];
const missing  = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`FATAL: missing required environment variable(s): ${missing.join(', ')}. Refusing to start.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 32');
  process.exit(1);
}

const app = require('./app');
const { startPasswordRotationScheduler } = require('./scheduler/passwordRotation');

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    startPasswordRotationScheduler();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
