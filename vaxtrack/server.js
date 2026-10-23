// Nuvexa server: static files + SQLite JSON API. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/db');
const auth = require('./lib/auth');
const { verifyExternalId } = require('./lib/idverify');
const { SCHEDULE, statusFor, summary, ageDays } = require('./lib/schedule');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
};

const FAVICON_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path fill="#0b6e5f" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>' +
  '</svg>',
  'utf8'
);

auth.seed();

// In-memory rate limiting for authentication (zero dependencies)
const loginAttempts = new Map();
const checkRateLimit = (ip, max = 10, windowMs = 15 * 60 * 1000) => {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  if (entry.count >= max) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000);
    throw fail(429, `Too many failed login attempts. Please try again in ${waitSec} seconds.`);
  }
};
const recordFailedAttempt = (ip) => {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  entry.count++;
  loginAttempts.set(ip, entry);
};
const clearAttempts = (ip) => loginAttempts.delete(ip);

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
  res.end(JSON.stringify(obj));
};
const fail = (code, error) => { const e = new Error(error); e.code = code; return e; };
const body = req => new Promise((ok, no) => {
  let s = '';
  req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try { ok(s ? JSON.parse(s) : {}); }
    catch { no(fail(400, 'Invalid JSON body.')); }
  });
});
const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const needUser = u => {
  if (!u) throw fail(401, 'Please sign in.');
  if (!u.approved) throw fail(403, 'Your account is awaiting approval by an administrator.');
  return u;
};
const childView = c => ({ ...c, schedule: statusFor(c), ageDays: ageDays(c.dob) });
const findChild = id => store.findChildById(id) || (() => { throw fail(404, 'Child record not found.'); })();

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('POST', '/api/register', async ({ b }) => {
  const u = { name: clean(b.name), email: clean(b.email).toLowerCase(), facility: clean(b.facility), license: clean(b.license, 40) };
  if (!u.name || !u.email || !u.facility || !u.license || String(b.password || '').length < 8) {
    throw fail(400, 'Fill in all fields. Password requires at least 8 characters.');
  }
  if (store.findUserByEmail(u.email)) {
    throw fail(409, 'An account with this email address already exists.');
  }
  store.insertUser({ id: store.id(), ...u, password: auth.hash(b.password), role: 'provider', approved: false });
  store.log(null, 'REGISTER', `${u.name} @ ${u.facility}`);
  return { message: 'Registration submitted. An administrator must approve your license before you can sign in.' };
});

route('POST', '/api/login', async ({ b, req }) => {
  const ip = req.socket.remoteAddress || 'unknown';
  checkRateLimit(ip);
  const r = auth.login(b.email, b.password);
  if (!r) {
    recordFailedAttempt(ip);
    throw fail(401, 'Invalid email or password.');
  }
  if (!r.user.approved) {
    throw fail(403, 'Your account is awaiting approval by an administrator.');
  }
  clearAttempts(ip);
  return r;
});

route('POST', '/api/logout', async ({ req }) => {
  auth.logout(req);
  return { ok: true, message: 'Signed out successfully.' };
});

route('GET', '/api/me', async ({ user }) => ({ user: auth.publicUser(needUser(user)) }));

route('GET', '/api/children', async ({ user, q }) => {
  needUser(user);
  const list = store.searchChildren(q.get('q'));
  return list.slice(0, 100).map(c => ({ id: c.id, name: c.name, dob: c.dob, govId: c.govId, guardian: c.guardian, facility: c.facility, ...summary(c) }));
});

route('POST', '/api/children', async ({ user, b }) => {
  needUser(user);
  const c = { name: clean(b.name), dob: clean(b.dob, 10), sex: clean(b.sex, 10), guardian: clean(b.guardian), phone: clean(b.phone, 30) };
  if (!c.name || !c.guardian || !/^\d{4}-\d{2}-\d{2}$/.test(c.dob)) throw fail(400, 'Name, guardian and valid date of birth (YYYY-MM-DD) are required.');
  if (new Date(c.dob) > new Date()) throw fail(400, 'Date of birth cannot be in the future.');
  const v = await verifyExternalId(b.govId);
  if (!v.ok) throw fail(422, v.error);
  const dup = store.findChildByGovId(v.id);
  if (dup) throw fail(409, `A record for this ID already exists (${dup.name}, registered at ${dup.facility}). Open it instead of creating a duplicate.`);
  const rec = { id: store.id(), ...c, govId: v.id, idVerifiedAt: v.verifiedAt, idSource: v.source, facility: user.facility, createdBy: user.name, createdAt: new Date().toISOString(), doses: [] };
  store.insertChild(rec);
  store.log(user, 'CREATE_CHILD', `${rec.name} [${rec.govId}]`);
  return childView(rec);
});

route('GET', '/api/children/:id', async ({ user, p }) => {
  needUser(user);
  const c = findChild(p.id);
  store.log(user, 'VIEW', `${c.name} [${c.govId}]`);
  return childView(c);
});

