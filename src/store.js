// reclama261 — almacén JSON atómico (sin dependencias)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { claims: [] };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      }
    } catch {
      this.data = { claims: [] };
    }
    if (!Array.isArray(this.data.claims)) this.data.claims = [];
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return [...this.data.claims].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  get(id) {
    return this.data.claims.find((c) => c.id === id) || null;
  }

  create(claim) {
    const now = new Date().toISOString();
    const rec = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      history: [{ at: now, status: 'DRAFT', note: 'Reclamación creada' }],
      ...claim,
    };
    this.data.claims.push(rec);
    this._save();
    return rec;
  }

  update(id, patch) {
    const rec = this.get(id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    this._save();
    return rec;
  }

  setStatus(id, status, note = '') {
    const rec = this.get(id);
    if (!rec) return null;
    const now = new Date().toISOString();
    rec.status = status;
    rec.updatedAt = now;
    rec.history = rec.history || [];
    rec.history.push({ at: now, status, note: note || undefined });
    this._save();
    return rec;
  }
}
