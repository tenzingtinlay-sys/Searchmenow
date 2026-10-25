# Searchmenow

Live OSINT search: usernames, names, emails (breaches), phone numbers and IPs across public sources,
with accounts, daily search credits, search history, opt-out, and a free public API.

```
server/
  index.js       HTTP server, search endpoints, /api/v1 public API
  store.js       users, sessions, credits, history, opt-outs, contact messages (data/store.json)
  platforms.js   username platforms (add more here)
public/
  index.html     app shell
  js/app.js      public site (/, /pricing, /login, /signup, /contact, /opt-out, /terms, /privacy) + dashboard
  js/icons.js    icons (Tabler, MIT)
  css/app.css
```

Run: `cp .env.example .env && npm start`, open http://localhost:3000. All keys in `.env.example` are optional.
Runtime data (accounts, API keys) is stored in `data/` and is not committed.

## Deploy to Vercel (GitHub Actions)

`.github/workflows/vercel.yml` checks the code on every push/PR, then deploys:
pushes to `main` go to production, pull requests get a preview URL.

One-time setup:
1. Create a Vercel account and a token: https://vercel.com/account/tokens
2. Link the project once (locally): `npx vercel link` → this creates `.vercel/project.json` with `orgId` and `projectId`.
3. In GitHub → repo → Settings → Secrets and variables → Actions, add:
   `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. In Vercel → Project → Settings → Environment Variables, add any optional keys from `.env.example`.

### Google Cloud search (optional)
Set `GOOGLE_API_KEY` as a **server-side environment variable** in Vercel for Production and Preview. Enable **YouTube Data API v3** and **Places API (New)** in the Google Cloud project first. The server exposes:
- `GET /api/google/status` — reports whether a key is configured (does not validate it).
- `GET /api/public/google/youtube?q=...` — public YouTube video/channel search.
- `GET /api/public/google/places?q=...` — Google Places text search, including map URLs and coordinates.

The key is never returned to the browser. These endpoints have per-IP rate limits, but they are public endpoints and still consume your Google quota. Restrict the key to only the APIs used; review Google Cloud usage and billing before production. If you also want CI to run authenticated provider tests, add `GOOGLE_API_KEY` under GitHub → Settings → Secrets and variables → Actions; the current deployment workflow does not need the key to deploy because Vercel stores runtime environment variables separately. An API key alone does not enable Google Sign-In or access private user data; those require OAuth credentials.

Note: on Vercel the file store lives in `/tmp`, which is temporary. Accounts and API keys can reset
when Vercel recycles the function. For lasting data, connect a database (e.g. Vercel Postgres / Upstash).

### One address only
In production the app answers only on your main Vercel domain (`SITE_HOST`, default: the project's
production domain, e.g. `searchmenow.vercel.app`). Any other address — deployment URLs, old domains —
redirects there with a 308, pages carry a canonical link to it, and browser API calls are only allowed
from it. Preview deployments for pull requests are not redirected. To use a custom domain, add it in
Vercel → Project → Domains and set `SITE_HOST` to it. To get `searchmenow.vercel.app`, name the Vercel
project `searchmenow` when you run `npx vercel link`.
