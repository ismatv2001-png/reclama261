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
import { Watcher } from './watcher.js';
import { generatePoaLetter } from './poa.js';
import { generateInvoiceLetter } from './invoice.js';
import { generateCourtLetter } from './court.js';
import { ClientStore } from './clients.js';
import { ingestDocuments } from './ingest.js';
import { sweepAirportDay } from './sweeper.js';

const BOOT = Date.now();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const DOCS = path.join(__dirname, '..', 'data', 'docs');
const PORT = Number(process.env.PORT || 8787);
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.30);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const store = new Store(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json'));
const clients = new ClientStore(process.env.CLIENTS_FILE || path.join(__dirname, '..', 'data', 'clients.json'));
const AIRLINES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'airlines.json'), 'utf8'),
).airlines;

// Cazador proactivo: al detectar retraso ≥3 h crea el reclamo automáticamente
const watcher = new Watcher(process.env.WATCH_FILE || path.join(__dirname, '..', 'data', 'watches.json'), {
  intervalMs: Number(process.env.WATCH_INTERVAL_MS || 15 * 60 * 1000),
  onClaim: (w, delayMin) => {
    try {
      const evaluation = evaluateClaim({
        eventType: 'delay',
        departureIata: w.departureIata || '',
        arrivalIata: w.arrivalIata,
        airlineCountry: w.airlineCountry || '',
        flightDate: w.flightDate,
        scheduledArrival: w.scheduledArrival,
        actualArrival: new Date(Date.parse(w.scheduledArrival) + delayMin * 60000).toISOString(),
        passengers: Number(w.passengers) || 1,
        claimCountry: w.claimCountry || 'ES',
      });
      const claim = store.create({
        passengerName: w.passengerName,
        email: w.email || '',
        airline: w.airline || '',
        flightNumber: w.flightNumber,
        departureIata: w.departureIata || '',
        arrivalIata: w.arrivalIata,
        flightDate: w.flightDate,
        scheduledArrival: w.scheduledArrival,
        eventType: 'delay',
        claimCountry: w.claimCountry || 'ES',
        passengers: Number(w.passengers) || 1,
        source: 'watcher',
        watchId: w.id,
        evaluation,
      });
      notifyWebhook({ type: 'watch_claim', watchId: w.id, claimId: claim.id, delayMin, amount: evaluation.totalAmount });
      return claim.id;
    } catch {
      return null;
    }
  },
});
if (process.env.ENABLE_WATCHER !== '0') watcher.start();

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

    if (p === '/api/health' && req.method === 'GET') {
      return send(res, 200, {
        ok: true,
        app: 'VuelaClaim',
        version: '0.5.0',
        uptimeSec: Math.round((Date.now() - BOOT) / 1000),
        claims: store.list().length,
        watches: watcher.list().length,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      });
    }

    if (p === '/api/rights' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      return send(res, 200, answerRights(q));
    }

    // ── Ingesta: emails/PDFs de reserva → reclamos ──
    if (p === '/api/ingest' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const emails = Array.isArray(body.emails) ? body.emails : (body.email ? [body.email] : []);
      const pdfs = (Array.isArray(body.pdfs) ? body.pdfs : []).map((pdf) => ({
        filename: pdf.filename || 'documento.pdf',
        bytes: Buffer.from(pdf.dataBase64 || '', 'base64'),
      }));
      const result = ingestDocuments({
        emails, pdfs, isValidAirport: (iata) => Boolean(AIRPORTS[iata]),
      });
      const created = [];
      if (body.autoCreate !== false) {
        for (const cand of result.candidates) {
          const claims = Array.isArray(body.claims) ? body.claims : [];
          const evaluation = evaluateClaim({
            eventType: cand.eventType,
            departureIata: cand.departureIata,
            arrivalIata: cand.arrivalIata,
            airlineCountry: AIRLINES[cand.airlinePrefix]?.country || '',
            flightDate: cand.flightDate || '',
            scheduledArrival: cand.flightDate ? `${cand.flightDate}T12:00` : '',
            actualArrival: cand.flightDate && cand.delayedMin
              ? new Date(Date.parse(`${cand.flightDate}T12:00`) + cand.delayedMin * 60000).toISOString() : '',
            passengers: 1,
            claimCountry: body.claimCountry || 'ES',
            airlineReason: body.airlineReason || '',
          });
          const claim = store.create({
            passengerName: cand.passengerName || body.passengerName || 'Pasajero (importado)',
            email: body.email || '',
            airline: AIRLINES[cand.airlinePrefix]?.name || cand.airlinePrefix || '',
            flightNumber: cand.flightNumber,
            departureIata: cand.departureIata,
            arrivalIata: cand.arrivalIata,
            flightDate: cand.flightDate,
            eventType: cand.eventType,
            pnr: cand.pnr,
            clientId: body.clientId || undefined,
            passengers: 1,
            claimCountry: body.claimCountry || 'ES',
            source: `ingest:${cand.source}`,
            evaluation,
            expenses: claims,
          });
          created.push({ id: claim.id, flightNumber: cand.flightNumber, route: `${cand.departureIata}→${cand.arrivalIata}`, amount: evaluation.totalAmount });
        }
      }
      return send(res, 200, {
        candidates: result.candidates.length,
        skipped: result.skipped,
        created,
      });
    }

    // ── Barrido a escala (AviationStack) ──
    if (p === '/api/sweep' && req.method === 'GET') {
      const airportIata = url.searchParams.get('airport') || '';
      const flightDate = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const direction = url.searchParams.get('direction') === 'arr' ? 'arr' : 'dep';
      if (!airportIata) return send(res, 400, { error: 'airport requerido' });
      const r = await sweepAirportDay({
        airportIata, flightDate, direction,
        key: process.env.AVSTACK_KEY || '',
      });
      return send(res, 200, r);
    }
    if (p === '/api/sweep/watch' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const opps = Array.isArray(body.opportunities) ? body.opportunities : [];
      if (!body.passengerName) return send(res, 400, { error: 'passengerName requerido' });
      const created = [];
      for (const o of opps) {
        created.push(watcher.create({
          flightNumber: o.flightNumber,
          arrivalIata: o.arrivalIata,
          departureIata: o.departureIata,
          airline: o.airline,
          flightDate: (o.scheduledArrival || '').slice(0, 10),
          scheduledArrival: o.scheduledArrival,
          passengerName: body.passengerName,
          email: body.email || '',
          claimCountry: body.claimCountry || 'ES',
          source: 'sweep',
        }));
      }
      return send(res, 201, { created: created.length, watches: created });
    }

    if (p === '/api/claims/export' && req.method === 'GET') {
      const csv = claimsToCsv(store.list());
      return send(res, 200, csv, 'text/csv; charset=utf-8');
    }

    if (p === '/api/claims' && req.method === 'GET') {
      const stuck = url.searchParams.get('stuck') === 'true';
      const airline = url.searchParams.get('airline') || '';
      const clientId = url.searchParams.get('clientId') || '';
      let list = stuck ? store.stuck() : store.list();
      if (airline) list = list.filter((c) => (c.airline || '').toLowerCase().includes(airline.toLowerCase()));
      if (clientId) list = list.filter((c) => c.clientId === clientId);
      return send(res, 200, list);
    }

    // ── Clientes / agencia (multi-tenant) ──
    if (p === '/api/clients' && req.method === 'GET') {
      return send(res, 200, clients.list());
    }
    if (p === '/api/clients/stats' && req.method === 'GET') {
      return send(res, 200, clients.stats(store.list()));
    }
    if (p === '/api/clients' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      if (!body.name) return send(res, 400, { error: 'name es obligatorio' });
      return send(res, 201, clients.create(body));
    }
    const clientMatch = p.match(/^\/api\/clients\/([0-9a-f-]{36})$/);
    if (clientMatch && req.method === 'PATCH') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const c = clients.update(clientMatch[1], body);
      return c ? send(res, 200, c) : send(res, 404, { error: 'not_found' });
    }
    if (clientMatch && req.method === 'DELETE') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      return clients.remove(clientMatch[1]) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not_found' });
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

    // ── Cazador (watch) ──
    if (p === '/api/watch' && req.method === 'GET') {
      return send(res, 200, watcher.list());
    }
    if (p === '/api/watch' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      if (!body.flightNumber || !body.arrivalIata || !body.scheduledArrival || !body.passengerName) {
        return send(res, 400, { error: 'flightNumber, arrivalIata, scheduledArrival y passengerName son obligatorios' });
      }
      const w = watcher.create(body);
      return send(res, 201, w);
    }
    const watchMatch = p.match(/^\/api\/watch\/([0-9a-f-]{36})$/);
    if (watchMatch && req.method === 'DELETE') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      return watcher.remove(watchMatch[1]) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not_found' });
    }
    const watchCheck = p.match(/^\/api\/watch\/([0-9a-f-]{36})\/check$/);
    if (watchCheck && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const w = watcher.get(watchCheck[1]);
      if (!w) return send(res, 404, { error: 'not_found' });
      try {
        const updated = await watcher.checkWatch(w);
        return send(res, 200, updated);
      } catch (e) {
        return send(res, 200, watcher.update(w.id, { status: 'WAITING_DATA', note: `error fuente: ${e.message}` }));
      }
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

    const poaMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/poa$/);
    if (poaMatch && req.method === 'GET') {
      const claim = store.get(poaMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
      return send(res, 200, generatePoaLetter(claim, lang), MIME['.html']);
    }

    const invoiceMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/invoice$/);
    if (invoiceMatch && req.method === 'GET') {
      const claim = store.get(invoiceMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const amount = url.searchParams.get('amount') ? Number(url.searchParams.get('amount')) : null;
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
      return send(res, 200, generateInvoiceLetter(claim, { amount, lang }), MIME['.html']);
    }

    const courtMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/court$/);
    if (courtMatch && req.method === 'GET') {
      const claim = store.get(courtMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const kind = url.searchParams.get('kind') === 'cta' ? 'cta' : 'demanda_verbal';
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
      return send(res, 200, generateCourtLetter(claim, kind, lang), MIME['.html']);
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

// Fail-closed: sin ADMIN_TOKEN la API queda abierta (authorized() devuelve true).
// Esta base guarda PNR, documentos e IBAN de clientes: exponerla sin token en una
// interfaz pública es una fuga de datos personales, no un simple descuido.
// Por eso, sin token solo se escucha en loopback; exponer requiere token explícito.
const HOST = process.env.HOST || (ADMIN_TOKEN ? '0.0.0.0' : '127.0.0.1');

server.listen(PORT, HOST, () => {
  console.log(`VuelaClaim escuchando en http://${HOST}:${PORT}`);
  if (!ADMIN_TOKEN) {
    console.log('AVISO: sin ADMIN_TOKEN — accesible solo desde esta máquina. Para exponerlo: ADMIN_TOKEN=<secreto> HOST=0.0.0.0');
  }
});
