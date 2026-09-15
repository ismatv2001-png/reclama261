// VuelaClaim — INGESTA: emails y PDFs de reserva → datos de vuelo → reclamo (cero dependencias)
import zlib from 'node:zlib';

// ── 1. Parser MIME (.eml) ────────────────────────────────────────────
function decodeQuotedPrintable(s) {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeBody(body, encoding) {
  const enc = String(encoding || '').toLowerCase();
  if (enc.includes('base64')) {
    try { return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch { return body; }
  }
  if (enc.includes('quoted-printable')) {
    try { return Buffer.from(decodeQuotedPrintable(body), 'binary').toString('utf8'); } catch { return body; }
  }
  return body;
}

function parseHeaders(block) {
  const headers = {};
  const lines = block.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (/^\s/.test(line) && current) { headers[current] += ' ' + line.trim(); continue; }
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) { current = m[1].toLowerCase(); headers[current] = m[2]; }
  }
  return headers;
}

function splitMessage(raw) {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return { head: raw, body: '' };
  return { head: raw.slice(0, idx), body: raw.slice(idx).replace(/^\r?\n\r?\n/, '') };
}

export function parseEml(raw) {
  const { head, body } = splitMessage(String(raw));
  const headers = parseHeaders(head);
  const ct = headers['content-type'] || 'text/plain';
  const boundaryMatch = ct.match(/boundary="?([^";]+)"?/i);
  const bodies = [];
  const attachments = [];

  const walk = (content, contentType, encoding) => {
    const bm = String(contentType || '').match(/boundary="?([^";]+)"?/i);
    if (bm) {
      const parts = content.split(new RegExp(`--${bm[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`));
      for (const part of parts) {
        if (!part.trim()) continue;
        const { head: ph, body: pb } = splitMessage(part.replace(/^\r?\n/, ''));
        const ph2 = parseHeaders(ph);
        walk(pb, ph2['content-type'] || 'text/plain', ph2['content-transfer-encoding']);
      }
      return;
    }
    const nameMatch = String(contentType || '').match(/name="?([^";]+)"?/i)
      || String(contentType || '').match(/filename="?([^";]+)"?/i);
    const isPdf = /pdf/i.test(contentType || '');
    if (isPdf || (nameMatch && /\.pdf$/i.test(nameMatch[1]))) {
      const buf = String(encoding || '').toLowerCase().includes('base64')
        ? Buffer.from(content.replace(/\s+/g, ''), 'base64')
        : Buffer.from(decodeQuotedPrintable(content), 'binary');
      attachments.push({ filename: nameMatch ? nameMatch[1] : 'adjunto.pdf', mime: 'application/pdf', bytes: buf });
      return;
    }
    if (/text\/(plain|html)/i.test(contentType || 'text/plain')) {
      bodies.push(decodeBody(content, encoding));
    } else if (!bm && content.trim()) {
      bodies.push(decodeBody(content, encoding));
    }
  };

  walk(body, ct, headers['content-transfer-encoding']);

  return {
    subject: headers.subject || '',
    from: headers.from || '',
    date: headers.date || '',
    text: bodies.join('\n'),
    attachments,
  };
}

// ── 2. Extracción de texto de PDF (streams FlateDecode o crudos) ─────
export function pdfText(buf) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const chunks = [];
  const re = /stream\r?\n?/g;
  let m;
  while ((m = re.exec(data.toString('latin1')))) {
    const start = m.index + m[0].length;
    const end = data.indexOf('endstream', start, 'latin1');
    if (end === -1) break;
    const slice = data.subarray(start, end);
    let text = '';
    try {
      text = zlib.inflateSync(slice).toString('latin1');
    } catch {
      try { text = zlib.inflateRawSync(slice).toString('latin1'); } catch { text = slice.toString('latin1'); }
    }
    chunks.push(text);
    re.lastIndex = end;
  }
  const raw = chunks.join('\n') || data.toString('latin1');
  const out = [];
  // Operadores de texto: (texto) Tj  y  [(a) -2 (b)] TJ
  for (const tm of raw.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\][]|\\.)*\]\s*TJ/g)) {
    const parts = tm[0].match(/\((?:\\.|[^\\()])*\)/g) || [];
    const line = parts
      .map((p) => p.slice(1, -1).replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n'))
      .join('');
    out.push(line);
  }
  return out.join('\n');
}

