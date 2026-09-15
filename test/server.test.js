// VuelaClaim — integración: levanta el servidor real y prueba la API entera
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 18000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;

let proc = null;

async function waitUp(ms = 6000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${BASE}/api/stats`);
      if (r.ok) return;
    } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('servidor no arrancó');
}

test('integración API completa', async () => {
  const dbFile = path.join(ROOT, 'data', `db.test-${Date.now()}.json`);
  proc = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile },
    stdio: 'ignore',
  });
  await waitUp();

  try {
    // estáticos + básicos
    let r = await fetch(`${BASE}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /VuelaClaim/);

    const stats = await (await fetch(`${BASE}/api/stats`)).json();
    assert.equal(typeof stats.potential, 'number');

    const airports = await (await fetch(`${BASE}/api/airports`)).json();
    assert.ok(airports.length > 50);

    const airlines = await (await fetch(`${BASE}/api/airlines`)).json();
    const u2 = airlines.find((a) => a.iata === 'U2');
    assert.ok(u2.tip, 'tip de easyJet presente');

    // check
    const check = await (await fetch(`${BASE}/api/check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'delay',
        scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T13:30',
        flightDate: '2026-05-01', passengers: 2, claimCountry: 'ES', airlineReason: 'problema técnico',
      }),
    })).json();
    assert.equal(check.eligible, true);
    assert.equal(check.totalAmount, 500);
    assert.ok(check.evidence.length >= 4, 'checklist de pruebas presente');
    assert.ok(check.extraordinary.count >= 1);

    // crear reclamo
    const claim = await (await fetch(`${BASE}/api/claims`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passengerName: 'Test API', departureIata: 'MAD', arrivalIata: 'BCN', airline: 'Iberia', eventType: 'delay', flightDate: '2026-05-01', scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T13:30', claimCountry: 'ES', airlineCountry: 'ES' }),
    })).json();
    assert.equal(claim.status, 'DRAFT');
    assert.equal(claim.evaluation.eligible, true);

    // cambio de estado + historial + nextActionDue
    const patched = await (await fetch(`${BASE}/api/claims/${claim.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUBMITTED', note: 'enviada por web' }),
    })).json();
    assert.equal(patched.status, 'SUBMITTED');
    assert.ok(patched.nextActionDue);
    assert.equal(patched.history.length, 2);

    // cartas: reclamación, escalado, recordatorio en varios idiomas
    for (const lang of ['es', 'en', 'de', 'fr', 'it', 'pt']) {
      const l = await fetch(`${BASE}/api/claims/${claim.id}/letter?lang=${lang}`);
      assert.equal(l.status, 200, `carta ${lang}`);
      const txt = await l.text();
      assert.match(txt, /<!doctype html>/i);
    }
    const esc = await (await fetch(`${BASE}/api/claims/${claim.id}/escalation?org=aesa&lang=es`)).text();
    assert.match(esc, /AESA/);
    const chaser = await (await fetch(`${BASE}/api/claims/${claim.id}/chaser?level=2&lang=de`)).text();
    assert.match(chaser, /Zweite Erinnerung/);

    // gastos + carta con gastos
    await fetch(`${BASE}/api/claims/${claim.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenses: [{ type: 'Hotel', amount: 95 }] }),
    });
    const letter = await (await fetch(`${BASE}/api/claims/${claim.id}/letter?lang=es`)).text();
    assert.match(letter, /Hotel: 95 €/);

    // documentos
    const doc = await fetch(`${BASE}/api/claims/${claim.id}/docs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'tarjeta.png', dataBase64: 'aGVsbG8=' }),
    });
    assert.equal(doc.status, 201);
    const docs = await (await fetch(`${BASE}/api/claims/${claim.id}/docs`)).json();
    assert.equal(docs.length, 1);

    // import CSV
    const imp = await (await fetch(`${BASE}/api/claims/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: 'passengerName,departureIata,arrivalIata,eventType,flightDate,scheduledArrival,actualArrival,claimCountry,airlineCountry\nJuan,BCN,MAD,delay,2026-05-02,2026-05-02T09:00,2026-05-02T12:30,ES,ES' }),
    })).json();
    assert.equal(imp.created, 1);

    // export
    const exp = await fetch(`${BASE}/api/claims/export`);
    assert.equal(exp.status, 200);
    assert.match(await exp.text(), /passengerName/);

    // derechos
    const rights = await (await fetch(`${BASE}/api/rights?q=huelga%20personal`)).json();
    assert.ok(rights.faq.length >= 1);
    assert.ok(rights.jurisprudence.length >= 1);

    // stats final
    const finalStats = await (await fetch(`${BASE}/api/stats`)).json();
    assert.equal(finalStats.total, 2);
  } finally {
    proc.kill();
    try { fs.rmSync(dbFile, { force: true }); } catch { /* ok */ }
  }
});
