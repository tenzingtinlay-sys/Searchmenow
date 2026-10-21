// Deep search: starts from one identifier and follows the clues it finds.
//
// Algorithm (breadth-first pivoting):
//   1. Put the seed (username / email / name / website) in a queue.
//   2. For each item, run the extractors for its type. Extractors read public
//      profiles and return (a) profile facts and (b) new identifiers they link to.
//   3. Every link is "evidence" with a weight (a verified proof is stronger than
//      the same username simply existing elsewhere).
//   4. New identifiers go back into the queue until max depth / max nodes.
//   5. Each identity's confidence = 1 - Π(1 - weight) over independent evidence,
//      adjusted by the user's logic filters (expected name / location / keywords).
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Searchmenow/1.0';
const W = { proof: 0.9, linked: 0.8, relme: 0.7, sameUser: 0.35, emailMatch: 0.85, nameSearch: 0.2, seed: 1 };

const get = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 8000) });
  if (!r.ok) throw new Error(String(r.status));
  return opts.text ? r.text() : r.json();
};
const ghHeaders = () => (process.env.GITHUB_SEARCH_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_SEARCH_TOKEN}` } : {});
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ---------- turn URLs / text into identifiers ----------
const SOCIAL = [
  [/github\.com\/([A-Za-z0-9-]{1,39})(?=[/?#"'\s]|$)/i, 'GitHub'],
  [/(?:twitter|x)\.com\/(?!intent|share|home|i\/)([A-Za-z0-9_]{1,15})(?=[/?#"'\s]|$)/i, 'Twitter/X'],
  [/gitlab\.com\/([A-Za-z0-9._-]{2,})(?=[/?#"'\s]|$)/i, 'GitLab'],
  [/linkedin\.com\/in\/([A-Za-z0-9-]{3,100})/i, 'LinkedIn'],
  [/instagram\.com\/([A-Za-z0-9._]{1,30})(?=[/?#"'\s]|$)/i, 'Instagram'],
  [/reddit\.com\/u(?:ser)?\/([A-Za-z0-9_-]{3,20})/i, 'Reddit'],
  [/keybase\.io\/([A-Za-z0-9_]{2,16})/i, 'Keybase'],
  [/youtube\.com\/@([A-Za-z0-9._-]{3,30})/i, 'YouTube'],
  [/bsky\.app\/profile\/([A-Za-z0-9.-]+)/i, 'Bluesky'],
  [/(?:^|\s)@([A-Za-z0-9_]{1,30})@([a-z0-9.-]+\.[a-z]{2,})/i, 'Mastodon'],
];
const IGNORE_USERS = new Set(['about', 'login', 'signup', 'settings', 'explore', 'features', 'pricing', 'home', 'search', 'share', 'intent', 'orgs', 'sponsors', 'topics', 'marketplace']);

function linksFromText(text) {
  const out = [];
  for (const [re, platform] of SOCIAL) {
    const g = new RegExp(re.source, 'gi'); let m;
    while ((m = g.exec(text))) {
      const user = platform === 'Mastodon' ? `${m[1]}@${m[2]}` : m[1];
      if (!IGNORE_USERS.has(user.toLowerCase())) out.push({ kind: 'username', value: user, platform });
    }
  }
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(m[0]) && !/noreply|example\.com|sentry/i.test(m[0])) out.push({ kind: 'email', value: m[0].toLowerCase() });
  return out;
}
const asWebsite = (u) => { try { const x = new URL(/^https?:/i.test(u) ? u : 'https://' + u); return /github\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|facebook\.com|youtube\.com|bsky\.app|keybase\.io/i.test(x.hostname) ? null : x.origin + x.pathname.replace(/\/$/, ''); } catch { return null; } };

// ---------- extractors (each returns { profiles: [], links: [] }) ----------
const byUsername = {
  async GitHub(u) {
    const d = await get(`https://api.github.com/users/${encodeURIComponent(u)}`, { headers: ghHeaders() });
    const links = [];
    if (d.twitter_username) links.push({ kind: 'username', value: d.twitter_username, platform: 'Twitter/X', w: W.linked });
    if (d.blog) { const s = asWebsite(d.blog); if (s) links.push({ kind: 'website', value: s, w: W.linked }); else links.push(...linksFromText(d.blog).map((l) => ({ ...l, w: W.linked }))); }
    if (d.email) links.push({ kind: 'email', value: d.email.toLowerCase(), w: W.linked });
    links.push(...linksFromText(d.bio || '').map((l) => ({ ...l, w: W.linked })));
    if (d.name) links.push({ kind: 'name', value: d.name, w: W.linked });
    return { profiles: [{ platform: 'GitHub', url: d.html_url, name: d.name, location: d.location, bio: d.bio, org: d.company, avatar: d.avatar_url, since: d.created_at }], links };
  },
  async Keybase(u) {
    const d = (await get(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(u)}&fields=proofs_summary,profile`)).them?.[0];
    if (!d) throw new Error('none');
    const map = { twitter: 'Twitter/X', github: 'GitHub', reddit: 'Reddit', hackernews: 'Hacker News', mastodon: 'Mastodon' };
    const links = [];
    for (const p of d.proofs_summary?.all || []) {
      if (map[p.proof_type]) links.push({ kind: 'username', value: p.nametag, platform: map[p.proof_type], w: W.proof, proof: true });
      else if (p.proof_type === 'dns' || p.proof_type === 'generic_web_site') { const s = asWebsite(p.nametag); if (s) links.push({ kind: 'website', value: s, w: W.proof, proof: true }); }
    }
    if (d.profile?.full_name) links.push({ kind: 'name', value: d.profile.full_name, w: W.proof });
    return { profiles: [{ platform: 'Keybase', url: `https://keybase.io/${u}`, name: d.profile?.full_name, location: d.profile?.location, bio: d.profile?.bio, verified: links.filter((l) => l.proof).length }], links };
  },
  async 'Dev.to'(u) {
    const d = await get(`https://dev.to/api/users/by_username?url=${encodeURIComponent(u)}`);
    const links = [];
    if (d.github_username) links.push({ kind: 'username', value: d.github_username, platform: 'GitHub', w: W.linked });
    if (d.twitter_username) links.push({ kind: 'username', value: d.twitter_username, platform: 'Twitter/X', w: W.linked });
    if (d.website_url) { const s = asWebsite(d.website_url); if (s) links.push({ kind: 'website', value: s, w: W.linked }); }
    if (d.name) links.push({ kind: 'name', value: d.name, w: W.linked });
    return { profiles: [{ platform: 'Dev.to', url: `https://dev.to/${d.username}`, name: d.name, location: d.location, bio: d.summary, since: d.joined_at }], links };
  },
  async Mastodon(u) {
    const d = await get(`https://mastodon.social/api/v1/accounts/lookup?acct=${encodeURIComponent(u)}`);
    const text = [d.note, ...(d.fields || []).map((f) => f.value)].join(' ');
    const links = linksFromText(text).map((l) => ({ ...l, w: (d.fields || []).some((f) => f.verified_at && f.value.includes(l.value)) ? W.proof : W.relme }));
    for (const f of d.fields || []) { const href = /href="([^"]+)"/.exec(f.value)?.[1]; const s = href && asWebsite(href); if (s) links.push({ kind: 'website', value: s, w: f.verified_at ? W.proof : W.relme }); }
    if (d.display_name) links.push({ kind: 'name', value: d.display_name, w: W.relme });
    return { profiles: [{ platform: 'Mastodon', url: d.url, name: d.display_name, bio: strip(d.note), since: d.created_at }], links };
  },
  async Bluesky(u) {
    const handle = u.includes('.') ? u : `${u}.bsky.social`;
    const d = await get(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
    const links = linksFromText(d.description || '').map((l) => ({ ...l, w: W.relme }));
    if (!handle.endsWith('.bsky.social')) { const s = asWebsite(handle.replace(/^@/, '')); if (s) links.push({ kind: 'website', value: s, w: W.proof, proof: true }); }
    if (d.displayName) links.push({ kind: 'name', value: d.displayName, w: W.relme });
    return { profiles: [{ platform: 'Bluesky', url: `https://bsky.app/profile/${d.handle}`, name: d.displayName, bio: d.description, followers: d.followersCount }], links };
  },
  async Gravatar(u) {
    const d = (await get(`https://en.gravatar.com/${encodeURIComponent(u)}.json`)).entry?.[0];
    if (!d) throw new Error('none');
    const links = [];
    for (const a of d.accounts || []) links.push(...linksFromText(a.url).map((l) => ({ ...l, w: W.linked })));
    for (const x of d.urls || []) { const s = asWebsite(x.value); if (s) links.push({ kind: 'website', value: s, w: W.linked }); }
    if (d.displayName) links.push({ kind: 'name', value: d.displayName, w: W.linked });
    return { profiles: [{ platform: 'Gravatar', url: d.profileUrl, name: d.displayName, location: d.currentLocation, bio: d.aboutMe }], links };
  },
};

