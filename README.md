# Consumer Info

[![CI](https://github.com/nath-vm/consumer-info/actions/workflows/ci.yml/badge.svg)](https://github.com/nath-vm/consumer-info/actions/workflows/ci.yml)

A full-stack web app for searching and managing **utility consumer account records** (account, meter and pole numbers, names, addresses). Staff sign in with a shared password to look records up; approved administrators sign in with Google to manage the data, access and security settings.

> **Data note:** this repository contains code only. Never commit real consumer data, `.env` files or exports. Use fake sample data for demos and screenshots.

## Features

- **Fast search** across all fields or a single field (account #, meter #, pole #, name, address), with server-side pagination.
- **Two access levels**
  - *Users* sign in with a shared password and get read-only access.
  - *Admins* sign in with Google. Only approved email addresses are allowed.
- **Admin dashboard**
  - add, edit, hide/unhide (soft delete) and permanently delete records, singly or in bulk
  - bulk import from Excel with duplicate detection, upsert and a downloadable list of failed rows
  - account-number normalization so imports and lookups always match
- **Rover Book:** a rover number → address table that auto-fills forms and updates matching consumers when an address changes.
- **Admin settings**
  - set the shared user password, or rotate it automatically (daily / weekly / monthly) with an email notification
  - turn user access on or off instantly (revokes active user sessions)
  - manage the approved admin Gmail list and notification recipients
  - browse the **audit log** (filterable by action, actor and result)

## How it works

1. A staff member signs in with the shared password and searches for a consumer.
2. An administrator signs in with Google, then manages records and imports spreadsheets.
3. Every sensitive action (logins, imports, edits, deletions, setting changes) is written to an audit log.

## Tech stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 19 (Create React App), Material UI, Axios, SheetJS (Excel import). Hosted on **Vercel** |
| Backend  | Node.js, Express 4, Mongoose. Hosted on **Render** |
| Database | MongoDB Atlas |
| Auth     | Google Sign-In (admins), bcrypt-hashed shared password (users), JWT access tokens + refresh tokens in httpOnly cookies |
| Email    | Resend email API (optional notifications) |
| Testing / CI | Jest + Supertest, GitHub Actions |

## Architecture

```
Browser ──▶ Vercel (React SPA)
              │  /api/*  (rewrite, same-origin)
              ▼
           Render (Express API) ──▶ MongoDB Atlas
                         └────────▶ Resend (email)
```

```
backend/
  app.js            Express app: middleware, routes, error handling (importable for tests)
  server.js         Entry point: env checks, DB connection, scheduler, listen
  middleware/       Auth (requireAdmin / requireUser / requireAnyAuth), rate limiters, ObjectId validation
  routes/           Route definitions
  controllers/      Request handlers (auth, consumers, batch import, rover book)
  models/           Mongoose schemas (Consumer, RoverBook, AdminConfig, AuditLog, RefreshToken)
  scheduler/        Automatic password rotation
  utils/            Shared helpers (safe error responses, rotation dates)
  tests/            Jest + Supertest API tests
frontend/
  src/pages/        User login/home, admin login/dashboard/settings
  src/components/   Tables, dialogs, search bar
  src/api.js        Axios client with automatic token refresh
```

## Security

- **Server-side access control:** every consumer and rover-book endpoint requires a valid token. Roles are enforced in middleware, so calling the API directly gives the same result as using the UI. Hidden records are only ever returned to admins.
- **Admin login:** Google ID token verified server-side (audience and verified-email checks) and matched against an approved-email list.
- **Sessions:** 15-minute access tokens and 7-day refresh tokens in `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookies. Refresh tokens are stored server-side and can be revoked: changing the password, disabling user access or removing an admin ends their sessions.
- **Abuse protection:** separate rate limits for login, sensitive admin actions, search and the API overall.
- **Hardening:** `helmet` headers with a CSP, small request-size limits (large limits only on admin-authenticated bulk-import routes), ObjectId validation, escaped regex input, field allow-lists on writes, and generic error responses (details are logged server-side only).
- **Auditing:** logins, imports, edits and settings changes are recorded; entries expire after 90 days.
- **Secrets** live only in environment variables; `.env` files are git-ignored.

## Getting started

**Prerequisites:** Node.js 18+, a MongoDB database (e.g. a free Atlas cluster) and a Google OAuth *Web* client ID (add `http://localhost:3000` as an authorized JavaScript origin).

```bash
git clone https://github.com/nath-vm/consumer-info.git
cd consumer-info

# Backend
cd backend
cp .env.example .env          # fill in the values
npm install
npm run dev                   # http://localhost:5000

# Frontend (new terminal)
cd frontend
cp .env.example .env          # set REACT_APP_GOOGLE_CLIENT_ID
npm install
npm start                     # http://localhost:3000 (proxies /api to port 5000)
```

The first admin is the Google account in `BOOTSTRAP_ADMIN_EMAIL`. After signing in, set the shared user password under **Settings**. The admin login page lives at `/p3-admin` by default (change it with `REACT_APP_ADMIN_ROUTE`).

### Environment variables

**Backend (`backend/.env`)**

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Token signing key, 32+ chars (`openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth Web client ID |
| `BOOTSTRAP_ADMIN_EMAIL` | first run | Auto-approved first admin (only while the whitelist is empty) |
| `RESEND_API_KEY`, `MAIL_FROM` | optional | Email notifications (Resend API key; sender address, see note below) |
| `TRUST_PROXY` | optional | Proxy hops in front of the app (default `1`) |
| `PORT`, `NODE_ENV` | optional | Server port and environment |

**Frontend (`frontend/.env`)**

| Variable | Description |
|----------|-------------|
| `REACT_APP_GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
| `REACT_APP_ADMIN_ROUTE` | Optional path for the admin login page (default `p3-admin`) |

## Testing

```bash
cd backend
npm test
```

The API tests mock the database and Google client. They cover login flows, role separation, hidden-record rules, input validation, token expiry and error handling. CI runs them, plus a production frontend build, on every push and pull request.

## API overview

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/api/consumers/search`, `/api/consumers/:id` | user or admin | Search / fetch records (hidden: admin only) |
| POST/PUT/DELETE | `/api/consumers/...` | admin | Create, update, hide, delete, bulk import |
| GET/POST/PUT/DELETE | `/api/rover-book/...` | admin | Rover Book lookups and management |
| POST | `/api/auth/user-login`, `/api/auth/admin-login` | public | Sign in (rate limited) |
| POST | `/api/auth/refresh`, `/api/auth/logout` | cookie | Renew or end a session |
| GET/POST/PUT/DELETE | `/api/auth/...` (settings, audit log) | admin | Access and security settings |
| GET | `/api/health` | public | Health check |

## Deployment

- **Backend (Render):** root directory `backend`, build `npm install`, start `npm start`; set the backend environment variables.
- **Frontend (Vercel):** root directory `frontend`; set the frontend environment variables. `vercel.json` proxies `/api/*` to the Render service and rewrites all other routes to `index.html`. Update the destination URL there if your Render URL changes.

## Design decisions and known limitations

- **Shared user password** instead of per-user accounts, which keeps access simple for a small team. It can rotate automatically; the new password is emailed to the configured recipients, so keep that list short and trusted. Rotation only happens if that email is sent successfully, so the new password can never be lost.
- **Email sender:** Resend's default test sender can only deliver to the email address that owns the Resend account. To notify other people, verify a domain in Resend and set `MAIL_FROM`.
- **Access tokens are stateless (15 min).** Disabling user access revokes refresh tokens immediately, but an already-issued access token stays valid until it expires.
- **Rate limits are per IP.** Behind Vercel's proxy, check that audit-log IPs are the real client addresses; adjust `TRUST_PROXY` if they are not.
- **Hidden admin URL** is only obscurity; the real protection is Google sign-in plus the approved-email list.
- **Create React App** is no longer maintained, and the Excel import library (SheetJS `xlsx`) has known advisories with no upstream fix. Imports are admin-only, but treat uploaded files as untrusted.

## Roadmap

- Migrate the frontend from Create React App to Vite and replace the Excel import library
- Split the largest components (`AdminDashboard`, `AdminSettings`) into smaller units and hooks
- Frontend component tests
- Optional per-user accounts with roles

## Author

Built by **Nathaniel Manansala** ([@nath-vm](https://github.com/nath-vm)).

## License

[MIT](LICENSE)
