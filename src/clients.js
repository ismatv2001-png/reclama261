// VuelaClaim — clientes/agencias (multi-tenant): carteras, comisión pactada y datos de facturación
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class ClientStore {
  constructor(file) {
    this.file = file;
    this.data = { clients: [] };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch { this.data = { clients: [] }; }
    if (!Array.isArray(this.data.clients)) this.data.clients = [];
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return [...this.data.clients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  get(id) {
    return this.data.clients.find((c) => c.id === id) || null;
  }

  create(client) {
    const rec = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      commissionRate: Number(client.commissionRate ?? 0.30),
      ...client,
    };
    this.data.clients.push(rec);
    this._save();
    return rec;
  }

  update(id, patch) {
    const rec = this.get(id);
    if (!rec) return null;
    if (patch.commissionRate !== undefined) patch.commissionRate = Number(patch.commissionRate);
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    this._save();
    return rec;
  }

  remove(id) {
    const before = this.data.clients.length;
    this.data.clients = this.data.clients.filter((c) => c.id !== id);
    if (this.data.clients.length !== before) this._save();
    return this.data.clients.length !== before;
  }

  // Agregado por cliente a partir de la lista de reclamos
  stats(claims) {
    const out = this.list().map((c) => ({
      id: c.id, name: c.name, commissionRate: c.commissionRate ?? 0.30,
      claims: 0, potential: 0, paid: 0, commission: 0,
    }));
    const byId = new Map(out.map((o) => [o.id, o]));
    const orphan = { id: null, name: '(sin cliente)', commissionRate: 0.30, claims: 0, potential: 0, paid: 0, commission: 0 };
    for (const claim of claims) {
      const target = byId.get(claim.clientId) || orphan;
      const amt = claim.evaluation?.totalAmount || 0;
      const rate = claim.commissionRate ?? target.commissionRate;
      target.claims += 1;
      if (claim.status === 'PAID') {
        target.paid += amt;
        target.commission += Math.round(amt * rate);
      } else if (!['CLOSED', 'REJECTED'].includes(claim.status)) {
        target.potential += amt;
      }
    }
    if (orphan.claims > 0) out.push(orphan);
    return out;
  }
}