async function emailExtract(email) {
  const results = await Promise.allSettled([
    (async () => {
      const h = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
      const d = (await get(`https://en.gravatar.com/${h}.json`)).entry?.[0];
      if (!d) throw new Error('none');
      const links = [{ kind: 'username', value: d.preferredUsername, platform: 'Gravatar', w: W.emailMatch }];
      for (const a of d.accounts || []) links.push(...linksFromText(a.url).map((l) => ({ ...l, w: W.emailMatch })));
      if (d.displayName) links.push({ kind: 'name', value: d.displayName, w: W.emailMatch });
      return { profiles: [{ platform: 'Gravatar', url: d.profileUrl, name: d.displayName, location: d.currentLocation }], links };
    })(),
    (async () => {
      const d = await get(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`, { headers: ghHeaders() });
      return { profiles: [], links: (d.items || []).slice(0, 3).map((u) => ({ kind: 'username', value: u.login, platform: 'GitHub', w: W.emailMatch })) };
    })(),
    (async () => {
      const d = await get(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`, { timeout: 12000 });
      const list = d.breaches?.[0] || [];
      return { profiles: [{ platform: 'Breaches', url: null, name: null, bio: list.length ? `${list.length} known breaches: ${list.slice(0, 8).join(', ')}${list.length > 8 ? '…' : ''}` : 'No known breaches', breaches: list.length }], links: [] };
    })(),
  ]);
  const local = email.split('@')[0];
  const out = { profiles: [], links: /^[a-z0-9._-]{3,30}$/i.test(local) && !/^(info|admin|contact|support|hello|mail|sales)$/i.test(local) ? [{ kind: 'username', value: local, w: W.sameUser, guess: true }] : [] };
  for (const r of results) if (r.status === 'fulfilled') { out.profiles.push(...r.value.profiles); out.links.push(...r.value.links); }
  return out;
}

