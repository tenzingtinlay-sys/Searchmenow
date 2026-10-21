// Tiny JSON-file store for users, sessions, search history, opt-outs and contact messages.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/searchmenow' : path.join(__dirname, '..', 'data'));
const FILE = path.join(DIR, 'store.json');
let db = { users: {}, sessions: {}, optouts: [], messages: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
let timer;
const save = () => { clearTimeout(timer); timer = setTimeout(() => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); }, 200); };

// Daily search limits. Unlimited by default; set FREE_DAILY_SEARCHES to a number to cap the Free plan.
const freeLimit = Number(process.env.FREE_DAILY_SEARCHES) || null;
const PLANS = {
  free: { name: 'Free', price: 0, daily: freeLimit },
  pro: { name: 'Pro', price: 19.99, daily: freeLimit ? 250 : null },
  team: { name: 'Team', price: 49.99, daily: freeLimit ? 2000 : null },
};
const today = () => new Date().toISOString().slice(0, 10);
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

function signup(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters.');
  if (db.users[email]) throw new Error('An account with this email already exists.');
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[email] = { email, salt, hash: hash(password, salt), plan: 'free', created: new Date().toISOString(), day: today(), used: 0, history: [] };
  save();
  return createSession(email);
}

function login(email, password) {
  const u = db.users[String(email || '').trim().toLowerCase()];
  if (!u || !crypto.timingSafeEqual(Buffer.from(hash(String(password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) throw new Error('Incorrect email or password.');
  return createSession(u.email);
}

function createSession(email) {
  const sid = crypto.randomBytes(32).toString('hex');
  db.sessions[sid] = { email, created: Date.now() };
  save();
  return sid;
}

const logout = (sid) => { delete db.sessions[sid]; save(); };

function userFromReq(req) {
  const sid = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  const s = sid && db.sessions[sid];
  if (!s || Date.now() - s.created > 30 * 864e5) return null;
  const u = db.users[s.email];
  if (u && u.day !== today()) { u.day = today(); u.used = 0; save(); }
  return u ? Object.assign(u, { _sid: sid }) : null;
}

const publicUser = (u) => ({ email: u.email, plan: u.plan, planName: PLANS[u.plan].name, used: u.used, limit: PLANS[u.plan].daily, remaining: PLANS[u.plan].daily ? Math.max(0, PLANS[u.plan].daily - u.used) : null, created: u.created });

// Charges one credit and records history. Returns an error message or null.
function charge(u, kind, query) {
  if (PLANS[u.plan].daily && u.used >= PLANS[u.plan].daily) return `Daily search limit reached (${PLANS[u.plan].daily} on ${PLANS[u.plan].name}). Upgrade in Billing or try again tomorrow.`;
  u.used++;
  u.history.unshift({ kind, query, at: new Date().toISOString() });
  u.history = u.history.slice(0, 50);
  save();
  return null;
}

function setPlan(u, plan) { if (!PLANS[plan]) throw new Error('Unknown plan.'); u.plan = plan; save(); }
function clearHistory(u) { u.history = []; save(); }
function deleteAccount(u) {
  for (const [sid, s] of Object.entries(db.sessions)) if (s.email === u.email) delete db.sessions[sid];
  delete db.users[u.email]; save();
}
function changePassword(u, current, next) {
  if (hash(String(current || ''), u.salt) !== u.hash) throw new Error('Current password is incorrect.');
  if (String(next || '').length < 8) throw new Error('New password must be at least 8 characters.');
  u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hash(next, u.salt); save();
}

// Opt-out list: identifiers that must never be returned in results.
const normId = (s) => String(s || '').trim().toLowerCase();
function addOptOut(identifier, email) {
  const id = normId(identifier);
  if (id.length < 2 || id.length > 120) throw new Error('Enter the username, email or name to remove.');
  if (!db.optouts.some((o) => o.id === id)) db.optouts.push({ id, contact: normId(email), at: new Date().toISOString() });
  save();
}
const isOptedOut = (q) => db.optouts.some((o) => o.id === normId(q));

function addMessage(m) {
  const msg = { name: String(m.name || '').slice(0, 100), email: normId(m.email).slice(0, 200), subject: String(m.subject || '').slice(0, 200), body: String(m.body || '').slice(0, 5000), at: new Date().toISOString() };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email) || msg.body.length < 5) throw new Error('Enter your email and a message.');
  db.messages.push(msg); save();
}

module.exports = { PLANS, signup, login, logout, userFromReq, publicUser, charge, setPlan, clearHistory, deleteAccount, changePassword, addOptOut, isOptedOut, addMessage };
