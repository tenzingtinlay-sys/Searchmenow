const http = require('http');
const fs = require('fs');
const path = require('path');
const platforms = require('./platforms');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, '..', 'public');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Searchmenow/1.0';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

async function checkPlatform(p, u) {
  const url = p.url.replace('{u}', encodeURIComponent(u));
  const link = (p.link || p.url).replace('{u}', encodeURIComponent(u));
  const started = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    let found;
    if (p.check === 'status') found = r.status === 200;
    else {
      const text = await r.text();
      if (p.check === 'json-not-null') found = r.ok && text.trim() !== 'null';
      else if (p.check === 'body-absent') found = r.ok && !text.includes(p.marker);
      else if (p.check === 'body-present') found = r.ok && text.includes(p.marker);
    }
    return { platform: p.name, url: link, status: found ? 'found' : 'not_found', ms: Date.now() - started };
  } catch {
    return { platform: p.name, url: link, status: 'error', ms: Date.now() - started };
  }
}

async function socialSearch(req, res, q) {
  const u = (q.get('username') || '').trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(u)) return json(res, 400, { error: 'Enter a valid username (letters, numbers, . _ -).' });
  // Stream results as NDJSON so the UI can update live.
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
  await Promise.all(platforms.map(async (p) => res.write(JSON.stringify(await checkPlatform(p, u)) + '\n')));
  res.end();
}

async function breachSearch(req, res, q) {
  const email = (q.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
  const key = process.env.HIBP_API_KEY;
  if (!key) return json(res, 503, { error: 'Breach search is not configured. Set HIBP_API_KEY (from haveibeenpwned.com/API/Key) in .env.' });
  try {
    const r = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`, {
      headers: { 'hibp-api-key': key, 'User-Agent': 'Searchmenow' }, signal: AbortSignal.timeout(10000),
    });
    if (r.status === 404) return json(res, 200, { breaches: [] });
    if (!r.ok) return json(res, 502, { error: `Upstream error (${r.status}).` });
    const data = await r.json();
    json(res, 200, { breaches: data.map((b) => ({ name: b.Title, domain: b.Domain, date: b.BreachDate, count: b.PwnCount, data: b.DataClasses })) });
  } catch { json(res, 502, { error: 'Could not reach breach service.' }); }
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://x');
  if (pathname === '/api/health') return json(res, 200, { ok: true });
  if (pathname === '/api/config') return json(res, 200, { platforms: platforms.length, breachEnabled: !!process.env.HIBP_API_KEY });
  if (pathname === '/api/social-search') return socialSearch(req, res, searchParams);
  if (pathname === '/api/breach-search') return breachSearch(req, res, searchParams);
  serveStatic(req, res, pathname);
}).listen(PORT, '0.0.0.0', () => console.log(`Searchmenow listening on :${PORT}`));