async function websiteExtract(site) {
  const html = await get(site, { text: true, timeout: 8000, headers: { Accept: 'text/html' } });
  const head = html.slice(0, 300000);
  const title = strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] || '').slice(0, 120);
  const relMe = [...head.matchAll(/<(?:a|link)[^>]+rel=["'][^"']*\bme\b[^"']*["'][^>]*>/gi)].map((m) => /href=["']([^"']+)/i.exec(m[0])?.[1]).filter(Boolean);
  const links = [];
  for (const href of relMe) links.push(...linksFromText(href).map((l) => ({ ...l, w: W.relme })));
  const hrefs = [...head.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]).join(' ');
  for (const l of linksFromText(hrefs)) if (!links.some((x) => x.value === l.value)) links.push({ ...l, w: l.kind === 'email' ? W.linked : 0.5 });
  return { profiles: [{ platform: 'Website', url: site, name: null, bio: title }], links: links.slice(0, 15) };
}

async function nameExtract(name) {
  const [gh, wiki] = await Promise.allSettled([
    get(`https://api.github.com/search/users?q=${encodeURIComponent(name)}+in:name&per_page=5`, { headers: ghHeaders() }),
    get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&srlimit=3`),
  ]);
  const out = { profiles: [], links: [] };
  if (gh.status === 'fulfilled') out.links.push(...(gh.value.items || []).map((u) => ({ kind: 'username', value: u.login, platform: 'GitHub', w: W.nameSearch })));
  if (wiki.status === 'fulfilled') out.profiles.push(...wiki.value.query.search.filter((r) => r.title.toLowerCase().includes(name.toLowerCase().split(' ').pop())).slice(0, 2).map((r) => ({ platform: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`, name: r.title, bio: strip(r.snippet) })));
  return out;
}

// Canonical profile URLs, so "github:alice" from a proof merges with the GitHub account found by the scan.
const PROFILE_URL = {
  GitHub: (u) => `https://github.com/${u}`, 'Twitter/X': (u) => `https://x.com/${u}`, Reddit: (u) => `https://www.reddit.com/user/${u}`,
  'Hacker News': (u) => `https://news.ycombinator.com/user?id=${u}`, GitLab: (u) => `https://gitlab.com/${u}`, Keybase: (u) => `https://keybase.io/${u}`,
  Instagram: (u) => `https://www.instagram.com/${u}`, LinkedIn: (u) => `https://www.linkedin.com/in/${u}`, YouTube: (u) => `https://www.youtube.com/@${u}`,
  Bluesky: (u) => `https://bsky.app/profile/${u}`, 'Dev.to': (u) => `https://dev.to/${u}`, Gravatar: (u) => `https://gravatar.com/${u}`,
};

