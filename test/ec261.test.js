// reclama261 — tests del motor EU261
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceBetween, compensationAmount, isCovered, evaluateClaim, limitationDeadline,
} from '../src/ec261.js';

test('distancia MAD-BCN ≈ 480-490 km y tier short', () => {
  const d = distanceBetween('MAD', 'BCN');
  assert.ok(d);
  assert.ok(d.km > 400 && d.km < 550, `km=${d.km}`);
  assert.equal(d.tier, 'short');
});

test('importes por distancia', () => {
  assert.equal(compensationAmount(1000), 250);
  assert.equal(compensationAmount(2500), 400);
  assert.equal(compensationAmount(4000), 600);
});

test('cobertura Art. 3: salida UE cualquier aerolínea; entrada UE solo aerolínea UE', () => {
  assert.equal(isCovered({ departureCountry: 'ES', arrivalCountry: 'US', airlineCountry: 'US' }).covered, true);
  assert.equal(isCovered({ departureCountry: 'US', arrivalCountry: 'ES', airlineCountry: 'ES' }).covered, true);
  assert.equal(isCovered({ departureCountry: 'US', arrivalCountry: 'US', airlineCountry: 'US' }).covered, false);
  assert.equal(isCovered({ departureCountry: 'US', arrivalCountry: 'ES', airlineCountry: 'US' }).covered, false);
});

test('retraso: 3h exactas dan derecho; 2h59 no', () => {
  const base = { departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'delay', flightDate: '2026-05-01', claimCountry: 'ES' };
  const ok = evaluateClaim({ ...base, scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T13:00' });
  assert.equal(ok.eligible, true);
  assert.equal(ok.totalAmount, 250);
  const no = evaluateClaim({ ...base, scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T12:59' });
  assert.equal(no.eligible, false);
  assert.equal(no.totalAmount, 0);
});

test('cancelación: aviso ≥14 días exime; aviso 6 días sin recolocación no', () => {
  const base = { departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'cancellation', scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-02T10:00', flightDate: '2026-05-01', claimCountry: 'ES' };
  const exempt = evaluateClaim({ ...base, noticeDays: 14 });
  assert.equal(exempt.eligible, false);
  const liable = evaluateClaim({ ...base, noticeDays: 6 });
  assert.equal(liable.eligible, true);
  assert.equal(liable.totalAmount, 250);
});

test('cancelación aviso 6 días + recolocación dentro de margen → exenta', () => {
  const ev = evaluateClaim({
    departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'cancellation',
    scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T11:30',
    rerouteArrival: '2026-05-01T11:30', noticeDays: 6, flightDate: '2026-05-01', claimCountry: 'ES',
  });
  assert.equal(ev.eligible, false);
});

test('larga distancia MAD-JFK: 600 € por pasajero; 2 pasajeros = 1200', () => {
  const ev = evaluateClaim({
    departureIata: 'MAD', arrivalIata: 'JFK', airlineCountry: 'ES', eventType: 'delay',
    scheduledArrival: '2026-06-01T20:00', actualArrival: '2026-06-02T01:00',
    flightDate: '2026-06-01', claimCountry: 'ES', passengers: 2,
  });
  assert.equal(ev.eligible, true);
  assert.equal(ev.amountPerPassenger, 600);
  assert.equal(ev.totalAmount, 1200);
});

test('excusa "problema técnico" coincide con jurisprudencia y no exime', () => {
  const ev = evaluateClaim({
    departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'delay',
    scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T13:30',
    flightDate: '2026-05-01', claimCountry: 'ES', airlineReason: 'problema técnico',
  });
  assert.ok(ev.extraordinary.count >= 1);
  assert.equal(ev.extraordinary.likely, false);
  assert.equal(ev.eligible, true);
});

test('plazos de prescripción: ES 5 años, DE 3 años (fin de año)', () => {
  const es = limitationDeadline('2026-05-01', 'ES');
  assert.equal(es.deadlineISO, '2031-05-01');
  const de = limitationDeadline('2026-05-01', 'DE');
  assert.equal(de.deadlineISO, '2029-12-31');
  const expirado = limitationDeadline('2015-05-01', 'ES');
  assert.equal(expirado.expired, true);
});

test('IATA desconocido devuelve error', () => {
  const ev = evaluateClaim({ departureIata: 'XXX', arrivalIata: 'MAD' });
  assert.equal(ev.error, 'unknown_iata');
});
