const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const platforms = require('./platforms');

// ---- Free public API keys (stored in data/api-keys.json) ----
const KEY_FILE = path.join(__dirname, '..', 'data', 'api-keys.json');
const DAILY_LIMIT = Number(process.env.API_DAILY_LIMIT || 100);
let keys = {};
try { keys = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')); } catch {}
const saveKeys = () => { fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true }); fs.writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2)); };
const today = () => new Date().toISOString().slice(0, 10);

function createKey(name) {
  const key = 'smn_' + crypto.randomBytes(20).toString('hex');
  keys[key] = { name, created: new Date().toISOString(), day: today(), used: 0, total: 0 };
  saveKeys();
  return key;
}

// Returns an error message, or null if the request may proceed (and counts it).
function useKey(req, q) {
  const key = req.headers['x-api-key'] || q.get('api_key');
  const k = key && keys[key];
  if (!k) return 'Missing or invalid API key. Create one free at /dashboard/api.';
  if (k.day !== today()) { k.day = today(); k.used = 0; }
  if (k.used >= DAILY_LIMIT) return `Daily limit of ${DAILY_LIMIT} requests reached.`;
  k.used++; k.total++; saveKeys();
  return null;
}

const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e4) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });

// Collect an NDJSON-streaming handler into a single JSON array for API clients.
function collect(handler, req, q) {
  return new Promise((done) => {
    const items = []; let code = 200, single = null;
    const fake = {
      writeHead: (c) => { code = c; }, write: (l) => items.push(...String(l).split('\n').filter(Boolean).map(JSON.parse)),
      end: (b) => { if (b) single = JSON.parse(b); done({ code, body: single || { results: items } }); },
    };
    handler(req, fake, q);
  });
}

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
  if (!key) return xposedOrNot(res, email);
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

// Free, keyless breach source used when no HIBP key is configured.
async function xposedOrNot(res, email) {
  try {
    const r = await fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    const list = d?.ExposedBreaches?.breaches_details || [];
    json(res, 200, { source: 'XposedOrNot', breaches: list.map((b) => ({ name: b.breach, domain: b.domain, date: String(b.xposed_date || ''), count: b.xposed_records, data: String(b.xposed_data || '').split(';').filter(Boolean) })) });
  } catch { json(res, 502, { error: 'Could not reach breach service.' }); }
}

// People search: public name lookups across open sources, streamed as NDJSON.
const peopleSources = [
  ['GitHub', async (n) => (await (await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(n)}+in:name&per_page=10`, { headers: { 'User-Agent': UA, ...(process.env.GITHUB_SEARCH_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_SEARCH_TOKEN}` } : {}) } })).json()).items?.map((u) => ({ title: u.login, url: u.html_url, detail: 'GitHub account' })) || []],
  ['Wikipedia', async (n) => (await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(n)}&format=json&srlimit=8`, { headers: { 'User-Agent': UA } })).json()).query.search.map((r) => ({ title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`, detail: r.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'") }))],
  ['ORCID', async (n) => {
    const [g, ...f] = n.split(/\s+/); const q = f.length ? `given-names:${g} AND family-name:${f.join(' ')}` : n;
    const d = await (await fetch(`https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(q)}&rows=8`, { headers: { Accept: 'application/json' } })).json();
    return (d['expanded-result'] || []).map((r) => ({ title: `${r['given-names'] || ''} ${r['family-names'] || ''}`.trim(), url: `https://orcid.org/${r['orcid-id']}`, detail: (r['institution-name'] || []).join(', ') || 'Researcher profile' }));
  }],
  ['Mastodon', async (n) => (await (await fetch(`https://mastodon.social/api/v2/search?q=${encodeURIComponent(n)}&type=accounts&limit=8`, { headers: { 'User-Agent': UA } })).json()).accounts?.map((a) => ({ title: `${a.display_name || a.username} (@${a.acct})`, url: a.url, detail: a.note.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').slice(0, 140) })) || []],
  ['Bluesky', async (n) => (await (await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(n)}&limit=8`)).json()).actors?.map((a) => ({ title: `${a.displayName || a.handle} (@${a.handle})`, url: `https://bsky.app/profile/${a.handle}`, detail: (a.description || '').slice(0, 140) })) || []],
];

async function peopleSearch(req, res, q) {
  const n = (q.get('name') || '').trim();
  if (n.length < 2 || n.length > 80) return json(res, 400, { error: 'Enter a full name.' });
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
  await Promise.all(peopleSources.map(async ([source, fn]) => {
    let results = [], error = false;
    try { results = await Promise.race([fn(n), new Promise((_, rej) => setTimeout(rej, 10000))]); } catch { error = true; }
    res.write(JSON.stringify({ source, results, error }) + '\n');
  }));
  res.end();
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://x');
  // CORS so the public API can be called from any website.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (pathname === '/api/keys' && req.method === 'POST') {
    const { name } = await readBody(req);
    const n = String(name || '').trim().slice(0, 60);
    if (!n) return json(res, 400, { error: 'Give your key a name (e.g. your website).' });
    return json(res, 201, { key: createKey(n), name: n, dailyLimit: DAILY_LIMIT });
  }
  if (pathname === '/api/keys/usage') {
    const k = keys[searchParams.get('api_key') || req.headers['x-api-key']];
    if (!k) return json(res, 404, { error: 'Unknown key.' });
    return json(res, 200, { name: k.name, created: k.created, usedToday: k.day === today() ? k.used : 0, total: k.total, dailyLimit: DAILY_LIMIT });
  }
  const v1 = { '/api/v1/social': socialSearch, '/api/v1/people': peopleSearch, '/api/v1/breach': breachSearch }[pathname];
  if (v1) {
    const err = useKey(req, searchParams);
    if (err) return json(res, 401, { error: err });
    const { code, body } = await collect(v1, req, searchParams);
    return json(res, code, body);
  }
  if (pathname === '/api/health') return json(res, 200, { ok: true });
  if (pathname === '/api/config') return json(res, 200, { platforms: platforms.length, apiDailyLimit: DAILY_LIMIT, breachEnabled: true, breachSource: process.env.HIBP_API_KEY ? 'Have I Been Pwned' : 'XposedOrNot (free)', peopleSources: peopleSources.length });
  if (pathname === '/api/social-search') return socialSearch(req, res, searchParams);
  if (pathname === '/api/people-search') return peopleSearch(req, res, searchParams);
  if (pathname === '/api/breach-search') return breachSearch(req, res, searchParams);
  serveStatic(req, res, pathname);
}).listen(PORT, '0.0.0.0', () => console.log(`Searchmenow listening on :${PORT}`));
