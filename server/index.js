const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const platforms = require('./platforms');
const store = require('./store');

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

// ---- Lookups: phone / email / IP. APILayer when APILAYER_API_KEY is set, free fallbacks otherwise ----
const AL_KEY = process.env.APILAYER_API_KEY;
const CF_TOKEN = (process.env.CF_BEACON_TOKEN || '').replace(/[^a-zA-Z0-9]/g, '');
const apilayer = async (p) => {
  const r = await fetch(`https://api.apilayer.com/${p}`, { headers: { apikey: AL_KEY }, signal: AbortSignal.timeout(12000) });
  const d = await r.json(); if (!r.ok) throw new Error(d.message || `APILayer error ${r.status}`); return d;
};
const CC = { 1: 'US/Canada', 7: 'Russia/Kazakhstan', 20: 'Egypt', 27: 'South Africa', 30: 'Greece', 31: 'Netherlands', 32: 'Belgium', 33: 'France', 34: 'Spain', 39: 'Italy', 41: 'Switzerland', 44: 'United Kingdom', 46: 'Sweden', 47: 'Norway', 49: 'Germany', 52: 'Mexico', 55: 'Brazil', 61: 'Australia', 62: 'Indonesia', 63: 'Philippines', 64: 'New Zealand', 65: 'Singapore', 66: 'Thailand', 81: 'Japan', 82: 'South Korea', 84: 'Vietnam', 86: 'China', 90: 'Turkey', 91: 'India', 92: 'Pakistan', 880: 'Bangladesh', 966: 'Saudi Arabia', 971: 'UAE', 975: 'Bhutan', 977: 'Nepal' };

