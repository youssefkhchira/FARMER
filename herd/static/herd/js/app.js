
(() => {
'use strict';

/* ================= i18n ================= */
const T = window.HERDBOOK_TRANSLATIONS;

/* ================= constants ================= */
const SP = window.HERDBOOK_SPECIES;
const STATUSES = window.HERDBOOK_STATUSES;
const EVT = window.HERDBOOK_EVENT_COLORS;
const HT = window.HERDBOOK_HEALTH_TYPES;
const SEG = window.HERDBOOK_CHART_COLORS;

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const mem = {};
const store = {
 get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? JSON.parse(mem[k]) : d; } },
 set(k, v) { const s = JSON.stringify(v); try { localStorage.setItem(k, s); } catch (e) { mem[k] = s; } },
 del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
};

function csrfToken() {
 const cookie = document.cookie.split('; ').find(item => item.startsWith('csrftoken='));
 return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : '';
}
async function api(path, options = {}) {
 const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
 if (options.method && options.method !== 'GET') headers['X-CSRFToken'] = csrfToken();
 const response = await fetch(path, {
  ...options, headers, credentials: 'same-origin',
  body: options.body === undefined ? undefined : JSON.stringify(options.body)
 });
 let payload;
 try { payload = await response.json(); }
 catch (error) { throw new Error('The server returned an unreadable response.'); }
 if (!response.ok) {
  const detail = payload.error;
  const error = new Error(typeof detail === 'string' ? detail : Object.values(detail || {}).flat().join(' '));
  error.status = response.status;
  throw error;
 }
 return payload;
}
let persistence = Promise.resolve();
function save() {
 if (!S.user || !S.data) return Promise.resolve();
 const snapshot = JSON.parse(JSON.stringify(S.data));
 const operation = persistence.catch(() => {}).then(() =>
  api('/api/data/', { method: 'PUT', body: snapshot })
 );
 persistence = operation.catch(error => { toast(error.message); });
 operation.catch(() => {});
 return operation;
}

const S = {
 lang: store.get('hb:lang', 'en'), user: null, data: null, view: 'dashboard', authMode: 'login',
 filter: { q: '', species: 'all', status: 'all' },
 cal: { y: new Date().getFullYear(), m: new Date().getMonth(), sel: today() }
};

function t(k, v) {
 let s = (T[S.lang] && T[S.lang][k]) || T.en[k] || k;
 if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
 return s;
}
const loc = () => ({ en: 'en-GB', fr: 'fr-FR', ar: 'ar-TN-u-nu-latn' })[S.lang];
const fmt = (s, o = { day: 'numeric', month: 'short', year: 'numeric' }) => s ? new Intl.DateTimeFormat(loc(), o).format(parse(s)) : '—';

function age(dob) {
 if (!dob) return '—';
 const b = parse(dob), n = new Date();
 let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
 if (n.getDate() < b.getDate()) m--;
 if (m < 0) m = 0;
 if (m >= 12) { const y = Math.floor(m / 12), r = m % 12; return y + ' ' + t('u_y') + (r ? ' ' + r + ' ' + t('u_m') : ''); }
 if (m >= 1) return m + ' ' + t('u_m');
 return Math.max(0, Math.floor((n - b) / 864e5)) + ' ' + t('u_d');
}

