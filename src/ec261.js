// reclama261 — motor EU261/2004
// Reglas adaptadas de flight-rights-mcp (MIT, (c) 2026 Mikel) + Reglamento CE 261/2004.
// Datos: src/data/airports.json y src/data/jurisprudence.json (MIT, flight-rights-mcp).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAppr, isApprApplicable } from './appr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AIRPORTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'airports.json'), 'utf8'),
).airports;

export const JURISPRUDENCE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'jurisprudence.json'), 'utf8'),
);

export const EU_EEA_CH_GB = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'CH', 'GB',
]);

// Alias ES/EN (sin acentos) → palabra clave presente en la jurisprudencia.
const ALIASES = {
  tecnico: 'technical', tecnica: 'technical',
  averia: 'defect', defecto: 'defect', fallo: 'defect', reparacion: 'defect',
  mantenimiento: 'wartung',
  pajaro: 'bird', pajaros: 'bird', ave: 'bird',
  huelga: 'strike', paro: 'strike', controladores: 'strike',
  meteorologico: 'weather', meteorologica: 'weather', tormenta: 'wetter',
  temporal: 'wetter', niebla: 'weather', viento: 'weather', nieve: 'wetter',
  hielo: 'eis', helada: 'eis',
  volcan: 'volcano', ceniza: 'ash', erupcion: 'volcano',
};

function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function distanceBetween(iataA, iataB) {
  const a = String(iataA).trim().toUpperCase();
  const b = String(iataB).trim().toUpperCase();
  if (!AIRPORTS[a] || !AIRPORTS[b]) return null;
  const km = haversineKm(
    AIRPORTS[a].lat, AIRPORTS[a].lon, AIRPORTS[b].lat, AIRPORTS[b].lon,
  );
  return {
    km: Math.round(km),
    tier: km <= 1500 ? 'short' : km <= 3500 ? 'medium' : 'long',
    a: { iata: a, ...AIRPORTS[a] },
    b: { iata: b, ...AIRPORTS[b] },
  };
}

export function tierOfKm(km) {
  return km <= 1500 ? 'short' : km <= 3500 ? 'medium' : 'long';
}

export function compensationAmount(km) {
  if (km <= 1500) return 250;
  if (km <= 3500) return 400;
  return 600;
}

export function isCovered({ departureCountry, arrivalCountry, airlineCountry }) {
  const dep = String(departureCountry || '').toUpperCase();
  const arr = String(arrivalCountry || '').toUpperCase();
  const air = String(airlineCountry || '').toUpperCase();
  if (EU_EEA_CH_GB.has(dep)) {
    return { covered: true, regulation: dep === 'GB' ? 'UK261' : 'EU261', basis: 'Art. 3(1)(a)' };
  }
  if (EU_EEA_CH_GB.has(air) && EU_EEA_CH_GB.has(arr)) {
    return { covered: true, regulation: 'EU261', basis: 'Art. 3(1)(b)' };
  }
  return { covered: false, regulation: null, basis: null };
}

export function minutesBetween(isoA, isoB) {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
}

export function checkExtraordinary(reason) {
  const text = normalize(reason);
  const cases = JURISPRUDENCE.cases;
  const matched = [];
  if (text) {
    for (const c of cases) {
      const kws = (c.keywords || []).map((k) => normalize(k));
      const hit = kws.some((k) => text.includes(k)) ||
        Object.entries(ALIASES).some(([alias, kw]) =>
          text.includes(alias) && kws.some((k) => k.includes(kw)));
      if (hit) matched.push(c);
    }
  }
  const likely = matched.length > 0 &&
    matched.every((m) => /no (hay|existe) (derecho|compensación)|sin derecho/i.test(m.result_for_passenger || ''));
  return { matched, likely, count: matched.length };
}

