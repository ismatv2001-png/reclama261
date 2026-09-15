// VuelaClaim — tests del régimen APPR (Canadá), portado de AERO (MIT)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isApprApplicable, isDomesticCanada, airlineSizeFromCode,
  apprCompensationFromHours, evaluateAppr,
} from '../src/appr.js';
import { evaluateClaim } from '../src/ec261.js';

test('APPR: aplicabilidad y doméstico', () => {
  assert.equal(isApprApplicable('YYZ', 'JFK'), true);
  assert.equal(isApprApplicable('MAD', 'YYZ'), true);
  assert.equal(isApprApplicable('MAD', 'JFK'), false);
  assert.equal(isDomesticCanada('YYZ', 'YVR'), true);
  assert.equal(isDomesticCanada('YYZ', 'JFK'), false);
});

test('APPR: tabla de compensación por horas y tamaño', () => {
  assert.equal(apprCompensationFromHours(2, 'large'), 0);
  assert.equal(apprCompensationFromHours(3, 'large'), 400);
  assert.equal(apprCompensationFromHours(6, 'large'), 700);
  assert.equal(apprCompensationFromHours(9, 'large'), 1000);
  assert.equal(apprCompensationFromHours(3, 'small'), 125);
  assert.equal(apprCompensationFromHours(6, 'small'), 250);
  assert.equal(apprCompensationFromHours(9, 'small'), 500);
});

test('APPR: tamaño de aerolínea (AC grande, Porter pequeña, desconocida pequeña)', () => {
  assert.equal(airlineSizeFromCode('AC'), 'large');
  assert.equal(airlineSizeFromCode('WS'), 'large');
  assert.equal(airlineSizeFromCode('PD'), 'small');
  assert.equal(airlineSizeFromCode('ZZ'), 'small');
});

test('APPR: evaluación completa YYZ→YVR con Air Canada 4h', () => {
  const ev = evaluateAppr({ departureIata: 'YYZ', arrivalIata: 'YVR', airlineCode: 'AC', delayMin: 240 });
  assert.equal(ev.applicable, true);
  assert.equal(ev.domestic, true);
  assert.equal(ev.amountPerPassengerCAD, 400);
});

test('evaluateClaim: jurisdicción auto deriva a APPR cuando EU261 no cubre', () => {
  // YYZ→JFK en Delta (US): EU261 no cubre, APPR sí
  const ev = evaluateClaim({
    departureIata: 'YYZ', arrivalIata: 'JFK', airlineCountry: 'US', airlineCode: 'DL',
    eventType: 'delay', scheduledArrival: '2026-06-01T18:00', actualArrival: '2026-06-01T23:00',
    flightDate: '2026-06-01', passengers: 1,
  });
  assert.equal(ev.jurisdiction, 'appr');
  assert.equal(ev.regulation, 'APPR (Canadá)');
  assert.equal(ev.eligible, true);
  assert.equal(ev.amountPerPassenger, 400);
  assert.equal(ev.currency, 'CAD');
  assert.equal(ev.deadline.country, 'CA');
});

test('evaluateClaim: EU261 tiene prioridad sobre APPR cuando ambos podrían aplicar', () => {
  // MAD→YYZ en Air Canada: EU261 cubre (salida UE) → jurisdicción eu261
  const ev = evaluateClaim({
    departureIata: 'MAD', arrivalIata: 'YYZ', airlineCountry: 'CA', airlineCode: 'AC',
    eventType: 'delay', scheduledArrival: '2026-06-01T18:00', actualArrival: '2026-06-01T22:00',
    flightDate: '2026-06-01', passengers: 1,
  });
  assert.equal(ev.jurisdiction, 'eu261');
  assert.equal(ev.regulation, 'EU261');
});
