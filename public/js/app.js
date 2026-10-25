// Searchmenow single-page app: public site + signed-in dashboard.
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
let config = {}, me = null, history_ = [];
let view; // current dashboard page container

const LEGAL = 'Searchmenow is not a consumer reporting agency and our results are not consumer reports. They may not be used to decide eligibility for credit, insurance, employment, housing or tenant screening, or any other purpose covered by the Fair Credit Reporting Act.';
const ANNOUNCEMENTS = [
  ['Deep search', 'Follow linked accounts, websites and emails from a single clue, with confidence scores and logic filters.'],
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
const brand = () => `<a class="brand" href="/" aria-label="Searchmenow home">${LOGO}<span>searchme<span class="dim">now</span></span></a>`;
const perDay = (n) => n ? `${n} searches per day` : 'Unlimited searches';
const errBox = (m) => `<div class="notice err">${esc(m)}</div>`;

// Classifies free text into the right search.
function routeFor(v) {
  v = v.trim();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) || (v.includes(':') && /^[0-9a-f:]+$/i.test(v))) return `/dashboard/lookup?type=ip&q=${encodeURIComponent(v)}`;
  if (/^\+?[\d\s().-]{7,20}$/.test(v)) return `/dashboard/lookup?type=phone&q=${encodeURIComponent(v)}`;
  if (v.includes('@')) return `/dashboard/breach-search?q=${encodeURIComponent(v)}`;
  if (/\s/.test(v)) return `/dashboard/people-search?q=${encodeURIComponent(v)}`;
  return `/dashboard/social-search?q=${encodeURIComponent(v)}`;
}
const KIND_ROUTE = { deep: 'deep-search', social: 'social-search', people: 'people-search', breach: 'breach-search', phone: 'lookup?type=phone&', email: 'lookup?type=email&', ip: 'lookup?type=ip&' };
const historyHref = (h) => { const r = KIND_ROUTE[h.kind]; return `/dashboard/${r}${r.includes('?') ? '' : '?'}q=${encodeURIComponent(h.query)}`; };

