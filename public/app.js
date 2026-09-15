// reclama261 — mesa de reclamaciones (vanilla, sin dependencias)
'use strict';

const $ = (sel) => document.querySelector(sel);
const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const COUNTRIES = ['ES', 'DE', 'FR', 'GB', 'IT', 'PT', 'NL', 'PL', 'AT', 'CH'];
const COUNTRY_NAMES = {
  ES: 'España (5 años)', DE: 'Alemania (3 años)', FR: 'Francia (5 años)',
  GB: 'Reino Unido (6 años)', IT: 'Italia (2 años)', PT: 'Portugal (3 años)',
  NL: 'Países Bajos (2 años)', PL: 'Polonia (3 años)', AT: 'Austria (3 años)', CH: 'Suiza (2 años)',
};
const STATUS_META = {
  DRAFT: 'Borrador', SUBMITTED: 'Enviada', RESPONSE: 'Respondida', OFFER: 'Oferta',
  PAID: 'Cobrada', REJECTED: 'Rechazada', ESCALATED: 'Escalada', COURT: 'Judicial', CLOSED: 'Cerrada',
};
const EVENTS = { delay: 'Retraso', cancellation: 'Cancelación', denied_boarding: 'Denegación' };

let claims = [];
let airports = [];
let airlines = [];
let detailId = null;
let timer = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.classList.remove('show'); }, 2600);
}

// ── Tablón ──
function renderBoard() {
  const q = $('#search').value.trim().toLowerCase();
  const list = claims.filter((c) => {
    if (!q) return true;
    const hay = [c.passengerName, c.flightNumber, c.airline, c.departureIata, c.arrivalIata]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
  const board = $('#board');
  board.textContent = '';
  $('#empty').hidden = list.length > 0;
  for (const c of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'row';
    btn.type = 'button';
    btn.addEventListener('click', () => openDetail(c.id));
    const amt = c.evaluation?.totalAmount ?? 0;
    btn.innerHTML = `
      <span class="route">${c.departureIata} → ${c.arrivalIata}</span>
      <span class="meta">${esc(c.airline || '—')}${c.flightNumber ? ` <span class="muted">${esc(c.flightNumber)}</span>` : ''}</span>
      <span class="meta">${esc(c.passengerName)}</span>
      <span class="muted">${EVENTS[c.eventType] || '—'}</span>
      <span class="amount">${fmtEUR.format(amt)}</span>
      <span><span class="chip chip-${c.status}">${STATUS_META[c.status] || c.status}</span></span>
      <span class="chev" aria-hidden="true">›</span>`;
    li.appendChild(btn);
    board.appendChild(li);
  }
}

async function renderStats() {
  const s = await api('/api/stats');
  $('#stat-potential').textContent = fmtEUR.format(s.potential);
  $('#stat-commission').textContent = fmtEUR.format(s.potentialCommission);
  $('#stat-active').textContent = String(s.total - (s.byStatus.PAID || 0) - (s.byStatus.CLOSED || 0) - (s.byStatus.REJECTED || 0));
  $('#stat-paid').textContent = fmtEUR.format(s.paid);
  $('#stat-stuck').textContent = String(s.stuck);
}

// ── Nuevo reclamo ──
async function fillAirports() {
  airports = await api('/api/airports');
  airports.sort((a, b) => a.iata.localeCompare(b.iata));
  const mk = (sel) => {
    const s = $(sel);
    for (const a of airports) {
      const o = document.createElement('option');
      o.value = a.iata;
      o.textContent = `${a.iata} · ${a.name}`;
      s.appendChild(o);
    }
  };
  mk('#dep-iata');
  mk('#arr-iata');
  mk('#watch-dep');
  mk('#watch-arr');
  const cc = $('#claim-country');
  for (const c of COUNTRIES) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = COUNTRY_NAMES[c];
    cc.appendChild(o);
  }
  const wc = $('#watch-country');
  for (const c of COUNTRIES) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = COUNTRY_NAMES[c];
    wc.appendChild(o);
  }
  const dl = $('#country-list');
  for (const c of COUNTRIES) {
    const o = document.createElement('option');
    o.value = c;
    o.label = COUNTRY_NAMES[c];
    dl.appendChild(o);
  }
}

function formData() {
  const f = new FormData($('#claim-form'));
  const out = {};
  for (const [k, v] of f.entries()) out[k] = v;
  return out;
}

