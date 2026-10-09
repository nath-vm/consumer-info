# What changed in this update

## STOP: do this first (secrets)
Your original zip contained `backend/.env` and `frontend/.env`. Check your GitHub repo for those files.
If they are there, they are exposed in the git history. Rotate: the MongoDB password, `JWT_SECRET`,
the Google client secret, and the Brevo/SMTP key. Then remove the files from the repo
(`git rm --cached backend/.env frontend/.env`, commit, push). The new `.gitignore` keeps them out.

## Biggest fix
The shared "user password" did not actually protect the data: `/api/consumers/search`,
`/api/consumers/:id` and the rover-book lookups were readable by anyone calling the API directly.
They now require a logged-in user or admin (checked on the server).
`/api/rover-book/lookup` and `/bulk-lookup` are now admin-only (only admin forms use them).

## New files
`README.md`, `LICENSE`, `.gitignore`, `.github/workflows/ci.yml`, `backend/.env.example` (rewritten),
`frontend/.env.example`, `backend/app.js`, `backend/middleware/validateObjectId.js`,
`backend/utils/errors.js`, `backend/tests/api.test.js`, `backend/tests/setupEnv.js`

## Modified files
- `backend/server.js` (now only starts the server; app moved to `app.js`; refuses to start without required env vars)
- `backend/middleware/auth.js` (new `requireAnyAuth`; shared token check)
- `backend/routes/consumerRoutes.js`, `backend/routes/roverBookRoutes.js` (auth + ObjectId validation)
- `backend/controllers/*` (no more raw error messages sent to the browser; search `field` filter now works; search input limits)
- Email now uses **Resend** instead of Brevo (`backend/utils/mailer.js`, no extra dependency). Env vars: `RESEND_API_KEY`, optional `MAIL_FROM`. `SMTP_USER`/`BREVO_API_KEY` are no longer used.
- `backend/scheduler/passwordRotation.js`: automatic rotation now sends the email FIRST and only rotates if it was delivered (previously a failed email meant the new password was lost). It skips rotation when email isn't configured.
- `backend/controllers/authController.js` (debug logs removed; Google email must be verified; audit-log filter input escaped; `uuid` replaced by `crypto.randomUUID`)
- `backend/package.json`, `backend/package-lock.json` (tests, patched `qs`, removed unused `cors` and `uuid`)
- `frontend/package.json` (name/description), `frontend/package-lock.json` (was out of sync, so `npm ci` and CI would have failed), `frontend/README.md`

## Delete from your repo
- Nothing required. (`backend/config/jwtSecret.js` is still used, so keep it.)

## Before you deploy
1. Replace the README repo links if your GitHub repo name is not `consumer-info` (it currently assumes `nath-vm/consumer-info`).
2. On Render make sure these are set: `MONGO_URI`, `JWT_SECRET` (32+ chars), `GOOGLE_CLIENT_ID`, `BOOTSTRAP_ADMIN_EMAIL`, `NODE_ENV=production`. Optional: `RESEND_API_KEY` (and `MAIL_FROM` once you verify a domain).
   The server now refuses to start without the first three.
3. You can delete these unused Render variables: `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_PASS`, `SMTP_USER`, `BREVO_API_KEY`.
4. After deploying, test: user login + search, admin Google login, add/edit a record, an Excel import, and the Settings page.
5. Check your audit log: if every entry shows the same IP, set `TRUST_PROXY=2` on Render.