// Runs a search request; handles auth and credit errors uniformly.
async function searchFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
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
const publicRoutes = { '/': landing, '/deep-search': () => publicSearchPage(deep), '/breach-search': () => publicSearchPage(breach), '/password-check': () => publicSearchPage(passwordCheck), '/social-search': () => publicSearchPage(social), '/people-search': () => publicSearchPage(people), '/lookup': () => publicSearchPage(lookup), '/osint-framework': osintFramework, '/login': landing, '/signup': landing, '/pricing': () => go('/', true), '/contact': contact, '/opt-out': optOut, '/terms': terms, '/privacy': privacy };
const dashRoutes = {
  '/dashboard': ['home', 'Home', home],
  '/dashboard/deep-search': ['deep', 'deep-search', deep],
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
  const publicSearchPages = { '/deep-search': deep, '/breach-search': breach, '/password-check': passwordCheck, '/social-search': social, '/people-search': people, '/lookup': lookup };
  if (publicSearchPages[p]) {
    shellMounted = false;
    page('<div class="wrap" style="padding:40px 24px;min-height:60vh"><div id="public-search-view"></div></div>');
    view = $('public-search-view');
    publicSearchPages[p]();
    return;
  }
  if (p.startsWith('/dashboard')) {
    const legacy = {
      '/dashboard': '/', '/dashboard/deep-search': '/deep-search', '/dashboard/social-search': '/social-search',
      '/dashboard/people-search': '/people-search', '/dashboard/breach-search': '/breach-search',
      '/dashboard/lookup': '/lookup', '/dashboard/api': '/', '/dashboard/billing': '/', '/dashboard/settings': '/'
    };
    return go(legacy[p] || '/', true);
  }
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
    <a href="/research">Global Research</a><a href="/osint-framework">OSINT Framework</a><a href="/deep-search">Deep search</a><a href="/social-search">Username</a><a href="/people-search">People / keywords</a><a href="/breach-search">Email breach check</a><a href="/password-check">Password exposure</a><a href="/lookup">Phone / email / IP</a><a href="/contact">Contact</a>
  </nav></header>`;
}
function siteFooter() {
  return `<footer class="site-footer"><div class="wrap">
    <div class="links"><a href="/contact">Contact</a><a href="/opt-out">Opt out of search results</a><a href="/terms">Terms &amp; permitted uses</a><a href="/privacy">Privacy</a></div>
    <p class="legal">${LEGAL}</p><p class="legal">© ${new Date().getFullYear()} Searchmenow</p></div></footer>`;
}
function page(inner) { app.innerHTML = siteNav() + inner + siteFooter(); }

function landing() {
  page(`<section class="hero wrap">
    <p class="lbl">Free public-source search</p>
    <h1>Search people, usernames, companies and education institutions</h1>
    <p>Searchmenow is a free search platform for discovering public profiles, company-related information, schools, universities and other open-source information.</p>
    <form class="search" id="lf">
      <select id="lkind" aria-label="Search type" style="max-width:260px">
        <option value="auto">Auto-detect search type</option><option value="deep">Keyword / website / public-source deep search</option>
        <option value="social">Username / social profiles</option><option value="people">Person name / public profiles</option>
        <option value="company">Company name</option><option value="education">Education institution</option><option value="school">School name</option><option value="university">University name</option><option value="youtube-email">YouTube channel / publicly listed email</option>
        <option value="breach">Email breach exposure</option><option value="password">Password exposure check (private range lookup)</option><option value="phone">Phone / mobile number</option>
        <option value="email">Email validation</option><option value="ip">IP address / network</option>
      </select>
      <input id="lq" placeholder="username, person, company, school, university, email or keyword" required aria-label="Search query">
      <button class="btn btn-primary">${icon('search')} Search</button>
    </form>
    <p class="mono">Free public search · no account or sign-in required · public-source results</p>
    <p class="mono" style="margin-top:8px">For your safety, do not enter Aadhaar, PAN, passport or other government ID numbers. Common Aadhaar, PAN and passport formats are blocked; this service is not for government-ID lookups.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><a class="btn btn-secondary" href="/deep-search">${icon('graph')} Deep search</a><a class="btn btn-secondary" href="/breach-search">${icon('shield')} Check breach exposure</a></div>
    <div class="kpis"><div><b>${config.platforms}</b><span>platforms</span></div><div><b>${config.peopleSources}</b><span>people sources</span></div><div><b>11+</b><span>search options</span></div><div><b>Live</b><span>no stale cache</span></div></div>
  </section>
  <section class="site-section"><div class="wrap">
    <h2>Search tools</h2><p class="sub">Choose a search type above or open a tool directly. Searches use public sources and available validation services.</p>
    <div class="cards">
      ${[['graph', 'Deep search', 'Start from one clue. We follow linked accounts, websites and emails and score each match.'], ['search', 'Social search', `Check a username on ${config.platforms} platforms. Results stream in as each site answers.`], ['users', 'People search', 'Find a full name on GitHub, Wikipedia, ORCID, Mastodon and Bluesky.'], ['database', 'Email breach search', 'See which known data breaches include an email address.'], ['shield', 'Password exposure', 'Check a password against known exposure counts without sending the full password to the upstream service.'], ['phone', 'Phone, email & IP', 'Validate numbers and mailboxes, and locate IP addresses.'], ['code', 'Free API', 'Run every search from your own website or app with an API key.'], ['shield', 'Opt-out', 'Anyone can remove their identifier from results.']]
        .map(([i, t, d]) => `<div class="card"><div class="ic">${icon(i)} ${t}</div><span>${d}</span></div>`).join('')}
    </div></div></section>
  <section class="site-section"><div class="wrap" style="text-align:center">
    <h2>Search without an account</h2><p class="sub">Choose a search tool and get started immediately.</p>
    <a class="btn btn-primary" href="/deep-search">${icon('search')} Start deep search ${icon('arrow')}</a>
  </div></section>`);
  $('lkind').onchange = () => { $('lq').type = $('lkind').value === 'password' ? 'password' : 'text'; $('lq').placeholder = $('lkind').value === 'password' ? 'Enter password to check (not placed in URL)' : 'username, person, company, school, university, email or keyword'; };
  $('lf').onsubmit = (e) => {
    e.preventDefault();
    const q = $('lq').value.trim(), kind = $('lkind').value;
    let route = kind === 'auto'
      ? (/^(\d{1,3}\.){3}\d{1,3}$/.test(q) || (q.includes(':') && /^[0-9a-f:]+$/i.test(q)) ? 'ip' : /^\+?[\d\s().-]{7,20}$/.test(q) ? 'phone' : q.includes('@') ? 'breach' : /\s/.test(q) ? 'deep' : 'social')
      : kind;
    const organizationModes = {
      company: { name: q, keywords: 'company, employer, organization, business' },
      education: { name: q, keywords: 'education, school, college, university, institution' },
      school: { name: q, keywords: 'school, education, student, alumni' },
      university: { name: q, keywords: 'university, college, education, alumni, faculty' },
      'youtube-email': { name: '', keywords: 'YouTube channel, creator, channel contact email, business email, publicly listed email' },
    };
    if (organizationModes[route]) {
      const p = new URLSearchParams({ q, name: organizationModes[route].name, keywords: organizationModes[route].keywords });
      return go('/deep-search?' + p.toString());
    }
    if (route === 'password') return go('/password-check'); // Never put passwords in URLs, query strings or browser history.
    const path = { deep:'/deep-search', social:'/social-search', people:'/people-search', breach:'/breach-search', password:'/password-check', phone:'/lookup?type=phone', email:'/lookup?type=email', ip:'/lookup?type=ip' }[route] || '/deep-search';
    const sep = path.includes('?') ? '&' : '?';
    go(path + sep + 'q=' + encodeURIComponent(q));
  };
}

function auth(mode) {
  const signup = mode === 'signup';
  const next = new URLSearchParams(location.search).get('next') || '/dashboard';
  app.innerHTML = `<div class="auth"><div class="box">
    ${brand()}
    <h1>${signup ? 'Create your account' : 'Sign in'}</h1>
    <p class="sub">${signup ? `Free plan includes ${perDay(config.plans?.free?.daily).toLowerCase()}.` : 'Welcome back.'}</p>
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
  const feats = { free: ['All 7 search types incl. Deep search', 'Live results', 'Search history'], pro: ['Everything in Free', 'Priority sources', 'Email support'], team: ['Everything in Pro', 'Shared billing', 'Higher API limits'] };
  return `<div class="cards">${Object.entries(config.plans).map(([id, p]) => `<div class="card ${current === id ? 'current' : ''}">
    <div class="ic">${p.name}${current === id ? ' <span class="pill found">current</span>' : ''}</div>
    <div class="price">$${p.price}<small>${p.price ? ' / month' : ''}</small></div>
    <span>${perDay(p.daily)}</span>
    <ul class="feat">${feats[id].map((f) => `<li>${icon('check', 14)}${f}</li>`).join('')}</ul>
    ${current === undefined ? `<a class="btn ${id === 'pro' ? 'btn-primary' : 'btn-secondary'}" href="/deep-search">${p.price ? 'Explore search tools' : 'Start searching'}</a>`
      : `<button class="btn ${current === id ? 'btn-secondary' : 'btn-primary'}" data-plan="${id}" ${current === id ? 'disabled' : ''}>${current === id ? 'Current plan' : id === 'free' ? 'Downgrade' : 'Upgrade'}</button>`}
  </div>`).join('')}</div>`;
}
function pricing() {
  page(`<div class="wrap" style="padding:56px 24px"><h1>Pricing</h1><p class="sub">Public searches are available without an account.</p>${planCards()}</div>`);
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
    <div class="section"><h2>What we store</h2><p class="sub">Your account email, a hashed password, your plan, search count and your last 50 searches. You can clear history or delete your account in Settings at any time.</p></div>
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
        ${nav('/dashboard/deep-search', 'deep', 'graph', 'Deep search')}
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
          <div class="readout" id="readout" title="Searches today"></div>
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
  $('readout').innerHTML = me.limit ? `${me.remaining}<span class="unit">/ ${me.limit} searches left</span>` : `${me.used}<span class="unit">searches today · unlimited</span>`;
}

