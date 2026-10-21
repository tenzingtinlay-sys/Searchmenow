// Searchmenow single-page app: public site + signed-in dashboard.
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
let config = {}, me = null, history_ = [];
let view; // current dashboard page container

const LEGAL = 'Searchmenow is not a consumer reporting agency and our results are not consumer reports. They may not be used to decide eligibility for credit, insurance, employment, housing or tenant screening, or any other purpose covered by the Fair Credit Reporting Act.';
const ANNOUNCEMENTS = [
  ['Phone, email & IP lookup', 'Validate phone numbers and emails and locate IP addresses from the new lookup tab.'],
  ['Free API', 'Create an API key and run any search from your own website or app.'],
  ['People search', 'Search a full name across GitHub, Wikipedia, ORCID, Mastodon and Bluesky.'],
];

// ---------- helpers ----------
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}
async function loadMe() {
  const r = await fetch('/api/me');
  const d = r.ok ? await r.json() : {}; me = d.user || null; history_ = d.history || [];
}
function go(url, replace) { history[replace ? 'replaceState' : 'pushState'](null, '', url); render(); }
const brand = () => `<a class="brand" href="${me ? '/dashboard' : '/'}" aria-label="Searchmenow home">${LOGO}<span>searchme<span class="dim">now</span></span></a>`;
const errBox = (m) => `<div class="notice err">${esc(m)}${/limit reached/i.test(m) ? ' <a href="/dashboard/billing">Upgrade</a>' : ''}</div>`;

// Classifies free text into the right search.
function routeFor(v) {
  v = v.trim();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) || (v.includes(':') && /^[0-9a-f:]+$/i.test(v))) return `/dashboard/lookup?type=ip&q=${encodeURIComponent(v)}`;
  if (/^\+?[\d\s().-]{7,20}$/.test(v)) return `/dashboard/lookup?type=phone&q=${encodeURIComponent(v)}`;
  if (v.includes('@')) return `/dashboard/breach-search?q=${encodeURIComponent(v)}`;
  if (/\s/.test(v)) return `/dashboard/people-search?q=${encodeURIComponent(v)}`;
  return `/dashboard/social-search?q=${encodeURIComponent(v)}`;
}
const KIND_ROUTE = { social: 'social-search', people: 'people-search', breach: 'breach-search', phone: 'lookup?type=phone&', email: 'lookup?type=email&', ip: 'lookup?type=ip&' };
const historyHref = (h) => { const r = KIND_ROUTE[h.kind]; return `/dashboard/${r}${r.includes('?') ? '' : '?'}q=${encodeURIComponent(h.query)}`; };

// Runs a search request; handles auth and credit errors uniformly.
async function searchFetch(url) {
  const r = await fetch(url);
  if (r.status === 401) { go('/login?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('Sign in to search.'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
  loadMe().then(updateReadout);
  return r;
}
async function stream(url, onItem) {
  const el = view;
  const r = await searchFetch(url);
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    lines.filter(Boolean).forEach((l) => { if (document.body.contains(el)) onItem(JSON.parse(l)); });
  }
}
function autorun() {
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('q').value = q; $('f').requestSubmit(); }
}

// ---------- router ----------
const publicRoutes = { '/': landing, '/login': () => auth('login'), '/signup': () => auth('signup'), '/pricing': pricing, '/contact': contact, '/opt-out': optOut, '/terms': terms, '/privacy': privacy };
const dashRoutes = {
  '/dashboard': ['home', 'Home', home],
  '/dashboard/social-search': ['social', 'social-search', social],
  '/dashboard/people-search': ['people', 'people-search', people],
  '/dashboard/breach-search': ['breach', 'breach-search', breach],
  '/dashboard/lookup': ['lookup', 'lookup', lookup],
  '/dashboard/api': ['api', 'api', api],
  '/dashboard/billing': ['billing', 'billing', billing],
  '/dashboard/settings': ['settings', 'settings', settings],
};

