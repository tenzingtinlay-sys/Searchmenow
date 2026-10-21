const view = document.getElementById('view');
const crumb = document.getElementById('crumb');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let config = { platforms: 0, breachEnabled: false };

const routes = {
  '/dashboard': ['home', home],
  '/dashboard/social-search': ['social', social],
  '/dashboard/breach-search': ['breach', breach],
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
  view.innerHTML = `<h1>Dashboard</h1><p class="sub">Search public sources for usernames and email exposure.</p>
  <div class="cards">
    <a class="card" href="/dashboard/social-search"><b>Social search</b><span>Check a username across ${config.platforms} platforms live.</span></a>
    <a class="card" href="/dashboard/breach-search"><b>Breach search</b><span>${config.breachEnabled ? 'Find known data breaches for an email.' : 'Needs an HIBP API key (see Settings).'}</span></a>
    <a class="card" href="/dashboard/settings"><b>Settings</b><span>API keys and configuration status.</span></a>
  </div>`;
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
}

function breach() {
  view.innerHTML = `<h1>Breach search</h1><p class="sub">Check whether an email appears in known data breaches (Have I Been Pwned).</p>
  ${config.breachEnabled ? '' : '<div class="notice" style="margin-bottom:16px">Not configured: add <code>HIBP_API_KEY</code> to <code>.env</code> and restart.</div>'}
  <form id="f"><input id="q" type="email" placeholder="name@example.com" required><button id="b">Search</button></form><div id="out"></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const out = document.getElementById('out'), btn = document.getElementById('b'); btn.disabled = true;
    out.innerHTML = '<div class="notice">Searching…</div>';
    const r = await fetch('/api/breach-search?email=' + encodeURIComponent(document.getElementById('q').value));
    const d = await r.json();
    if (!r.ok) out.innerHTML = `<div class="notice err">${esc(d.error)}</div>`;
    else if (!d.breaches.length) out.innerHTML = '<div class="notice">No breaches found.</div>';
    else out.innerHTML = `<div class="results">${d.breaches.map((b) => `<div class="row"><div><b>${esc(b.name)}</b> <span class="mono">${esc(b.domain || '')}</span><br><span class="mono">${esc(b.data.join(', '))}</span></div><span class="pill">${esc(b.date)}</span></div>`).join('')}</div>`;
    btn.disabled = false;
  };
}

function settings() {
  view.innerHTML = `<h1>Settings</h1><p class="sub">Keys are read from server environment variables and are never sent to the browser.</p>
  <div class="results">
    <div class="row"><div><b>HIBP_API_KEY</b><br><span class="mono">Enables Breach search</span></div><span class="pill ${config.breachEnabled ? 'found' : ''}">${config.breachEnabled ? 'configured' : 'missing'}</span></div>
    <div class="row"><div><b>Social platforms</b><br><span class="mono">server/platforms.js</span></div><span class="pill found">${config.platforms}</span></div>
  </div>`;
}

fetch('/api/config').then((r) => r.json()).then((c) => { config = c; }).finally(render);