// ── 3. Extracción de datos de reserva ────────────────────────────────
const IATA_RE = /\b([A-Z]{3})\b/g;

export function extractBooking(text, isValidAirport = () => true) {
  const t = String(text || '').replace(/\u00a0/g, ' ');
  const flat = t.replace(/\s+/g, ' ');

  const flightMatch = flat.match(/\b([A-Z]{2})\s?(\d{1,4})\b/);
  const flightNumber = flightMatch ? `${flightMatch[1]}${flightMatch[2]}` : '';
  const airlinePrefix = flightMatch ? flightMatch[1] : '';

  let departureIata = '';
  let arrivalIata = '';
  const routeMatch = flat.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to|a)\s*([A-Z]{3})\b/);
  if (routeMatch && isValidAirport(routeMatch[1]) && isValidAirport(routeMatch[2])) {
    departureIata = routeMatch[1];
    arrivalIata = routeMatch[2];
  } else {
    const codes = [...flat.matchAll(IATA_RE)].map((m) => m[1]).filter((c) => isValidAirport(c));
    if (codes.length >= 2) { departureIata = codes[0]; arrivalIata = codes[1]; }
  }

  let flightDate = '';
  const iso = flat.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) flightDate = iso[0];
  else {
    const dmy = flat.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
    if (dmy) flightDate = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const pnrMatch = flat.match(/\b(?:PNR|locator|booking\s*(?:ref|reference|code)|referencia|reserva|localizador)[:\s#]*([A-Z0-9]{6})\b/i);
  const pnr = pnrMatch ? pnrMatch[1].toUpperCase() : '';

  const paxMatch = flat.match(/(?:pasajero|passenger|titular|name)[:\s]*([A-ZÁÉÍÓÚÑ][\w'áéíóúñ-]+(?:\s+[A-ZÁÉÍÓÚÑ][\w'áéíóúñ-]+){1,3})/i);
  const passengerName = paxMatch ? paxMatch[1].trim() : '';

  const delayedMin = (() => {
    const h = flat.match(/(\d{1,2})\s*(?:h|horas?|hours?)\s*(?:de\s*)?(?:retraso|delay|late)/i);
    if (h) return Number(h[1]) * 60;
    const min = flat.match(/(\d{2,4})\s*(?:min|minutos?|minutes?)\s*(?:de\s*)?(?:retraso|delay)/i);
    if (min) return Number(min[1]);
    return null;
  })();

  const isCancelled = /cancelad|cancelled|canceled|anulad/i.test(flat);
  const isDenied = /denegaci[oó]n de embarque|denied boarding|overbook/i.test(flat);

  return {
    flightNumber, airlinePrefix, departureIata, arrivalIata, flightDate, pnr,
    passengerName, delayedMin, eventType: isCancelled ? 'cancellation' : isDenied ? 'denied_boarding' : 'delay',
    confident: Boolean(flightNumber && departureIata && arrivalIata),
  };
}

// ── 4. Orquestación ─────────────────────────────────────────────────
export function ingestDocuments({ emails = [], pdfs = [], isValidAirport = () => true } = {}) {
  const candidates = [];
  const skipped = [];
  const push = (source, booking, extra = {}) => {
    if (!booking.confident) {
      skipped.push({ source, reason: 'datos insuficientes', flightNumber: booking.flightNumber, route: [booking.departureIata, booking.arrivalIata] });
      return;
    }
    candidates.push({ source, ...booking, ...extra });
  };

  for (const raw of emails) {
    const mail = parseEml(raw);
    const texts = [mail.text, ...mail.attachments.map((a) => pdfText(a.bytes))];
    const best = texts.map((t) => extractBooking(t, isValidAirport)).sort((a, b) => Number(b.confident) - Number(a.confident))[0];
    push(`email:${mail.subject || 'sin asunto'}`, best || extractBooking('', isValidAirport), { from: mail.from });
  }
  for (const pdf of pdfs) {
    const text = pdfText(pdf.bytes || pdf);
    push(`pdf:${pdf.filename || 'documento.pdf'}`, extractBooking(text, isValidAirport));
  }
  return { candidates, skipped };
}
