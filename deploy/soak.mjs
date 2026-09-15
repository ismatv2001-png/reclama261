// VuelaClaim — prueba de carga ligera (sin dependencias)
// Uso: node deploy/soak.mjs [url] [concurrentes] [segundos]
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const CONCURRENCY = Number(process.argv[3] || 8);
const SECONDS = Number(process.argv[4] || 10);

const ROUTES = [
  { path: '/api/health', method: 'GET' },
  { path: '/api/stats', method: 'GET' },
  { path: '/api/airlines', method: 'GET' },
  { path: '/api/rights?q=tecnico', method: 'GET' },
  { path: '/api/claims/export', method: 'GET' },
  { path: '/api/check', method: 'POST', body: JSON.stringify({
    departureIata: 'MAD', arrivalIata: 'BCN', airlineCountry: 'ES', eventType: 'delay',
    scheduledArrival: '2026-05-01T10:00', actualArrival: '2026-05-01T13:30',
    flightDate: '2026-05-01', passengers: 1, claimCountry: 'ES',
  }) },
];

let ok = 0;
let err = 0;
let bytes = 0;

async function worker() {
  const deadline = Date.now() + SECONDS * 1000;
  while (Date.now() < deadline) {
    const r = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    try {
      const res = await fetch(`${BASE}${r.path}`, {
        method: r.method,
        headers: { 'Content-Type': 'application/json' },
        body: r.body,
      });
      const text = await res.text();
      bytes += text.length;
      if (res.ok) ok++; else err++;
    } catch {
      err++;
    }
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const secs = (Date.now() - t0) / 1000;
console.log(`VuelaClaim soak: ${CONCURRENCY} concurrentes × ${secs.toFixed(1)} s`);
console.log(`OK: ${ok} · errores: ${err} · ${(ok / secs).toFixed(1)} req/s · ${(bytes / 1048576).toFixed(2)} MB`);
process.exit(err > 0 && ok === 0 ? 1 : 0);
