const express      = require('express');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const { requireAdmin } = require('./middleware/auth');

const app = express();

// ─── Reverse proxy ────────────────────────────────────────────────────────────
// Number of proxy hops in front of the app (Render's load balancer = 1).
// This affects req.ip, which the rate limiters use. If your audit log shows the
// SAME IP for every user, requests are arriving via Vercel's rewrite and the
// limiters are being shared: raise TRUST_PROXY to 2 and re-check.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", 'https://accounts.google.com', 'https://apis.google.com'],
      frameSrc:   ["'self'", 'https://accounts.google.com'],
      connectSrc: ["'self'", 'https://accounts.google.com'],
      imgSrc:     ["'self'", 'data:', 'https:'],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      fontSrc:    ["'self'", 'https:', 'data:'],
    },
  },
}));

app.use(cookieParser());

// ─── Body parsing ─────────────────────────────────────────────────────────────
// Bulk-import endpoints need a large body limit, but only AFTER the caller is
// verified as an admin, so anonymous users can't make the server parse 20 MB.
const bigJson = express.json({ limit: '20mb' });
app.use(
  [
    '/api/consumers/batch',
    '/api/consumers/batch-upsert',
    '/api/consumers/batch-update',
    '/api/consumers/check-duplicates',
    '/api/consumers/normalize-account-numbers',
    '/api/rover-book/batch-upsert',
    '/api/rover-book/bulk-lookup',
  ],
  requireAdmin,
  bigJson
);
// Everything else gets a small limit.
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// ─── General rate limit (auth and search have stricter limiters on their routes) ─
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ─── API routes ───────────────────────────────────────────────────────────────
// The React app is hosted separately on Vercel, which proxies /api to this server
// (see frontend/vercel.json), so requests are same-origin and CORS isn't needed.
app.use('/api/consumers',  require('./routes/consumerRoutes'));
app.use('/api/auth',       require('./routes/authRoutes'));
app.use('/api/rover-book', require('./routes/roverBookRoutes'));

// ─── 404 + error handler (must be last) ───────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[SERVER ERROR]', err);
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON.' });
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
