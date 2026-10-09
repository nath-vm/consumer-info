# CHANGES: what was fixed and what you must do

This is a hardened copy of your project with the same folder structure. Copy the files over your GitHub repo, **delete** the files listed first, then follow "Before you deploy".

## 1. Files to DELETE from your repo

| File | Why |
|---|---|
| `backend/.env` | Real secrets. Must never be in git. Keep your own local copy outside the repo folder or just re-create it from `.env.example`. |
| `frontend/.env` | Same rule (it only held a public Google client ID, but keep the habit). |
| `frontend/README.md` | Default Create React App text, replaced by the root `README.md`. |

If `.env` files were ever committed, deleting them is **not enough**: remove them from tracking with `git rm --cached backend/.env frontend/.env`, commit, and **rotate every credential** (see section 5).

## 2. NEW files

```
.github/workflows/ci.yml        CI: no tracked .env, backend tests (Node 20+22) + prod audit, frontend build
.github/dependabot.yml          weekly dependency update PRs
.gitignore                      root ignore file (covers .env, node_modules, build)
LICENSE                         MIT, **replace [YOUR FULL NAME]**
README.md                       full project documentation
CHANGES.md                      this file
frontend/.env.example           new
backend/app.js                  Express app factory (so tests can run without a database)
backend/config/env.js           fail-fast environment validation
backend/utils/asyncHandler.js   stops async errors from crashing the process
backend/utils/httpErrors.js     generic error responses (no err.message leaks)
backend/utils/escapeRegex.js    shared regex escaping
backend/utils/validateObjectId.js   rejects bad :id values with 400
backend/utils/sanitizeConsumer.js   single shared input cleaner (was duplicated and had drifted)
backend/scripts/seedDemoData.js fake demo data with safety guards
backend/tests/*                 9 test files, 120 tests, no database needed
```

## 3. MODIFIED files

```
backend/.env.example                rewritten (only variables the code really uses)
backend/package.json                metadata, jest/supertest, test scripts, removed unused `cors` and `uuid`
backend/package-lock.json           regenerated (the old one was out of sync, so `npm ci` failed)
backend/server.js                   env validation, exits if MongoDB fails, no dead static-file code
backend/middleware/auth.js          added requireAuth, error codes, HS256 pinning
backend/middleware/rateLimiter.js   added general /api limiter
backend/routes/authRoutes.js        new /admin-login-redirect route, async wrapper, 10 KB body limit, removed unused /session-info
backend/routes/consumerRoutes.js    search + single record now require login; per-route body limits; ObjectId checks
backend/routes/roverBookRoutes.js   all routes admin-only (lookups were public); ObjectId checks
backend/controllers/authController.js        see "Bugs fixed" below
backend/controllers/consumerController.js    see "Bugs fixed" below
backend/controllers/batchController.js       shared sanitizer, no err.message leaks, stricter row checks
backend/controllers/roverBookController.js   no err.message leaks, type checks
backend/scheduler/passwordRotation.js        exports added for testing (behavior unchanged)
frontend/src/api.js                 silent refresh now also handles NO_TOKEN / INVALID_TOKEN
frontend/src/pages/AdminLogin.js    production sign-in uses Google redirect mode (no popup); shows redirect errors
frontend/vercel.json                added basic security headers
frontend/package.json               metadata only
frontend/package-lock.json          regenerated + `npm audit fix` (axios high-severity issue fixed)
```

## 4. What was fixed

**Critical**
- **Public data.** `GET /api/consumers/search`, `GET /api/consumers/:id` and the rover-book lookups answered anonymous callers. They now require a login (search/single record: user or admin; rover book: admin only, because only admin screens use it).
- **Refresh-token injection (authentication bypass).** `/api/auth/refresh` and `/logout` put the cookie/body value straight into a MongoDB query. A crafted value (`{"$ne": null}`, also possible through a `j:`-prefixed cookie) matched someone else's live session. Only strings are accepted now. A regression test covers it.
- **Server crashes.** `adminLogin`, `refreshToken` and `logout` had no error handling around database calls, so one database error could crash the whole server. All handlers are now wrapped.

