// reclama261 — régimen canadiense APPR (Air Passenger Protection Regulations)
// Portado y adaptado de AERO (MIT, © NathanGrenier): claimEstimator.ts, geoUtil.ts, airlineSizes.ts.
// Importes en CAD. Nota legal: solo aplica si la interrupción estaba BAJO CONTROL de la aerolínea.

const CANADIAN_IATA = new Set([
  'YUL', 'YYZ', 'YVR', 'YYC', 'YOW', 'YHZ', 'YQB', 'YEG', 'YWG', 'YYJ',
  'YYT', 'YXE', 'YLW', 'YZF', 'YQM', 'YQR', 'YQT', 'YXS', 'YXX', 'YKF', 'YTZ',
]);

const AIRLINE_SIZES = {
  AC: 'large', WS: 'large', TS: 'large', PD: 'small', F8: 'small', WO: 'small',
  '5T': 'small', QK: 'small', '3H': 'small', '4N': 'small', '8P': 'small',
  WG: 'small', ZX: 'small', GG: 'small',
  // Grandes internacionales que operan a/desde Canadá (default APPR: >2M pasajeros/año = large)
  DL: 'large', AA: 'large', UA: 'large', B6: 'large', AS: 'large',
  BA: 'large', VS: 'large', U2: 'large', EI: 'large', FR: 'large',
  AF: 'large', KL: 'large', LH: 'large', LX: 'large', OS: 'large', SN: 'large',
  IB: 'large', VY: 'large', TP: 'large', AZ: 'large', TK: 'large',
  EK: 'large', EY: 'large', QR: 'large', SQ: 'large', CX: 'large',
  NH: 'large', JL: 'large', KE: 'large', TG: 'large', ET: 'large', MS: 'large',
  AM: 'large', AV: 'large', LA: 'large', CM: 'large', G3: 'large', AD: 'large',
  DY: 'large', SK: 'large', AY: 'large', LO: 'large', W6: 'large', A3: 'large',
};

export function isCanadianAirport(iata) {
  return CANADIAN_IATA.has(String(iata || '').toUpperCase());
}

export function isApprApplicable(depIata, arrIata) {
  return isCanadianAirport(depIata) || isCanadianAirport(arrIata);
}

export function isDomesticCanada(depIata, arrIata) {
  return isCanadianAirport(depIata) && isCanadianAirport(arrIata);
}

export function airlineSizeFromCode(code) {
  return AIRLINE_SIZES[String(code || '').toUpperCase()] || 'small';
}

export function apprCompensationFromHours(hours, airlineSize) {
  if (hours < 3) return 0;
  const large = airlineSize === 'large';
  if (hours >= 9) return large ? 1000 : 500;
  if (hours >= 6) return large ? 700 : 250;
  return large ? 400 : 125; // 3–6 h
}

export function evaluateAppr({
  departureIata = '', arrivalIata = '', airlineCode = '', delayMin = null, eventType = 'delay',
} = {}) {
  if (!isApprApplicable(departureIata, arrivalIata)) {
    return { applicable: false };
  }
  const size = airlineSizeFromCode(airlineCode);
  const hours = delayMin === null ? null : delayMin / 60;
  const amount = hours === null ? 0 : apprCompensationFromHours(hours, size);
  const domestic = isDomesticCanada(departureIata, arrivalIata);
  return {
    applicable: true,
    regulation: 'APPR (Canadá)',
    domestic,
    airlineSize: size,
    delayHours: hours === null ? null : Math.round(hours * 10) / 10,
    amountPerPassengerCAD: amount,
    note: 'APPR solo compensa si la interrupción estaba BAJO CONTROL de la aerolínea (no seguridad/meteorología). Reclamar ante la CTA (Canadian Transportation Agency).',
    eventType,
  };
}