async function liveCheck() {
  const body = formData();
  const has = body.departureIata && body.arrivalIata && body.scheduledArrival && body.flightDate;
  const lc = $('#live-check');
  lc.hidden = !has;
  if (!has) return;
  const ev = await api('/api/check', { method: 'POST', body });
  if (ev.error) { $('#lc-note').textContent = 'Códigos de aeropuerto no reconocidos.'; return; }
  $('#lc-covered').textContent = ev.covered ? `${ev.regulation} (${ev.basis})` : 'NO APLICA';
  $('#lc-distance').textContent = `${ev.distanceKm} km · ${ev.tier}`;
  $('#lc-amount').textContent = ev.eligible ? fmtEUR.format(ev.totalAmount) : '0 €';
  $('#lc-deadline').textContent = ev.deadline && !ev.deadline.error ? `${ev.deadline.deadlineISO} (${ev.deadline.years} años)` : '—';
  const note = $('#lc-note');
  note.className = 'live-note' + (ev.warnings?.length ? ' warn' : '');
  note.textContent = ev.warnings?.length
    ? `⚠ ${ev.warnings[0]}`
    : (ev.covered && !ev.eligible ? ev.reasons[0] : '');
}

function bindLive() {
  $('#claim-form').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(liveCheck, 350);
  });
}

// ── Detalle ──
function nextActions(status) {
  const map = {
    DRAFT: [['SUBMITTED', 'Marcar enviada']],
    SUBMITTED: [['RESPONSE', 'Aerolínea respondió'], ['REJECTED', 'Rechazada']],
    RESPONSE: [['OFFER', 'Hay oferta'], ['REJECTED', 'Rechazada']],
    OFFER: [['PAID', 'Cobrada 💰'], ['REJECTED', 'Rechazada']],
    REJECTED: [['ESCALATED', 'Escalar (AESA/ADR)']],
    ESCALATED: [['COURT', 'Vía judicial'], ['PAID', 'Cobrada 💰']],
    COURT: [['PAID', 'Cobrada 💰'], ['CLOSED', 'Cerrar']],
    PAID: [], CLOSED: [],
  };
  return map[status] || [];
}

function openDetail(id) {
  const c = claims.find((x) => x.id === id);
  if (!c) return;
  const d = $('#detail-dialog');
  $('#d-title').textContent = `${c.departureIata} → ${c.arrivalIata} · ${c.passengerName}`;
  const ev = c.evaluation || {};
  const cells = [
    ['Vuelo', `${c.flightNumber || '—'} · ${c.airline || '—'}`],
    ['Fecha', c.flightDate || '—'],
    ['Incidencia', `${EVENTS[c.eventType] || '—'}${ev.delayMin != null ? ` · ${Math.floor(ev.delayMin / 60)}h${ev.delayMin % 60 ? ' ' + (ev.delayMin % 60) + 'min' : ''}` : ''}`],
    ['Importe', `${fmtEUR.format(ev.totalAmount || 0)}${ev.reducedBy50 ? ' (reducido 50 %)' : ''}`, true],
    ['Ámbito', ev.covered ? `${ev.regulation} · ${ev.basis}` : 'NO APLICA'],
    ['Plazo', ev.deadline && !ev.deadline.error ? `${ev.deadline.deadlineISO}` : '—'],
  ];
  const grid = $('#d-grid');
  grid.textContent = '';
  for (const [label, value, mono] of cells) {
    const div = document.createElement('div');
    div.className = 'cell' + (mono ? ' mono' : '');
    div.innerHTML = `<span>${label}</span><strong>${esc(String(value))}</strong>`;
    grid.appendChild(div);
  }
  const tl = $('#d-timeline');
  tl.textContent = '';
  for (const h of (c.history || [])) {
    const li = document.createElement('li');
    li.innerHTML = `<time>${new Date(h.at).toLocaleString('es-ES')}</time><span class="note">${STATUS_META[h.status] || h.status}${h.note ? ' — ' + esc(h.note) : ''}</span>`;
    tl.appendChild(li);
  }
  const acts = $('#d-actions');
  acts.textContent = '';
  for (const [status, label] of nextActions(c.status)) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.addEventListener('click', async () => {
      try {
        await api(`/api/claims/${c.id}`, { method: 'PATCH', body: { status } });
        d.close();
        await refresh();
        toast('Estado actualizado');
      } catch (e) { toast(e.message); }
    });
    acts.appendChild(b);
  }
  detailId = c.id;
  updateLetterLinks();
  renderAirlineBox(c);
  renderEvidence(c);
  renderDocs(c.id);
  renderExpenses(c);
  d.showModal();
}