const ic = p => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const IC = {
 dashboard: ic('<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>'),
 animals: ic('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
 health: ic('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
 calendar: ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
 settings: ic('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
 plus: ic('<path d="M12 5v14M5 12h14"/>'), x: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
 search: ic('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
 left: ic('<path d="m15 18-6-6 6-6"/>'), right: ic('<path d="m9 18 6-6-6-6"/>'),
 logout: ic('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')
};

/* ================= data layer ================= */
const isActive = a => a.status !== 'sold' && a.status !== 'deceased';
const A = id => S.data.animals.find(a => a.id === id);
const emptyData = () => ({ animals: [], events: [], health: [] });

function nextTag(sp) {
 const c = SP[sp].c; let max = 0;
 S.data.animals.forEach(a => { const m = a.tag.match(new RegExp('^' + c + '-(\\d+)$')); if (m) max = Math.max(max, +m[1]); });
 return c + '-' + String(max + 1).padStart(3, '0');
}

function applyStatus(a, ns) {
 const old = a.status; a.status = ns;
 if (ns === 'ill' && old !== 'ill' && !S.data.health.some(h => h.animalId === a.id && h.type === 'illness' && !h.resolved))
  S.data.health.push({ id: uid(), animalId: a.id, date: today(), type: 'illness', title: '', notes: '', resolved: false });
 if (old === 'ill' && ns !== 'ill') recoverRecords(a.id);
}
function recoverRecords(id) {
 S.data.health.forEach(h => { if (h.animalId === id && h.type === 'illness' && !h.resolved) { h.resolved = true; h.resolvedOn = today(); } });
}

function eventsOn(d) {
 const r = S.data.events.filter(e => e.date === d).map(e => ({ ...e, kind: 'user' }));
 const md = d.slice(5), y = +d.slice(0, 4);
 S.data.animals.forEach(a => {
  if (isActive(a) && a.dob && a.dob.slice(5) === md && +a.dob.slice(0, 4) < y)
   r.push({ id: 'b' + a.id, date: d, type: 'birthday', title: t('c_birthday', { n: a.tag + (a.name ? ' ' + a.name : '') }), animalId: a.id, kind: 'auto' });
 });
 return r;
}

/* ================= auth ================= */
function acceptSession(payload) {
 S.user = payload.user;
 S.data = payload.data || emptyData();
 S.view = 'dashboard';
}

/* ================= view helpers ================= */
function sel(name, opts, val, extra = '') {
 return `<select name="${name}" ${extra}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
const badge = s => `<span class="badge st-${s}">${t('st_' + s)}</span>`;
const tagEl = (a, c = '') => `<span class="tag ${c}">${esc(a.tag)}</span>`;
const langSwitch = () => `<div class="lang" role="group" aria-label="Language">${[['en', 'EN'], ['fr', 'FR'], ['ar', 'عربي']].map(([l, n]) => `<button data-act="lang" data-l="${l}" class="${S.lang === l ? 'on' : ''}" ${S.lang === l ? 'aria-pressed="true"' : ''}>${n}</button>`).join('')}</div>`;
const empty = (title, text, btn) => `<div class="empty"><h2>${title}</h2><p>${text}</p>${btn || ''}</div>`;

function evRow(e, showDate) {
 const a = e.animalId ? A(e.animalId) : null;
 const meta = [t('ev_' + e.type), a ? a.tag : '', showDate ? fmt(e.date, { day: 'numeric', month: 'short' }) : ''].filter(Boolean).join(', ');
 return `<div class="ev ${e.done ? 'done' : ''}"><span class="dot ${EVT[e.type] || 'o'}"></span><div class="evt"><b>${esc(e.title)}</b><small>${esc(meta)}</small></div>` +
  (e.kind === 'user' ? `<button class="btn sm ghost" data-act="ev-done" data-id="${e.id}">${e.done ? t('c_undo') : t('c_done')}</button><button class="ic-btn" data-act="ev-del" data-id="${e.id}" aria-label="${t('delete')}">${IC.x}</button>` : '') + `</div>`;
}

/* ================= views ================= */
function authView() {
 const reg = S.authMode === 'register';
 return `<div class="auth">
 <section class="auth-side"><div class="brand">${IC.animals}<span>Herdbook</span></div><h2>${t('side_title')}</h2><p>${t('side_text')}</p>
  <div class="hang" aria-hidden="true">SHE-014<small>Nour</small></div></section>
 <section class="auth-form">
  <div class="tabs" role="tablist"><button role="tab" data-act="authmode" data-m="login" class="${reg ? '' : 'on'}">${t('signin')}</button><button role="tab" data-act="authmode" data-m="register" class="${reg ? 'on' : ''}">${t('register')}</button></div>
  <form data-form="${reg ? 'register' : 'login'}" novalidate>
   ${reg ? `<div class="fld"><label for="a-n">${t('full_name')}</label><input id="a-n" name="name" autocomplete="name"></div><div class="fld"><label for="a-f">${t('farm_name')}</label><input id="a-f" name="farm"></div>` : ''}
   <div class="fld"><label for="a-e">${t('email')}</label><input id="a-e" name="email" type="email" dir="ltr" autocomplete="email"></div>
   <div class="fld"><label for="a-p">${t('password')}</label><input id="a-p" name="password" type="password" dir="ltr" autocomplete="${reg ? 'new-password' : 'current-password'}">${reg ? `<small>${t('pw_hint')}</small>` : ''}</div>
   <button class="btn" type="submit">${reg ? t('register') : t('signin')}</button>
   <p class="err" id="ferr" role="alert"></p>
  </form>
  <p class="note">${t('auth_note')}</p>${langSwitch()}
 </section></div>`;
}

function shell() {
 const items = ['dashboard', 'animals', 'health', 'calendar', 'settings'].map(v =>
  `<button class="nav ${S.view === v ? 'on' : ''}" data-act="nav" data-v="${v}" ${S.view === v ? 'aria-current="page"' : ''}>${IC[v]}<span>${t('n_' + v)}</span></button>`).join('');
 return `<div class="shell"><aside class="side"><div class="brand">${IC.animals}<span>Herdbook</span></div><div class="farm">${esc(S.user.farm)}</div><nav>${items}</nav>
 <div class="side-foot">${langSwitch()}<button class="nav" data-act="logout">${IC.logout}<span>${t('logout')}</span></button></div></aside>
 <main class="main" id="main"><header class="topbar"><div class="brand">${IC.animals}<span>Herdbook</span></div>${langSwitch()}</header>${view()}</main>
 <nav class="bottom" aria-label="Main">${items}</nav></div>`;
}

function view() {
 return { dashboard: vDash, animals: vAnimals, health: vHealth, calendar: vCal, settings: vSettings }[S.view]();
}

/* ---- dashboard ---- */
function vDash() {
 const act = S.data.animals.filter(isActive), total = act.length;
 const ill = act.filter(a => a.status === 'ill'), preg = act.filter(a => a.status === 'pregnant').length;
 const t0 = today(), d30 = addDays(t0, -30);
 const born = act.filter(a => a.dob && a.dob >= d30 && a.dob <= t0).length;
 const by = {};
 act.forEach(a => { (by[a.species] = by[a.species] || { n: 0 }).n++; });
 const keys = Object.keys(by).sort((a, b) => by[b].n - by[a].n);
 const head = `<div class="head"><div><h1>${esc(S.user.farm)}</h1><p>${t('hello', { n: esc(S.user.name) })}</p></div><button class="btn" data-act="add-animal">${IC.plus}${t('a_add')}</button></div>`;
 if (!S.data.animals.length) return head + empty(t('d_empty_title'), t('d_empty_text'), `<button class="btn" data-act="add-animal">${IC.plus}${t('a_add')}</button>`);

 const hero = `<section class="herd"><div class="top"><div><div class="n">${total}</div><div class="sub">${t('d_animals')}</div></div>
  <div class="facts"><div><b>${ill.length}</b>${t('d_ill')}</div><div><b>${preg}</b>${t('d_preg')}</div><div><b>${born}</b>${t('d_born')}</div></div></div>
  ${total ? `<div class="bar" role="img" aria-label="${t('d_species')}">${keys.map((k, i) => `<i style="width:${by[k].n / total * 100}%;background:${SEG[i % SEG.length]}"></i>`).join('')}</div>
  <div class="legend">${keys.map((k, i) => `<span><s style="background:${SEG[i % SEG.length]}"></s>${SP[k].i} ${t('sp_' + k)} <b>${by[k].n}</b></span>`).join('')}</div>` : ''}</section>`;

 const overdue = S.data.events.filter(e => !e.done && e.date < t0).sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ ...e, kind: 'user' }));
 const todayEv = eventsOn(t0).filter(e => !e.done);
 const illRows = ill.map(a => {
  const r = S.data.health.filter(h => h.animalId === a.id && h.type === 'illness' && !h.resolved).sort((x, y) => y.date.localeCompare(x.date))[0];
  return `<div class="row-item">${tagEl(a)}<div class="grow"><b>${esc(a.name || t('sp_' + a.species))}</b><small>${r ? esc(t('d_ill_since', { d: fmt(r.date, { day: 'numeric', month: 'short' }) })) + (r.title ? ', ' + esc(r.title) : '') : ''}</small></div><button class="btn sm ghost" data-act="open" data-id="${a.id}">${t('n_animals')}</button></div>`;
 }).join('');
 const attn = illRows + overdue.slice(0, 5).map(e => evRow(e, true)).join('') + todayEv.map(e => evRow(e, false)).join('');
 const up = [];
 for (let i = 0; i < 14 && up.length < 10; i++) { const d = addDays(t0, i); eventsOn(d).filter(e => !e.done).forEach(e => up.push({ ...e, date: d })); }

 return head + hero + `<div class="grid2">
  <section class="card"><h2>${t('d_attention')}</h2>${attn || `<p><small>${t('d_none_attention')}</small></p>`}</section>
  <section class="card"><h2>${t('d_upcoming')}</h2>${up.length ? up.map(e => evRow(e, true)).join('') : `<p><small>${t('d_none_upcoming')}</small></p>`}</section></div>`;
}

/* ---- animals ---- */
function vAnimals() {
 const f = S.filter;
 return `<div class="head"><h1>${t('n_animals')}</h1><button class="btn" data-act="add-animal">${IC.plus}${t('a_add')}</button></div>
 <div class="tools"><label class="search">${IC.search}<input id="q" type="search" aria-label="${esc(t('a_search'))}" placeholder="${esc(t('a_search'))}" value="${esc(f.q)}"></label>
 ${sel('species', [['all', t('a_all_species')], ...Object.keys(SP).map(k => [k, SP[k].i + ' ' + t('sp_' + k)])], f.species, 'id="fsp" aria-label="' + esc(t('f_species')) + '"')}
 ${sel('status', [['all', t('a_all_status')], ...STATUSES.map(s => [s, t('st_' + s)])], f.status, 'id="fst" aria-label="' + esc(t('f_status')) + '"')}</div>
 <div id="alist">${animalList()}</div>`;
}
function animalList() {
 const f = S.filter, q = f.q.trim().toLowerCase();
 const list = S.data.animals.filter(a => (f.species === 'all' || a.species === f.species) && (f.status === 'all' || a.status === f.status) &&
  (!q || [a.tag, a.name, a.breed].some(x => (x || '').toLowerCase().includes(q))))
  .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
 if (!S.data.animals.length) return empty(t('d_empty_title'), t('d_empty_text'), `<button class="btn" data-act="add-animal">${IC.plus}${t('a_add')}</button>`);
 if (!list.length) return `<div class="empty">${t('a_none')}</div>`;
 return `<p class="count">${t('a_count', { n: list.length })}</p>` + list.map(a => `<button class="arow" data-act="open" data-id="${a.id}">
  ${tagEl(a)}<span class="an"><b>${esc(a.name || '—')}</b><small>${SP[a.species].i} ${t('sp_' + a.species)}${a.breed ? ', ' + esc(a.breed) : ''}, ${t('sex_' + a.sex)}</small></span>
  <span class="dobc">${fmt(a.dob)}<small>${a.dob ? t('age') + ': ' + age(a.dob) : ''}</small></span>${badge(a.status)}</button>`).join('');
}

function animalForm(a) {
 const isNew = !a; a = a || { species: 'rabbit', sex: 'female', status: 'healthy', tag: nextTag('rabbit') };
 return `<form data-form="animal" data-id="${a.id || ''}" novalidate>
 <div class="dh"><h2>${isNew ? t('a_add') : t('edit')}</h2><button type="button" class="ic-btn" data-act="close" aria-label="${t('close')}">${IC.x}</button></div>
 <div class="fg">
  <div class="fld"><label for="f-sp">${t('f_species')}</label>${sel('species', Object.keys(SP).map(k => [k, SP[k].i + ' ' + t('sp_' + k)]), a.species, 'id="f-sp"')}</div>
  <div class="fld"><label for="f-tag">${t('f_tag')}</label><input id="f-tag" name="tag" value="${esc(a.tag)}" data-auto="${isNew ? 1 : 0}" autocomplete="off" dir="ltr"></div>
  <div class="fld"><label for="f-n">${t('f_name')}</label><input id="f-n" name="name" value="${esc(a.name)}"></div>
  <div class="fld"><label for="f-sx">${t('f_sex')}</label>${sel('sex', [['female', t('sex_female')], ['male', t('sex_male')]], a.sex, 'id="f-sx"')}</div>
  <div class="fld"><label for="f-b">${t('f_breed')}</label><input id="f-b" name="breed" value="${esc(a.breed)}"></div>
  <div class="fld"><label for="f-d">${t('f_dob')}</label><input id="f-d" name="dob" type="date" max="${today()}" value="${esc(a.dob)}"></div>
  <div class="fld"><label for="f-w">${t('f_weight')}</label><input id="f-w" name="weight" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(a.weight)}"></div>
  <div class="fld"><label for="f-st">${t('f_status')}</label>${sel('status', STATUSES.map(s => [s, t('st_' + s)]), a.status, 'id="f-st"')}</div>
  <div class="fld"><label for="f-m">${t('f_mother')}</label><input id="f-m" name="mother" value="${esc(a.mother)}" dir="ltr"></div>
  <div class="fld"><label for="f-f">${t('f_father')}</label><input id="f-f" name="father" value="${esc(a.father)}" dir="ltr"></div>
  <div class="fld full"><label for="f-nt">${t('f_notes')}</label><textarea id="f-nt" name="notes">${esc(a.notes)}</textarea></div>
 </div><p class="err" id="ferr" role="alert"></p>
 <div class="acts"><button class="btn" type="submit">${t('save')}</button><button class="btn ghost" type="button" data-act="close">${t('cancel')}</button></div></form>`;
}

function animalDetail(id) {
 const a = A(id); if (!a) return closeModal();
 const recs = S.data.health.filter(h => h.animalId === id).sort((x, y) => y.date.localeCompare(x.date));
 const fact = (l, v) => `<div><small>${l}</small><b>${v || '—'}</b></div>`;
 openModal(`<div class="dh">${tagEl(a, 'lg')}<button class="ic-btn" data-act="close" aria-label="${t('close')}">${IC.x}</button></div>
 <h2>${esc(a.name || t('sp_' + a.species))}</h2><div style="margin-top:8px">${badge(a.status)}</div>
 <div class="facts-l">
  ${fact(t('f_species'), SP[a.species].i + ' ' + t('sp_' + a.species))}${fact(t('f_sex'), t('sex_' + a.sex))}
  ${fact(t('f_breed'), esc(a.breed))}${fact(t('f_dob'), a.dob ? fmt(a.dob) + ' (' + age(a.dob) + ')' : '')}
  ${fact(t('f_weight'), a.weight ? esc(a.weight) + ' kg' : '')}${fact(t('f_mother') + ' / ' + t('f_father'), esc(a.mother || '—') + ' / ' + esc(a.father || '—'))}
 </div>
 ${a.notes ? `<p>${esc(a.notes)}</p>` : ''}
 <div class="acts"><button class="btn ghost" data-act="edit-animal" data-id="${id}">${t('edit')}</button>
  ${a.status === 'ill' ? `<button class="btn" data-act="recover" data-id="${id}">${t('mark_healthy')}</button>` : isActive(a) ? `<button class="btn dark" data-act="set-ill" data-id="${id}">${t('mark_ill')}</button>` : ''}
  <button class="btn ghost" data-act="add-health" data-id="${id}">${t('add_record')}</button>
  <button class="btn danger" data-act="del-animal" data-id="${id}">${t('delete')}</button></div>
 <div class="sec"><h2>${t('h_history')}</h2>${recs.length ? recs.map(h => hRow(h, false)).join('') : `<p><small>${t('h_none')}</small></p>`}</div>`);
}

/* ---- health ---- */
function hRow(h, showTag = true) {
 const a = A(h.animalId);
 return `<div class="hrow"><div class="hd">${fmt(h.date)}</div><div class="hb"><div class="top"><span class="badge ${h.type === 'illness' ? 'st-ill' : 'st-healthy'}">${t('ht_' + h.type)}</span>${showTag && a ? tagEl(a, 'sm') : ''}</div>
 <b>${esc(h.title || '')}</b>${h.notes ? `<small>${esc(h.notes)}</small>` : ''}${h.type === 'illness' && h.resolved ? `<small>${t('h_recovered_on', { d: fmt(h.resolvedOn) })}</small>` : ''}</div>
 <button class="ic-btn" data-act="del-health" data-id="${h.id}" aria-label="${t('delete')}">${IC.x}</button></div>`;
}
function vHealth() {
 const ill = S.data.animals.filter(a => a.status === 'ill');
 const log = [...S.data.health].sort((x, y) => y.date.localeCompare(x.date));
 return `<div class="head"><h1>${t('n_health')}</h1><button class="btn" data-act="add-health">${IC.plus}${t('h_add')}</button></div>
 <section class="card"><h2>${t('h_ill_now')} (${ill.length})</h2>${ill.length ? ill.map(a => {
  const r = S.data.health.filter(h => h.animalId === a.id && h.type === 'illness' && !h.resolved).sort((x, y) => y.date.localeCompare(x.date))[0];
  return `<div class="row-item">${tagEl(a)}<div class="grow"><b>${esc(a.name || t('sp_' + a.species))}</b><small>${r ? esc(t('d_ill_since', { d: fmt(r.date) })) + (r.title ? ', ' + esc(r.title) : '') : ''}</small></div>
  <button class="btn sm ghost" data-act="add-health" data-id="${a.id}" data-type="treatment">${t('ht_treatment')}</button><button class="btn sm" data-act="recover" data-id="${a.id}">${t('mark_healthy')}</button></div>`;
 }).join('') : `<p><small>${t('h_none_ill')}</small></p>`}</section>
 <section class="card sec"><h2>${t('h_log')}</h2>${log.length ? log.map(h => hRow(h)).join('') : `<p><small>${t('h_none')}</small></p>`}</section>`;
}
function healthForm(id, type) {
 const list = S.data.animals.filter(isActive).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
 if (!list.length) return toast(t('h_no_animals'));
 type = type || 'illness';
 openModal(`<form data-form="health" novalidate><div class="dh"><h2>${t('h_add')}</h2><button type="button" class="ic-btn" data-act="close" aria-label="${t('close')}">${IC.x}</button></div>
 <div class="fg">
  <div class="fld"><label for="h-a">${t('h_animal')}</label>${sel('animalId', [['', t('h_pick')], ...list.map(a => [a.id, a.tag + (a.name ? ' — ' + a.name : '')])], id || '', 'id="h-a"')}</div>
  <div class="fld"><label for="h-t">${t('h_type')}</label>${sel('type', HT.map(x => [x, t('ht_' + x)]), type, 'id="h-t"')}</div>
  <div class="fld"><label for="h-d">${t('h_date')}</label><input id="h-d" name="date" type="date" value="${today()}"></div>
  <div class="fld"><label for="h-ti">${t('h_title')}</label><input id="h-ti" name="title"></div>
  <div class="fld full"><label for="h-n">${t('h_notes')}</label><textarea id="h-n" name="notes"></textarea></div>
  <div class="fld full"><label for="h-nx">${t('h_next')}</label><input id="h-nx" name="next" type="date"></div>
  <label class="chk full ${type === 'illness' ? '' : 'hide'}" id="h-ill"><input type="checkbox" name="setIll" checked>${t('h_set_ill')}</label>
 </div><p class="err" id="ferr" role="alert"></p>
 <div class="acts"><button class="btn" type="submit">${t('save')}</button><button class="btn ghost" type="button" data-act="close">${t('cancel')}</button></div></form>`);
}

/* ---- calendar ---- */
function vCal() {
 const { y, m } = S.cal, ym = y + '-' + pad(m + 1);
 if (!S.cal.sel || S.cal.sel.slice(0, 7) !== ym) S.cal.sel = today().slice(0, 7) === ym ? today() : ym + '-01';
 const lead = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
 const wd = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(loc(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
 let cells = wd.map(w => `<div class="wd">${esc(w)}</div>`).join('') + '<div></div>'.repeat(lead);
 for (let d = 1; d <= dim; d++) {
  const ds = ym + '-' + pad(d), evs = eventsOn(ds), dots = [...new Set(evs.map(e => EVT[e.type] || 'o'))].slice(0, 3);
  cells += `<button class="day ${ds === today() ? 'today' : ''} ${ds === S.cal.sel ? 'sel' : ''}" data-act="day" data-d="${ds}" aria-label="${esc(fmt(ds))}${evs.length ? ', ' + evs.length : ''}"><span>${d}</span><span class="dots">${dots.map(c => `<i class="dot ${c}"></i>`).join('')}</span></button>`;
 }
 const dayEv = eventsOn(S.cal.sel);
 const up = []; for (let i = 0; i < 30 && up.length < 8; i++) { const d = addDays(today(), i); eventsOn(d).filter(e => !e.done).forEach(e => up.push({ ...e, date: d })); }
 return `<div class="head"><h1>${t('n_calendar')}</h1><button class="btn" data-act="add-event" data-d="${S.cal.sel}">${IC.plus}${t('c_add')}</button></div>
 <section class="card"><div class="calhead"><h2>${esc(new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(new Date(y, m, 1)))}</h2>
  <div class="calnav"><button class="btn sm ghost" data-act="cal-today">${t('c_today')}</button><button class="ic-btn" data-act="cal-prev" aria-label="‹">${IC.left.replace('class="ic"', 'class="ic flip"')}</button><button class="ic-btn" data-act="cal-next" aria-label="›">${IC.right.replace('class="ic"', 'class="ic flip"')}</button></div></div>
  <div class="cal">${cells}</div></section>
 <div class="grid2"><section class="card"><h2>${esc(fmt(S.cal.sel, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>${dayEv.length ? dayEv.map(e => evRow(e, false)).join('') : `<p><small>${t('c_no_events')}</small></p>`}
  <div class="acts"><button class="btn sm ghost" data-act="add-event" data-d="${S.cal.sel}">${IC.plus}${t('c_add')}</button></div></section>
 <section class="card"><h2>${t('c_upcoming')}</h2>${up.length ? up.map(e => evRow(e, true)).join('') : `<p><small>${t('d_none_upcoming')}</small></p>`}</section></div>`;
}
function eventForm(date) {
 const list = S.data.animals.filter(isActive).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
 openModal(`<form data-form="event" novalidate><div class="dh"><h2>${t('c_add')}</h2><button type="button" class="ic-btn" data-act="close" aria-label="${t('close')}">${IC.x}</button></div>
 <div class="fg">
  <div class="fld"><label for="e-t">${t('c_type')}</label>${sel('type', Object.keys(EVT).filter(k => k !== 'birthday').map(k => [k, t('ev_' + k)]), 'vaccination', 'id="e-t"')}</div>
  <div class="fld"><label for="e-d">${t('c_date')}</label><input id="e-d" name="date" type="date" value="${date || today()}"></div>
  <div class="fld full"><label for="e-ti">${t('c_title')}</label><input id="e-ti" name="title"></div>
  <div class="fld full"><label for="e-a">${t('c_animal')}</label>${sel('animalId', [['', t('c_none')], ...list.map(a => [a.id, a.tag + (a.name ? ' — ' + a.name : '')])], '', 'id="e-a"')}</div>
  <div class="fld full"><label for="e-n">${t('c_notes')}</label><textarea id="e-n" name="notes"></textarea></div>
  <label class="chk full hide" id="e-birth"><input type="checkbox" name="autoBirth" checked>${t('c_auto_birth')}</label>
 </div><p class="err" id="ferr" role="alert"></p>
 <div class="acts"><button class="btn" type="submit">${t('save')}</button><button class="btn ghost" type="button" data-act="close">${t('cancel')}</button></div></form>`);
}

/* ---- settings ---- */
function vSettings() {
 return `<div class="head"><h1>${t('n_settings')}</h1></div>
 <section class="card"><h2>${t('s_profile')}</h2><form data-form="profile" novalidate><div class="fg">
  <div class="fld"><label for="p-n">${t('full_name')}</label><input id="p-n" name="name" value="${esc(S.user.name)}"></div>
  <div class="fld"><label for="p-f">${t('farm_name')}</label><input id="p-f" name="farm" value="${esc(S.user.farm)}"></div></div>
  <div class="acts"><button class="btn" type="submit">${t('save')}</button></div></form></section>
 <section class="card sec"><h2>${t('s_language')}</h2>${langSwitch()}</section>
 <section class="card sec"><h2>${t('s_data')}</h2><p><small>${t('s_local_note')}</small></p>
  <div class="acts"><button class="btn" data-act="export">${t('s_export')}</button>
  <label class="btn ghost" style="cursor:pointer">${t('s_import')}<input type="file" id="imp" accept="application/json,.json" hidden></label>
  <button class="btn ghost" data-act="csv">${t('s_csv')}</button>
  <button class="btn danger" data-act="reset">${t('s_reset')}</button></div></section>
 <div class="acts sec"><button class="btn dark" data-act="logout">${IC.logout}${t('logout')}</button></div>`;
}

/* ================= modal / toast / render ================= */
function openModal(html) {
 $('#modal').innerHTML = `<div class="ov" data-act="ov"><div class="dlg" role="dialog" aria-modal="true">${html}</div></div>`;
 const f = $('#modal input:not([type=hidden]),#modal select,#modal textarea') || $('#modal button');
 if (f) f.focus();
}
function closeModal() { $('#modal').innerHTML = ''; }
let tt;
function toast(msg) { const el = $('#toast'); el.firstElementChild.textContent = msg; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2200); }

function render() {
 document.documentElement.lang = S.lang;
 document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
 document.title = 'Herdbook – ' + (S.user ? S.user.farm : t('tagline'));
 $('#app').innerHTML = S.user ? shell() : authView();
}
function download(name, text, type) {
 const a = document.createElement('a');
 a.href = URL.createObjectURL(new Blob([text], { type }));
 a.download = name; document.body.appendChild(a); a.click(); a.remove();
 setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= events ================= */
document.addEventListener('click', e => {
 const el = e.target.closest('[data-act]'); if (!el) return;
 const act = el.dataset.act, id = el.dataset.id;
 if (act === 'ov') { if (e.target === el) closeModal(); return; }
 switch (act) {
  case 'close': closeModal(); break;
  case 'lang': S.lang = el.dataset.l; store.set('hb:lang', S.lang); render(); break;
  case 'authmode': S.authMode = el.dataset.m; render(); break;
  case 'nav': S.view = el.dataset.v; render(); window.scrollTo(0, 0); break;
  case 'logout':
   persistence.then(() => api('/api/logout/', { method: 'POST', body: {} })).catch(error => toast(error.message));
   S.user = null; S.data = null; S.authMode = 'login'; render(); break;
  case 'add-animal': openModal(animalForm()); break;
  case 'edit-animal': openModal(animalForm(A(id))); break;
  case 'open': animalDetail(id); break;
  case 'del-animal':
   if (confirm(t('confirm_del'))) {
    S.data.animals = S.data.animals.filter(a => a.id !== id);
    S.data.health = S.data.health.filter(h => h.animalId !== id);
    S.data.events = S.data.events.filter(v => v.animalId !== id);
    save(); closeModal(); render(); toast(t('t_deleted'));
   } break;
  case 'set-ill': applyStatus(A(id), 'ill'); save(); render(); animalDetail(id); break;
  case 'recover': { const a = A(id); a.status = 'healthy'; recoverRecords(id); save(); render(); if ($('#modal .dlg')) animalDetail(id); break; }
  case 'add-health': healthForm(id, el.dataset.type); break;
  case 'del-health': S.data.health = S.data.health.filter(h => h.id !== id); save(); render(); { const a = $('#modal [data-act=edit-animal]'); if (a) animalDetail(a.dataset.id); } break;
  case 'add-event': eventForm(el.dataset.d); break;
  case 'ev-done': { const v = S.data.events.find(x => x.id === id); if (v) v.done = !v.done; save(); render(); break; }
  case 'ev-del': S.data.events = S.data.events.filter(x => x.id !== id); save(); render(); break;
  case 'day': S.cal.sel = el.dataset.d; render(); break;
  case 'cal-prev': S.cal.m--; if (S.cal.m < 0) { S.cal.m = 11; S.cal.y--; } S.cal.sel = null; render(); break;
  case 'cal-next': S.cal.m++; if (S.cal.m > 11) { S.cal.m = 0; S.cal.y++; } S.cal.sel = null; render(); break;
  case 'cal-today': { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth(), sel: today() }; render(); break; }
  case 'export': download('herdbook-backup-' + today() + '.json', JSON.stringify({ app: 'herdbook', v: 1, farm: S.user.farm, data: S.data }, null, 1), 'application/json'); break;
  case 'csv': {
   const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
   const rows = [['ID', 'Species', 'Name', 'Sex', 'Breed', 'Date of birth', 'Age', 'Weight (kg)', 'Status', 'Mother', 'Father', 'Notes']];
   S.data.animals.forEach(a => rows.push([a.tag, a.species, a.name, a.sex, a.breed, a.dob, a.dob ? age(a.dob) : '', a.weight, a.status, a.mother, a.father, a.notes]));
   download('herdbook-animals-' + today() + '.csv', '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); break;
  }
  case 'reset': if (confirm(t('s_reset_confirm'))) { S.data = emptyData(); save(); render(); toast(t('t_deleted')); } break;
 }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.addEventListener('input', e => {
 if (e.target.id === 'q') { S.filter.q = e.target.value; $('#alist').innerHTML = animalList(); }
 if (e.target.id === 'f-tag') e.target.dataset.auto = '0';
});
document.addEventListener('change', e => {
 const el = e.target;
 if (el.id === 'fsp') { S.filter.species = el.value; $('#alist').innerHTML = animalList(); }
 if (el.id === 'fst') { S.filter.status = el.value; $('#alist').innerHTML = animalList(); }
 if (el.id === 'f-sp') { const tg = $('#f-tag'); if (tg && tg.dataset.auto === '1') tg.value = nextTag(el.value); }
 if (el.id === 'h-t') $('#h-ill').classList.toggle('hide', el.value !== 'illness');
 if (el.id === 'e-t') $('#e-birth').classList.toggle('hide', el.value !== 'mating');
 if (el.id === 'imp' && el.files[0]) {
  const fr = new FileReader();
  fr.onload = async () => {
   let backup;
   try {
    const j = JSON.parse(fr.result), d = j.data;
    if (!d || !Array.isArray(d.animals) || !Array.isArray(d.events) || !Array.isArray(d.health)) throw 0;
    if (!confirm(t('s_import_confirm'))) return;
    backup = { animals: d.animals, events: d.events, health: d.health };
   } catch (x) { toast(t('s_bad_file')); return; }
   S.data = backup;
   try { await save(); render(); toast(t('s_imported')); }
   catch (error) { render(); }
  };
  fr.readAsText(el.files[0]); el.value = '';
 }
});

document.addEventListener('submit', async e => {
 e.preventDefault();
 const f = e.target, kind = f.dataset.form, fd = Object.fromEntries(new FormData(f));
 const err = m => { $('#ferr').textContent = m; };
 const val = k => (fd[k] || '').trim();

 if (kind === 'register') {
  const email = val('email').toLowerCase();
  if (!val('name') || !val('farm') || !email || !fd.password) return err(t('err_fill'));
  if (fd.password.length < 6) return err(t('err_pw'));
  try {
   acceptSession(await api('/api/register/', { method: 'POST', body: { name: val('name'), farm: val('farm'), email, password: fd.password } }));
   render();
  } catch (error) { err(error.status === 409 ? t('err_exists') : error.message || t('err_fill')); }
 }
 if (kind === 'login') {
  const email = val('email').toLowerCase();
  if (!email || !fd.password) return err(t('err_fill'));
  try {
   acceptSession(await api('/api/login/', { method: 'POST', body: { email, password: fd.password } }));
   render();
  } catch (error) { err(error.status === 401 ? t('err_login') : error.message || t('err_fill')); }
 }
 if (kind === 'profile') {
  if (!val('name') || !val('farm')) return;
  try {
   const response = await api('/api/profile/', { method: 'POST', body: { name: val('name'), farm: val('farm') } });
   S.user = response.user; render(); toast(t('t_saved'));
  } catch (error) { err(error.message); }
 }
 if (kind === 'animal') {
  const id = f.dataset.id, tag = val('tag').toUpperCase();
  if (!tag) return err(t('err_tag'));
  if (S.data.animals.some(a => a.tag === tag && a.id !== id)) return err(t('err_tag_dup'));
  if (fd.dob && fd.dob > today()) return err(t('err_dob'));
  const rec = { species: fd.species, tag, name: val('name'), sex: fd.sex, breed: val('breed'), dob: fd.dob || '', weight: fd.weight || '', mother: val('mother').toUpperCase(), father: val('father').toUpperCase(), notes: val('notes') };
  if (id) { const a = A(id); Object.assign(a, rec); applyStatus(a, fd.status); }
  else { const a = { id: uid(), created: today(), status: 'healthy', ...rec }; S.data.animals.push(a); applyStatus(a, fd.status); }
  save(); closeModal(); render(); toast(t('t_saved'));
 }
 if (kind === 'health') {
  const a = A(fd.animalId); if (!a) return err(t('h_pick'));
  const type = fd.type, ill = type === 'illness' && fd.setIll;
  S.data.health.push({ id: uid(), animalId: a.id, date: fd.date || today(), type, title: val('title'), notes: val('notes'), resolved: type !== 'illness' });
  if (ill && a.status !== 'ill') a.status = 'ill';
  if (type === 'illness' && !ill) S.data.health[S.data.health.length - 1].resolved = true;
  if (fd.next) S.data.events.push({ id: uid(), date: fd.next, type: type === 'vaccination' ? 'vaccination' : 'vet', title: val('title') || t('ht_' + type), animalId: a.id, notes: '', done: false });
  save(); closeModal(); render(); toast(t('t_saved'));
 }
 if (kind === 'event') {
  if (!fd.date) return err(t('err_fill'));
  const a = fd.animalId ? A(fd.animalId) : null;
  S.data.events.push({ id: uid(), date: fd.date, type: fd.type, title: val('title') || t('ev_' + fd.type), animalId: a ? a.id : '', notes: val('notes'), done: false });
  if (fd.type === 'mating' && fd.autoBirth && a && SP[a.species].g)
   S.data.events.push({ id: uid(), date: addDays(fd.date, SP[a.species].g), type: 'birth', title: t('c_expected_birth', { n: a.tag }), animalId: a.id, notes: '', done: false });
  S.cal.sel = fd.date; S.cal.y = +fd.date.slice(0, 4); S.cal.m = +fd.date.slice(5, 7) - 1;
  save(); closeModal(); render(); toast(t('t_saved'));
 }
});

/* ================= init ================= */
async function init() {
 try {
  const payload = await api('/api/session/');
  if (payload.user) acceptSession(payload);
  else S.authMode = payload.has_users ? 'login' : 'register';
 } catch (error) {
  S.authMode = 'register';
  toast(error.message);
 }
 render();
}
init();
})();
