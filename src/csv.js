// reclama261 — parser CSV simple (comillas, saltos de línea dentro de campos)
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

export const CLAIM_FIELDS = [
  'passengerName', 'email', 'airline', 'flightNumber', 'departureIata', 'arrivalIata',
  'airlineCountry', 'eventType', 'flightDate', 'scheduledArrival', 'actualArrival',
  'noticeDays', 'rerouteArrival', 'airlineReason', 'claimCountry', 'passengers',
];
