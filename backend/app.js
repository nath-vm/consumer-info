/**
 * Express app factory. Kept separate from server.js so tests can import the
 * app without opening a database connection or a network port.
 */
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { apiLimiter } = require('./middleware/rateLimiter');

function createApp() {
  const app = express();

  // This API returns JSON only (the React app is hosted on Vercel), so helmet's defaults are enough.
  app.use(helmet());

  // Number of reverse proxies in front of this app (Render's load balancer = 1).
  // If rate limiting seems to treat all visitors as one IP, see README > Known limitations.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

  app.use(cookieParser());

  // NOTE: no global body parser on purpose. Each route set picks its own size limit:
  // small (default 100kb) for normal requests, larger only for the batch import routes.

  // Health check (before the limiter so uptime pings never get blocked)
  app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api', apiLimiter);

  app.use('/api/consumers', require('./routes/consumerRoutes'));
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/rover-book', require('./routes/roverBookRoutes'));

  // Unknown API route -> JSON 404 (instead of an HTML page)
  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

  // Central error handler: never exposes internal error details to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ message: 'Request body too large.' });
    }
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ message: 'Invalid JSON body.' });
    }
    console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
