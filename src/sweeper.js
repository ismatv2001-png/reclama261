// VuelaClaim — BARRIDO a escala: detecta vuelos retrasados de un aeropuerto/día y los convierte en oportunidades
// Fuente principal: AviationStack (clave gratuita, 100 req/mes). Sin clave devuelve instrucción clara.

const AVSTACK_BASE = 'https://api.aviationstack.com/v1';

export function mapAvstackFlight(f) {
  const scheduledArrival = f.arrival?.scheduled || null;
  const delayMin = f.arrival?.delay ?? null;
  return {
    flightNumber: f.flight?.iata || f.flight?.number || '',
    airline: f.airline?.name || '',
    airlineIata: f.airline?.iata || '',
    departureIata: f.departure?.iata || '',
    arrivalIata: f.arrival?.iata || '',
    scheduledArrival,
    actualArrival: f.arrival?.actual || null,
    delayMin,
    status: f.flight_status || '',
    claimable: typeof delayMin === 'number' && delayMin >= 180,
  };
}

export async function sweepAirportDay({
  airportIata, flightDate, direction = 'dep', key = '', fetcher = fetch, limit = 100,
} = {}) {
  if (!key) {
    return {
      provider: 'aviationstack', ok: false, error: 'avstack_no_key',
      hint: 'Registra la clave gratuita de AviationStack y expórtala como AVSTACK_KEY para barrer aeropuertos enteros.',
      opportunities: [],
    };
  }
  const param = direction === 'arr' ? 'arr_iata' : 'dep_iata';
  const url = `${AVSTACK_BASE}/flights?${param}=${encodeURIComponent(airportIata)}&flight_date=${encodeURIComponent(flightDate)}&limit=${limit}&access_key=${encodeURIComponent(key)}`;
  const res = await fetcher(url);
  if (!res.ok) return { provider: 'aviationstack', ok: false, error: `avstack_${res.status}`, opportunities: [] };
  const data = await res.json();
  const all = (data.data || []).map(mapAvstackFlight);
  const opportunities = all.filter((f) => f.claimable).sort((a, b) => b.delayMin - a.delayMin);
  return {
    provider: 'aviationstack',
    ok: true,
    airportIata,
    flightDate,
    direction,
    scanned: all.length,
    opportunities,
    totalDelayMin: opportunities.reduce((s, f) => s + f.delayMin, 0),
  };
}

// Barrido multi-aeropuerto (para la flota: un agente por aeropuerto)
export async function sweepMany({ airports = [], flightDate, key = '', fetcher = fetch, direction = 'dep' } = {}) {
  const results = [];
  for (const airportIata of airports) {
    try {
      results.push(await sweepAirportDay({ airportIata, flightDate, key, fetcher, direction }));
    } catch (e) {
      results.push({ provider: 'aviationstack', ok: false, airportIata, error: e.message, opportunities: [] });
    }
  }
  return {
    ok: results.every((r) => r.ok),
    airports: results.length,
    opportunities: results.flatMap((r) => r.opportunities),
    results,
  };
}