**High / medium**
- Sessions: the access cookie expired at exactly the same moment as the 15-minute token, so the silent refresh could never trigger. The cookie now lives 7 days while the token inside still expires in 15 minutes.
- `err.message` was sent to clients in 31 places (you estimated about 15). All replaced with generic messages; details go to the server log.
- Google admin login now requires `email_verified`.
- Search: the "search in field" dropdown was ignored by the server (now honored); stable sort added so pages don't repeat or skip rows; query must be a string; user page size capped at 50 and `allPages` is admin-only.
- `/:id` ObjectId validation on every route (rover-book update/delete had none).
- Regex input in the audit-log filter is escaped (an invalid pattern used to cause a 500).
- Type checks on passwords, emails and rows so malformed input gives 400, not 500.
- Body limit 20 MB on every route → 10 KB (auth), 100 KB (default), 10 MB only for batch imports; auth runs before the big body is parsed.
- General API rate limit; server fails fast if `JWT_SECRET` / `MONGO_URI` / `GOOGLE_CLIENT_ID` is missing or the secret is under 32 characters.
- Removed: debug logs in user login, unused `cors` and `uuid` dependencies, dead static-file serving, the unused public `/session-info` endpoint, the access token in the refresh response body.
- Account numbers are now normalised on single add/edit too (before, only the batch import did it, so duplicates could slip through).
- Dependencies: backend production audit is clean. Frontend: `axios` fixed; the remaining findings are in Create React App's toolchain plus `xlsx` (see README > Known limitations).

## 5. Before you deploy: do these yourself, in this order

1. **Check GitHub for committed secrets** (steps in the final checklist of the chat reply). If `backend/.env` was ever committed, treat everything below as exposed.
2. **MongoDB Atlas:** Database Access → edit the database user → *Edit Password* → generate a new one. Update `MONGO_URI` in Render.
3. **Render (backend) → Environment:**
   - Set a **new** `JWT_SECRET` (`openssl rand -hex 32`). This logs everybody out, which is intended.
   - Set a new `MONGO_URI` (from step 2), keep `GOOGLE_CLIENT_ID`, `NODE_ENV=production`, `BOOTSTRAP_ADMIN_EMAIL`.
   - Create a **new Brevo API key** and update `BREVO_API_KEY`; delete the old key in Brevo. Keep `SMTP_USER` (your verified sender address).
   - **Delete** these variables, the code no longer reads them: `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_PASS`. (Also rotate the Google client secret and the Brevo SMTP key in their dashboards, since they were in the leaked file.)
   - Optional: add `TRUST_PROXY_HOPS` (default 1).
4. **Vercel (frontend) → Settings → Environment Variables:** keep `REACT_APP_GOOGLE_CLIENT_ID`; delete `REACT_APP_API_URL` (unused); optionally add `REACT_APP_ADMIN_ROUTE`.
5. **Google Cloud Console → your OAuth client → Authorized redirect URIs:** add `https://consumer-info.vercel.app/api/auth/admin-login-redirect` (needed for the new no-popup sign-in; if Google shows `redirect_uri_mismatch`, this entry is missing or has a typo). Keep the *Authorized JavaScript origins* entry too. Optional on Render: `ADMIN_ROUTE` (only if you changed `REACT_APP_ADMIN_ROUTE`).
6. **Deploy**, then in Atlas open the `refreshtokens` collection and **delete all documents** (everyone must log in again; this removes any session an attacker could have minted).
7. **Review for intruders:** sign in as admin → Settings → Audit log. Look for actions you didn't do, especially `ADMIN_GMAIL_ADDED` and `USER_PASSWORD_CHANGED`. Also check the admin Gmail list and notification emails for addresses you don't recognise. (Note: the old `/refresh` endpoint wrote no audit entries, so abuse of that bug would only show up through what the attacker *did* afterwards.)
8. Set the shared user password again from the admin screen (rotation emails now go out only with the new Brevo key).

## 6. Behavior changes you should know about

- The shared user password must now be **8-72 characters**.
- Users see at most **50 records per page**; admins keep up to 200/500.
- Rover-book lookup endpoints are **admin only** (the user screen never used them).
- Single add/edit now normalises `accountNumber` exactly like the batch import (spaces removed, uppercased).
- Admin Google sign-in in production now navigates to Google and back instead of opening a popup (local development still uses the popup).
- Frontend: a fully expired session now redirects to the login page instead of showing "Error fetching records."

## 7. Not changed on purpose (roadmap)

Splitting the two 1,400-1,600 line admin components, migrating to Vite, frontend tests, per-user accounts, hashing/rotating refresh tokens, a frontend CSP, and replacing `xlsx`. The rotation email still contains the password in plain text (documented in the README); changing that is a design decision for you.
