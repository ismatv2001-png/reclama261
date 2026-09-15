// VuelaClaim — fuentes de datos de vuelo
// OpenSky Network: gratis sin clave para volumen bajo (arrivals por aeropuerto).
// AviationStack: clave gratuita opcional (100 req/mes) para consultas por número de vuelo.

const OPEN_SKY_BASE = 'https://opensky-network.org/api';
const AVSTACK_BASE = 'https://api.aviationstack.com/v1';

export function normalizeCallsign(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// GET /flights/arrival?airport=XXX&begin=..&end=.. (epoch, segundos)
export async function fetchArrivalsOpenSky({ arrivalIata, beginEpoch, endEpoch, fetcher = fetch } = {}) {
  const url = `${OPEN_SKY_BASE}/flights/arrival?airport=${encodeURIComponent(arrivalIata)}&begin=${Math.floor(beginEpoch)}&end=${Math.floor(endEpoch)}`;
  const res = await fetcher(url, { headers: { 'User-Agent': 'VuelaClaim/0.4' } });
  if (res.status === 429) throw new Error('opensky_rate_limit');
  if (!res.ok) throw new Error(`opensky_${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('opensky_bad_payload');
  return data.map((f) => ({
    callsign: f.callsign || '',
    firstSeen: f.firstSeen ?? null,
    lastSeen: f.lastSeen ?? null,
    estArrivalAirport: f.estArrivalAirport || '',
    estArrivalHorizDistance: f.estArrivalHorizDistance ?? null,
  }));
}

// Consulta por número de vuelo + fecha (requiere AVSTACK_KEY)
export async function fetchFlightAvstack({ flightNumber, flightDate, key, fetcher = fetch } = {}) {
  if (!key) throw new Error('avstack_no_key');
  const url = `${AVSTACK_BASE}/flights?flight_iata=${encodeURIComponent(flightNumber)}&flight_date=${encodeURIComponent(flightDate)}&access_key=${encodeURIComponent(key)}`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`avstack_${res.status}`);
  const data = await res.json();
  const flights = (data.data || []).map((f) => ({
    flightNumber: f.flight?.iata || f.flight?.number || '',
    status: f.flight_status || '',
    scheduledArrival: f.arrival?.scheduled || null,
    actualArrival: f.arrival?.actual || null,
    delayMin: f.arrival?.delay ?? null,
  }));
  return { flights, pagination: data.pagination || {} };
}

// ¿El callsign de OpenSky (ej. IBE1234, RYR3AB) corresponde al número de vuelo (IB1234, FR3AB)?
// Acepta strings o el objeto de llegada completo; devuelve el elemento original coincidente.
export function matchFlight(items, flightNumber) {
  const want = normalizeCallsign(flightNumber);
  if (want.length < 4) return null;
  // Sufijo numérico (ej. "1234" de IB1234) — OpenSky usa el prefijo ICAO de 3 letras
  const digits = want.replace(/^[A-Z]+/, '');
  const key = digits.length >= 3 ? digits : want;
  return items.find((item) => {
    const n = normalizeCallsign(typeof item === 'string' ? item : item?.callsign);
    return n === want || n.endsWith(key) || n.includes(want);
  }) || null;
}

// Retraso en minutos: lastSeen (epoch segundos) vs llegada programada (ISO)
export function delayFromArrival(lastSeenEpoch, scheduledArrivalISO) {
  const sched = Date.parse(scheduledArrivalISO);
  if (Number.isNaN(sched) || !lastSeenEpoch) return null;
  return Math.round((lastSeenEpoch * 1000 - sched) / 60000);
}