function render() {
  const p = location.pathname.replace(/(.)\/$/, '$1');
  window.scrollTo(0, 0);
  if (dashRoutes[p]) {
    if (!me) return go('/login?next=' + encodeURIComponent(location.pathname + location.search), true);
    shell();
    const [key, crumb, fn] = dashRoutes[p];
    document.querySelectorAll('.sidebar .nav-link[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
    $('crumbs').innerHTML = p === '/dashboard' ? '<span class="cur">dashboard</span>' : `<a href="/dashboard">dashboard</a><span>/</span><span class="cur">${crumb}</span>`;
    $('sidebar').classList.remove('open');
    view = $('page'); fn();
    $('main').scrollTop = 0;
    return;
  }
  if ((p === '/login' || p === '/signup') && me) return go('/dashboard', true);
  shellMounted = false;
  (publicRoutes[p] || notFound)();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
addEventListener('popstate', render);

// ---------- public site ----------
function siteNav() {
  return `<header class="site-nav">${brand()}<nav class="links">
    <a href="/pricing">Pricing</a><a href="/contact">Contact</a>
    ${me ? '<a class="btn btn-primary btn-sm" href="/dashboard">Dashboard</a>' : '<a href="/login">Sign in</a><a class="btn btn-primary btn-sm" href="/signup">Get started</a>'}
  </nav></header>`;
}
function siteFooter() {
  return `<footer class="site-footer"><div class="wrap">
    <div class="links"><a href="/pricing">Pricing</a><a href="/contact">Contact</a><a href="/opt-out">Opt out of search results</a><a href="/terms">Terms &amp; permitted uses</a><a href="/privacy">Privacy</a></div>
    <p class="legal">${LEGAL}</p><p class="legal">© ${new Date().getFullYear()} Searchmenow</p></div></footer>`;
}
function page(inner) { app.innerHTML = siteNav() + inner + siteFooter(); }

function landing() {
  page(`<section class="hero wrap">
    <p class="lbl">Live OSINT search</p>
    <h1>Search a username, email, name or phone across public sources</h1>
    <p>Searchmenow queries ${config.platforms}+ platforms and open data sources live, ranks matching public profiles and shows known breach exposure for an email.</p>
    <form class="search" id="lf"><input id="lq" placeholder="username, name@example.com, Jane Smith, +14155550123" required aria-label="Search"><button class="btn btn-primary">${icon('search')} Search</button></form>
    <p class="mono">Free account · ${config.plans?.free?.daily || 10} searches per day · no card required</p>
    <div class="kpis"><div><b>${config.platforms}</b><span>platforms</span></div><div><b>${config.peopleSources}</b><span>people sources</span></div><div><b>6</b><span>search types</span></div><div><b>Live</b><span>no stale cache</span></div></div>
  </section>
  <section class="site-section"><div class="wrap">
    <h2>Everything in one dashboard</h2><p class="sub">Each search runs in real time against the source, so results reflect what is public right now.</p>
    <div class="cards">
      ${[['search', 'Social search', `Check a username on ${config.platforms} platforms. Results stream in as each site answers.`], ['users', 'People search', 'Find a full name on GitHub, Wikipedia, ORCID, Mastodon and Bluesky.'], ['database', 'Breach search', 'See which known data breaches include an email address.'], ['phone', 'Phone, email & IP', 'Validate numbers and mailboxes, and locate IP addresses.'], ['code', 'Free API', 'Run every search from your own website or app with an API key.'], ['shield', 'Opt-out', 'Anyone can remove their identifier from results.']]
        .map(([i, t, d]) => `<div class="card"><div class="ic">${icon(i)} ${t}</div><span>${d}</span></div>`).join('')}
    </div></div></section>
  <section class="site-section"><div class="wrap" style="text-align:center">
    <h2>Start searching for free</h2><p class="sub">Create an account in seconds.</p>
    <a class="btn btn-primary" href="${me ? '/dashboard' : '/signup'}">${me ? 'Open dashboard' : 'Create free account'} ${icon('arrow')}</a>
  </div></section>`);
  $('lf').onsubmit = (e) => { e.preventDefault(); const target = routeFor($('lq').value); me ? go(target) : go('/signup?next=' + encodeURIComponent(target)); };
}

function auth(mode) {
  const signup = mode === 'signup';
  const next = new URLSearchParams(location.search).get('next') || '/dashboard';
  app.innerHTML = `<div class="auth"><div class="box">
    ${brand()}
    <h1>${signup ? 'Create your account' : 'Sign in'}</h1>
    <p class="sub">${signup ? `Free plan includes ${config.plans?.free?.daily || 10} searches per day.` : 'Welcome back.'}</p>
    <form id="af">
      <div class="field"><label for="ae">Email</label><input id="ae" type="email" autocomplete="email" required></div>
      <div class="field"><label for="ap">Password</label><input id="ap" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" required>${signup ? '<span class="mono">At least 8 characters</span>' : ''}</div>
      ${signup ? '<label class="mono" style="display:flex;gap:8px;align-items:flex-start;margin:4px 0 16px;line-height:1.5"><input type="checkbox" required style="width:auto;min-height:0;margin-top:2px"> I will only use results for lawful purposes and agree to the <a href="/terms" target="_blank">terms</a>.</label>' : ''}
      <div id="aerr" style="margin-bottom:12px"></div>
      <button class="btn btn-primary" style="width:100%" id="ab">${signup ? 'Create account' : 'Sign in'}</button>
    </form>
    <p class="mono" style="margin-top:20px;text-align:center">${signup ? 'Already have an account? <a href="/login">Sign in</a>' : 'New here? <a href="/signup">Create an account</a>'}</p>
  </div></div>`;
  $('af').onsubmit = async (e) => {
    e.preventDefault(); $('ab').disabled = true; $('aerr').innerHTML = '';
    try {
      await post(`/api/auth/${mode}`, { email: $('ae').value, password: $('ap').value });
      await loadMe(); go(next.startsWith('/') ? next : '/dashboard', true);
    } catch (err) { $('aerr').innerHTML = errBox(err.message); $('ab').disabled = false; }
  };
  $('ae').focus();
}

function planCards(current) {
  const feats = { free: ['All 6 search types', 'Live results', 'Search history'], pro: ['Everything in Free', 'Priority sources', 'Email support'], team: ['Everything in Pro', 'Shared billing', 'Higher API limits'] };
  return `<div class="cards">${Object.entries(config.plans).map(([id, p]) => `<div class="card ${current === id ? 'current' : ''}">
    <div class="ic">${p.name}${current === id ? ' <span class="pill found">current</span>' : ''}</div>
    <div class="price">$${p.price}<small>${p.price ? ' / month' : ''}</small></div>
    <span>${p.daily} searches per day</span>
    <ul class="feat">${feats[id].map((f) => `<li>${icon('check', 14)}${f}</li>`).join('')}</ul>
    ${current === undefined ? `<a class="btn ${id === 'pro' ? 'btn-primary' : 'btn-secondary'}" href="/signup">${p.price ? 'Get ' + p.name : 'Start free'}</a>`
      : `<button class="btn ${current === id ? 'btn-secondary' : 'btn-primary'}" data-plan="${id}" ${current === id ? 'disabled' : ''}>${current === id ? 'Current plan' : id === 'free' ? 'Downgrade' : 'Upgrade'}</button>`}
  </div>`).join('')}</div>`;
}
function pricing() {
  page(`<div class="wrap" style="padding:56px 24px"><h1>Pricing</h1><p class="sub">Start free. Upgrade when you need more searches.</p>${planCards()}</div>`);
}

function contact() {
  page(`<div class="narrow"><h1>Contact support</h1><p class="sub">Questions, bugs, billing or removal requests. We reply by email.</p>
    <form id="cf">
      <div class="field"><label for="cn">Name</label><input id="cn" autocomplete="name"></div>
      <div class="field"><label for="ce">Email</label><input id="ce" type="email" required value="${esc(me?.email || '')}"></div>
      <div class="field"><label for="cs">Subject</label><select id="cs"><option>General question</option><option>Bug report</option><option>Billing</option><option>Removal request</option></select></div>
      <div class="field"><label for="cb">Message</label><textarea id="cb" required minlength="5"></textarea></div>
      <div id="cout" style="margin-bottom:12px"></div><button class="btn btn-primary" id="cbtn">Send message</button>
    </form></div>`);
  $('cf').onsubmit = async (e) => {
    e.preventDefault(); $('cbtn').disabled = true;
    try { await post('/api/contact', { name: $('cn').value, email: $('ce').value, subject: $('cs').value, body: $('cb').value }); $('cf').innerHTML = '<div class="notice ok">Thanks, your message was sent. We will reply by email.</div>'; }
    catch (err) { $('cout').innerHTML = errBox(err.message); $('cbtn').disabled = false; }
  };
}

function optOut() {
  page(`<div class="narrow"><h1>Opt out of search results</h1><p class="sub">Enter a username, email address, phone number or full name you own. Once removed, Searchmenow will refuse to search for it, in the dashboard and through the API.</p>
    <form id="of">
      <div class="field"><label for="oi">Username, email, phone or name to remove</label><input id="oi" required></div>
      <div class="field"><label for="oe">Your contact email</label><input id="oe" type="email" required></div>
      <label class="mono" style="display:flex;gap:8px;align-items:flex-start;margin:4px 0 16px;line-height:1.5"><input type="checkbox" required style="width:auto;min-height:0;margin-top:2px"> I confirm this identifier belongs to me or I am authorised to request its removal.</label>
      <div id="oout" style="margin-bottom:12px"></div><button class="btn btn-primary" id="ob">Remove from results</button>
    </form></div>`);
  $('of').onsubmit = async (e) => {
    e.preventDefault(); $('ob').disabled = true;
    try { await post('/api/opt-out', { identifier: $('oi').value, email: $('oe').value }); $('of').innerHTML = `<div class="notice ok">Done. <b>${esc($('oi').value)}</b> is now excluded from all Searchmenow results.</div>`; }
    catch (err) { $('oout').innerHTML = errBox(err.message); $('ob').disabled = false; }
  };
}

function terms() {
  page(`<div class="narrow"><h1>Terms &amp; permitted uses</h1>
    <div class="section"><h2>What Searchmenow does</h2><p class="sub">Searchmenow queries publicly available sources in real time and shows what they return. We do not verify that a result belongs to a specific person.</p></div>
    <div class="section"><h2>Permitted uses</h2><p class="sub">Security research, checking your own exposure, verifying identities you are authorised to verify, journalism and academic research.</p></div>
    <div class="section"><h2>Prohibited uses</h2><p class="sub">Stalking, harassment, doxxing or any unlawful purpose. ${esc(LEGAL)}</p></div>
    <div class="section"><h2>Removal</h2><p class="sub">Anyone can remove their identifier at <a href="/opt-out">/opt-out</a>.</p></div></div>`);
}
function privacy() {
  page(`<div class="narrow"><h1>Privacy</h1>
    <div class="section"><h2>What we store</h2><p class="sub">Your account email, a hashed password, your plan, daily search count and your last 50 searches. You can clear history or delete your account in Settings at any time.</p></div>
    <div class="section"><h2>Searches</h2><p class="sub">Search terms are sent to the public sources needed to answer them. We do not sell data.</p></div>
    <div class="section"><h2>Cookies</h2><p class="sub">One essential cookie keeps you signed in.${config.analytics ? ' Cloudflare Web Analytics measures page performance without cookies.' : ''}</p></div></div>`);
}
function notFound() {
  page(`<div class="narrow" style="text-align:center;padding:96px 24px"><h1>We couldn’t find that page</h1><p class="sub">The link may have moved, or it never existed.</p>
    <div style="display:flex;gap:12px;justify-content:center"><a class="btn btn-primary" href="/">${icon('home')} Go home</a><a class="btn btn-secondary" href="/contact">Contact support</a></div></div>`);
}

// ---------- dashboard shell ----------
let shellMounted = false;
function shell() {
  if (shellMounted && $('page')) return updateReadout();
  shellMounted = true;
  const nav = (href, route, ic, label) => `<a class="nav-link" href="${href}" data-route="${route}">${icon(ic)}<span>${label}</span></a>`;
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="top">${brand()}</div>
      <nav aria-label="Dashboard">
        ${nav('/dashboard', 'home', 'home', 'Home')}
        ${nav('/dashboard/social-search', 'social', 'search', 'Social search')}
        ${nav('/dashboard/people-search', 'people', 'users', 'People search')}
        ${nav('/dashboard/breach-search', 'breach', 'database', 'Breach search')}
        ${nav('/dashboard/lookup', 'lookup', 'phone', 'Phone, email &amp; IP')}
        <div class="sep"></div><p class="lbl">Developers</p>
        ${nav('/dashboard/api', 'api', 'code', 'API')}
        <div class="sep"></div><p class="lbl">Account</p>
        ${nav('/dashboard/billing', 'billing', 'wallet', 'Billing')}
        ${nav('/dashboard/settings', 'settings', 'settings', 'Settings')}
      </nav>
      <div class="bottom">
        <a class="nav-link" href="/">${icon('external')}<span>Back to site</span></a>
        <a class="nav-link" href="/privacy">${icon('shield')}<span>Privacy choices</span></a>
        <button class="nav-link" id="signout">${icon('logout')}<span>Sign out</span></button>
      </div>
    </aside>
    <main class="content" id="main">
      <header class="topbar">
        <nav class="crumbs" id="crumbs" aria-label="Breadcrumb"></nav>
        <a class="menu-btn brand" href="/dashboard">${LOGO}</a>
        <div class="top-actions">
          <div class="readout" id="readout" title="Searches left today"></div>
          <div style="position:relative">
            <button class="icon-btn" id="bell" aria-label="Announcements" aria-expanded="false">${icon('bell')}<span class="dot" id="bell-dot"></span></button>
            <div class="popover" id="ann" hidden>${ANNOUNCEMENTS.map(([t, d]) => `<div class="item"><b>${t}</b>${d}</div>`).join('')}</div>
          </div>
          <button class="icon-btn menu-btn" id="menu" aria-label="Open navigation menu">${icon('menu')}</button>
        </div>
      </header>
      <div class="page" id="page"></div>
      <footer class="dash-footer"><div class="inner">
        <div class="links"><a href="/opt-out">Opt out of search results</a><a href="/privacy">Privacy choices</a></div>
        <p class="legal">${LEGAL} <a href="/terms">Permitted uses</a>.</p>
      </div></footer>
    </main>
    <a class="support" href="/contact" aria-label="Contact support">${icon('mail')}<span>Support</span></a>
  </div>`;
  if (localStorage.getItem('smn_ann_seen') === String(ANNOUNCEMENTS.length)) $('bell-dot').hidden = true;
  $('bell').onclick = (e) => {
    e.stopPropagation(); const a = $('ann'); a.hidden = !a.hidden; $('bell').setAttribute('aria-expanded', !a.hidden);
    localStorage.setItem('smn_ann_seen', ANNOUNCEMENTS.length); $('bell-dot').hidden = true;
  };
  document.addEventListener('click', (e) => { if ($('ann') && !e.target.closest('#ann')) $('ann').hidden = true; });
  $('menu').onclick = () => $('sidebar').classList.toggle('open');
  $('signout').onclick = async () => { await post('/api/auth/logout'); me = null; shellMounted = false; go('/'); };
  updateReadout();
}
function updateReadout() {
  if (!me || !$('readout')) return;
  $('readout').innerHTML = `${me.remaining}<span class="unit">/ ${me.limit} searches left</span>`;
}

// ---------- dashboard pages ----------
function home() {
  const types = [['/dashboard/social-search', 'search', 'Social search', `Username across ${config.platforms} platforms.`], ['/dashboard/people-search', 'users', 'People search', `Full name across ${config.peopleSources} open sources.`], ['/dashboard/breach-search', 'database', 'Breach search', `Known breaches for an email via ${config.breachSource}.`], ['/dashboard/lookup', 'phone', 'Phone, email & IP', `Validate and locate${config.apilayer ? ' via APILayer' : ''}.`]];
  view.innerHTML = `<h1>Dashboard</h1><p class="sub">Signed in as ${esc(me.email)} · ${esc(me.planName)} plan</p>
    <form class="search" id="hf"><input id="hq" placeholder="username, name@example.com, Jane Smith, +14155550123 or 8.8.8.8" required aria-label="Search"><button class="btn btn-primary">${icon('search')} Search</button></form>
    <div class="section"><p class="lbl">Today</p><div class="card" style="max-width:360px"><div class="ic">${me.used} of ${me.limit} searches used</div><div class="progress"><div style="width:${Math.min(100, (me.used / me.limit) * 100)}%"></div></div>${me.plan === 'free' ? '<span><a href="/dashboard/billing">Upgrade</a> for more searches.</span>' : ''}</div></div>
    <div class="section"><p class="lbl">Search types</p><div class="cards">${types.map(([h, i, t, d]) => `<a class="card" href="${h}"><div class="ic">${icon(i)} ${t}</div><span>${d}</span></a>`).join('')}</div></div>
    <div class="section"><p class="lbl">Recent searches</p>${history_.length ? `<div class="results">${history_.map((h) => `<a class="row" href="${historyHref(h)}" style="text-decoration:none"><div style="display:flex;gap:10px;align-items:center">${icon('history')}<b>${esc(h.query)}</b></div><span class="mono">${esc(h.kind)} · ${new Date(h.at).toLocaleString()}</span></a>`).join('')}</div>` : '<div class="notice">No searches yet. Try the search box above.</div>'}</div>`;
  $('hf').onsubmit = (e) => { e.preventDefault(); go(routeFor($('hq').value)); };
  $('hq').focus();
}

function social() {
  view.innerHTML = `<h1>Social search</h1><p class="sub">Find public profiles that match a username across ${config.platforms} platforms. 1 search credit.</p>
    <form class="search" id="f"><input id="q" placeholder="username" autocomplete="off" required><button class="btn btn-primary" id="b">${icon('search')} Search</button></form><div id="out"></div>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('q').value.trim(), out = $('out'); $('b').disabled = true;
    history.replaceState(null, '', '?q=' + encodeURIComponent(u));
    out.innerHTML = `<div class="stats"><span class="stream-cursor"></span><span id="st">Checking 0/${config.platforms}</span><span id="fd">0 found</span></div><div class="results" id="rs"></div>`;
    const rows = []; let done = 0, found = 0;
    try {
      await stream('/api/social-search?username=' + encodeURIComponent(u), (x) => {
        rows.push(x); done++; if (x.status === 'found') found++;
        rows.sort((a, b) => (a.status === 'found' ? 0 : 1) - (b.status === 'found' ? 0 : 1) || a.platform.localeCompare(b.platform));
        $('st').textContent = `Checked ${done}/${config.platforms}`; $('fd').textContent = `${found} found`;
        $('rs').innerHTML = rows.map((x) => `<div class="row"><div><b>${esc(x.platform)}</b><br>${x.status === 'found' ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>` : `<span class="mono">${esc(x.url)}</span>`}</div><span class="pill ${x.status}">${x.status.replace('_', ' ')}</span></div>`).join('');
      });
      out.querySelector('.stream-cursor')?.remove();
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  autorun();
}

function people() {
  view.innerHTML = `<h1>People search</h1><p class="sub">Search a full name across ${config.peopleSources} public profile sources. 1 search credit.</p>
    <form class="search" id="f"><input id="q" placeholder="Jane Smith" required><button class="btn btn-primary" id="b">${icon('search')} Search</button></form><div id="out"></div>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const n = $('q').value.trim(), out = $('out'); $('b').disabled = true;
    history.replaceState(null, '', '?q=' + encodeURIComponent(n));
    out.innerHTML = `<div class="stats"><span class="stream-cursor"></span><span id="st">Querying ${config.peopleSources} sources…</span></div><div id="groups" style="display:flex;flex-direction:column;gap:16px"></div>`;
    let done = 0, total = 0;
    try {
      await stream('/api/people-search?name=' + encodeURIComponent(n), (g) => {
        done++; total += g.results.length;
        $('st').textContent = `${done}/${config.peopleSources} sources · ${total} results`;
        const body = g.error ? '<div class="row"><span class="mono">Source unavailable right now</span><span class="pill error">error</span></div>'
          : g.results.length ? g.results.map((x) => `<div class="row"><div><b>${esc(x.title)}</b><br><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>${x.detail ? `<br><span class="mono">${esc(x.detail)}</span>` : ''}</div></div>`).join('')
          : '<div class="row"><span class="mono">No matches</span><span class="pill">0</span></div>';
        $('groups').insertAdjacentHTML('beforeend', `<div><p class="lbl">${esc(g.source)} · ${g.results.length}</p><div class="results">${body}</div></div>`);
      });
      out.querySelector('.stream-cursor')?.remove();
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  autorun();
}

function breach() {
  view.innerHTML = `<h1>Breach search</h1><p class="sub">Check whether an email appears in known data breaches. Source: ${esc(config.breachSource)}. 1 search credit.</p>
    <form class="search" id="f"><input id="q" type="email" placeholder="name@example.com" required><button class="btn btn-primary" id="b">${icon('search')} Search</button></form><div id="out"></div>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const out = $('out'), q = $('q').value.trim(); $('b').disabled = true;
    history.replaceState(null, '', '?q=' + encodeURIComponent(q));
    out.innerHTML = '<div class="stats"><span class="stream-cursor"></span><span>Searching breach records…</span></div>';
    try {
      const d = await (await searchFetch('/api/breach-search?email=' + encodeURIComponent(q))).json();
      out.innerHTML = !d.breaches.length ? '<div class="notice ok">No known breaches found for this email.</div>'
        : `<div class="stats"><span>${d.breaches.length} breaches found</span></div><div class="results">${d.breaches.map((b) => `<div class="row"><div><b>${esc(b.name)}</b> <span class="mono">${esc(b.domain || '')}</span><br><span class="mono">${esc(b.data.join(', '))}</span></div><span class="pill">${esc(b.date)}</span></div>`).join('')}</div>`;
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  autorun();
}

function lookup() {
  const kinds = { phone: ['number', '+14158586273'], email: ['email', 'name@example.com'], ip: ['ip', '8.8.8.8'] };
  view.innerHTML = `<h1>Phone, email &amp; IP lookup</h1><p class="sub">Powered by ${config.apilayer ? 'APILayer (Numverify, Mailboxlayer, IP to Location)' : 'free sources. Add <code>APILAYER_API_KEY</code> for carrier, SMTP and richer data'}. 1 search credit.</p>
    <form class="search" id="f"><select id="k" aria-label="Lookup type"><option value="phone">Phone</option><option value="email">Email</option><option value="ip">IP address</option></select>
    <input id="q" required aria-label="Value"><button class="btn btn-primary" id="b">${icon('search')} Look up</button></form><div id="out"></div>`;
  const sel = $('k'), qk = new URLSearchParams(location.search).get('type'); if (kinds[qk]) sel.value = qk;
  const ph = () => { $('q').placeholder = kinds[sel.value][1]; }; ph(); sel.onchange = ph;
  const label = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/\bIp\b/, 'IP').replace(/\bIsp\b/, 'ISP').replace(/\bAsn\b/, 'ASN').replace(/\bMx\b/, 'MX');
  const val = (v) => v === true ? '<span class="pill found">yes</span>' : v === false ? '<span class="pill">no</span>' : Array.isArray(v) ? esc(v.join(', ') || '—') : esc(v ?? '—');
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const [param] = kinds[sel.value], out = $('out'), q = $('q').value.trim(); $('b').disabled = true;
    history.replaceState(null, '', `?type=${sel.value}&q=${encodeURIComponent(q)}`);
    out.innerHTML = '<div class="stats"><span class="stream-cursor"></span><span>Looking up…</span></div>';
    try {
      const d = await (await searchFetch(`/api/lookup/${sel.value}?${param}=${encodeURIComponent(q)}`)).json();
      if (d.error) throw new Error(d.error);
      const { source, ...rest } = d;
      out.innerHTML = `<div class="stats"><span>Source: ${esc(source)}</span></div><div class="results">${Object.entries(rest).map(([k, v]) => `<div class="row"><span class="mono">${esc(label(k))}</span><span>${val(v)}</span></div>`).join('')}</div>`;
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  autorun();
}

function api() {
  const base = location.origin, saved = localStorage.getItem('smn_key') || '';
  const eps = [['social', 'username=torvalds', `Username across ${config.platforms} platforms`], ['people', 'name=Jane%20Smith', 'Name across public sources'], ['breach', 'email=you@example.com', 'Known breaches for an email'], ['phone', 'number=%2B14158586273', 'Phone validation, country, carrier'], ['email', 'email=you@example.com', 'Email deliverability check'], ['ip', 'ip=8.8.8.8', 'IP geolocation and ISP']];
  view.innerHTML = `<h1>API</h1><p class="sub">Use Searchmenow from any website or app. ${config.apiDailyLimit} requests per key per day. CORS enabled.</p>
    <div class="section"><p class="lbl">1 · Create a key</p>
      <form class="search" id="kf" style="margin-bottom:12px"><input id="kn" placeholder="Key name, e.g. mywebsite.com" required><button class="btn btn-primary">Create key</button></form><div id="kout"></div></div>
    <div class="section"><p class="lbl">2 · Try it</p>
      <form class="search" id="tf" style="margin-bottom:12px"><select id="te" aria-label="Endpoint">${eps.map(([e]) => `<option>${e}</option>`).join('')}</select><input id="tq" placeholder="torvalds" required><button class="btn btn-secondary" id="tb">Send</button></form>
      <pre id="tout" class="notice" hidden></pre></div>
    <div class="section"><p class="lbl">3 · Endpoints</p><div class="results">${eps.map(([e, qs, d]) => `<div class="row"><div><code>GET /api/v1/${e}?${qs}</code><br><span class="mono">${d}</span></div></div>`).join('')}</div></div>
    <div class="section"><p class="lbl">Example</p><pre class="notice">fetch('${base}/api/v1/social?username=torvalds', {
  headers: { 'X-API-Key': 'YOUR_KEY' }
}).then(r => r.json()).then(console.log);

curl -H "X-API-Key: YOUR_KEY" "${base}/api/v1/breach?email=you@example.com"</pre></div>`;
  const showKey = async (k) => {
    const u = await (await fetch('/api/keys/usage?api_key=' + k)).json();
    $('kout').innerHTML = u.error ? '' : `<div class="notice"><b style="color:var(--text)">${esc(u.name)}</b> · ${u.usedToday}/${u.dailyLimit} used today<br><code style="color:var(--ok);word-break:break-all">${esc(k)}</code> <button class="btn btn-quiet btn-sm" id="copy">Copy</button><br><span class="mono">Keep this key secret.</span></div>`;
    $('copy').onclick = () => navigator.clipboard.writeText(k).then(() => toast('API key copied'));
  };
  if (saved) showKey(saved);
  $('kf').onsubmit = async (e) => {
    e.preventDefault();
    try { const d = await post('/api/keys', { name: $('kn').value }); localStorage.setItem('smn_key', d.key); showKey(d.key); toast('API key created'); }
    catch (err) { $('kout').innerHTML = errBox(err.message); }
  };
  const params = { social: ['username', 'torvalds'], people: ['name', 'Jane Smith'], breach: ['email', 'you@example.com'], phone: ['number', '+14158586273'], email: ['email', 'you@example.com'], ip: ['ip', '8.8.8.8'] };
  $('te').onchange = () => { $('tq').placeholder = params[$('te').value][1]; };
  $('tf').onsubmit = async (e) => {
    e.preventDefault();
    const k = localStorage.getItem('smn_key'), out = $('tout'); out.hidden = false;
    if (!k) return (out.textContent = 'Create a key first.');
    const ep = $('te').value; $('tb').disabled = true; out.textContent = 'Loading…';
    const r = await fetch(`/api/v1/${ep}?${params[ep][0]}=${encodeURIComponent($('tq').value)}`, { headers: { 'X-API-Key': k } });
    out.textContent = `HTTP ${r.status}\n` + JSON.stringify(await r.json(), null, 2);
    if ($('tb')) { $('tb').disabled = false; showKey(k); }
  };
}

function billing() {
  view.innerHTML = `<h1>Billing</h1><p class="sub">You are on the <b style="color:var(--text)">${esc(me.planName)}</b> plan · ${me.limit} searches per day · ${me.used} used today.</p>
    ${planCards(me.plan)}<div id="bmsg" style="margin-top:16px"></div>
    ${config.billingDemo ? '<p class="mono" style="margin-top:12px">Demo billing is on: plan changes apply instantly without payment.</p>' : ''}`;
  view.querySelectorAll('button[data-plan]').forEach((b) => b.onclick = async () => {
    try { await post('/api/account/plan', { plan: b.dataset.plan }); await loadMe(); toast(`Switched to ${me.planName}`); billing(); updateReadout(); }
    catch (err) { $('bmsg').innerHTML = errBox(err.message); }
  });
}

function settings() {
  const row = (t, d, v, ok) => `<div class="row"><div><b>${t}</b><br><span class="mono">${d}</span></div><span class="pill ${ok ? 'found' : ''}">${esc(v)}</span></div>`;
  view.innerHTML = `<h1>Settings</h1><p class="sub">Manage your account and see which data sources are active.</p>
    <div class="section"><p class="lbl">Account</p><div class="results">
      ${row('Email', 'Used to sign in', me.email, true)}
      ${row('Plan', `${me.limit} searches per day`, me.planName, true)}
      ${row('Member since', '', new Date(me.created).toLocaleDateString(), true)}
    </div></div>
    <div class="section"><p class="lbl">Change password</p>
      <form id="pf" style="max-width:420px"><div class="field"><label for="pc">Current password</label><input id="pc" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pn">New password</label><input id="pn" type="password" autocomplete="new-password" minlength="8" required></div>
      <div id="pout" style="margin-bottom:12px"></div><button class="btn btn-secondary">Update password</button></form></div>
    <div class="section"><p class="lbl">Data sources</p><div class="results">
      ${row('Breach search', 'Set HIBP_API_KEY to use Have I Been Pwned', config.breachSource, true)}
      ${row('APILayer', 'Numverify, Mailboxlayer, IP to Location', config.apilayer ? 'configured' : 'free fallback', config.apilayer)}
      ${row('Analytics', 'Cloudflare Web Analytics (CF_BEACON_TOKEN)', config.analytics ? 'enabled' : 'off', config.analytics)}
      ${row('People sources', 'GitHub, Wikipedia, ORCID, Mastodon, Bluesky', config.peopleSources, true)}
      ${row('Social platforms', 'server/platforms.js', config.platforms, true)}
    </div></div>
    <div class="section"><p class="lbl">Privacy</p><div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary" id="clr">Clear search history</button><button class="btn btn-danger" id="del">Delete account</button></div></div>`;
  $('pf').onsubmit = async (e) => {
    e.preventDefault();
    try { await post('/api/account/password', { current: $('pc').value, next: $('pn').value }); $('pf').reset(); $('pout').innerHTML = '<div class="notice ok">Password updated.</div>'; }
    catch (err) { $('pout').innerHTML = errBox(err.message); }
  };
  $('clr').onclick = async () => { await post('/api/account/history/clear'); history_ = []; toast('Search history cleared'); };
  $('del').onclick = async () => {
    if (!confirm('Delete your account and all search history? This cannot be undone.')) return;
    await post('/api/account/delete'); me = null; shellMounted = false; go('/'); toast('Account deleted');
  };
}

// ---------- boot ----------
Promise.all([fetch('/api/config').then((r) => r.json()).then((c) => { config = c; }), loadMe()]).finally(render);
