const view = document.getElementById('view');
const crumb = document.getElementById('crumb');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let config = { platforms: 0, breachEnabled: false };

const routes = {
  '/dashboard': ['home', home],
  '/dashboard/social-search': ['social', social],
  '/dashboard/people-search': ['people', people],
  '/dashboard/breach-search': ['breach', breach],
  '/dashboard/billing': ['billing', billing],
  '/dashboard/api': ['api', api],
  '/dashboard/lookup': ['lookup', lookup],
  '/dashboard/settings': ['settings', settings],
};

function render() {
  let p = location.pathname.replace(/\/$/, '');
  if (!routes[p]) { history.replaceState(null, '', '/dashboard'); p = '/dashboard'; }
  const [key, fn] = routes[p];
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  crumb.textContent = p.slice(1).replace(/\//g, ' / ');
  fn();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/dashboard"]');
  if (!a) return;
  e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); render();
});
addEventListener('popstate', render);

function home() {
  view.innerHTML = `<h1>Dashboard</h1><p class="sub">Enter a username, email, full name, phone number or IP. We route it to the right search.</p>
  <form id="hf"><input id="hq" placeholder="username, name@example.com, or Jane Smith" required><button>Search</button></form>
  <div class="cards">
    <a class="card" href="/dashboard/people-search"><b>People search</b><span>Find a name across ${config.peopleSources} open sources.</span></a>
    <a class="card" href="/dashboard/social-search"><b>Social search</b><span>Check a username across ${config.platforms} platforms live.</span></a>
    <a class="card" href="/dashboard/breach-search"><b>Breach search</b><span>Find known data breaches for an email via ${config.breachSource}.</span></a>
    <a class="card" href="/dashboard/lookup"><b>Phone, email &amp; IP</b><span>Validate numbers and emails, locate IPs${config.apilayer ? ' via APILayer' : ''}.</span></a>
    <a class="card" href="/dashboard/settings"><b>Settings</b><span>API keys and configuration status.</span></a>
  </div>`;
  document.getElementById('hf').onsubmit = (e) => {
    e.preventDefault();
    const v = document.getElementById('hq').value.trim();
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || (v.includes(':') && /^[0-9a-f:]+$/i.test(v));
    const isPhone = /^\+?[\d\s().-]{7,20}$/.test(v);
    if (isIp || isPhone) return go(`/dashboard/lookup?type=${isIp ? 'ip' : 'phone'}&q=` + encodeURIComponent(v));
    const route = v.includes('@') ? '/dashboard/breach-search' : /\s/.test(v) ? '/dashboard/people-search' : '/dashboard/social-search';
    go(route + '?q=' + encodeURIComponent(v));
  };
}

function go(url) { history.pushState(null, '', url); render(); }
// Prefill and auto-run a page's search when it was opened with ?q=
function autorun() {
  const q = new URLSearchParams(location.search).get('q');
  if (q) { document.getElementById('q').value = q; document.getElementById('f').requestSubmit(); }
}

// Reads an NDJSON stream and calls onItem for every line.
async function stream(url, onItem) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json()).error);
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    lines.filter(Boolean).forEach((l) => onItem(JSON.parse(l)));
  }
}