// ---------- scoring helpers ----------
function similarity(a, b) {
  a = a.toLowerCase().replace(/[^a-z0-9]/g, ''); b = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return 0; if (a === b) return 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}
// Location match: substring either way, or initials ("New York" ~ "NY").
const locMatch = (have, want) => {
  const h = have.toLowerCase(), w = want.toLowerCase().trim();
  if (!h || !w) return false;
  if (h.includes(w) || w.includes(h)) return true;
  const initials = (x) => x.split(/[\s,]+/).filter(Boolean).map((t) => t[0]).join('');
  return h.split(',').some((part) => initials(part.trim()) === w.replace(/[^a-z]/g, ''));
};
const combine = (ws) => 1 - ws.reduce((p, w) => p * (1 - w), 1);
const norm = (kind, v) => `${kind}:${String(v).trim().toLowerCase().replace(/^@/, '').replace(/\/$/, '')}`;

function detectKind(q) {
  q = q.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) return 'email';
  if (/^https?:\/\//i.test(q) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(q) && !q.includes(' ') && /\.[a-z]{2,}$/i.test(q.split('/')[0])) return 'website';
  if (/\s/.test(q)) return 'name';
  return 'username';
}

/**
 * Runs a deep search and streams events through emit():
 *   {type:'start'} {type:'step', text} {type:'identity', ...} {type:'profile', ...} {type:'done', summary}
 * opts: { depth (1-3), maxNodes, expectName, expectLocation, keywords, isOptedOut(value), checkUsername(username) }
 */
