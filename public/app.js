// Nuvexa front end: hash-routed single page app, no build step.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let token = localStorage.getItem('nuvexa_token') || localStorage.getItem('vt'), me = null;

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { signOut(); }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
const fd = form => Object.fromEntries(new FormData(form));
const badge = s => `<span class="badge ${s}">${{ given: 'Given', due: 'Due now', overdue: 'Overdue', upcoming: 'Upcoming' }[s]}</span>`;
function onSubmit(sel, fn) {
  const f = $(sel); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const err = f.querySelector('.err'); if (err) err.textContent = '';
    try { await fn(fd(f), f); } catch (x) { if (err) err.textContent = x.message; else toast(x.message); }
  });
}
async function signOut() {
  try { await api('/logout', 'POST'); } catch {}
  token = null; me = null;
  localStorage.removeItem('nuvexa_token');
  localStorage.removeItem('vt');
  location.hash = '#/login';
  render();
}
$('#logout').onclick = signOut;

/* ---------- views ---------- */
function loginView(mode = 'login') {
  const reg = mode === 'register';
  document.title = (reg ? 'Register Facility' : 'Provider Sign In') + ' – Nuvexa';
  app.innerHTML = `<div class="card narrow"><h1>${reg ? 'Register your facility' : 'Provider sign in'}</h1>
  <form id="f">
    ${reg ? `<label>Your name</label><input name="name" required>
    <label>Facility</label><input name="facility" required>
    <label>Professional license number</label><input name="license" required>` : ''}
    <label>Email</label><input name="email" type="email" required autocomplete="username">
    <label>Password${reg ? ' (8+ characters)' : ''}</label><input name="password" type="password" required autocomplete="${reg ? 'new' : 'current'}-password">
    <div class="err"></div>
    <div class="actions"><button>${reg ? 'Request access' : 'Sign in'}</button>
    <button type="button" class="ghost" id="sw">${reg ? 'I have an account' : 'Register as provider'}</button></div>
  </form></div>`;
  $('#sw').onclick = () => loginView(reg ? 'login' : 'register');
  onSubmit('#f', async b => {
    if (reg) { const r = await api('/register', 'POST', b); toast(r.message); loginView('login'); return; }
    const r = await api('/login', 'POST', b);
    token = r.token; localStorage.setItem('nuvexa_token', token); me = r.user; location.hash = '#/'; render();
  });
}

async function dashboardView() {
  document.title = 'Overview – Nuvexa';
  const d = await api('/dashboard');
  app.innerHTML = `<h1>Overview</h1>
  <div class="grid">
    <div class="stat"><b>${d.children}</b><span>Children registered</span></div>
    <div class="stat"><b>${d.coverage}%</b><span>Doses given vs. doses due</span></div>
    <div class="stat ${d.withOverdue ? 'alert' : ''}"><b>${d.withOverdue}</b><span>Children with overdue vaccines</span></div>
    <div class="stat"><b>${d.dosesToday}</b><span>Doses recorded today</span></div>
  </div>
  <div class="card"><h2 style="margin-top:0">Follow-up list: overdue vaccines</h2>
  ${d.overdueList.length ? `<table><tr><th>Child</th><th>Guardian / phone</th><th>Overdue</th><th>Registered at</th></tr>
  ${d.overdueList.map(c => `<tr class="click" data-id="${c.id}"><td>${esc(c.name)}</td><td>${esc(c.guardian)}<br><span class="meta">${esc(c.phone)}</span></td>
  <td class="overdue">${c.vaccines.map(esc).join(', ')}</td><td>${esc(c.facility)}</td></tr>`).join('')}</table>` : '<p class="meta">No overdue vaccines. Register a newborn to start tracking.</p>'}</div>
  <div class="card"><h2 style="margin-top:0">Doses recorded by facility</h2>
  ${Object.keys(d.byFacility).length ? `<table>${Object.entries(d.byFacility).map(([f, n]) => `<tr><td>${esc(f)}</td><td>${n}</td></tr>`).join('')}</table>` : '<p class="meta">No doses recorded yet.</p>'}</div>`;
  app.querySelectorAll('tr.click').forEach(r => r.onclick = () => location.hash = '#/child/' + r.dataset.id);
}