function renderEvidence(c) {
  const ul = $('#d-evidence');
  ul.textContent = '';
  for (const item of (c.evaluation?.evidence || [])) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
}

function updateLetterLinks() {
  if (!detailId) return;
  const lang = $('#letter-lang').value;
  const org = $('#esc-org').value;
  const lvl = $('#chaser-level').value;
  $('#d-letter').href = `/api/claims/${detailId}/letter?lang=${lang}`;
  $('#d-escalation').href = `/api/claims/${detailId}/escalation?org=${org}&lang=${lang}`;
  $('#d-chaser').href = `/api/claims/${detailId}/chaser?level=${lvl}&lang=${lang}`;
  $('#d-poa').href = `/api/claims/${detailId}/poa?lang=${lang}`;
  $('#d-invoice').href = `/api/claims/${detailId}/invoice?lang=${lang}`;
  $('#d-court').href = `/api/claims/${detailId}/court?kind=demanda_verbal&lang=${lang}`;
}

function renderExpenses(c) {
  const ul = $('#d-exp-list');
  ul.textContent = '';
  for (const [i, e] of (c.expenses || []).entries()) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${e.type}: ${Number(e.amount).toFixed(2)} €`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.style.cssText = 'width:28px;height:28px;font-size:12px;';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Quitar gasto');
    del.addEventListener('click', async () => {
      const claim = claims.find((x) => x.id === detailId);
      claim.expenses.splice(i, 1);
      await api(`/api/claims/${detailId}`, { method: 'PATCH', body: { expenses: claim.expenses } });
      renderExpenses(claim);
    });
    li.appendChild(span);
    li.appendChild(del);
    ul.appendChild(li);
  }
}

function renderAirlineBox(c) {
  const box = $('#d-airline');
  const match = airlines.find((a) =>
    a.name.toLowerCase() === (c.airline || '').toLowerCase() ||
    (c.airline && a.name.toLowerCase().includes(c.airline.toLowerCase())));
  if (!match) { box.hidden = true; return; }
  box.hidden = false;
  $('#d-airline-name').textContent = `${match.iata} · ${match.name} (${match.country})`;
  const web = $('#d-airline-web');
  web.href = match.web;
  web.textContent = match.web.replace(/^https?:\/\//, '');
  $('#d-airline-email').textContent = match.email ? `Email: ${match.email}` : '';
  $('#d-airline-email').hidden = !match.email;
  const tip = $('#d-airline-tip');
  tip.hidden = !match.tip;
  tip.textContent = match.tip ? `💡 ${match.tip}` : '';
}

async function renderDocs(id) {
  const docs = await api(`/api/claims/${id}/docs`).catch(() => []);
  const ul = $('#d-doc-list');
  ul.textContent = '';
  for (const doc of docs) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/api/claims/${id}/docs/${encodeURIComponent(doc.name)}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = doc.name;
    li.appendChild(a);
    const t = document.createElement('time');
    t.textContent = new Date(doc.at).toLocaleDateString('es-ES');
    li.appendChild(t);
    ul.appendChild(li);
  }
}

// ── Flujo ──
async function refresh() {
  claims = await api('/api/claims');
  renderBoard();
  renderStats();
  renderWatches();
}

// ── Cazador ──
const WATCH_LABELS = {
  OBSERVING: 'Observando', WAITING_DATA: 'Esperando datos', CLAIM_CREATED: 'Reclamo creado ✓',
  NO_COMPENSATION: 'Sin compensación', NO_DATA: 'Sin datos', ERROR: 'Error',
};
const WATCH_CHIP = {
  OBSERVING: 'chip-SUBMITTED', WAITING_DATA: 'chip-DRAFT', CLAIM_CREATED: 'chip-PAID',
  NO_COMPENSATION: 'chip-CLOSED', NO_DATA: 'chip-REJECTED', ERROR: 'chip-REJECTED',
};

async function renderWatches() {
  const watches = await api('/api/watch').catch(() => []);
  $('#watch-section').hidden = watches.length === 0;
  const ul = $('#watch-list');
  ul.textContent = '';
  for (const w of watches) {
    const li = document.createElement('li');
    li.className = 'watch-row';
    const chip = WATCH_CHIP[w.status] || 'chip-DRAFT';
    li.innerHTML = `
      <span class="route">${esc(w.flightNumber)} → ${esc(w.arrivalIata)}</span>
      <span>${esc(w.passengerName)}${w.departureIata ? ` <span class="muted">desde ${esc(w.departureIata)}</span>` : ''}</span>
      <span class="muted">${esc(w.flightDate || '')} · ${esc(w.scheduledArrival || '')}</span>
      <span><span class="chip ${chip}">${WATCH_LABELS[w.status] || w.status}${w.delayMin != null ? ` · ${w.delayMin} min` : ''}</span></span>
      <span class="watch-actions">
        <button type="button" class="btn" data-check="${w.id}">Comprobar</button>
        <button type="button" class="btn" data-del="${w.id}">Quitar</button>
      </span>`;
    ul.appendChild(li);
  }
}

function bindWatch() {
  $('#watch-btn').addEventListener('click', () => $('#watch-dialog').showModal());
  $('#watch-add').addEventListener('click', () => $('#watch-dialog').showModal());
  $('#watch-submit').addEventListener('click', async () => {
    const f = new FormData($('#watch-form'));
    const body = {};
    for (const [k, v] of f.entries()) body[k] = v;
    if (!body.flightNumber || !body.arrivalIata || !body.scheduledArrival || !body.passengerName) {
      toast('N.º de vuelo, destino, llegada y pasajero son obligatorios');
      return;
    }
    try {
      await api('/api/watch', { method: 'POST', body });
      $('#watch-dialog').close();
      $('#watch-form').reset();
      await renderWatches();
      toast('Vigilancia activada — el cazador comprueba solo');
    } catch (e) { toast(e.message); }
  });
  $('#watch-list').addEventListener('click', async (e) => {
    const check = e.target.dataset?.check;
    const del = e.target.dataset?.del;
    if (check) {
      toast('Consultando OpenSky…');
      const w = await api(`/api/watch/${check}/check`, { method: 'POST', body: {} });
      toast(WATCH_LABELS[w.status] || w.status);
      await renderWatches();
      await refresh();
    }
    if (del) {
      await api(`/api/watch/${del}`, { method: 'DELETE' });
      await renderWatches();
      toast('Vigilancia eliminada');
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function bindImport() {
  $('#import-csv').addEventListener('click', () => $('#import-dialog').showModal());
  $('#csv-template').addEventListener('click', () => {
    const headers = 'passengerName,email,airline,flightNumber,departureIata,arrivalIata,airlineCountry,eventType,flightDate,scheduledArrival,actualArrival,noticeDays,rerouteArrival,airlineReason,claimCountry,passengers';
    const example = 'María García,maria@correo.com,Iberia,IB1234,MAD,BCN,ES,delay,2026-05-01,2026-05-01T10:00,2026-05-01T13:30,0,,,ES,1';
    const blob = new Blob([headers + '\n' + example], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reclamos-plantilla.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#csv-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('#csv-text').value = await f.text();
  });
  $('#csv-submit').addEventListener('click', async () => {
    const csv = $('#csv-text').value.trim();
    if (!csv) { toast('Pega o selecciona un CSV'); return; }
    try {
      const res = await api('/api/claims/import', { method: 'POST', body: { csv } });
      $('#import-dialog').close();
      $('#csv-text').value = '';
      $('#csv-file').value = '';
      await refresh();
      toast(`Importados ${res.created} reclamos${res.failed.length ? ` · ${res.failed.length} fallidos` : ''}`);
    } catch (e) { toast(e.message); }
  });
  $('#letter-lang').addEventListener('change', updateLetterLinks);
  $('#esc-org').addEventListener('change', updateLetterLinks);
  $('#chaser-level').addEventListener('change', updateLetterLinks);
  $('#exp-add').addEventListener('click', async () => {
    const type = $('#exp-type').value.trim();
    const amount = parseFloat($('#exp-amount').value);
    if (!type || !(amount > 0) || !detailId) { toast('Tipo y importe requeridos'); return; }
    const claim = claims.find((x) => x.id === detailId);
    claim.expenses = claim.expenses || [];
    claim.expenses.push({ type, amount });
    await api(`/api/claims/${detailId}`, { method: 'PATCH', body: { expenses: claim.expenses } });
    $('#exp-type').value = '';
    $('#exp-amount').value = '';
    renderExpenses(claim);
  });
  $('#rights-btn').addEventListener('click', () => $('#rights-dialog').showModal());
  let rightsTimer = null;
  $('#rights-q').addEventListener('input', () => {
    clearTimeout(rightsTimer);
    rightsTimer = setTimeout(async () => {
      const q = $('#rights-q').value.trim();
      if (q.length < 3) { $('#rights-results').textContent = ''; return; }
      const r = await api(`/api/rights?q=${encodeURIComponent(q)}`);
      const box = $('#rights-results');
      box.textContent = '';
      for (const f of r.faq) {
        const div = document.createElement('div');
        div.className = 'rights-item';
        div.innerHTML = `<strong>${esc(f.question)}</strong><p>${esc(f.answer)}</p>`;
        box.appendChild(div);
      }
      for (const j of r.jurisprudence) {
        const div = document.createElement('div');
        div.className = 'rights-item';
        div.innerHTML = `<strong>Jurisprudencia</strong><p>${esc(j.ruling)}</p><span class="jur">${esc(j.citation)}</span>`;
        box.appendChild(div);
      }
      if (!r.faq.length && !r.jurisprudence.length) {
        box.innerHTML = '<p class="import-hint">Sin coincidencias — prueba con: técnico, huelga, hotel, plazo, equipaje, conexión, AESA…</p>';
      }
      $('#rights-src').textContent = r.source;
    }, 250);
  });
  $('#doc-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f || !detailId) return;
    if (f.size > 5_000_000) { toast('Máximo 5 MB'); return; }
    const buf = await f.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    try {
      await api(`/api/claims/${detailId}/docs`, {
        method: 'POST',
        body: { name: f.name, dataBase64: btoa(bin) },
      });
      e.target.value = '';
      await renderDocs(detailId);
      toast('Documento subido');
    } catch (err) { toast(err.message); }
  });
}

// ── Clientes / agencia ──
async function fillClients() {
  const list = await api('/api/clients').catch(() => []);
  const sel = $('#claim-client');
  if (sel) {
    sel.textContent = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— sin cliente —';
    sel.appendChild(none);
    for (const c of list) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = `${c.name} (${Math.round((c.commissionRate ?? 0.3) * 100)} %)`;
      sel.appendChild(o);
    }
  }
  return list;
}

async function renderClients() {
  const stats = await api('/api/clients/stats').catch(() => []);
  const ul = $('#cl-list');
  if (!ul) return;
  ul.textContent = '';
  for (const s of stats) {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${esc(s.name)}</strong> · ${Math.round(s.commissionRate * 100)} % ·
      ${s.claims} reclamos · potencial ${fmtEUR.format(s.potential)} · cobrado ${fmtEUR.format(s.paid)} ·
      comisión ${fmtEUR.format(s.commission)}</span>
      ${s.id ? `<button type="button" class="icon-btn" data-del-client="${s.id}" aria-label="Quitar">✕</button>` : ''}`;
    ul.appendChild(li);
  }
}

