// reclama261 — servidor HTTP sin dependencias (Node ≥ 20)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRPORTS, evaluateClaim } from './ec261.js';
import { generateClaimLetter, generateEscalationLetter, generateChaserLetter } from './letter.js';
import { answerRights } from './rights.js';
import { Store } from './store.js';
import { parseCsv, claimsToCsv, CLAIM_FIELDS } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const DOCS = path.join(__dirname, '..', 'data', 'docs');
const PORT = Number(process.env.PORT || 8787);
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.30);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const store = new Store(path.join(__dirname, '..', 'data', 'db.json'));
const AIRLINES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'airlines.json'), 'utf8'),
).airlines;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 8_000_000) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  if (!ADMIN_TOKEN) return true;
  return req.headers['x-admin-token'] === ADMIN_TOKEN;
}

function notifyWebhook(payload) {
  if (!WEBHOOK_URL) return;
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  try {
    // Estáticos
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'), MIME['.html']);
    }
    if (req.method === 'GET' && ['/app.js', '/styles.css'].includes(p)) {
      const f = path.join(PUBLIC, path.basename(p));
      return send(res, 200, fs.readFileSync(f, 'utf8'), MIME[path.extname(f)]);
    }

    // ── API ──
    if (p === '/api/airports' && req.method === 'GET') {
      const list = Object.entries(AIRPORTS).map(([iata, v]) => ({ iata, ...v }));
      return send(res, 200, list);
    }

    if (p === '/api/airlines' && req.method === 'GET') {
      return send(res, 200, Object.entries(AIRLINES).map(([iata, v]) => ({ iata, ...v })));
    }

    if (p === '/api/check' && req.method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, evaluateClaim(body));
    }

    if (p === '/api/rights' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      return send(res, 200, answerRights(q));
    }

    if (p === '/api/claims/export' && req.method === 'GET') {
      const csv = claimsToCsv(store.list());
      return send(res, 200, csv, 'text/csv; charset=utf-8');
    }

    if (p === '/api/claims' && req.method === 'GET') {
      const stuck = url.searchParams.get('stuck') === 'true';
      const airline = url.searchParams.get('airline') || '';
      let list = stuck ? store.stuck() : store.list();
      if (airline) list = list.filter((c) => (c.airline || '').toLowerCase().includes(airline.toLowerCase()));
      return send(res, 200, list);
    }

    if (p === '/api/claims' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      if (!body.passengerName || !body.departureIata || !body.arrivalIata) {
        return send(res, 400, { error: 'passengerName, departureIata y arrivalIata son obligatorios' });
      }
      const evaluation = evaluateClaim(body);
      const claim = store.create({ ...body, evaluation, passengers: Number(body.passengers) || 1 });
      return send(res, 201, claim);
    }

    if (p === '/api/claims/import' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const rows = parseCsv(body.csv || '');
      const created = [];
      const failed = [];
      for (const [i, r] of rows.entries()) {
        const claim = {};
        for (const f of CLAIM_FIELDS) claim[f] = r[f] ?? '';
        if (!claim.passengerName || !claim.departureIata || !claim.arrivalIata) {
          failed.push({ row: i + 2, error: 'faltan passengerName/departureIata/arrivalIata' });
          continue;
        }
        try {
          const evaluation = evaluateClaim(claim);
          const rec = store.create({ ...claim, evaluation, passengers: Number(claim.passengers) || 1 });
          created.push(rec.id);
        } catch (e) {
          failed.push({ row: i + 2, error: e.message });
        }
      }
      return send(res, 200, { created: created.length, failed });
    }

    const claimMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})$/);
    if (claimMatch && req.method === 'GET') {
      const claim = store.get(claimMatch[1]);
      return claim ? send(res, 200, claim) : send(res, 404, { error: 'not_found' });
    }

    if (claimMatch && req.method === 'PATCH') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const claim = store.get(claimMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      if (body.status && body.status !== claim.status) {
        const updated = store.setStatus(claim.id, body.status, body.note || '');
        notifyWebhook({ id: claim.id, status: body.status, at: updated.updatedAt });
      }
      delete body.status;
      delete body.note;
      const updated = store.update(claim.id, body);
      return send(res, 200, updated);
    }

    const docsMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/docs$/);
    if (docsMatch && req.method === 'GET') {
      const claim = store.get(docsMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      return send(res, 200, claim.docs || []);
    }
    if (docsMatch && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const claim = store.get(docsMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const body = await readBody(req);
      if (!body.name || !body.dataBase64) return send(res, 400, { error: 'name y dataBase64 requeridos' });
      const buf = Buffer.from(body.dataBase64, 'base64');
      if (buf.length > 5_000_000) return send(res, 413, { error: 'max 5 MB' });
      const dir = path.join(DOCS, claim.id);
      fs.mkdirSync(dir, { recursive: true });
      const fname = safeName(body.name);
      fs.writeFileSync(path.join(dir, fname), buf);
      const docs = claim.docs || [];
      docs.push({ name: fname, size: buf.length, at: new Date().toISOString() });
      store.update(claim.id, { docs });
      return send(res, 201, { name: fname, size: buf.length });
    }

    const docFile = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/docs\/([^/]+)$/);
    if (docFile && req.method === 'GET') {
      const claim = store.get(docFile[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const f = path.join(DOCS, claim.id, safeName(docFile[2]));
      if (!fs.existsSync(f)) return send(res, 404, { error: 'not_found' });
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
    }

    const letterMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/letter$/);
    if (letterMatch && req.method === 'GET') {
      const claim = store.get(letterMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const lang = url.searchParams.get('lang') || 'es';
      return send(res, 200, generateClaimLetter(claim, lang), MIME['.html']);
    }

    const escMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/escalation$/);
    if (escMatch && req.method === 'GET') {
      const claim = store.get(escMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const org = url.searchParams.get('org') || 'aesa';
      const lang = url.searchParams.get('lang') || 'es';
      return send(res, 200, generateEscalationLetter(claim, org, lang), MIME['.html']);
    }

    const chaserMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/chaser$/);
    if (chaserMatch && req.method === 'GET') {
      const claim = store.get(chaserMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const level = Number(url.searchParams.get('level') || 1);
      const lang = url.searchParams.get('lang') || 'es';
      return send(res, 200, generateChaserLetter(claim, level, lang), MIME['.html']);
    }

    if (p === '/api/stats' && req.method === 'GET') {
      const claims = store.list();
      const byStatus = {};
      const byAirline = {};
      let potential = 0;
      let potentialCommission = 0;
      let paid = 0;
      for (const c of claims) {
        byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        const airline = c.airline || 'Sin aerolínea';
        byAirline[airline] = byAirline[airline] || { total: 0, potential: 0, paid: 0 };
        byAirline[airline].total += 1;
        const amt = c.evaluation?.totalAmount || 0;
        if (c.status === 'PAID') { paid += amt; byAirline[airline].paid += amt; }
        else if (!['CLOSED', 'REJECTED'].includes(c.status)) {
          potential += amt;
          potentialCommission += Math.round(amt * COMMISSION_RATE);
          byAirline[airline].potential += amt;
        }
      }
      return send(res, 200, {
        total: claims.length,
        byStatus,
        byAirline,
        stuck: store.stuck().length,
        potential,
        potentialCommission,
        paid,
        commissionRate: COMMISSION_RATE,
      });
    }

    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    return send(res, e.message === 'invalid json' ? 400 : 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`reclama261 escuchando en http://0.0.0.0:${PORT}`);
});