async function childrenView() {
  document.title = 'Find Child – Nuvexa';
  app.innerHTML = `<h1>Find a child</h1>
  <form class="toolbar" id="sf"><input id="q" placeholder="Birth/government ID, child name or guardian" autofocus><button>Search</button></form>
  <div class="card" id="res"></div>`;
  const run = async () => {
    const list = await api('/children?q=' + encodeURIComponent($('#q').value));
    $('#res').innerHTML = list.length ? `<table><tr><th>Child</th><th>Birth ID</th><th>Born</th><th>Status</th></tr>
    ${list.map(c => `<tr class="click" data-id="${c.id}"><td>${esc(c.name)}<br><span class="meta">${esc(c.guardian)}</span></td><td>${esc(c.govId)}</td><td>${esc(c.dob)}</td>
    <td>${c.overdue ? `<span class="badge overdue">${c.overdue} overdue</span> ` : ''}${c.due ? `<span class="badge due">${c.due} due</span> ` : ''}<span class="meta">${c.given}/${c.total} given</span></td></tr>`).join('')}</table>`
      : '<p class="meta">No matching records. Check the ID, or <a href="#/new">register a newborn</a>.</p>';
    $('#res').querySelectorAll('tr.click').forEach(r => r.onclick = () => location.hash = '#/child/' + r.dataset.id);
  };
  $('#sf').onsubmit = e => { e.preventDefault(); run().catch(x => toast(x.message)); };
  run();
}

function newChildView() {
  document.title = 'Register Newborn – Nuvexa';
  const today = new Date().toISOString().slice(0, 10);
  app.innerHTML = `<h1>Register a newborn</h1><div class="card"><form id="f">
  <label>Birth certificate / government ID number</label><input name="govId" required placeholder="e.g. BC-2026-004521">
  <div class="row"><div><label>Child's full name</label><input name="name" required></div>
  <div><label>Date of birth</label><input name="dob" type="date" max="${today}" value="${today}" required></div></div>
  <div class="row"><div><label>Sex</label><select name="sex"><option>Female</option><option>Male</option></select></div>
  <div><label>Parent / guardian</label><input name="guardian" required></div></div>
  <label>Guardian phone</label><input name="phone" type="tel">
  <div class="err"></div>
  <div class="actions"><button>Verify ID and create record</button></div></form></div>`;
  onSubmit('#f', async b => { const c = await api('/children', 'POST', b); toast('Record created'); location.hash = '#/child/' + c.id; });
}

async function childView(id) {
  const c = await api('/children/' + id);
  document.title = `${c.name} – Nuvexa`;
  const today = new Date().toISOString().slice(0, 10);
  const age = c.ageDays < 90 ? `${c.ageDays} days` : `${Math.floor(c.ageDays / 30.4)} months`;
  app.innerHTML = `<h1>${esc(c.name)}</h1>
  <div class="card"><div class="facts">
    <div><b>Birth / government ID</b>${esc(c.govId)} <span class="badge given">Verified</span></div>
    <div><b>Date of birth</b>${esc(c.dob)} (${age} old)</div><div><b>Sex</b>${esc(c.sex)}</div>
    <div><b>Guardian</b>${esc(c.guardian)} ${esc(c.phone)}</div>
    <div><b>Registered at</b>${esc(c.facility)}</div></div>
    <div class="actions"><button class="ghost small" onclick="print()">Print vaccination card</button></div></div>
  <div class="card"><h2 style="margin-top:0">Immunization schedule</h2>
  <table><tr><th>Vaccine</th><th>Due</th><th>Status</th><th>Given</th><th></th></tr>
  ${c.schedule.map(v => `<tr><td>${esc(v.name)}${v.dose ? ` (dose ${v.dose})` : ' (birth dose)'}</td><td>${esc(v.dueDate)}</td><td>${badge(v.status)}</td>
  <td>${v.record ? `${esc(v.record.date)}<br><span class="meta">${esc(v.record.facility)} · ${esc(v.record.by)}${v.record.lot ? ' · lot ' + esc(v.record.lot) : ''}</span>` : ''}</td>
  <td>${v.record ? `<button class="small ghost" data-void="${v.record.id}">Correct</button>` : `<button class="small" data-give="${v.code}">Record</button>`}</td></tr>`).join('')}</table></div>
  ${c.doses.some(d => d.voided) ? `<div class="card"><h2 style="margin-top:0">Corrected entries (kept for audit)</h2><table>
  ${c.doses.filter(d => d.voided).map(d => `<tr class="voided"><td>${esc(d.code)} on ${esc(d.date)} at ${esc(d.facility)}</td><td>${esc(d.voidReason)} — ${esc(d.voidedBy)}</td></tr>`).join('')}</table></div>` : ''}
  <div class="card" id="dlg" hidden></div>`;
  const dlg = $('#dlg');
  app.querySelectorAll('[data-give]').forEach(b => b.onclick = () => {
    const v = c.schedule.find(x => x.code === b.dataset.give);
    dlg.hidden = false;
    dlg.innerHTML = `<h2 style="margin-top:0">Record ${esc(v.name)}${v.dose ? ' dose ' + v.dose : ''}</h2><form id="g">
    <div class="row"><div><label>Date given</label><input name="date" type="date" min="${c.dob}" max="${today}" value="${today}" required></div>
    <div><label>Vaccine lot number</label><input name="lot"></div></div>
    <label>Notes (reactions, site)</label><textarea name="notes" rows="2"></textarea><div class="err"></div>
    <div class="actions"><button>Save dose</button><button type="button" class="ghost" id="cx">Cancel</button></div></form>`;
    dlg.scrollIntoView({ behavior: 'smooth' });
    $('#cx').onclick = () => dlg.hidden = true;
    onSubmit('#g', async f => { await api(`/children/${id}/doses`, 'POST', { ...f, code: v.code }); toast('Dose recorded'); childView(id); });
  });
  app.querySelectorAll('[data-void]').forEach(b => b.onclick = () => {
    dlg.hidden = false;
    dlg.innerHTML = `<h2 style="margin-top:0">Correct an entry</h2><p class="meta">The entry stays in the audit history but no longer counts as given.</p><form id="g">
    <label>Reason for correction</label><input name="reason" required><div class="err"></div>
    <div class="actions"><button class="danger">Void entry</button><button type="button" class="ghost" id="cx">Cancel</button></div></form>`;
    dlg.scrollIntoView({ behavior: 'smooth' });
    $('#cx').onclick = () => dlg.hidden = true;
    onSubmit('#g', async f => { await api(`/children/${id}/doses/${b.dataset.void}/void`, 'POST', f); toast('Entry voided'); childView(id); });
  });
}

