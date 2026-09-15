// VuelaClaim — Cazador proactivo: vigila vuelos, detecta retrasos y crea reclamos solo
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchArrivalsOpenSky, matchFlight, delayFromArrival } from './flightdata.js';

const CLEAN_STATUSES = new Set(['CLAIM_CREATED', 'NO_COMPENSATION', 'NO_DATA', 'ERROR']);

export class Watcher {
  constructor(file, { fetcher = fetch, intervalMs = 15 * 60 * 1000, onClaim = null } = {}) {
    this.file = file;
    this.fetcher = fetcher;
    this.intervalMs = intervalMs;
    this.onClaim = onClaim;
    this.timer = null;
    this.data = { watches: [] };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch { this.data = { watches: [] }; }
    if (!Array.isArray(this.data.watches)) this.data.watches = [];
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return [...this.data.watches].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  get(id) {
    return this.data.watches.find((w) => w.id === id) || null;
  }

  create(watch) {
    const rec = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'OBSERVING',
      checks: 0,
      ...watch,
    };
    this.data.watches.push(rec);
    this._save();
    return rec;
  }

  update(id, patch) {
    const w = this.get(id);
    if (!w) return null;
    Object.assign(w, patch, { updatedAt: new Date().toISOString() });
    this._save();
    return w;
  }

  remove(id) {
    const before = this.data.watches.length;
    this.data.watches = this.data.watches.filter((w) => w.id !== id);
    if (this.data.watches.length !== before) this._save();
    return this.data.watches.length !== before;
  }

  // Comprueba una vigilancia contra OpenSky. Pura lógica de negocio + fetcher inyectado.
  async checkWatch(w) {
    const sched = Date.parse(w.scheduledArrival);
    if (Number.isNaN(sched)) {
      this.update(w.id, { status: 'ERROR', note: 'fecha programada inválida' });
      return this.get(w.id);
    }
    // Antes de la hora programada: seguir observando (margen 30 min)
    if (Date.now() < sched - 30 * 60 * 1000) {
      this.update(w.id, { status: 'OBSERVING' });
      return this.get(w.id);
    }
    const arrivals = await fetchArrivalsOpenSky({
      arrivalIata: w.arrivalIata,
      beginEpoch: (sched - 2 * 3600 * 1000) / 1000,
      endEpoch: Date.now() / 1000 + 3600,
      fetcher: this.fetcher,
    });
    const hit = matchFlight(arrivals, w.flightNumber);
    const checks = (w.checks || 0) + 1;
    if (!hit || !hit.lastSeen) {
      // Sin datos aún: si lleva >24 h desde la hora programada, abandonar
      if (Date.now() > sched + 24 * 3600 * 1000) {
        this.update(w.id, { status: 'NO_DATA', checks, note: 'sin datos de OpenSky tras 24 h' });
      } else {
        this.update(w.id, { status: 'WAITING_DATA', checks });
      }
      return this.get(w.id);
    }
    const delayMin = delayFromArrival(hit.lastSeen, w.scheduledArrival);
    if (delayMin === null) {
      this.update(w.id, { status: 'WAITING_DATA', checks });
      return this.get(w.id);
    }
    if (delayMin >= 180) {
      const claimId = this.onClaim ? this.onClaim(w, delayMin) : null;
      this.update(w.id, {
        status: 'CLAIM_CREATED', checks, delayMin,
        lastSeenISO: new Date(hit.lastSeen * 1000).toISOString(), claimId,
      });
    } else {
      this.update(w.id, {
        status: 'NO_COMPENSATION', checks, delayMin,
        lastSeenISO: new Date(hit.lastSeen * 1000).toISOString(),
        note: `retraso ${delayMin} min (< 180) — sin compensación`,
      });
    }
    return this.get(w.id);
  }

  // Barre todas las vigilancias activas
  async sweep() {
    const results = [];
    for (const w of this.list()) {
      if (CLEAN_STATUSES.has(w.status)) continue;
      try { results.push(await this.checkWatch(w)); } catch (e) {
        this.update(w.id, { status: 'WAITING_DATA', note: `error fuente: ${e.message}` });
        results.push(this.get(w.id));
      }
    }
    return results;
  }

  start() {
    if (this.timer) return;
    this.sweep().catch(() => {});
    this.timer = setInterval(() => this.sweep().catch(() => {}), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