export function limitationDeadline(flightDateISO, country = 'ES') {
  const rules = JURISPRUDENCE.statute_of_limitations;
  const c = String(country).toUpperCase();
  const flight = new Date(`${flightDateISO}T12:00:00Z`);
  if (Number.isNaN(flight.getTime())) return { error: 'invalid_date' };
  if (!rules[c]) return { error: 'unknown_country', available: Object.keys(rules) };
  const years = rules[c].years;
  let deadline;
  if (c === 'DE') {
    deadline = new Date(Date.UTC(flight.getUTCFullYear() + years, 11, 31));
  } else {
    deadline = new Date(Date.UTC(flight.getUTCFullYear() + years, flight.getUTCMonth(), flight.getUTCDate()));
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysRemaining = Math.round((deadline - today) / 86400000);
  return {
    country: c,
    years,
    rule: rules[c].rule,
    deadlineISO: deadline.toISOString().slice(0, 10),
    daysRemaining,
    expired: daysRemaining < 0,
  };
}

// ── Evaluación principal ──────────────────────────────────────────────
export function evaluateClaim({
  eventType = 'delay',
  scheduledArrival = '',
  actualArrival = '',
  departureIata = '',
  arrivalIata = '',
  airlineCountry = '',
  airlineCode = '',
  noticeDays = 0,
  rerouteArrival = '',
  rerouteDeparture = '',
  airlineReason = '',
  claimCountry = 'ES',
  flightDate = '',
  passengers = 1,
  jurisdiction = 'auto', // 'eu261' | 'appr' | 'auto'
} = {}) {
  const dist = distanceBetween(departureIata, arrivalIata);
  if (!dist) {
    return { error: 'unknown_iata', detail: [departureIata, arrivalIata] };
  }
  const coverage = isCovered({
    departureCountry: dist.a.country,
    arrivalCountry: dist.b.country,
    airlineCountry,
  });
  const delayMin = minutesBetween(scheduledArrival, actualArrival);

  // Ruta APPR (Canadá): aplica cuando se pide explícitamente o en 'auto' cuando EU261 no cubre
  const appr = (jurisdiction === 'appr' || (jurisdiction === 'auto' && !coverage.covered && isApprApplicable(departureIata, arrivalIata)))
    ? evaluateAppr({ departureIata, arrivalIata, airlineCode, delayMin, eventType })
    : null;

  if (appr && appr.applicable) {
    const total = appr.amountPerPassengerCAD * Math.max(1, Number(passengers) || 1);
    const baseDate = flightDate || scheduledArrival.slice(0, 10);
    const deadlineDate = new Date(`${baseDate}T12:00:00Z`);
    deadlineDate.setUTCFullYear(deadlineDate.getUTCFullYear() + 1);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const deadline = {
      country: 'CA',
      years: 1,
      rule: 'CTA: presentar la queja dentro de 1 año desde el incidente',
      deadlineISO: deadlineDate.toISOString().slice(0, 10),
      daysRemaining: Math.round((deadlineDate - today) / 86400000),
      expired: deadlineDate < today,
    };
    return {
      covered: true,
      regulation: appr.regulation,
      basis: appr.domestic ? 'APPR s.19 (vuelo doméstico)' : 'APPR s.19 (vuelo con origen/destino Canadá)',
      distanceKm: dist.km,
      tier: dist.tier,
      delayMin,
      eligible: appr.amountPerPassengerCAD > 0,
      reducedBy50: false,
      amountPerPassenger: appr.amountPerPassengerCAD,
      currency: 'CAD',
      totalAmount: total,
      reasons: [appr.note],
      warnings: [appr.note],
      extraordinary: { matched: [], likely: false, count: 0 },
      deadline,
      evidence: [
        'Tarjeta de embarque o itinerario',
        'Prueba del retraso (hora real de llegada)',
        'Prueba de que el motivo estaba bajo control de la aerolínea',
      ],
      jurisdiction: 'appr',
    };
  }
  const rerouteArrivalDelta = rerouteArrival
    ? minutesBetween(scheduledArrival, rerouteArrival) : null;
  const rerouteDepartureDelta = rerouteDeparture
    ? minutesBetween(scheduledArrival, rerouteDeparture) : null;
  const amount = compensationAmount(dist.km);
  const deadline = limitationDeadline(flightDate || scheduledArrival.slice(0, 10), claimCountry);
  const extraordinary = checkExtraordinary(airlineReason);

  const reasons = [];
  let eligible = false;
  let reducedBy50 = false;

  if (!coverage.covered) {
    reasons.push('Vuelo fuera del ámbito EU261/UK261 (Art. 3).');
  } else if (eventType === 'delay') {
    if (delayMin === null) reasons.push('Faltan horas de llegada programada/real.');
    else if (delayMin >= 180) { eligible = true; reasons.push(`Retraso de ${delayMin} min (≥ 180) — derecho pleno (Sturgeon C-402/07).`); }
    else reasons.push(`Retraso de ${delayMin} min (< 180) — sin compensación (sí hay derecho a asistencia).`);
  } else if (eventType === 'cancellation' || eventType === 'denied_boarding') {
    const n = Number(noticeDays) || 0;
    const exempt =
      (eventType === 'cancellation' && n >= 14) ||
      (eventType === 'cancellation' && n >= 7 && rerouteArrivalDelta !== null &&
        rerouteArrivalDelta <= 240 && (rerouteDepartureDelta === null || rerouteDepartureDelta >= -120)) ||
      (eventType === 'cancellation' && n < 7 && rerouteArrivalDelta !== null &&
        rerouteArrivalDelta <= 120 && (rerouteDepartureDelta === null || rerouteDepartureDelta >= -60)) ||
      (eventType === 'denied_boarding' && rerouteArrivalDelta !== null &&
        rerouteArrivalDelta <= 120 && (rerouteDepartureDelta === null || rerouteDepartureDelta >= -60));
    if (exempt) {
      reasons.push(eventType === 'cancellation'
        ? 'Cancelación exenta: aviso previo suficiente + recolocación dentro de márgenes (Art. 5).'
        : 'Denegación de embarque recolocada dentro de márgenes (Art. 4) — exenta.');
    } else {
      eligible = true;
      const band = dist.tier === 'short' ? 120 : dist.tier === 'medium' ? 180 : 240;
      if (rerouteArrivalDelta !== null && rerouteArrivalDelta <= band) {
        reducedBy50 = true;
        reasons.push('Recolocación dentro del margen Art. 7(2): importe reducido al 50 %.');
      } else {
        reasons.push(eventType === 'cancellation'
          ? 'Cancelación sin exención aplicable — derecho a compensación (Art. 5/7).'
          : 'Denegación de embarque — derecho a compensación (Art. 4/7).');
      }
    }
  } else {
    reasons.push('Tipo de evento desconocido.');
  }

  const finalAmount = eligible ? (reducedBy50 ? Math.round(amount / 2) : amount) : 0;
  const warnings = [];
  if (coverage.covered && delayMin !== null && delayMin >= 120 && delayMin < 180) {
    warnings.push('Asistencia (comida/hotel) exigible aunque no haya compensación.');
  }
  if (extraordinary.likely && eligible) {
    warnings.push('La excusa de la aerolínea suele prosperar en el TJUE — pedir pruebas y alegar medidas razonables.');
  } else if (eligible && extraordinary.count > 0) {
    warnings.push('Según jurisprudencia, esa excusa NO exime — citar el caso en la carta.');
  }
  if (deadline && deadline.expired) warnings.push('Posible prescripción — verificar con abogado antes de reclamar.');

  const evidence = [
    'Tarjeta de embarque (original o copia clara)',
    'Confirmación de reserva / email con PNR',
  ];
  if (eventType === 'delay') {
    evidence.push('Prueba del retraso: pantallazo de FlightRadar24/FlightAware o parte oficial de la aerolínea');
  } else if (eventType === 'cancellation') {
    evidence.push('Comunicación de cancelación de la aerolínea (email/SMS/captura)');
  } else if (eventType === 'denied_boarding') {
    evidence.push('Tarjeta de embarque sellada o certificado de denegación de embarque');
  }
  evidence.push('Datos bancarios (IBAN) para el pago');

  return {
    covered: coverage.covered,
    regulation: coverage.regulation,
    basis: coverage.basis,
    distanceKm: dist.km,
    tier: dist.tier,
    delayMin,
    eligible,
    reducedBy50,
    amountPerPassenger: finalAmount,
    currency: 'EUR',
    totalAmount: finalAmount * Math.max(1, Number(passengers) || 1),
    reasons,
    warnings,
    extraordinary,
    deadline,
    evidence,
    jurisdiction: 'eu261',
  };
}