// ---------- dashboard pages ----------
function home() {
  const types = [['/dashboard/deep-search', 'graph', 'Deep search', 'Follow linked accounts, websites and emails from one clue.'], ['/dashboard/social-search', 'search', 'Social search', `Username across ${config.platforms} platforms.`], ['/dashboard/people-search', 'users', 'People search', `Full name across ${config.peopleSources} open sources.`], ['/dashboard/breach-search', 'database', 'Breach search', `Known breaches for an email via ${config.breachSource}.`], ['/dashboard/lookup', 'phone', 'Phone, email & IP', `Validate and locate${config.apilayer ? ' via APILayer' : ''}.`]];
  view.innerHTML = `<h1>Dashboard</h1><p class="sub">Signed in as ${esc(me.email)} · ${esc(me.planName)} plan</p>
    <form class="search" id="hf"><input id="hq" placeholder="username, name@example.com, Jane Smith, +14155550123 or 8.8.8.8" required aria-label="Search"><button class="btn btn-primary">${icon('search')} Search</button></form>
    ${me.limit ? `<div class="section"><p class="lbl">Today</p><div class="card" style="max-width:360px"><div class="ic">${me.used} of ${me.limit} searches used</div><div class="progress"><div style="width:${Math.min(100, (me.used / me.limit) * 100)}%"></div></div>${me.plan === 'free' ? '<span><a href="/dashboard/billing">Upgrade</a> for more searches.</span>' : ''}</div></div>` : `<div class="section"><p class="lbl">Today</p><div class="card" style="max-width:360px"><div class="ic">${me.used} searches today</div><span>Unlimited searches on your plan.</span></div></div>`}
    <div class="section"><p class="lbl">Search types</p><div class="cards">${types.map(([h, i, t, d]) => `<a class="card" href="${h}"><div class="ic">${icon(i)} ${t}</div><span>${d}</span></a>`).join('')}</div></div>
    <div class="section"><p class="lbl">Recent searches</p>${history_.length ? `<div class="results">${history_.map((h) => `<a class="row" href="${historyHref(h)}" style="text-decoration:none"><div style="display:flex;gap:10px;align-items:center">${icon('history')}<b>${esc(h.query)}</b></div><span class="mono">${esc(h.kind)} · ${new Date(h.at).toLocaleString()}</span></a>`).join('')}</div>` : '<div class="notice">No searches yet. Try the search box above.</div>'}</div>`;
  $('hf').onsubmit = (e) => { e.preventDefault(); go(routeFor($('hq').value)); };
  $('hq').focus();
}

function publicSearchPage(fn) { page('<div class="wrap" style="padding:32px 24px"><div id="public-search-view"></div></div>'); view = $('public-search-view'); fn(); }

