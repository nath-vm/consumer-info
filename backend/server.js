require('dotenv').config();

const { validateEnv } = require('./config/env');

// Fail fast: refuse to start with a missing/weak configuration.
try {
  validateEnv();
} catch (err) {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
}

const mongoose = require('mongoose');
const createApp = require('./app');
const { startPasswordRotationScheduler } = require('./scheduler/passwordRotation');

const app = createApp();
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    startPasswordRotationScheduler();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    // Without a database the app cannot do anything useful: exit so the host restarts it
    // and the failure is visible, instead of running as a "healthy" but broken server.
    console.error('[FATAL] MongoDB connection error:', err.message);
    process.exit(1);
  });

// Last-resort safety nets: log and exit so the platform restarts a clean process.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  process.exit(1);
});
