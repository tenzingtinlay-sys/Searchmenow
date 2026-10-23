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

Note: on Vercel the file store lives in `/tmp`, which is temporary. Accounts and API keys can reset
when Vercel recycles the function. For lasting data, connect a database (e.g. Vercel Postgres / Upstash).

### One address only
In production the app answers only on your main Vercel domain (`SITE_HOST`, default: the project's
production domain, e.g. `searchmenow.vercel.app`). Any other address — deployment URLs, old domains —
redirects there with a 308, pages carry a canonical link to it, and browser API calls are only allowed
from it. Preview deployments for pull requests are not redirected. To use a custom domain, add it in
Vercel → Project → Domains and set `SITE_HOST` to it. To get `searchmenow.vercel.app`, name the Vercel
project `searchmenow` when you run `npx vercel link`.