function deep() {
  const qs = new URLSearchParams(location.search);
  view.innerHTML = `<h1>Deep search</h1><p class="sub">Start from one username, email, full name or website. Searchmenow follows links found in public profiles, explores linked accounts and websites up to three hops, and scores the evidence. Matches are leads, not proof of identity. No sign-in required; rate limits apply.</p>
    <form id="f">
      <div class="search" style="display:flex;gap:8px;margin-bottom:12px"><input id="q" placeholder="username, name@example.com, Jane Smith or example.com" required aria-label="Seed"><button class="btn btn-primary" id="b">${icon('graph')} Deep search</button></div>
      <details id="opts" style="margin-bottom:24px" ${qs.get('name') || qs.get('location') || qs.get('keywords') ? 'open' : ''}><summary class="mono" style="cursor:pointer;padding:6px 0">Logic filters &amp; depth</summary>
        <div class="cards" style="margin-top:12px">
          <div class="field"><label for="dd">Depth (how many hops to follow)</label><select id="dd"><option value="1">1 · direct links only</option><option value="2" selected>2 · links of links</option><option value="3">3 · widest (slower)</option></select></div>
          <div class="field"><label for="dn">Expected name</label><input id="dn" placeholder="e.g. Jane Smith" value="${esc(qs.get('name') || '')}"></div>
          <div class="field"><label for="dl">Expected location</label><input id="dl" placeholder="e.g. Berlin or NY" value="${esc(qs.get('location') || '')}"></div>
          <div class="field"><label for="dk">Keywords (comma separated)</label><input id="dk" placeholder="e.g. rust, photography" value="${esc(qs.get('keywords') || '')}"></div>
        </div>
        <p class="mono" style="line-height:1.6">Profiles that match your expected name or location score higher; profiles that contradict them score lower. Matching keywords add confidence.</p>
      </details>
    </form><div id="out"></div>`;
  if (qs.get('depth')) $('dd').value = qs.get('depth');
  const tier = (c) => c >= 70 ? ['Strong matches', 'found'] : c >= 40 ? ['Possible matches', 'error'] : ['Weak leads', ''];
  const KIND_LABEL = { username: 'Username', email: 'Email', website: 'Website', account: 'Account', name: 'Name' };
  const linkFor = (x) => x.kind === 'website' || x.kind === 'account' ? x.value : x.urls?.[0] || null;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('q').value.trim(), out = $('out');
    const params = new URLSearchParams({ q, depth: $('dd').value, name: $('dn').value.trim(), location: $('dl').value.trim(), keywords: $('dk').value.trim() });
    for (const [k, v] of [...params]) if (!v) params.delete(k);
    history.replaceState(null, '', '?' + params);
    $('b').disabled = true;
    out.innerHTML = `<div class="stats"><span class="stream-cursor" id="cur"></span><span id="st">Starting…</span><span id="cnt"></span></div>
      <div id="sum" class="cards" style="margin-bottom:24px"></div><div id="tiers" style="display:flex;flex-direction:column;gap:20px"></div>
      <details style="margin-top:24px"><summary class="lbl" style="cursor:pointer">Profiles read (<span id="pc">0</span>)</summary><div class="results" id="profs" style="margin-top:8px"></div></details>`;
    const ids = new Map(); let pcount = 0, timer;
    const draw = () => {
      const all = [...ids.values()].filter((x) => x.depth > 0).sort((a, b) => b.confidence - a.confidence);
      $('cnt').textContent = `${all.length} leads`;
      const groups = {};
      for (const x of all) (groups[tier(x.confidence)[0]] ||= []).push(x);
      $('tiers').innerHTML = ['Strong matches', 'Possible matches', 'Weak leads'].filter((t) => groups[t]).map((t) => `<div><p class="lbl">${t} · ${groups[t].length}</p><div class="results">${groups[t].map((x) => {
        const href = linkFor(x);
        return `<div class="row" style="align-items:flex-start"><div style="min-width:0;flex:1"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill">${KIND_LABEL[x.kind] || x.kind}</span>${x.platform ? `<span class="mono">${esc(x.platform)}</span>` : ''}${href ? `<a href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(x.value)}</b></a>` : `<b>${esc(x.value)}</b>`}</div>
          <div class="mono" style="margin-top:6px;line-height:1.6">${x.evidence.map((ev) => `${ev.proof ? '✓ ' : '↳ '}${esc(ev.why)} <span style="opacity:.6">via ${esc(ev.via)}</span>`).join('<br>')}</div></div>
          <div style="width:120px;flex-shrink:0;text-align:right"><span class="pill ${tier(x.confidence)[1]}">${x.confidence}%</span><div class="progress"><div style="width:${x.confidence}%"></div></div></div></div>`;
      }).join('')}</div></div>`).join('') || '<div class="notice">Following leads…</div>';
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(draw, 120); };
    try {
      await stream((location.pathname === '/deep-search' ? '/api/public/deep-search?' : '/api/deep-search?') + params, (ev) => {
        if (ev.type === 'step') $('st').textContent = ev.text;
        else if (ev.type === 'identity') { ids.set(ev.key, ev); schedule(); }
        else if (ev.type === 'profile') {
          $('pc').textContent = ++pcount;
          $('profs').insertAdjacentHTML('beforeend', `<div class="row" style="align-items:flex-start"><div><b>${esc(ev.platform)}</b>${ev.name ? ` · ${esc(ev.name)}` : ''}${ev.location ? ` · <span class="mono">${esc(ev.location)}</span>` : ''}<br>${ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.url)}</a><br>` : ''}${ev.bio ? `<span class="mono">${esc(String(ev.bio).slice(0, 200))}</span>` : ''}</div><span class="mono">${esc(ev.via)}</span></div>`);
        } else if (ev.type === 'done') {
          const s = ev.summary; draw();
          $('cur')?.remove(); $('st').textContent = `Done · ${s.profiles} profiles read · depth ${s.depth}${s.timedOut ? ' · stopped at time limit' : ''}`;
          const card = (t, v, d) => `<div class="card"><span>${t}</span><div class="ic" style="font-size:16px">${v}</div>${d ? `<span>${d}</span>` : ''}</div>`;
          $('sum').innerHTML = card('Likely name', s.likelyNames[0] ? esc(s.likelyNames[0].value) : '—', s.likelyNames.slice(1).map((n) => esc(n.value)).join(', ') || (s.likelyNames[0] ? 'Most consistent across sources' : 'No name found'))
            + card('Likely location', s.likelyLocations[0] ? esc(s.likelyLocations[0].value) : '—', s.likelyLocations.slice(1).map((n) => esc(n.value)).join(', '))
            + card('Leads found', `${s.identities - 1}`, `${s.strongLinks} strong · ${s.verifiedProofs} verified proofs`)
            + (s.breaches !== null ? card('Breach exposure', `${s.breaches}`, 'known breaches for the email') : '');
        } else if (ev.type === 'error') out.insertAdjacentHTML('beforeend', errBox(ev.error));
      });
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  autorun();
}

const SOCIAL_PLATFORM_GROUPS = {
  'Social': ['Instagram', 'Facebook', 'X', 'TikTok', 'Pinterest', 'Snapchat', 'Threads', 'Tumblr', 'VK', 'Weibo', 'Bluesky', 'Mastodon.social', 'Pixelfed.social', 'Minds', 'Gab', 'Gettr', 'Truth Social', 'Roblox', 'Linktree', 'About.me'],
  'Professional': ['LinkedIn', 'Behance', 'Dribbble', 'Flickr', 'Patreon', 'Ko-fi', 'Buy Me a Coffee', 'Kaggle', 'Hugging Face', 'Letterboxd', 'Last.fm', 'SoundCloud', 'Vimeo', 'Gravatar'],
  'Developer': ['GitHub', 'GitLab', 'Dev.to', 'Medium', 'Keybase', 'npm', 'PyPI', 'Docker Hub', 'Replit', 'Codeberg', 'Bitbucket', 'HackerOne', 'LeetCode', 'Codewars'],
  'Forums & communities': ['Reddit', 'Quora', 'Hacker News', 'Chess.com', 'Lichess', 'Lemmy.world'],
  'Video & streaming': ['YouTube', 'Twitch', 'Dailymotion', 'Rumble', 'Odysee', 'Steam'],
  'Messaging': ['Telegram'],
};
const SOCIAL_PLATFORM_NAMES = [...new Set(Object.values(SOCIAL_PLATFORM_GROUPS).flat())];

function social() {
  const params = new URLSearchParams(location.search);
  const requested = (params.get('platforms') || '').split(',').map((x) => x.trim()).filter((x) => SOCIAL_PLATFORM_NAMES.includes(x));
  let selected = new Set(requested.length ? requested : SOCIAL_PLATFORM_NAMES);
  view.innerHTML = `<h1>Social search</h1><p class="sub">Choose a category—Social, Professional, Developer, Forums & communities, Video & streaming, or Messaging—then select individual platforms. Searchmenow checks public profile URLs in this workspace; some services block automated checks, so verify results. No app installation is needed for supported checks.</p>
    <form id="f">
      <div class="field"><label for="q">Username or handle</label><input id="q" placeholder="username (without @)" autocomplete="off" required></div>
      <div class="section" style="margin:16px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div><p class="lbl" style="margin:0">Choose platforms <span class="pill" id="selected-count">${selected.size} selected</span></p><p class="mono" style="margin:6px 0 0">Select one, a few, or all available networks.</p></div>
          <div style="display:flex;gap:8px"><button type="button" class="btn btn-secondary btn-sm" id="select-all">Select all</button><button type="button" class="btn btn-quiet btn-sm" id="clear-all">Clear</button></div>
        </div>
        <input id="platform-filter" placeholder="Filter platform names…" aria-label="Filter platform names" style="margin-top:14px">
        <div id="platform-groups" style="display:flex;flex-direction:column;gap:16px;margin-top:14px">
          ${Object.entries(SOCIAL_PLATFORM_GROUPS).map(([group,names]) => `<div class="platform-group"><p class="lbl">${esc(group)}</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">${names.map((name) => `<label class="row platform-choice" data-platform="${esc(name.toLowerCase())}" style="justify-content:flex-start;gap:9px;cursor:pointer;padding:10px;border:1px solid var(--line);border-radius:10px"><input type="checkbox" name="platform" value="${esc(name)}" ${selected.has(name) ? 'checked' : ''} style="width:auto;min-height:0"><span>${esc(name)}</span></label>`).join('')}</div></div>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary" id="b">${icon('search')} Search selected platforms</button>
    </form><div id="out"></div>`;
  $('q').value = params.get('q') || '';
  const updateSelected = () => {
    selected = new Set([...view.querySelectorAll('input[name="platform"]:checked')].map((x) => x.value));
    $('selected-count').textContent = `${selected.size} selected`;
  };
  view.querySelectorAll('input[name="platform"]').forEach((cb) => cb.addEventListener('change', updateSelected));
  $('select-all').onclick = () => { view.querySelectorAll('input[name="platform"]').forEach((cb) => { if (cb.closest('.platform-choice').style.display !== 'none') cb.checked = true; }); updateSelected(); };
  $('clear-all').onclick = () => { view.querySelectorAll('input[name="platform"]').forEach((cb) => { cb.checked = false; }); updateSelected(); };
  $('platform-filter').oninput = () => {
    const q = $('platform-filter').value.trim().toLowerCase();
    view.querySelectorAll('.platform-choice').forEach((el) => { el.style.display = el.dataset.platform.includes(q) ? 'flex' : 'none'; });
    view.querySelectorAll('.platform-group').forEach((group) => { group.style.display = [...group.querySelectorAll('.platform-choice')].some((el) => el.style.display !== 'none') ? '' : 'none'; });
  };
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('q').value.trim().replace(/^@/, ''), out = $('out');
    updateSelected();
    if (!selected.size) { out.innerHTML = errBox('Select at least one social platform to search.'); return; }
    $('b').disabled = true;
    history.replaceState(null, '', '?q=' + encodeURIComponent(u) + '&platforms=' + encodeURIComponent([...selected].join(',')));
    out.innerHTML = `<div class="stats"><span class="stream-cursor"></span><span id="st">Checking 0/${selected.size}</span><span id="fd">0 found</span></div><div class="results" id="rs"></div>`;
    const rows = []; let done = 0, found = 0;
    try {
      await stream('/api/public/social-search?username=' + encodeURIComponent(u) + '&platforms=' + encodeURIComponent([...selected].join(',')), (x) => {
        rows.push(x); done++; if (x.status === 'found') found++;
        rows.sort((a, b) => (a.status === 'found' ? 0 : 1) - (b.status === 'found' ? 0 : 1) || a.platform.localeCompare(b.platform));
        $('st').textContent = `Checked ${done}/${selected.size}`; $('fd').textContent = `${found} found` + (rows.some((r) => r.status === 'blocked') ? ` · ${rows.filter((r) => r.status === 'blocked').length} blocked` : '');
        $('rs').innerHTML = rows.map((x) => `<div class="row"><div><b>${esc(x.platform)}</b><br>${x.status === 'found' ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>` : `<span class="mono">${esc(x.url)}</span>`}</div><span class="pill ${x.status === 'blocked' ? 'error' : x.status}">${x.status.replace('_', ' ')}</span></div>`).join('');
      });
      out.querySelector('.stream-cursor')?.remove();
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  if (params.get('q')) $('f').requestSubmit();
}
function people() {
  view.innerHTML = `<h1>People search</h1><p class="sub">Search a full name or public keyword across ${config.peopleSources} public profile sources. Searchmenow is free to use; results depend on the sources available.</p>
    <form class="search" id="f"><input id="q" placeholder="Jane Smith" required><button class="btn btn-primary" id="b">${icon('search')} Search</button></form><div id="out"></div>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const n = $('q').value.trim(), out = $('out'); $('b').disabled = true;
    history.replaceState(null, '', '?q=' + encodeURIComponent(n));
    out.innerHTML = `<div class="stats"><span class="stream-cursor"></span><span id="st">Querying ${config.peopleSources} sources…</span></div><div id="groups" style="display:flex;flex-direction:column;gap:16px"></div>`;
    let done = 0, total = 0;
    try {
      await stream((location.pathname === '/people-search' ? '/api/public/people-search' : '/api/people-search') + '?name=' + encodeURIComponent(n), (g) => {
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
  view.innerHTML = `<h1>Breach search</h1><p class="sub">Check whether an email appears in known breach records from ${esc(config.breachSource)}. This reports breach names and exposed data categories, not passwords. No sign-in required; rate limits apply.</p>
    <form class="search" id="f"><input id="q" type="email" placeholder="name@example.com" required><button class="btn btn-primary" id="b">${icon('search')} Search</button></form><div id="out"></div>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const out = $('out'), q = $('q').value.trim(); $('b').disabled = true;
    history.replaceState(null, '', location.pathname);
    out.replaceChildren();
    try {
      const endpoint = location.pathname === '/breach-search' ? '/api/public/breach-search' : '/api/breach-search';
      const response = await fetch(endpoint + '?email=' + encodeURIComponent(q));
      const d = await response.json();
      if (!response.ok || d.error) throw new Error(d.error || 'Breach search failed.');
      if (!Array.isArray(d.breaches) || !d.breaches.length) {
        out.replaceChildren();
        return;
      }
      const attribution = d.source === 'Have I Been Pwned' ? '<a href="https://haveibeenpwned.com/" target="_blank" rel="noopener noreferrer">Have I Been Pwned</a>' : esc(d.source || config.breachSource);
      out.innerHTML = `<p class="mono">Source: ${attribution}. Showing matching breach records only.</p><div class="stats"><span>${d.breaches.length} breaches found</span></div><div class="results">${d.breaches.map((b) => `<div class="row"><div><b>${esc(b.name)}</b> <span class="mono">${esc(b.domain || '')}</span><br><span class="mono">${esc((b.data || []).join(', '))}</span></div><span class="pill">${esc(b.date)}</span></div>`).join('')}</div>`;
    } catch (err) { if (document.body.contains(out)) out.innerHTML = errBox(err.message); }
    if ($('b')) $('b').disabled = false;
  };
  autorun();
}

function passwordCheck() {
  view.innerHTML = `<h1>Password exposure check</h1>
    <p class="sub">Check whether a password appears in known exposure records using Have I Been Pwned's free Pwned Passwords range API. Your browser sends the password to Searchmenow over HTTPS; Searchmenow hashes it and sends only the first five characters of the SHA-1 hash upstream. The full password is not sent to Have I Been Pwned and is not stored by this feature.</p>
    <form class="search" id="pf"><input id="pw" type="password" autocomplete="new-password" placeholder="Enter a password to check" required maxlength="1024" aria-label="Password to check"><button class="btn btn-primary" id="pwb">${icon('shield')} Check exposure</button></form>
    <p class="mono">Do not enter a password you currently use for a sensitive account. A positive result means it has appeared in exposure data; it does not prove your account was accessed. Never reuse an exposed password.</p>
    <div id="pwout"></div>
    <p class="mono">Data source: <a href="https://haveibeenpwned.com/Passwords" target="_blank" rel="noopener noreferrer">Have I Been Pwned — Pwned Passwords</a>.</p>`;
  $('pf').onsubmit = async (e) => {
    e.preventDefault();
    const password = $('pw').value, out = $('pwout'), button = $('pwb');
    button.disabled = true;
    out.innerHTML = '<div class="stats"><span class="stream-cursor"></span><span>Checking exposure privately…</span></div>';
    try {
      const r = await fetch('/api/public/password-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || 'Password check failed.');
      if (!d.pwned) {
        out.replaceChildren();
      } else {
        out.innerHTML = `<div class="notice err"><b>Password exposure match found</b><p>Observed ${Number(d.count).toLocaleString()} times in the source corpus. Do not use it; if it is used anywhere, change it and any reused passwords.</p></div><p class="mono">Only a partial password hash was sent upstream. Source: <a href="https://haveibeenpwned.com/Passwords" target="_blank" rel="noopener noreferrer">Have I Been Pwned Pwned Passwords</a>.</p>`;
      }
      $('pw').value = '';
    } catch (err) { out.innerHTML = errBox(err.message); }
    if ($('pwb')) $('pwb').disabled = false;
  };
  const existing = new URLSearchParams(location.search).get('check');
  if (existing === '1') $('pw').focus();
}

function lookup() {
  const kinds = { phone: ['number', '+14158586273'], email: ['email', 'name@example.com'], ip: ['ip', '8.8.8.8'] };
  view.innerHTML = `<h1>Phone, email &amp; IP lookup</h1><p class="sub">Powered by ${config.apilayer ? 'APILayer (Numverify, Mailboxlayer, IP to Location)' : 'available free sources'}. No account required; public lookups are rate-limited. Phone lookups validate numbers and return available carrier/region metadata, not live tracking.</p>
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
      const apiBase = location.pathname === '/lookup' ? '/api/public/lookup/' : '/api/lookup/';
      const d = await (await searchFetch(`${apiBase}${sel.value}?${param}=${encodeURIComponent(q)}`)).json();
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
  const eps = [['deep', 'q=torvalds&depth=2', 'Deep search: linked accounts with confidence scores'], ['password', 'password=not-for-production', 'Password exposure check (use the dedicated POST form for privacy)'], ['social', 'username=torvalds', `Username across ${config.platforms} platforms`], ['people', 'name=Jane%20Smith', 'Name across public sources'], ['breach', 'email=you@example.com', 'Known breaches for an email'], ['phone', 'number=%2B14158586273', 'Phone validation, country, carrier'], ['email', 'email=you@example.com', 'Email deliverability check'], ['ip', 'ip=8.8.8.8', 'IP geolocation and ISP']];
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
  const params = { deep: ['q', 'torvalds'], password: ['password', 'use dedicated form'], social: ['username', 'torvalds'], people: ['name', 'Jane Smith'], breach: ['email', 'you@example.com'], phone: ['number', '+14158586273'], email: ['email', 'you@example.com'], ip: ['ip', '8.8.8.8'] };
  $('te').onchange = () => { $('tq').placeholder = params[$('te').value][1]; };
  $('tf').onsubmit = async (e) => {
    e.preventDefault();
    const k = localStorage.getItem('smn_key'), out = $('tout'); out.hidden = false;
    if (!k) return (out.textContent = 'Create a key first.');
    const ep = $('te').value; $('tb').disabled = true; out.textContent = 'Loading…';
    if (ep === 'password') { out.textContent = 'For privacy, password checks use POST /api/public/password-check and never place the password in a URL. Use the Password exposure page instead.'; $('tb').disabled = false; return; }
    const r = await fetch(`/api/v1/${ep}?${params[ep][0]}=${encodeURIComponent($('tq').value)}`, { headers: { 'X-API-Key': k } });
    out.textContent = `HTTP ${r.status}\n` + JSON.stringify(await r.json(), null, 2);
    if ($('tb')) { $('tb').disabled = false; showKey(k); }
  };
}

function billing() {
  view.innerHTML = `<h1>Billing</h1><p class="sub">You are on the <b style="color:var(--text)">${esc(me.planName)}</b> plan · ${perDay(me.limit)} · ${me.used} used today.</p>
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
      ${row('Plan', perDay(me.limit), me.planName, true)}
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


// ---------- OSINT tool directory ----------
async function osintFramework() {
  page(`<section class="wrap" style="padding:34px 24px 48px;min-height:65vh">
    <p class="lbl">Open-source intelligence · tool directory</p>
    <h1 style="font-size:30px;margin-bottom:10px">OSINT Framework</h1>
    <p class="sub" style="max-width:780px">Search public sources directly inside Searchmenow using the quick-search options below. You do not need to install external tools for the supported Searchmenow searches. The directory also lists optional third-party resources; those links open external sites and are not required for Searchmenow's own searches.</p>
    <div class="search" style="margin-bottom:12px"><input id="osint-filter" placeholder="Search tools, categories or capabilities…" aria-label="Filter OSINT tools"><a class="btn btn-primary" href="/deep-search">${icon('search')} Start a search</a></div>
    <div class="links" style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px">
      <a class="btn btn-secondary" href="/social-search">Choose social platforms</a><a class="btn btn-secondary" href="/people-search">People</a><a class="btn btn-secondary" href="/breach-search">Email breach exposure</a><a class="btn btn-secondary" href="/password-check">Password exposure</a><a class="btn btn-secondary" href="/lookup?type=email">Email checks</a><a class="btn btn-secondary" href="/lookup?type=phone">Phone</a><a class="btn btn-secondary" href="/lookup?type=ip">IP address</a>
    </div>
    <form id="osint-quick-form" class="search" style="margin-bottom:22px">
      <select id="osint-kind" aria-label="Search criteria" style="max-width:280px">
        <option value="deep">Keyword / deep search</option><option value="social">Username across selected platforms</option><option value="people">Person / public profile</option>
        <option value="company">Company / employer</option><option value="school">School</option><option value="university">University / college</option>
        <option value="youtube-email">YouTube channel / publicly listed email</option><option value="email">Email validation</option><option value="breach">Email breach exposure</option><option value="password">Password exposure check</option>
        <option value="phone">Phone number</option><option value="ip">IP address</option>
      </select>
      <input id="osint-query" placeholder="Enter a name, username, company, school, email, phone or IP" aria-label="Search value" required>
      <button class="btn btn-primary">${icon('search')} Search inside Searchmenow</button>
    </form>
    <p class="mono" style="margin:-12px 0 18px">Searchmenow runs its supported checks here. External directory entries are optional references, not required installs. Email-to-YouTube matching can only surface public or indexed clues; YouTube does not provide a public reverse lookup for arbitrary private email addresses.</p>
    <div id="osint-status" class="mono" style="margin:10px 0 14px">Loading directory…</div>
    <div id="osint-categories" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:12px"></div>
    <div class="notice" style="margin-top:22px">Use public and authorized sources only. Do not attempt to bypass login, private-profile, CAPTCHA or other access controls. Public content does not establish someone's current location. External services have their own terms, rate limits and privacy practices.</div>
    <p class="mono" style="margin-top:12px">Inspired by <a href="https://osintframework.com/" target="_blank" rel="noopener noreferrer">OSINT Framework</a>. Original project source: <a href="https://github.com/lockfale/OSINT-Framework" target="_blank" rel="noopener noreferrer">lockfale/OSINT-Framework</a> (MIT). This Searchmenow page is an independently curated implementation, not an official copy.</p>
  </section>`);
  const filter = $('osint-filter'), host = $('osint-categories'), status = $('osint-status');
  $('osint-quick-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = $('osint-query').value.trim(), kind = $('osint-kind').value;
    const encode = encodeURIComponent(value);
    const org = {
      company: ['company, employer, organization, business'],
      school: ['school, education, student, alumni'],
      university: ['university, college, education, alumni, faculty'],
      'youtube-email': ['YouTube channel, creator, channel contact email, business email, publicly listed email'],
    };
    if (org[kind]) {
      const p = new URLSearchParams({ q: value, name: kind === 'youtube-email' ? '' : value, keywords: org[kind][0] });
      return go('/deep-search?' + p.toString());
    }
    const paths = {
      deep: '/deep-search?q=' + encode,
      social: '/social-search?q=' + encode,
      people: '/people-search?q=' + encode,
      email: '/lookup?type=email&q=' + encode,
      breach: '/breach-search?q=' + encode,
      password: '/password-check',
      phone: '/lookup?type=phone&q=' + encode,
      ip: '/lookup?type=ip&q=' + encode,
    };
    go(paths[kind] || paths.deep);
  });
  const renderTools = (categories, query = '') => {
    const q = query.trim().toLowerCase();
    const visible = categories.map((c) => ({...c, tools:(c.tools || []).filter((t) => !q || [c.name,c.description,t.name,t.purpose,t.url].join(' ').toLowerCase().includes(q))})).filter((c) => c.tools.length && (!q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.tools.length));
    status.textContent = visible.reduce((n,c) => n+c.tools.length,0) + ' tools across ' + visible.length + ' categories';
    host.innerHTML = visible.map((c) => `<details open style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;min-width:0">
      <summary style="cursor:pointer;color:var(--text);font-weight:600;display:flex;justify-content:space-between;gap:12px"><span>${esc(c.name)}</span><span class="mono">${c.tools.length}</span></summary>
      <p class="mono" style="line-height:1.6;margin:10px 0 12px">${esc(c.description || '')}</p>
      <div style="display:flex;flex-direction:column;gap:8px">${c.tools.map((t) => `
        <div style="padding:10px;border:1px solid var(--border);border-radius:8px;display:flex;gap:10px;align-items:flex-start;justify-content:space-between">
          <div style="min-width:0"><b style="color:var(--text)">${esc(t.name)}</b><div class="mono" style="line-height:1.55;margin-top:4px">${esc(t.purpose || '')}</div></div>
          <button type="button" class="btn btn-secondary btn-sm osint-run-tool" data-category="${esc(c.id)}" data-tool="${esc(t.name)}" aria-label="Search ${esc(t.name)} inside Searchmenow" style="flex-shrink:0">Search here ↗</button>
        </div>`).join('')}</div>
    </details>`).join('') || '<div class="notice">No tools match that search. Try a broader keyword.</div>';
  };
  host.addEventListener('click', (e) => {
    const button = e.target.closest('.osint-run-tool');
    if (!button) return;
    const value = $('osint-query').value.trim();
    if (!value) {
      $('osint-query').focus();
      $('osint-query').placeholder = 'Enter a search value first, then click Search here';
      status.textContent = 'Enter a name, username, email, domain, phone or IP above to search inside Searchmenow.';
      return;
    }
    const category = (button.dataset.category || '').toLowerCase();
    const tool = button.dataset.tool || '';
    const lower = (category + ' ' + tool).toLowerCase();
    const q = encodeURIComponent(value);
    let destination = '/deep-search?q=' + q + '&keywords=' + encodeURIComponent(tool);
    if (/username|public profile|whatsmyname|namechk|github users/.test(lower)) destination = '/social-search?q=' + q;
    else if (/email validation|emailrep/.test(lower)) destination = '/lookup?type=email&q=' + q;
    else if (/breach|pwned/.test(lower)) destination = '/breach-search?q=' + q;
    else if (/password/.test(lower)) destination = '/password-check';
    else if (/phone/.test(lower)) destination = '/lookup?type=phone&q=' + q;
    else if (/ip, network|ip lookup|arin rdap|ripestat|abuseipdb/.test(lower)) destination = '/lookup?type=ip&q=' + q;
    else if (/people|professional|linkedin|orcid|wikidata/.test(lower)) destination = '/people-search?q=' + q;
    go(destination);
  });
  try {
    const r = await fetch('/api/public/osint-tools');
    const d = await r.json();
    if (!r.ok || !Array.isArray(d.categories)) throw new Error(d.error || 'Directory unavailable.');
    renderTools(d.categories);
    filter.addEventListener('input', () => renderTools(d.categories, filter.value));
  } catch (e) {
    status.textContent = 'Could not load directory.';
    host.innerHTML = errBox(e.message);
  }
}

// ---------- boot ----------
Promise.all([fetch('/api/config').then((r) => r.json()).then((c) => { config = c; }), loadMe()]).finally(render);