async function adminView() {
  document.title = 'Administration – Nuvexa';
  if (me.role !== 'admin') { app.innerHTML = '<p>Administrators only.</p>'; return; }
  const [users, audit] = await Promise.all([api('/admin/users'), api('/admin/audit')]);
  app.innerHTML = `<h1>Administration</h1><div class="card"><h2 style="margin-top:0">Providers</h2><table>
  <tr><th>Name</th><th>Facility / license</th><th>Status</th><th></th></tr>
  ${users.map(u => `<tr><td>${esc(u.name)}<br><span class="meta">${esc(u.email)}</span></td><td>${esc(u.facility)}<br><span class="meta">${esc(u.license)}</span></td>
  <td>${u.approved ? '<span class="badge given">Approved</span>' : '<span class="badge due">Pending</span>'}</td>
  <td>${u.role === 'admin' ? '' : `<button class="small ${u.approved ? 'ghost' : ''}" data-u="${u.id}" data-a="${!u.approved}">${u.approved ? 'Revoke' : 'Approve'}</button>`}</td></tr>`).join('')}</table></div>
  <div class="card"><h2 style="margin-top:0">Audit log (latest 100)</h2><table>
  ${audit.map(a => `<tr><td class="meta">${new Date(a.at).toLocaleString()}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}<br><span class="meta">${esc(a.by)}</span></td></tr>`).join('')}</table></div>`;
  app.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => {
    await api(`/admin/users/${b.dataset.u}/approve`, 'POST', { approve: b.dataset.a === 'true' }); adminView();
  });
}

/* ---------- router ---------- */
async function render() {
  const h = location.hash || '#/';
  if (!token) { $('#top').hidden = true; return loginView(); }
  try { if (!me) me = (await api('/me')).user; } catch { return loginView(); }
  $('#top').hidden = false;
  $('#who').textContent = `${me.name} · ${me.facility}`;
  const tabs = [['#/', 'Overview'], ['#/children', 'Find child'], ['#/new', 'Register newborn'], ...(me.role === 'admin' ? [['#/admin', 'Admin']] : [])];
  $('#nav').innerHTML = tabs.map(([href, t]) => `<a href="${href}" class="${h === href ? 'on' : ''}">${t}</a>`).join('');
  try {
    if (h === '#/children') await childrenView();
    else if (h === '#/new') newChildView();
    else if (h === '#/admin') await adminView();
    else if (h.startsWith('#/child/')) await childView(h.slice(8));
    else await dashboardView();
  } catch (e) { app.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; }
}
addEventListener('hashchange', render);
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const dlg = $('#dlg');
    if (dlg && !dlg.hidden) dlg.hidden = true;
  }
});
render();
