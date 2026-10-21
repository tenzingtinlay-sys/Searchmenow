# Searchmenow

OSINT dashboard: live username search across public platforms and email breach lookup (via Have I Been Pwned).

```
server/          Node HTTP server + API (no dependencies)
  index.js       /api/social-search, /api/breach-search, static files
  platforms.js   platform URL patterns — add more here
public/          dashboard frontend (HTML/CSS/JS)
```

Run: `cp .env.example .env && npm start`, then open http://localhost:3000/dashboard.
Breach search needs `HIBP_API_KEY` in `.env`.
