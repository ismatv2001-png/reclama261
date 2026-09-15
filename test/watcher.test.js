// VuelaClaim — tests del cazador proactivo (lógica pura, fetcher simulado)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchFlight, delayFromArrival, normalizeCallsign } from '../src/flightdata.js';
import { Watcher } from '../src/watcher.js';

test('normalización y emparejamiento de callsign', () => {
  assert.equal(normalizeCallsign(' IBE-1234 '), 'IBE1234');
  assert.equal(matchFlight(['IBE1234', 'RYR3AB'], 'IB1234'), 'IBE1234');
  assert.equal(matchFlight(['RYR3AB'], 'FR3AB'), 'RYR3AB');
  assert.equal(matchFlight(['IBE1234'], 'XX'), null);
});

test('retraso en minutos desde lastSeen epoch', () => {
  const sched = '2026-05-01T10:00:00Z';
  const schedEpoch = Date.parse(sched) / 1000;
  assert.equal(delayFromArrival(schedEpoch + 240 * 60, sched), 240);
  assert.equal(delayFromArrival(schedEpoch - 10 * 60, sched), -10);
  assert.equal(delayFromArrival(null, sched), null);
});

function makeWatcher(fetcher, onClaim = null) {
  const file = path.join(os.tmpdir(), `vuelaclaim-watch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const w = new Watcher(file, { fetcher, onClaim });
  return { w, file };
}

test('cazador: vuelo futuro → OBSERVING sin consultar la fuente', async () => {
  const { w, file } = makeWatcher(async () => { throw new Error('no debería llamarse'); });
  const fut = new Date(Date.now() + 3600 * 1000).toISOString();
  const rec = w.create({ flightNumber: 'IB1234', arrivalIata: 'BCN', scheduledArrival: fut, passengerName: 'X', flightDate: '2026-05-01' });
  const res = await w.checkWatch(rec);
  assert.equal(res.status, 'OBSERVING');
  assert.equal(res.checks, 0);
  fs.rmSync(file, { force: true });
});

function fakeArrivals(list) {
  return async () => ({ ok: true, status: 200, json: async () => list });
}

test('cazador: retraso 4 h → crea reclamo automáticamente', async () => {
  const sched = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const schedEpoch = Date.parse(sched) / 1000;
  let created = null;
  const fetcher = fakeArrivals([{
    callsign: 'IBE1234', firstSeen: schedEpoch, lastSeen: schedEpoch + 4 * 3600, estArrivalAirport: 'BCN',
  }]);
  const { w, file } = makeWatcher(fetcher, (watch, delayMin) => { created = { watch, delayMin }; return 'CLAIM-1'; });
  const rec = w.create({ flightNumber: 'IB1234', arrivalIata: 'BCN', scheduledArrival: sched, passengerName: 'X', flightDate: '2026-05-01' });
  const res = await w.checkWatch(rec);
  assert.equal(res.status, 'CLAIM_CREATED');
  assert.equal(res.claimId, 'CLAIM-1');
  assert.equal(res.delayMin, 240);
  assert.ok(created, 'onClaim llamado');
  assert.equal(created.delayMin, 240);
  fs.rmSync(file, { force: true });
});

test('cazador: retraso 2 h → NO_COMPENSATION sin crear reclamo', async () => {
  const sched = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const schedEpoch = Date.parse(sched) / 1000;
  const fetcher = fakeArrivals([{ callsign: 'IBE1234', lastSeen: schedEpoch + 2 * 3600, estArrivalAirport: 'BCN' }]);
  const { w, file } = makeWatcher(fetcher, () => { throw new Error('no debe crear'); });
  const rec = w.create({ flightNumber: 'IB1234', arrivalIata: 'BCN', scheduledArrival: sched, passengerName: 'X', flightDate: '2026-05-01' });
  const res = await w.checkWatch(rec);
  assert.equal(res.status, 'NO_COMPENSATION');
  assert.equal(res.delayMin, 120);
  fs.rmSync(file, { force: true });
});

test('cazador: sin datos <24 h → WAITING_DATA; >24 h → NO_DATA', async () => {
  const fetcher = fakeArrivals([]);
  // <24h
  const sched1 = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { w, file } = makeWatcher(fetcher);
  const rec1 = w.create({ flightNumber: 'IB1234', arrivalIata: 'BCN', scheduledArrival: sched1, passengerName: 'X', flightDate: '2026-05-01' });
  const r1 = await w.checkWatch(rec1);
  assert.equal(r1.status, 'WAITING_DATA');
  assert.equal(r1.checks, 1);
  // >24h
  const sched2 = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const rec2 = w.create({ flightNumber: 'IB1234', arrivalIata: 'BCN', scheduledArrival: sched2, passengerName: 'Y', flightDate: '2026-05-01' });
  const r2 = await w.checkWatch(rec2);
  assert.equal(r2.status, 'NO_DATA');
  fs.rmSync(file, { force: true });
});
