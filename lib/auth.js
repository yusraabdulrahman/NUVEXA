const crypto = require('crypto');
const store = require('./db');

function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function verify(password, stored) {
  try {
    const [salt, h] = String(stored || '').split(':');
    if (!salt || !h) return false;
    const test = hash(password, salt).split(':')[1];
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(test, 'hex'));
  } catch {
    return false;
  }
}

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, facility: u.facility, license: u.license, role: u.role, approved: Boolean(u.approved) });

function pruneSessions() {
  store.pruneSessions(12 * 3600 * 1000);
}

function login(email, password) {
  pruneSessions();
  const u = store.findUserByEmail(email);
  if (!u || !verify(String(password), u.password)) return null;
  const token = crypto.randomBytes(24).toString('hex');
  store.insertSession(token, u.id, Date.now());
  return { token, user: publicUser(u) };
}

function userFromToken(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!t) return null;
  const s = store.findSession(t);
  if (!s || Date.now() - s.at > 12 * 3600 * 1000) return null;
  return store.findUserById(s.userId);
}

function logout(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!t) return;
  store.deleteSession(t);
}

function seed() {
  if (store.findUserByEmail('admin@nuvexa.test')) return;
  const mk = ({ pw, ...o }) => store.insertUser({ id: store.id(), password: hash(pw), ...o });
  mk({ name: 'System Admin', email: 'admin@nuvexa.test', pw: 'admin123', facility: 'Ministry of Health', license: 'ADMIN', role: 'admin', approved: true });
  mk({ name: 'Dr. Amina Yusuf', email: 'provider@nuvexa.test', pw: 'provider123', facility: 'City General Hospital', license: 'LIC-1001', role: 'provider', approved: true });
  mk({ name: 'Nurse Daniel Okoye', email: 'clinic@nuvexa.test', pw: 'clinic123', facility: 'Eastside Health Clinic', license: 'LIC-2002', role: 'provider', approved: true });
}

module.exports = { hash, login, logout, userFromToken, publicUser, seed, pruneSessions };
