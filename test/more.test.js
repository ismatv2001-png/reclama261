// reclama261 — tests de importación, cartas y SLA
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCsv } from '../src/csv.js';
import { generateClaimLetter, generateEscalationLetter } from '../src/letter.js';
import { Store } from '../src/store.js';

const claimFixture = {
  id: '00000000-0000-4000-8000-000000000001',
  passengerName: 'Prueba Pérez',
  airline: 'Iberia',
  flightNumber: 'IB1234',
  departureIata: 'MAD',
  arrivalIata: 'BCN',
  eventType: 'delay',
  flightDate: '2026-05-01',
  passengers: 2,
  evaluation: {
    covered: true, regulation: 'EU261', distanceKm: 483, tier: 'short',
    delayMin: 210, eligible: true, reducedBy50: false,
    amountPerPassenger: 250, totalAmount: 500,
    extraordinary: { matched: [{ citation: 'C-549/07', ruling: 'Anspruch besteht.' }], count: 1, likely: false },
    deadline: { deadlineISO: '2031-05-01', years: 5 },
  },
};

test('parseCsv maneja comillas, comas y CRLF', () => {
  const csv = 'name,email\r\n"García, María",maria@x.com\r\nJuan,juan@x.com';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'García, María');
  assert.equal(rows[1].email, 'juan@x.com');
});

test('carta en alemán y escalado AESA en español', () => {
  const de = generateClaimLetter(claimFixture, 'de');
  assert.match(de, /Ausgleichsforderung/);
  assert.match(de, /500 €/);
  const esc = generateEscalationLetter(claimFixture, 'aesa', 'es');
  assert.match(esc, /AESA/);
  assert.match(esc, /artículo 7/);
  const enEsc = generateEscalationLetter(claimFixture, 'caa', 'en');
  assert.match(enEsc, /Civil Aviation Authority/);
});

test('store: nextActionDue y stuck', () => {
  const file = path.join(os.tmpdir(), `reclama-test-${Date.now()}.json`);
  const s = new Store(file);
  const rec = s.create({
    passengerName: 'X', departureIata: 'MAD', arrivalIata: 'BCN',
    evaluation: { totalAmount: 250 },
  });
  assert.equal(rec.status, 'DRAFT');
  s.setStatus(rec.id, 'SUBMITTED');
  const updated = s.get(rec.id);
  assert.equal(updated.status, 'SUBMITTED');
  assert.ok(updated.nextActionDue);
  assert.equal(updated.history.length, 2);
  // simular vencido
  s.update(rec.id, { nextActionDue: '2000-01-01' });
  assert.equal(s.stuck().length, 1);
  s.setStatus(rec.id, 'PAID');
  assert.equal(s.stuck().length, 0);
  fs.rmSync(file, { force: true });
});