async function phoneLookup(req, res, q) {
  const num = (q.get('number') || '').replace(/[^\d+]/g, '');
  const digits = num.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return json(res, 400, { error: 'Enter a phone number with country code, e.g. +14158586273.' });
  if (AL_KEY) {
    try {
      const d = await apilayer(`number_verification/validate?number=${digits}`);
      return json(res, 200, { source: 'APILayer Numverify', valid: d.valid, number: d.international_format, country: d.country_name, location: d.location, carrier: d.carrier, lineType: d.line_type });
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  const code = [3, 2, 1].map((n) => digits.slice(0, n)).find((c) => CC[c]);
  json(res, 200, { source: 'Built-in (add APILAYER_API_KEY for carrier and line type)', valid: !!code, number: '+' + digits, country: code ? CC[code] : 'Unknown', countryCode: code ? '+' + code : null });
}

async function emailLookup(req, res, q) {
  const email = (q.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
  if (AL_KEY) {
    try {
      const d = await apilayer(`email_verification/check?email=${encodeURIComponent(email)}`);
      return json(res, 200, { source: 'APILayer Mailboxlayer', email, formatValid: d.format_valid, mxFound: d.mx_found, smtpCheck: d.smtp_check, disposable: d.disposable, free: d.free, role: d.role, score: d.score, didYouMean: d.did_you_mean || null });
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  const domain = email.split('@')[1];
  let mx = [];
  try { mx = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((m) => m.exchange); } catch {}
  const FREE = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'mail.com', 'yandex.com'];
  const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'temp-mail.org'];
  json(res, 200, { source: 'Built-in DNS check (add APILAYER_API_KEY for SMTP check and score)', email, formatValid: true, mxFound: mx.length > 0, mailServers: mx.slice(0, 5), free: FREE.includes(domain), disposable: DISPOSABLE.includes(domain), role: /^(admin|info|support|sales|contact|noreply|no-reply|help)@/.test(email) });
}

async function ipLookup(req, res, q) {
  const ip = (q.get('ip') || '').trim();
  if (!net.isIP(ip)) return json(res, 400, { error: 'Enter a valid IPv4 or IPv6 address.' });
  try {
    if (AL_KEY) {
      const d = await apilayer(`ip_to_location/${ip}`);
      return json(res, 200, { source: 'APILayer IP to Location', ip, country: d.country_name, region: d.region_name, city: d.city, lat: d.latitude, lon: d.longitude, isp: d.connection?.isp, timezone: d.timezones?.[0] });
    }
    const d = await (await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,org,as,lat,lon,timezone,proxy,hosting`, { signal: AbortSignal.timeout(10000) })).json();
    if (d.status !== 'success') return json(res, 200, { source: 'ip-api.com', ip, error: d.message || 'No data (private or reserved IP?)' });
    json(res, 200, { source: 'ip-api.com (free)', ip, country: d.country, region: d.regionName, city: d.city, lat: d.lat, lon: d.lon, isp: d.isp, org: d.org, asn: d.as, timezone: d.timezone, proxyOrVpn: d.proxy, hosting: d.hosting });
  } catch (e) { json(res, 502, { error: e.message || 'Lookup failed.' }); }
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  if (file.endsWith('index.html') && CF_TOKEN) {
    // Cloudflare Web Analytics: official beacon, loaded only when a token is configured.
    const tag = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: CF_TOKEN, spa: true })}'></script>`;
    return res.end(fs.readFileSync(file, 'utf8').replace('</body>', tag + '\n</body>'));
  }
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
  const v1 = { '/api/v1/social': socialSearch, '/api/v1/people': peopleSearch, '/api/v1/breach': breachSearch, '/api/v1/phone': phoneLookup, '/api/v1/email': emailLookup, '/api/v1/ip': ipLookup }[pathname];
  if (v1) {
    const err = useKey(req, searchParams);
    if (err) return json(res, 401, { error: err });
    if ([...searchParams.values()].some(store.isOptedOut)) return json(res, 451, { error: 'This identifier has been removed from search results.' });
    const { code, body } = await collect(v1, req, searchParams);
    return json(res, code, body);
  }
  if (pathname === '/api/health') return json(res, 200, { ok: true });

  // ---- Accounts ----
  const cookie = (sid, maxAge) => `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  if (req.method === 'POST' && (pathname === '/api/auth/signup' || pathname === '/api/auth/login')) {
    const b = await readBody(req);
    try {
      const sid = pathname.endsWith('signup') ? store.signup(b.email, b.password) : store.login(b.email, b.password);
      res.setHeader('Set-Cookie', cookie(sid, 30 * 86400));
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/contact') {
    try { store.addMessage(await readBody(req)); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/opt-out') {
    const b = await readBody(req);
    try { store.addOptOut(b.identifier, b.email); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  const user = store.userFromReq(req);
  if (pathname === '/api/me') return json(res, 200, user ? { user: store.publicUser(user), history: user.history.slice(0, 10) } : { user: null, history: [] });
  if (pathname.startsWith('/api/account') || pathname === '/api/auth/logout') {
    if (!user) return json(res, 401, { error: 'Not signed in.' });
    const b = req.method === 'POST' ? await readBody(req) : {};
    try {
      if (pathname === '/api/auth/logout') { store.logout(user._sid); res.setHeader('Set-Cookie', cookie('', 0)); }
      else if (pathname === '/api/account/plan') {
        if (b.plan !== 'free' && process.env.BILLING_DEMO !== 'true') throw new Error('Payments are not connected yet. Set BILLING_DEMO=true to switch plans without paying (testing only).');
        store.setPlan(user, b.plan);
      }
      else if (pathname === '/api/account/password') store.changePassword(user, b.current, b.next);
      else if (pathname === '/api/account/history/clear') store.clearHistory(user);
      else if (pathname === '/api/account/delete') { store.deleteAccount(user); res.setHeader('Set-Cookie', cookie('', 0)); }
      else return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ---- Dashboard searches: require sign-in, cost one credit, respect opt-outs ----
  const searches = {
    '/api/social-search': [socialSearch, 'social', 'username'], '/api/people-search': [peopleSearch, 'people', 'name'],
    '/api/breach-search': [breachSearch, 'breach', 'email'], '/api/lookup/phone': [phoneLookup, 'phone', 'number'],
    '/api/lookup/email': [emailLookup, 'email', 'email'], '/api/lookup/ip': [ipLookup, 'ip', 'ip'],
  };
  if (searches[pathname]) {
    const [fn, kind, param] = searches[pathname];
    if (!user) return json(res, 401, { error: 'Sign in to search.' });
    const query = (searchParams.get(param) || '').trim();
    if (!query) return json(res, 400, { error: 'Enter something to search.' });
    if (store.isOptedOut(query)) return json(res, 451, { error: 'This identifier has been removed from search results at the owner’s request.' });
    const err = store.charge(user, kind, query);
    if (err) return json(res, 402, { error: err });
    return fn(req, res, searchParams);
  }
  if (pathname === '/api/config') return json(res, 200, { platforms: platforms.length, apiDailyLimit: DAILY_LIMIT, apilayer: !!AL_KEY, analytics: !!CF_TOKEN, breachEnabled: true, breachSource: process.env.HIBP_API_KEY ? 'Have I Been Pwned' : 'XposedOrNot (free)', peopleSources: peopleSources.length, plans: store.PLANS, billingDemo: process.env.BILLING_DEMO === 'true' });
  serveStatic(req, res, pathname);
}).listen(PORT, '0.0.0.0', () => console.log(`Searchmenow listening on :${PORT}`));