async function deepSearch(seed, emit, opts = {}) {
  const maxDepth = Math.min(3, Math.max(1, Number(opts.depth) || 2));
  const maxNodes = Math.min(40, Number(opts.maxNodes) || 25);
  const deadline = Date.now() + 75000;
  const kind = detectKind(seed);
  const value = kind === 'website' ? asWebsite(seed) || seed : seed.trim();
  const identities = new Map(); // key -> {kind, value, platform, depth, evidence:[{w, via, why}]}
  const profiles = [];
  const queue = [];
  const names = new Map(), locations = new Map();
  const tally = (m, v, w) => { if (!v) return; const k = String(v).trim(); if (k.length < 2) return; m.set(k, (m.get(k) || 0) + w); };

  function addIdentity(l, depth, via, why) {
    if (l.kind === 'name' && depth > 0) { tally(names, l.value, l.w); return; }
    if (opts.isOptedOut?.(l.value)) return;
    const key = norm(l.kind, l.value);
    let id = identities.get(key);
    if (!id) {
      if (identities.size >= maxNodes) return;
      id = { key, kind: l.kind, value: l.value, platform: l.platform, depth, evidence: [], profiles: [] };
      identities.set(key, id);
      if (l.kind !== 'account' && (depth < maxDepth || l.kind === 'website')) queue.push(id);
    }
    if (!id.evidence.some((e) => e.via === via && e.why === why)) id.evidence.push({ w: l.w, via, why, proof: !!l.proof });
    if (!id.platform && l.platform && id.depth > 0) id.platform = l.platform;
    emitIdentity(id);
  }
  const score = (id) => {
    let c = combine(id.evidence.map((e) => e.w));
    const facts = id.profiles.map((p) => `${p.name || ''} ${p.location || ''} ${p.bio || ''}`).join(' ').toLowerCase();
    if (opts.expectName && id.profiles.some((p) => p.name)) c = id.profiles.some((p) => p.name && similarity(p.name, opts.expectName) > 0.7) ? combine([c, 0.3]) : c * 0.6;
    if (opts.expectLocation && id.profiles.some((p) => p.location)) c = id.profiles.some((p) => locMatch(p.location || '', opts.expectLocation)) ? combine([c, 0.3]) : c * 0.6;
    if (opts.keywords) for (const k of opts.keywords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) if (facts.includes(k)) c = combine([c, 0.25]);
    return Math.round(Math.min(1, c) * 100);
  };
  const emitIdentity = (id) => emit({ type: 'identity', key: id.key, kind: id.kind, value: id.value, platform: id.platform, depth: id.depth, confidence: score(id), evidence: id.evidence.map(({ via, why, proof }) => ({ via, why, proof })), urls: id.profiles.map((p) => p.url).filter(Boolean) });

  emit({ type: 'start', seed: value, kind, depth: maxDepth });
  addIdentity({ kind, value, w: W.seed }, 0, 'seed', 'Your search');

  while (queue.length && Date.now() < deadline) {
    const batch = queue.splice(0, 4);
    await Promise.all(batch.map(async (id) => {
      const label = `${id.kind} ${id.value}`;
      emit({ type: 'step', text: `Expanding ${label} (depth ${id.depth})` });
      const jobs = [];
      if (id.kind === 'username') {
        // Seed usernames are tried on every extractor; discovered ones only on their own platform.
        const all = Object.keys(byUsername);
        const targets = !id.platform ? all : byUsername[id.platform] ? (id.depth === 0 ? all : [id.platform]) : [];
        for (const p of targets) jobs.push([p, () => byUsername[p](p === 'Mastodon' ? id.value : id.value.split('@')[0])]);
        if (opts.checkUsername && id.depth <= 1 && /^[A-Za-z0-9._-]{2,40}$/.test(id.value)) jobs.push(['platform scan', async () => {
          const found = await opts.checkUsername(id.value);
          return { profiles: [], links: found.filter((f) => !Object.keys(byUsername).includes(f.platform)).map((f) => ({ kind: 'account', value: f.url, platform: f.platform, w: W.sameUser })) };
        }]);
      } else if (id.kind === 'email') jobs.push(['email', () => emailExtract(id.value)]);
      else if (id.kind === 'website') jobs.push(['website', () => websiteExtract(id.value)]);
      else if (id.kind === 'name') jobs.push(['name', () => nameExtract(id.value)]);

      await Promise.all(jobs.map(async ([src, fn]) => {
        try {
          const parentTrust = id.depth === 0 ? 1 : score(id) / 100;
          const { profiles: ps, links } = await fn();
          for (const p of ps) {
            const prof = { ...p, of: id.key, via: src };
            profiles.push(prof); id.profiles.push(prof);
            tally(names, p.name, parentTrust); tally(locations, p.location, parentTrust);
            emit({ type: 'profile', of: id.key, ...prof });
          }
          // A platform answering for this username is itself evidence the account exists.
          if (ps.length && id.kind === 'username' && src !== id.platform && src !== 'platform scan') {
            const sib = { kind: 'account', value: PROFILE_URL[src] ? PROFILE_URL[src](id.value.split('@')[0]) : ps[0].url, platform: src, w: W.sameUser };
            if (sib.value) addIdentity(sib, id.depth + 1, label, `Same username on ${src}`);
          }
          for (let l of links) {
            if (l.kind === 'username' && (l.value.toLowerCase() === id.value.toLowerCase() || (kind === 'username' && l.value.toLowerCase() === value.toLowerCase()))) {
              if (!l.platform || l.platform === id.platform || !PROFILE_URL[l.platform]) continue;
              l = { kind: 'account', value: PROFILE_URL[l.platform](l.value), platform: l.platform, w: l.w, proof: l.proof };
            }
            const why = src === 'name' ? `Name match on ${l.platform}` : l.proof ? `Verified proof on ${src}` : l.kind === 'account' && l.w > W.sameUser ? `Linked from ${src} profile` : l.proof ? `Verified proof on ${src}` : l.guess ? 'Guessed from email address' : l.kind === 'account' ? `Exists on ${l.platform}` : `Linked from ${src} profile`;
            // Username similarity raises weight for "same person, other platform" links.
            let w = l.kind === 'username' && id.kind === 'username' ? l.w * (0.7 + 0.3 * similarity(l.value, id.value)) : l.w;
            // Trust propagates: a clue is only as strong as the lead it came from.
            w *= parentTrust;
            addIdentity({ ...l, w }, id.depth + 1, label, why);
          }
        } catch { /* source had nothing or was unreachable */ }
      }));
      emitIdentity(id);
    }));
  }

  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => ({ value: v, score: Math.round(n * 10) / 10 }));
  const all = [...identities.values()].map((id) => ({ kind: id.kind, value: id.value, platform: id.platform, confidence: score(id) })).sort((a, b) => b.confidence - a.confidence);
  emit({
    type: 'done',
    summary: {
      seed: value, kind, depth: maxDepth, timedOut: Date.now() >= deadline,
      identities: all.length, profiles: profiles.length,
      likelyNames: top(names), likelyLocations: top(locations),
      strongLinks: all.filter((x) => x.confidence >= 70 && x.kind !== 'account').length,
      verifiedProofs: [...identities.values()].reduce((n, id) => n + id.evidence.filter((e) => e.proof).length, 0),
      breaches: profiles.find((p) => p.platform === 'Breaches')?.breaches ?? null,
    },
  });
}

module.exports = { deepSearch, detectKind, similarity };
module.exports.locMatch = locMatch;
