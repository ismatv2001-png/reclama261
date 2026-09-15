// reclama261 — tests de importación, cartas y SLA
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCsv, claimsToCsv } from '../src/csv.js';
import { generateClaimLetter, generateEscalationLetter, generateChaserLetter } from '../src/letter.js';
import { generatePoaLetter } from '../src/poa.js';
import { generateInvoiceLetter } from '../src/invoice.js';
import { generateCourtLetter } from '../src/court.js';
import { answerRights } from '../src/rights.js';
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

test('recordatorios escalonados: nivel 1, 2 y 3 con tono creciente', () => {
  const c1 = generateChaserLetter(claimFixture, 1, 'es');
  assert.match(c1, /Primer recordatorio/);
  const c3 = generateChaserLetter(claimFixture, 3, 'es');
  assert.match(c3, /Último requerimiento/);
  const c2de = generateChaserLetter(claimFixture, 2, 'de');
  assert.match(c2de, /Zweite Erinnerung/);
});

test('gastos Art. 9 aparecen en la carta y se exportan en CSV', () => {
  const withExp = { ...claimFixture, expenses: [{ type: 'Hotel', amount: 120 }, { type: 'Comida', amount: 35 }] };
  const letter = generateClaimLetter(withExp, 'es');
  assert.match(letter, /Hotel: 120 €/);
  assert.match(letter, /155 €/);
  const csv = claimsToCsv([withExp]);
  assert.match(csv, /expensesEUR/);
  assert.match(csv, /155/);
});

test('base de conocimiento: responde sobre excusas técnicas y plazos', () => {
  const r = answerRights('la aerolínea dice problema técnico');
  assert.ok(r.faq.length >= 1);
  assert.ok(r.jurisprudence.length >= 1);
  assert.match(r.faq[0].question, /técnico/i);
  const r2 = answerRights('¿cuántos años tengo para reclamar?');
  assert.match(r2.faq[0].question, /Hasta cuándo/i);
});

test('cesión de derechos (POA) en ES y EN', () => {
  const es = generatePoaLetter(claimFixture, 'es');
  assert.match(es, /AUTORIZO expresamente/);
  assert.match(es, /VuelaClaim/);
  assert.match(es, /Prueba Pérez/);
  const en = generatePoaLetter(claimFixture, 'en');
  assert.match(en, /Power of attorney/);
  assert.match(en, /30 %/);
});

test('factura de comisión: 30 % sobre lo cobrado', () => {
  const inv = generateInvoiceLetter({ ...claimFixture, paidAmount: 500 }, { lang: 'es' });
  assert.match(inv, /FACTURA/);
  assert.match(inv, /150\.00 €/);
  assert.match(inv, /VC-/);
  const invEn = generateInvoiceLetter({ ...claimFixture, paidAmount: 1000 }, { lang: 'en' });
  assert.match(invEn, /INVOICE/);
  assert.match(invEn, /300\.00 €/);
});

test('demanda de juicio verbal (ES) y queja CTA (CA)', () => {
  const d = generateCourtLetter(claimFixture, 'demanda_verbal', 'es');
  assert.match(d, /JUICIO VERBAL/);
  assert.match(d, /500 €/);
  assert.match(d, /LEC/);
  const cta = generateCourtLetter({ ...claimFixture, evaluation: { totalAmount: 400 } }, 'cta', 'en');
  assert.match(cta, /Canadian Transportation Agency/);
  assert.match(cta, /400 CAD/);
});
