// The Project Analyst Co. — backend
// Zero external dependencies: uses only Node.js built-ins, so `npm install`
// is not required. Just: node server.js
//
// Storage: flat JSON files under ./data (fine for a small agency's traffic;
// swap for a real database later if you outgrow it — the API shape won't change).

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

const PORT = process.env.PORT || 3000;

// --- CONFIGURE THESE (via environment variables in production) ---
const ADMIN_KEY = process.env.ADMIN_KEY || 'Areesha@projectanalystco';
const SADAPAY_ACCOUNT_TITLE = process.env.SADAPAY_ACCOUNT_TITLE || 'The Project Analyst Co.';
const SADAPAY_IBAN = process.env.SADAPAY_IBAN || 'PASTE-YOUR-IBAN-HERE';
// -------------------------------------------------------------------

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}
function writeJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map(c => {
      const idx = c.indexOf('=');
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1))];
    })
  );
}

function getSession(req) {
  const cookies = parseCookies(req);
  if (!cookies.sid) return null;
  const sessions = readJSON(SESSIONS_FILE);
  const session = sessions.find(s => s.token === cookies.sid && s.expires > Date.now());
  return session || null;
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readJSON(SESSIONS_FILE);
  sessions.push({ token, userId, expires: Date.now() + 1000 * 60 * 60 * 24 * 7 }); // 7 days
  writeJSON(SESSIONS_FILE, sessions);
  return token;
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host}`); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  const { pathname } = url;

  // ---------- static pages ----------
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (req.method === 'GET' && pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(path.join(__dirname, 'admin.html')));
  }

  // ---------- auth ----------
  if (pathname === '/api/signup' && req.method === 'POST') {
    try {
      const { name, email, password } = await collectBody(req);
      if (!name || !isValidEmail(email) || !password || password.length < 6) {
        return sendJSON(res, 400, { error: 'Please provide a name, valid email, and a password of at least 6 characters.' });
      }
      const users = readJSON(USERS_FILE);
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return sendJSON(res, 409, { error: 'An account with that email already exists. Try signing in instead.' });
      }
      const user = {
        id: crypto.randomUUID(),
        name, email,
        password: hashPassword(password),
        paymentStatus: 'unpaid',
        createdAt: Date.now(),
      };
      users.push(user);
      writeJSON(USERS_FILE, users);
      const token = createSession(user.id);
      res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`);
      return sendJSON(res, 200, { ok: true, name: user.name, email: user.email, paymentStatus: user.paymentStatus });
    } catch { return sendJSON(res, 400, { error: 'Invalid request.' }); }
  }

  if (pathname === '/api/signin' && req.method === 'POST') {
    try {
      const { email, password } = await collectBody(req);
      const users = readJSON(USERS_FILE);
      const user = users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
      if (!user || !verifyPassword(password, user.password)) {
        return sendJSON(res, 401, { error: 'Incorrect email or password.' });
      }
      const token = createSession(user.id);
      res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`);
      return sendJSON(res, 200, { ok: true, name: user.name, email: user.email, paymentStatus: user.paymentStatus });
    } catch { return sendJSON(res, 400, { error: 'Invalid request.' }); }
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies.sid) {
      const sessions = readJSON(SESSIONS_FILE).filter(s => s.token !== cookies.sid);
      writeJSON(SESSIONS_FILE, sessions);
    }
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) return sendJSON(res, 200, { loggedIn: false });
    const user = readJSON(USERS_FILE).find(u => u.id === session.userId);
    if (!user) return sendJSON(res, 200, { loggedIn: false });
    return sendJSON(res, 200, { loggedIn: true, name: user.name, email: user.email, paymentStatus: user.paymentStatus });
  }

  // ---------- payments (SadaPay, manual verification) ----------
  if (pathname === '/api/payment-info' && req.method === 'GET') {
    return sendJSON(res, 200, { bank: 'SadaPay', accountTitle: SADAPAY_ACCOUNT_TITLE, iban: SADAPAY_IBAN });
  }

  if (pathname === '/api/payments/claim' && req.method === 'POST') {
    const session = getSession(req);
    if (!session) return sendJSON(res, 401, { error: 'Please sign in first.' });
    try {
      const { amount, note } = await collectBody(req);
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return sendJSON(res, 400, { error: 'Please enter a valid amount.' });
      }
      const payments = readJSON(PAYMENTS_FILE);
      payments.push({
        id: crypto.randomUUID(),
        userId: session.userId,
        amount: Number(amount),
        note: (note || '').slice(0, 500),
        status: 'pending',
        createdAt: Date.now(),
      });
      writeJSON(PAYMENTS_FILE, payments);
      return sendJSON(res, 200, { ok: true });
    } catch { return sendJSON(res, 400, { error: 'Invalid request.' }); }
  }

  // ---------- admin (protect with ADMIN_KEY env var) ----------
  if (pathname === '/api/admin/payments' && req.method === 'GET') {
    if (req.headers['x-admin-key'] !== ADMIN_KEY) return sendJSON(res, 403, { error: 'Invalid admin key.' });
    const users = readJSON(USERS_FILE);
    const payments = readJSON(PAYMENTS_FILE).map(p => {
      const u = users.find(u => u.id === p.userId);
      return { ...p, userName: u?.name, userEmail: u?.email };
    }).sort((a, b) => b.createdAt - a.createdAt);
    return sendJSON(res, 200, { payments });
  }

  const verifyMatch = pathname.match(/^\/api\/admin\/payments\/([^/]+)\/verify$/);
  if (verifyMatch && req.method === 'POST') {
    if (req.headers['x-admin-key'] !== ADMIN_KEY) return sendJSON(res, 403, { error: 'Invalid admin key.' });
    const payments = readJSON(PAYMENTS_FILE);
    const payment = payments.find(p => p.id === verifyMatch[1]);
    if (!payment) return sendJSON(res, 404, { error: 'Payment not found.' });
    payment.status = 'verified';
    writeJSON(PAYMENTS_FILE, payments);
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === payment.userId);
    if (user) { user.paymentStatus = 'paid'; writeJSON(USERS_FILE, users); }
    return sendJSON(res, 200, { ok: true });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => console.log(`The Project Analyst Co. server running on port ${PORT}`));