route('POST', '/api/children/:id/doses', async ({ user, p, b }) => {
  needUser(user);
  const c = findChild(p.id);
  const v = SCHEDULE.find(x => x.code === b.code);
  if (!v) throw fail(400, 'Unknown vaccine.');
  const date = clean(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'Enter a valid date given (YYYY-MM-DD).');
  if (new Date(date) < new Date(c.dob)) throw fail(400, 'Date given cannot be before the date of birth.');
  if (new Date(date) > new Date()) throw fail(400, 'Date given cannot be in the future.');
  if (c.doses.some(d => d.code === v.code && !d.voided)) throw fail(409, `${v.name} dose ${v.dose} is already recorded. Void it first if it was entered in error.`);
  const dose = { id: store.id(), code: v.code, date, lot: clean(b.lot, 40), notes: clean(b.notes, 300), facility: user.facility, by: user.name, at: new Date().toISOString(), voided: false };
  store.insertDose(c.id, dose);
  store.log(user, 'ADD_DOSE', `${v.name} #${v.dose} → ${c.name}`);
  return childView(findChild(p.id));
});

route('POST', '/api/children/:id/doses/:doseId/void', async ({ user, p, b }) => {
  needUser(user);
  const c = findChild(p.id);
  const d = c.doses.find(x => x.id === p.doseId);
  if (!d || d.voided) throw fail(404, 'Dose record not found or already voided.');
  const reason = clean(b.reason, 200);
  if (reason.length < 3) throw fail(400, 'Please provide a clear reason for voiding this record.');
  const voidedAt = new Date().toISOString();
  const voidedBy = `${user.name} (${user.facility})`;
  store.voidDose(d.id, reason, voidedBy, voidedAt);
  store.log(user, 'VOID_DOSE', `${d.code} on ${c.name}: ${reason}`);
  return childView(findChild(p.id));
});

route('GET', '/api/dashboard', async ({ user }) => {
  needUser(user);
  const kids = store.db.children;
  const overdueList = kids.map(c => ({ c, s: summary(c) })).filter(x => x.s.overdue > 0)
    .sort((a, b) => b.s.overdue - a.s.overdue).slice(0, 25)
    .map(({ c, s }) => ({
      id: c.id,
      name: c.name,
      guardian: c.guardian,
      phone: c.phone,
      facility: c.facility,
      overdue: s.overdue,
      vaccines: statusFor(c).filter(v => v.status === 'overdue').map(v => `${v.name} #${v.dose}`)
    }));
  const all = kids.map(summary);
  const given = all.reduce((a, s) => a + s.given, 0);
  const expected = all.reduce((a, s) => a + s.given + s.due + s.overdue, 0);
  const byFacility = {};
  kids.forEach(c => c.doses.filter(d => !d.voided).forEach(d => { byFacility[d.facility] = (byFacility[d.facility] || 0) + 1; }));
  return {
    children: kids.length,
    withOverdue: overdueList.length ? all.filter(s => s.overdue > 0).length : 0,
    coverage: expected ? Math.round(100 * given / expected) : 100,
    dosesToday: kids.reduce((a, c) => a + c.doses.filter(d => !d.voided && d.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length, 0),
    overdueList,
    byFacility
  };
});

const needAdmin = u => { if (needUser(u).role !== 'admin') throw fail(403, 'Administrators only.'); };
route('GET', '/api/admin/users', async ({ user }) => { needAdmin(user); return store.db.users.map(auth.publicUser); });
route('POST', '/api/admin/users/:id/approve', async ({ user, p, b }) => {
  needAdmin(user);
  const u = store.findUserById(p.id);
  if (!u) throw fail(404, 'User not found.');
  const approved = b.approve !== false;
  store.updateUserApproval(u.id, approved);
  store.log(user, approved ? 'APPROVE_USER' : 'REVOKE_USER', u.email);
  return auth.publicUser({ ...u, approved });
});
route('GET', '/api/admin/audit', async ({ user }) => { needAdmin(user); return store.db.audit.slice(0, 100); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  // Favicon handler
  if (url.pathname === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', ...SECURITY_HEADERS });
    return res.end(FAVICON_SVG);
  }

  // REST API routes
  if (url.pathname.startsWith('/api/')) {
    try {
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (!m) continue;
        const b = req.method === 'POST' ? await body(req) : {};
        return send(res, 200, await r.fn({ user: auth.userFromToken(req), p: m.groups || {}, b, q: url.searchParams, req }));
      }
      throw fail(404, 'Endpoint not found.');
    } catch (e) {
      return send(res, e.code || 500, { error: e.code ? e.message : 'Server error occurred.' });
    }
  }

  // Static file serving with strict path traversal boundary check
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safeRelativePath = path.normalize(requestedPath).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(PUBLIC, safeRelativePath);

  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Not found');
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    ...SECURITY_HEADERS,
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Nuvexa running at http://localhost:${PORT}`));