function people() {
  view.innerHTML = `<h1>People search</h1><p class="sub">Search a full name across public profile sources (${config.peopleSources}).</p>
  <form id="f"><input id="q" placeholder="Jane Smith" required><button id="b">Search</button></form><div id="out"></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const n = document.getElementById('q').value.trim(), btn = document.getElementById('b'), out = document.getElementById('out');
    btn.disabled = true;
    out.innerHTML = `<div class="stats"><span id="st">Querying ${config.peopleSources} sources…</span></div><div id="groups" style="display:flex;flex-direction:column;gap:16px"></div>`;
    let done = 0, total = 0;
    try {
      await stream('/api/people-search?name=' + encodeURIComponent(n), (g) => {
        done++; total += g.results.length;
        document.getElementById('st').textContent = `${done}/${config.peopleSources} sources · ${total} results`;
        const body = g.error ? '<div class="row"><span class="mono">Source unavailable right now</span><span class="pill error">error</span></div>'
          : g.results.length ? g.results.map((x) => `<div class="row"><div><b>${esc(x.title)}</b><br><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>${x.detail ? `<br><span class="mono">${esc(x.detail)}</span>` : ''}</div></div>`).join('')
          : '<div class="row"><span class="mono">No matches</span><span class="pill">0</span></div>';
        document.getElementById('groups').insertAdjacentHTML('beforeend', `<div><p class="lbl" style="padding-left:0">${esc(g.source)} · ${g.results.length}</p><div class="results">${body}</div></div>`);
      });
    } catch (err) { out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
    btn.disabled = false;
  };
  autorun();
}

function lookup() {
  const kinds = { phone: ['number', '+14158586273'], email: ['email', 'name@example.com'], ip: ['ip', '8.8.8.8'] };
  view.innerHTML = `<h1>Phone, email &amp; IP lookup</h1><p class="sub">Powered by ${config.apilayer ? 'APILayer (Numverify, Mailboxlayer, IP to Location)' : 'free sources. Add <code>APILAYER_API_KEY</code> for carrier, SMTP and richer data'}.</p>
  <form id="f"><select id="k" style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0 10px">
    <option value="phone">Phone</option><option value="email">Email</option><option value="ip">IP address</option></select>
    <input id="q" placeholder="+14158586273" required><button id="b">Look up</button></form><div id="out"></div>`;
  const sel = document.getElementById('k');
  const qk = new URLSearchParams(location.search).get('type'); if (kinds[qk]) sel.value = qk;
  const ph = () => { document.getElementById('q').placeholder = kinds[sel.value][1]; }; ph(); sel.onchange = ph;
  const label = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const val = (v) => v === true ? '<span class="pill found">yes</span>' : v === false ? '<span class="pill">no</span>' : Array.isArray(v) ? esc(v.join(', ') || '—') : esc(v ?? '—');
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const [param] = kinds[sel.value], out = document.getElementById('out'), btn = document.getElementById('b');
    btn.disabled = true; out.innerHTML = '<div class="notice">Looking up…</div>';
    try {
      const r = await fetch(`/api/lookup/${sel.value}?${param}=${encodeURIComponent(document.getElementById('q').value)}`);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error);
      const { source, ...rest } = d;
      out.innerHTML = `<div class="stats"><span>Source: ${esc(source)}</span></div><div class="results">${Object.entries(rest).map(([k, v]) => `<div class="row"><span class="mono">${esc(label(k))}</span><span>${val(v)}</span></div>`).join('')}</div>`;
    } catch (err) { out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
    btn.disabled = false;
  };
  autorun();
}

function api() {
  const base = location.origin;
  const saved = localStorage.getItem('smn_key') || '';
  view.innerHTML = `<h1>Free API</h1><p class="sub">Use Searchmenow from any website or app. Free: ${config.apiDailyLimit} requests per key per day. CORS is enabled.</p>
  <p class="lbl" style="padding-left:0">1 · Create a key</p>
  <form id="kf"><input id="kn" placeholder="Name, e.g. mywebsite.com" required><button>Create free key</button></form>
  <div id="kout" style="margin-bottom:24px"></div>
  <p class="lbl" style="padding-left:0">2 · Try it</p>
  <form id="tf"><select id="te" style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0 10px">
    <option value="social|username">social</option><option value="people|name">people</option><option value="breach|email">breach</option><option value="phone|number">phone</option><option value="email|email">email</option><option value="ip|ip">ip</option></select>
    <input id="tq" placeholder="torvalds" required><button id="tb">Send</button></form>
  <pre id="tout" class="notice" style="max-height:320px;overflow:auto;white-space:pre-wrap;display:none"></pre>
  <p class="lbl" style="padding-left:0;margin-top:24px">3 · Endpoints</p>
  <div class="results">
    ${[['social', 'username=torvalds', 'Username across ' + config.platforms + ' platforms'], ['people', 'name=Jane%20Smith', 'Name across public sources'], ['breach', 'email=you@example.com', 'Known breaches for an email'], ['phone', 'number=%2B14158586273', 'Phone validation, country, carrier'], ['email', 'email=you@example.com', 'Email deliverability check'], ['ip', 'ip=8.8.8.8', 'IP geolocation and ISP']]
      .map(([e, qs, d]) => `<div class="row"><div><b>GET /api/v1/${e}?${qs}</b><br><span class="mono">${d}</span></div></div>`).join('')}
  </div>
  <p class="lbl" style="padding-left:0;margin-top:24px">Example: call from any website</p>
  <pre class="notice" style="white-space:pre-wrap">fetch('${base}/api/v1/social?username=torvalds', {
  headers: { 'X-API-Key': 'YOUR_KEY' }
}).then(r => r.json()).then(console.log);

curl -H "X-API-Key: YOUR_KEY" "${base}/api/v1/breach?email=you@example.com"</pre>`;
  const showKey = async (k) => {
    const u = await (await fetch('/api/keys/usage?api_key=' + k)).json();
    document.getElementById('kout').innerHTML = u.error ? '' : `<div class="notice"><b style="color:var(--text)">${esc(u.name)}</b> · ${u.usedToday}/${u.dailyLimit} used today<br><code style="color:var(--ok);word-break:break-all">${esc(k)}</code><br><span class="mono">Keep this key secret. It is saved in this browser.</span></div>`;
  };
  if (saved) showKey(saved);
  document.getElementById('kf').onsubmit = async (e) => {
    e.preventDefault();
    const r = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('kn').value }) });
    const d = await r.json();
    if (!r.ok) return (document.getElementById('kout').innerHTML = `<div class="notice err">${esc(d.error)}</div>`);
    localStorage.setItem('smn_key', d.key); showKey(d.key);
  };
  document.getElementById('te').onchange = (e) => { document.getElementById('tq').placeholder = { social: 'torvalds', people: 'Jane Smith', breach: 'you@example.com', phone: '+14158586273', email: 'you@example.com', ip: '8.8.8.8' }[e.target.value.split('|')[0]]; };
  document.getElementById('tf').onsubmit = async (e) => {
    e.preventDefault();
    const k = localStorage.getItem('smn_key'), out = document.getElementById('tout'), btn = document.getElementById('tb');
    out.style.display = 'block';
    if (!k) return (out.textContent = 'Create a key first.');
    const [ep, param] = document.getElementById('te').value.split('|');
    btn.disabled = true; out.textContent = 'Loading…';
    const r = await fetch(`/api/v1/${ep}?${param}=${encodeURIComponent(document.getElementById('tq').value)}`, { headers: { 'X-API-Key': k } });
    out.textContent = `HTTP ${r.status}\n` + JSON.stringify(await r.json(), null, 2);
    btn.disabled = false; showKey(k);
  };
}

function billing() {
  const plans = [['Free', '$0', 'Social, people and breach search with free sources'], ['Pro', '$19.99/mo', 'Higher limits, saved searches, export'], ['Team', '$49.99/mo', 'Multiple seats and API access']];
  view.innerHTML = `<h1>Billing</h1><p class="sub">You are on the <b>Free</b> plan.</p>
  <div class="cards">${plans.map(([n, p, d], i) => `<div class="card"><b>${n}</b><span style="font-size:22px;color:var(--text)">${p}</span><span>${d}</span>
  <button ${i === 0 ? 'disabled' : ''} data-plan="${n}" style="height:36px;margin-top:8px">${i === 0 ? 'Current plan' : 'Upgrade'}</button></div>`).join('')}</div>
  <div id="bmsg" style="margin-top:16px"></div>`;
  view.querySelectorAll('button[data-plan]').forEach((b) => b.onclick = () => {
    document.getElementById('bmsg').innerHTML = '<div class="notice">Payments are not connected yet. Add a Stripe integration to enable upgrades.</div>';
  });
}

function social() {
  view.innerHTML = `<h1>Social search</h1><p class="sub">Find public profiles that match a username.</p>
  <form id="f"><input id="q" placeholder="username" autocomplete="off" required><button id="b">Search</button></form>
  <div id="out"></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('q').value.trim(), btn = document.getElementById('b'), out = document.getElementById('out');
    btn.disabled = true;
    out.innerHTML = `<div class="stats"><span id="st">Checking 0/${config.platforms}</span><span id="fd">0 found</span></div><div class="results" id="rs"></div>`;
    const rows = []; let done = 0, found = 0;
    try {
      const r = await fetch('/api/social-search?username=' + encodeURIComponent(u));
      if (!r.ok) throw new Error((await r.json()).error);
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done: end } = await reader.read(); if (end) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const l of lines) if (l) {
          const x = JSON.parse(l); rows.push(x); done++; if (x.status === 'found') found++;
          rows.sort((a, b) => (a.status === 'found' ? 0 : 1) - (b.status === 'found' ? 0 : 1) || a.platform.localeCompare(b.platform));
          document.getElementById('st').textContent = `Checked ${done}/${config.platforms}`;
          document.getElementById('fd').textContent = `${found} found`;
          document.getElementById('rs').innerHTML = rows.map((x) => `<div class="row"><div><b>${esc(x.platform)}</b><br>${x.status === 'found' ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>` : `<span class="mono">${esc(x.url)}</span>`}</div><span class="pill ${x.status}">${x.status.replace('_', ' ')}</span></div>`).join('');
        }
      }
    } catch (err) { out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
    btn.disabled = false;
  };
  autorun();
}

function breach() {
  view.innerHTML = `<h1>Breach search</h1><p class="sub">Check whether an email appears in known data breaches. Source: ${config.breachSource}.</p>
  <form id="f"><input id="q" type="email" placeholder="name@example.com" required><button id="b">Search</button></form><div id="out"></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const out = document.getElementById('out'), btn = document.getElementById('b'); btn.disabled = true;
    out.innerHTML = '<div class="notice">Searching…</div>';
    const r = await fetch('/api/breach-search?email=' + encodeURIComponent(document.getElementById('q').value));
    const d = await r.json();
    if (!r.ok) out.innerHTML = `<div class="notice err">${esc(d.error)}</div>`;
    else if (!d.breaches.length) out.innerHTML = '<div class="notice">No breaches found.</div>';
    else out.innerHTML = `<div class="stats"><span>${d.breaches.length} breaches found</span></div><div class="results">${d.breaches.map((b) => `<div class="row"><div><b>${esc(b.name)}</b> <span class="mono">${esc(b.domain || '')}</span><br><span class="mono">${esc(b.data.join(', '))}</span></div><span class="pill">${esc(b.date)}</span></div>`).join('')}</div>`;
    btn.disabled = false;
  };
  autorun();
}

