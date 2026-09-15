// reclama261 — servidor HTTP sin dependencias (Node ≥ 20)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRPORTS, evaluateClaim } from './ec261.js';
import { generateClaimLetter } from './letter.js';
import { Store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8787);
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.30);

const store = new Store(path.join(__dirname, '..', 'data', 'db.json'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
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
      if (data.length > 1_000_000) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
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

    // API
    if (p === '/api/airports' && req.method === 'GET') {
      const list = Object.entries(AIRPORTS).map(([iata, v]) => ({ iata, ...v }));
      return send(res, 200, list);
    }

    if (p === '/api/check' && req.method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, evaluateClaim(body));
    }

    if (p === '/api/claims' && req.method === 'GET') {
      return send(res, 200, store.list());
    }

    if (p === '/api/claims' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.passengerName || !body.departureIata || !body.arrivalIata) {
        return send(res, 400, { error: 'passengerName, departureIata y arrivalIata son obligatorios' });
      }
      const evaluation = evaluateClaim(body);
      const claim = store.create({ ...body, evaluation, passengers: Number(body.passengers) || 1 });
      return send(res, 201, claim);
    }

    const claimMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})$/);
    if (claimMatch && req.method === 'GET') {
      const claim = store.get(claimMatch[1]);
      return claim ? send(res, 200, claim) : send(res, 404, { error: 'not_found' });
    }

    if (claimMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const claim = store.get(claimMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      if (body.status && body.status !== claim.status) {
        store.setStatus(claim.id, body.status, body.note || '');
      }
      delete body.status;
      delete body.note;
      const updated = store.update(claim.id, body);
      return send(res, 200, updated);
    }

    const letterMatch = p.match(/^\/api\/claims\/([0-9a-f-]{36})\/letter$/);
    if (letterMatch && req.method === 'GET') {
      const claim = store.get(letterMatch[1]);
      if (!claim) return send(res, 404, { error: 'not_found' });
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
      return send(res, 200, generateClaimLetter(claim, lang), MIME['.html']);
    }

    if (p === '/api/stats' && req.method === 'GET') {
      const claims = store.list();
      const byStatus = {};
      let potential = 0;
      let potentialCommission = 0;
      let paid = 0;
      for (const c of claims) {
        byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        const amt = c.evaluation?.totalAmount || 0;
        if (c.status === 'PAID') paid += amt;
        else if (!['CLOSED', 'REJECTED'].includes(c.status)) {
          potential += amt;
          potentialCommission += Math.round(amt * COMMISSION_RATE);
        }
      }
      return send(res, 200, {
        total: claims.length,
        byStatus,
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
