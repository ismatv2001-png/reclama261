// VuelaClaim — campaña fuzz/property (PRNG determinista, reproducible)
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClaim, AIRPORTS } from '../src/ec261.js';
import { parseCsv } from '../src/csv.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IATAS = Object.keys(AIRPORTS);
const EVENTS = ['delay', 'cancellation', 'denied_boarding'];
const COUNTRIES = ['ES', 'DE', 'FR', 'GB', 'IT', 'PT', 'NL', 'PL', 'AT', 'CH', 'ZZ'];
const REASONS = ['', 'problema técnico', 'huelga', 'clima', 'maleta', ''];

function iso(min) {
  return new Date(Date.UTC(2026, 4, 1, 8, 0) + min * 60000).toISOString();
}

test('fuzz evaluateClaim: 2000 casos sin excepciones y con invariantes', () => {
  const rnd = mulberry32(42);
  for (let i = 0; i < 2000; i++) {
    const useUnknown = rnd() < 0.05;
    const departureIata = useUnknown ? 'XXX' : IATAS[Math.floor(rnd() * IATAS.length)];
    const arrivalIata = IATAS[Math.floor(rnd() * IATAS.length)];
    const eventType = EVENTS[Math.floor(rnd() * EVENTS.length)];
    const schedMin = Math.floor(rnd() * 3000);
    const deltaMin = Math.floor(rnd() * 1200) - 300; // de -300 a +900
    const input = {
      departureIata,
      arrivalIata,
      airlineCountry: COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      airlineCode: ['AC', 'DL', 'FR', 'IB', 'ZZ'][Math.floor(rnd() * 5)],
      eventType,
      flightDate: '2026-05-01',
      scheduledArrival: iso(schedMin),
      actualArrival: iso(schedMin + deltaMin),
      noticeDays: Math.floor(rnd() * 31),
      rerouteArrival: rnd() < 0.3 ? iso(schedMin + Math.floor(rnd() * 500)) : '',
      airlineReason: REASONS[Math.floor(rnd() * REASONS.length)],
      claimCountry: COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      passengers: 1 + Math.floor(rnd() * 6),
    };
    let ev;
    assert.doesNotThrow(() => { ev = evaluateClaim(input); }, `caso ${i}`);
    if (ev.error) {
      assert.equal(ev.error, 'unknown_iata', `caso ${i}`);
      continue;
    }
    assert.ok(Number.isFinite(ev.totalAmount), `caso ${i} totalAmount`);
    assert.ok(ev.totalAmount >= 0, `caso ${i}`);
    if (ev.eligible) assert.ok(ev.amountPerPassenger > 0, `caso ${i}`);
    assert.ok(['eu261', 'appr'].includes(ev.jurisdiction), `caso ${i}: ${ev.jurisdiction}`);
    assert.ok(Array.isArray(ev.evidence) && ev.evidence.length >= 2, `caso ${i}`);
    assert.ok(Array.isArray(ev.warnings), `caso ${i}`);
  }
});

test('fuzz parseCsv: 500 entradas aleatorias nunca lanzan', () => {
  const rnd = mulberry32(7);
  const chars = ['a', 'b', ',', '"', '\n', '\r', ' ', 'ñ', '€', ';'];
  for (let i = 0; i < 500; i++) {
    let s = '';
    const len = Math.floor(rnd() * 120);
    for (let j = 0; j < len; j++) s += chars[Math.floor(rnd() * chars.length)];
    let out;
    assert.doesNotThrow(() => { out = parseCsv(s); }, `csv ${i}: ${JSON.stringify(s)}`);
    assert.ok(Array.isArray(out), `csv ${i}`);
    // parseCsv devuelve objetos con las cabeceras como claves
    for (const row of out) {
      assert.equal(typeof row, 'object', `csv ${i}`);
      assert.ok(row !== null, `csv ${i}`);
      assert.equal(Array.isArray(row), false, `csv ${i}`);
    }
  }
  // cabecera sola → sin filas
  assert.deepEqual(parseCsv('a,b,c'), []);
  assert.deepEqual(parseCsv('a,b\n1,2'), [{ a: '1', b: '2' }]);
});

test('límite exacto: 179 min → 0 €; 180 y 181 min → 250 € (MAD-BCN)', () => {
  const base = {
    departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'delay',
    flightDate: '2026-05-01', claimCountry: 'ES', scheduledArrival: iso(0),
  };
  assert.equal(evaluateClaim({ ...base, actualArrival: iso(179) }).totalAmount, 0);
  assert.equal(evaluateClaim({ ...base, actualArrival: iso(180) }).totalAmount, 250);
  assert.equal(evaluateClaim({ ...base, actualArrival: iso(181) }).totalAmount, 250);
});