function settings() {
  view.innerHTML = `<h1>Settings</h1><p class="sub">Keys are read from server environment variables and are never sent to the browser.</p>
  <div class="results">
    <div class="row"><div><b>Breach source</b><br><span class="mono">Set HIBP_API_KEY to use Have I Been Pwned instead of XposedOrNot</span></div><span class="pill found">${esc(config.breachSource)}</span></div>
    <div class="row"><div><b>APILAYER_API_KEY</b><br><span class="mono">Numverify, Mailboxlayer and IP to Location from apilayer.com</span></div><span class="pill ${config.apilayer ? 'found' : ''}">${config.apilayer ? 'configured' : 'using free fallback'}</span></div>
    <div class="row"><div><b>CF_BEACON_TOKEN</b><br><span class="mono">Cloudflare Web Analytics (visitor stats)</span></div><span class="pill ${config.analytics ? 'found' : ''}">${config.analytics ? 'enabled' : 'off'}</span></div>
    <div class="row"><div><b>People sources</b><br><span class="mono">GitHub, Wikipedia, ORCID, Mastodon, Bluesky</span></div><span class="pill found">${config.peopleSources}</span></div>
    <div class="row"><div><b>Social platforms</b><br><span class="mono">server/platforms.js</span></div><span class="pill found">${config.platforms}</span></div>
  </div>`;
}

fetch('/api/config').then((r) => r.json()).then((c) => { config = c; }).finally(render);