function bindClients() {
  $('#clients-btn')?.addEventListener('click', async () => {
    await fillClients();
    await renderClients();
    $('#clients-dialog').showModal();
  });
  $('#cl-add')?.addEventListener('click', async () => {
    const rate = Number($('#cl-rate').value || 30) / 100;
    try {
      await api('/api/clients', {
        method: 'POST',
        body: {
          name: $('#cl-name').value.trim(), email: $('#cl-email').value.trim(),
          iban: $('#cl-iban').value.trim(), commissionRate: rate,
        },
      });
      $('#cl-name').value = ''; $('#cl-email').value = ''; $('#cl-iban').value = '';
      await fillClients();
      await renderClients();
      toast('Cliente añadido');
    } catch (e) { toast(e.message); }
  });
  $('#cl-list')?.addEventListener('click', async (e) => {
    const id = e.target.dataset?.delClient;
    if (!id) return;
    await api(`/api/clients/${id}`, { method: 'DELETE' });
    await fillClients();
    await renderClients();
    toast('Cliente eliminado');
  });
}

function bind() {
  $('#search').addEventListener('input', renderBoard);
  $('#new-claim').addEventListener('click', () => $('#new-dialog').showModal());
  $('#empty-new').addEventListener('click', () => $('#new-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => b.closest('dialog').close()));
  $('#claim-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = formData();
      await api('/api/claims', { method: 'POST', body });
      $('#new-dialog').close();
      $('#claim-form').reset();
      $('#live-check').hidden = true;
      await refresh();
      toast('Reclamo registrado');
    } catch (err) { toast(err.message); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      e.preventDefault();
      $('#search').focus();
    }
  });
  bindLive();
  bindImport();
  bindWatch();
  bindClients();
}

async function main() {
  await fillAirports();
  try { airlines = await api('/api/airlines'); } catch { airlines = []; }
  try { await fillClients(); } catch { /* sin clientes aún */ }
  bind();
  await refresh();
}

main().catch((e) => toast(e.message));
