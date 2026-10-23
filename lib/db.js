// SQLite & JSON Dual-Engine Database Manager for Nuvexa.
// Prefers native SQLite via 'better-sqlite3' or 'node:sqlite' with automatic JSON fallback.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DIR, 'db.json');
const SQLITE_FILE = path.join(DIR, 'nuvexa.sqlite');

fs.mkdirSync(DIR, { recursive: true });

let sqliteDb = null;
let engine = 'json'; // 'sqlite' or 'json'

// Try initializing better-sqlite3 first, then node:sqlite
try {
  const Database = require('better-sqlite3');
  sqliteDb = new Database(SQLITE_FILE);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  engine = 'sqlite';
} catch {
  try {
    const { DatabaseSync } = require('node:sqlite');
    sqliteDb = new DatabaseSync(SQLITE_FILE);
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    engine = 'sqlite';
  } catch {
    engine = 'json';
  }
}

// In-memory representation for JSON fallback
let jsonData = { users: [], children: [], sessions: [], audit: [] };

function initSqliteSchema() {
  if (!sqliteDb) return;
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      facility TEXT NOT NULL,
      license TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'provider',
      approved INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dob TEXT NOT NULL,
      sex TEXT NOT NULL,
      guardian TEXT NOT NULL,
      phone TEXT,
      govId TEXT UNIQUE NOT NULL,
      idVerifiedAt TEXT,
      idSource TEXT,
      facility TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doses (
      id TEXT PRIMARY KEY,
      childId TEXT NOT NULL,
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      lot TEXT,
      notes TEXT,
      facility TEXT NOT NULL,
      by TEXT NOT NULL,
      at TEXT NOT NULL,
      voided INTEGER NOT NULL DEFAULT 0,
      voidReason TEXT,
      voidedBy TEXT,
      voidedAt TEXT,
      FOREIGN KEY (childId) REFERENCES children(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      at INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      by TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_children_govid ON children(govId);
    CREATE INDEX IF NOT EXISTS idx_doses_childid ON doses(childId);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_at ON sessions(at);
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
  `);

  // Migrate existing data from db.json if SQLite database is newly created
  migrateFromJsonIfEmpty();
}

function migrateFromJsonIfEmpty() {
  try {
    const userCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0 && fs.existsSync(JSON_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        console.log(`[Database] Migrating ${parsed.users.length} users and existing data from JSON into SQLite...`);
        
        const insertUser = sqliteDb.prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const insertChild = sqliteDb.prepare('INSERT OR IGNORE INTO children VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertDose = sqliteDb.prepare('INSERT OR IGNORE INTO doses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertSession = sqliteDb.prepare('INSERT OR IGNORE INTO sessions VALUES (?, ?, ?)');
        const insertAudit = sqliteDb.prepare('INSERT OR IGNORE INTO audit VALUES (?, ?, ?, ?, ?)');

        sqliteDb.exec('BEGIN TRANSACTION;');
        for (const u of parsed.users || []) {
          insertUser.run(u.id, u.name, u.email, u.password, u.facility, u.license, u.role || 'provider', u.approved ? 1 : 0);
        }
        for (const c of parsed.children || []) {
          insertChild.run(c.id, c.name, c.dob, c.sex || '', c.guardian, c.phone || '', c.govId, c.idVerifiedAt || '', c.idSource || '', c.facility, c.createdBy || '', c.createdAt || new Date().toISOString());
          for (const d of c.doses || []) {
            insertDose.run(d.id, c.id, d.code, d.date, d.lot || '', d.notes || '', d.facility, d.by, d.at, d.voided ? 1 : 0, d.voidReason || '', d.voidedBy || '', d.voidedAt || '');
          }
        }
        for (const s of parsed.sessions || []) {
          insertSession.run(s.token, s.userId, s.at);
        }
        for (const a of parsed.audit || []) {
          insertAudit.run(id(), a.at, a.by, a.action, a.detail);
        }
        sqliteDb.exec('COMMIT;');
        console.log('[Database] Migration to SQLite completed successfully.');
      }
    }
  } catch (err) {
    console.error('[Database] JSON to SQLite migration notice:', err.message);
  }
}

function loadJson() {
  if (fs.existsSync(JSON_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        jsonData = { users: [], children: [], sessions: [], audit: [], ...parsed };
      }
    } catch (e) {
      console.error('[Database] JSON parse error, initializing default data:', e.message);
    }
  }
}

function saveJson() {
  const tmp = JSON_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(jsonData, null, 2));
  fs.renameSync(tmp, JSON_FILE);
}

const id = () => crypto.randomBytes(6).toString('hex');

if (engine === 'sqlite') {
  initSqliteSchema();
  console.log('[Database] Connected to SQLite database at data/nuvexa.sqlite');
} else {
  loadJson();
  console.log('[Database] Running on JSON storage. (To enable SQLite, run: npm install better-sqlite3)');
}

// -------------------------------------------------------------
// Compatibility Layer: provides transparent reactive store.db
// -------------------------------------------------------------
const store = {
  get engine() {
    return engine;
  },
  id,
  save() {
    if (engine === 'json') saveJson();
  },
  log(user, action, detail) {
    const at = new Date().toISOString();
    const by = user ? `${user.name} (${user.facility})` : 'system';
    if (engine === 'sqlite') {
      sqliteDb.prepare('INSERT INTO audit VALUES (?, ?, ?, ?, ?)').run(id(), at, by, action, detail);
    } else {
      jsonData.audit.unshift({ at, by, action, detail });
      jsonData.audit = jsonData.audit.slice(0, 500);
      saveJson();
    }
  },
  get db() {
    if (engine === 'json') return jsonData;

    // SQLite transparent view
    return {
      get users() {
        return sqliteDb.prepare('SELECT id, name, email, password, facility, license, role, (approved = 1) AS approved FROM users').all();
      },
      get children() {
        const rows = sqliteDb.prepare('SELECT * FROM children').all();
        const doses = sqliteDb.prepare('SELECT * FROM doses').all();
        const doseMap = {};
        for (const d of doses) {
          d.voided = Boolean(d.voided);
          if (!doseMap[d.childId]) doseMap[d.childId] = [];
          doseMap[d.childId].push(d);
        }
        return rows.map(c => ({
          ...c,
          doses: doseMap[c.id] || [],
        }));
      },
      get sessions() {
        return sqliteDb.prepare('SELECT token, userId, at FROM sessions').all();
      },
      get audit() {
        return sqliteDb.prepare('SELECT at, by, action, detail FROM audit ORDER BY at DESC LIMIT 100').all();
      },
    };
  },

  // Direct High-Performance Database Operations
  findUserByEmail(email) {
    if (engine === 'sqlite') {
      const row = sqliteDb.prepare('SELECT id, name, email, password, facility, license, role, (approved = 1) AS approved FROM users WHERE email = ?').get(String(email).toLowerCase());
      return row || null;
    }
    return jsonData.users.find(u => u.email === String(email).toLowerCase()) || null;
  },

  findUserById(userId) {
    if (engine === 'sqlite') {
      const row = sqliteDb.prepare('SELECT id, name, email, password, facility, license, role, (approved = 1) AS approved FROM users WHERE id = ?').get(userId);
      return row || null;
    }
    return jsonData.users.find(u => u.id === userId) || null;
  },

  insertUser(user) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        user.id, user.name, user.email, user.password, user.facility, user.license, user.role || 'provider', user.approved ? 1 : 0
      );
    } else {
      jsonData.users.push(user);
      saveJson();
    }
  },

  updateUserApproval(userId, approved) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('UPDATE users SET approved = ? WHERE id = ?').run(approved ? 1 : 0, userId);
    } else {
      const u = jsonData.users.find(x => x.id === userId);
      if (u) { u.approved = approved; saveJson(); }
    }
  },

  findChildById(childId) {
    if (engine === 'sqlite') {
      const c = sqliteDb.prepare('SELECT * FROM children WHERE id = ?').get(childId);
      if (!c) return null;
      const doses = sqliteDb.prepare('SELECT * FROM doses WHERE childId = ? ORDER BY date ASC').all(childId);
      c.doses = doses.map(d => ({ ...d, voided: Boolean(d.voided) }));
      return c;
    }
    return jsonData.children.find(c => c.id === childId) || null;
  },

  findChildByGovId(govId) {
    if (engine === 'sqlite') {
      const c = sqliteDb.prepare('SELECT * FROM children WHERE govId = ?').get(govId);
      if (!c) return null;
      const doses = sqliteDb.prepare('SELECT * FROM doses WHERE childId = ? ORDER BY date ASC').all(c.id);
      c.doses = doses.map(d => ({ ...d, voided: Boolean(d.voided) }));
      return c;
    }
    return jsonData.children.find(c => c.govId === govId) || null;
  },

  searchChildren(query) {
    const s = String(query || '').trim().toLowerCase();
    if (engine === 'sqlite') {
      let rows;
      if (s) {
        rows = sqliteDb.prepare('SELECT * FROM children WHERE LOWER(govId) LIKE ? OR LOWER(name) LIKE ? OR LOWER(guardian) LIKE ? LIMIT 100').all(`%${s}%`, `%${s}%`, `%${s}%`);
      } else {
        rows = sqliteDb.prepare('SELECT * FROM children LIMIT 100').all();
      }
      const allDoses = sqliteDb.prepare('SELECT * FROM doses').all();
      const doseMap = {};
      for (const d of allDoses) {
        d.voided = Boolean(d.voided);
        if (!doseMap[d.childId]) doseMap[d.childId] = [];
        doseMap[d.childId].push(d);
      }
      return rows.map(c => ({ ...c, doses: doseMap[c.id] || [] }));
    }
    return jsonData.children.filter(c => !s || c.govId.toLowerCase().includes(s) || c.name.toLowerCase().includes(s) || c.guardian.toLowerCase().includes(s)).slice(0, 100);
  },

  insertChild(child) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('INSERT INTO children VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        child.id, child.name, child.dob, child.sex || '', child.guardian, child.phone || '', child.govId, child.idVerifiedAt || '', child.idSource || '', child.facility, child.createdBy, child.createdAt
      );
    } else {
      jsonData.children.push(child);
      saveJson();
    }
  },

  insertDose(childId, dose) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('INSERT INTO doses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        dose.id, childId, dose.code, dose.date, dose.lot || '', dose.notes || '', dose.facility, dose.by, dose.at, dose.voided ? 1 : 0, dose.voidReason || '', dose.voidedBy || '', dose.voidedAt || ''
      );
    } else {
      const c = jsonData.children.find(x => x.id === childId);
      if (c) { (c.doses = c.doses || []).push(dose); saveJson(); }
    }
  },

  voidDose(doseId, reason, voidedBy, voidedAt) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('UPDATE doses SET voided = 1, voidReason = ?, voidedBy = ?, voidedAt = ? WHERE id = ?').run(
        reason, voidedBy, voidedAt, doseId
      );
    } else {
      for (const c of jsonData.children) {
        const d = (c.doses || []).find(x => x.id === doseId);
        if (d) { Object.assign(d, { voided: true, voidReason: reason, voidedBy, voidedAt }); saveJson(); break; }
      }
    }
  },

  insertSession(token, userId, at) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(token, userId, at);
    } else {
      jsonData.sessions.push({ token, userId, at });
      saveJson();
    }
  },

  findSession(token) {
    if (engine === 'sqlite') {
      return sqliteDb.prepare('SELECT token, userId, at FROM sessions WHERE token = ?').get(token) || null;
    }
    return jsonData.sessions.find(s => s.token === token) || null;
  },

  deleteSession(token) {
    if (engine === 'sqlite') {
      sqliteDb.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } else {
      const idx = jsonData.sessions.findIndex(s => s.token === token);
      if (idx !== -1) { jsonData.sessions.splice(idx, 1); saveJson(); }
    }
  },

  pruneSessions(maxAgeMs = 12 * 3600 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    if (engine === 'sqlite') {
      sqliteDb.prepare('DELETE FROM sessions WHERE at <= ?').run(cutoff);
    } else {
      jsonData.sessions = jsonData.sessions.filter(s => s && s.at > cutoff);
      saveJson();
    }
  },
};

module.exports = store;
