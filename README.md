# Searchmenow

Live OSINT search for public usernames, names, breach exposure, phone/email/IP lookups, with accounts, daily search credits, search history, opt-out controls, and a public API.

## Repository layout

- `server/` — Node.js HTTP backend and search endpoints
- `public/` — static website, CSS and browser JavaScript
- `api/` — legacy Vercel adapter (retained temporarily for migration reference)
- `.github/workflows/run-nodejs.yml` — syntax, startup and smoke checks

## Run locally

```sh
cp .env.example .env
npm start
```

Then open http://localhost:3000. All keys in `.env.example` are optional. Runtime data is stored locally under `data/` and is not committed.

## Cloudflare publishing

The production static site is published through Cloudflare Pages from this GitHub repository:

- **Cloudflare Pages project:** `searchmenow`
- **Production address:** https://searchmenow.pages.dev
- **Source branch:** `main`
- **Static output directory:** `public`

Cloudflare Pages is connected to GitHub, so commits pushed to `main` trigger a Pages deployment. The Vercel deployment workflow and `vercel.json` have been removed so GitHub no longer deploys this project to Vercel.

### Backend migration status — not yet complete

The existing backend in `server/` uses Node.js HTTP server APIs and file-based persistence for accounts, sessions, opt-outs and API keys. Cloudflare Pages does not run that Node.js server merely by publishing `public/`. To make all features work on Cloudflare, the backend must be migrated to a Cloudflare-compatible runtime and durable storage (for example, a Cloudflare Worker/Container plus D1 or another supported persistent store), and server-side secrets must be configured there. Until that work is deployed and smoke-tested, do not assume account, search API or other server-backed features work on the Pages address.

## Optional Google Cloud search

Set `GOOGLE_API_KEY` as a server-side secret only after the Cloudflare backend is deployed. Enable YouTube Data API v3 and Places API (New) in Google Cloud. The backend endpoints are:

- `GET /api/google/status` — reports whether a key is configured.
- `GET /api/public/google/youtube?q=...` — public YouTube video/channel search.
- `GET /api/public/google/places?q=...` — Google Places text search.

The key must never be returned to the browser. These public endpoints consume Google quota; restrict the key to only the required APIs and monitor usage/billing. A Google API key alone does not enable Google Sign-In or private-data access.

## Environment variables

See `.env.example`. Keep secrets out of Git and configure them as server-side Cloudflare secrets when the backend migration is ready.
