# Consumer Info – Frontend

React single-page app. See the [root README](../README.md) for the project overview, setup and deployment.

```bash
cp .env.example .env     # set REACT_APP_GOOGLE_CLIENT_ID
npm install
npm start                # http://localhost:3000 (API calls are proxied to http://localhost:5000)
npm run build
```

In production, `vercel.json` rewrites `/api/*` to the backend, so the browser only ever talks to one origin.
For local development, the `proxy` setting in `package.json` forwards `/api` to the backend on port 5000.
