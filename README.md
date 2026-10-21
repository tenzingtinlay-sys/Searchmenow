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
