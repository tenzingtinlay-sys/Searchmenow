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
  view.innerHTML = `<h1>Dashboard</h1><p class="sub">Enter a username, email or full name. We route it to the right search.</p>
  <form id="hf"><input id="hq" placeholder="username, name@example.com, or Jane Smith" required><button>Search</button></form>
  <div class="cards">
    <a class="card" href="/dashboard/people-search"><b>People search</b><span>Find a name across ${config.peopleSources} open sources.</span></a>
    <a class="card" href="/dashboard/social-search"><b>Social search</b><span>Check a username across ${config.platforms} platforms live.</span></a>
    <a class="card" href="/dashboard/breach-search"><b>Breach search</b><span>Find known data breaches for an email via ${config.breachSource}.</span></a>
    <a class="card" href="/dashboard/settings"><b>Settings</b><span>API keys and configuration status.</span></a>
  </div>`;
  document.getElementById('hf').onsubmit = (e) => {
    e.preventDefault();
    const v = document.getElementById('hq').value.trim();
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
    <div class="row"><div><b>People sources</b><br><span class="mono">GitHub, Wikipedia, ORCID, Mastodon, Bluesky</span></div><span class="pill found">${config.peopleSources}</span></div>
    <div class="row"><div><b>Social platforms</b><br><span class="mono">server/platforms.js</span></div><span class="pill found">${config.platforms}</span></div>
  </div>`;
}

fetch('/api/config').then((r) => r.json()).then((c) => { config = c; }).finally(render);
