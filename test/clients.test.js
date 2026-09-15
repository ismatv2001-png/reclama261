// VuelaClaim — tests de clientes/agencia (multi-tenant)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClientStore } from '../src/clients.js';

function tmpFile() {
  return path.join(os.tmpdir(), `vuelaclaim-clients-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('clientes: CRUD y comisión por defecto 30 %', () => {
  const file = tmpFile();
  const cs = new ClientStore(file);
  const c = cs.create({ name: 'Agencia Norte', email: 'a@norte.es' });
  assert.equal(c.commissionRate, 0.30);
  assert.equal(cs.list().length, 1);
  const upd = cs.update(c.id, { commissionRate: 0.25, iban: 'ES00' });
  assert.equal(upd.commissionRate, 0.25);
  assert.equal(cs.get(c.id).iban, 'ES00');
  assert.equal(cs.remove(c.id), true);
  assert.equal(cs.list().length, 0);
  assert.equal(cs.remove(c.id), false);
  fs.rmSync(file, { force: true });
});

test('clientes: agregado por cliente (potencial, cobrado, comisión)', () => {
  const file = tmpFile();
  const cs = new ClientStore(file);
  const a = cs.create({ name: 'A', commissionRate: 0.30 });
  const b = cs.create({ name: 'B', commissionRate: 0.20 });
  const claims = [
    { clientId: a.id, status: 'PAID', evaluation: { totalAmount: 1000 } },
    { clientId: a.id, status: 'SUBMITTED', evaluation: { totalAmount: 500 } },
    { clientId: b.id, status: 'OFFER', evaluation: { totalAmount: 400 } },
    { status: 'SUBMITTED', evaluation: { totalAmount: 250 } }, // sin cliente
  ];
  const stats = cs.stats(claims);
  const sa = stats.find((s) => s.id === a.id);
  const sb = stats.find((s) => s.id === b.id);
  const orphan = stats.find((s) => s.id === null);
  assert.equal(sa.claims, 2);
  assert.equal(sa.paid, 1000);
  assert.equal(sa.commission, 300);
  assert.equal(sa.potential, 500);
  assert.equal(sb.potential, 400);
  assert.equal(sb.commission, 0);
  assert.ok(orphan && orphan.claims === 1);
  fs.rmSync(file, { force: true });
});
