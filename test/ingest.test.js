// VuelaClaim — tests de ingesta (email + PDF) y barrido a escala
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseEml, pdfText, extractBooking, ingestDocuments } from '../src/ingest.js';
import { mapAvstackFlight, sweepAirportDay, sweepMany } from '../src/sweeper.js';
import { AIRPORTS } from '../src/ec261.js';

const isValid = (iata) => Boolean(AIRPORTS[iata]);

// .eml sintético con reserva Iberia MAD→BCN y retraso de 4 horas
const EML = [
  'From: reservas@iberia.com',
  'To: pasajero@correo.es',
  'Subject: Confirmacion de reserva IB1234 - Localizador AB12CD',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="BOUND"',
  '',
  '--BOUND',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Estimado cliente,',
  'Pasajero: Maria Garcia Lopez',
  'Vuelo: IB1234',
  'Ruta: MAD - BCN',
  'Fecha: 2026-05-01',
  'Localizador: AB12CD',
  'Su vuelo ha sufrido 4 horas de retraso.',
  '--BOUND--',
].join('\r\n');

test('parseEml: extrae asunto, cuerpo y texto útil', () => {
  const mail = parseEml(EML);
  assert.match(mail.subject, /IB1234/);
  assert.match(mail.text, /Maria Garcia/);
});

test('extractBooking: vuelo, ruta, fecha, PNR, pasajero y retraso', () => {
  const b = extractBooking(parseEml(EML).text, isValid);
  assert.equal(b.flightNumber, 'IB1234');
  assert.equal(b.departureIata, 'MAD');
  assert.equal(b.arrivalIata, 'BCN');
  assert.equal(b.flightDate, '2026-05-01');
  assert.equal(b.pnr, 'AB12CD');
  assert.match(b.passengerName, /Maria Garcia/);
  assert.equal(b.delayedMin, 240);
  assert.equal(b.eventType, 'delay');
  assert.equal(b.confident, true);
});

test('ingestDocuments: email → candidato; email sin datos → descartado', () => {
  const res = ingestDocuments({ emails: [EML, 'From: x\r\nSubject: hola\r\n\r\nSin datos de vuelo'], isValidAirport: isValid });
  assert.equal(res.candidates.length, 1);
  assert.equal(res.candidates[0].flightNumber, 'IB1234');
  assert.equal(res.skipped.length, 1);
});

test('pdfText: extrae texto de un PDF con stream FlateDecode', () => {
  const contenido = 'BT /F1 12 Tf (Vuelo IB1234 MAD - BCN 2026-05-01) Tj ET';
  const comprimido = zlib.deflateSync(Buffer.from(contenido, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + comprimido.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'),
    comprimido,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  const text = pdfText(pdf);
  assert.match(text, /IB1234/);
  const b = extractBooking(text, isValid);
  assert.equal(b.departureIata, 'MAD');
  assert.equal(b.arrivalIata, 'BCN');
  assert.equal(b.flightDate, '2026-05-01');
});

test('ingestDocuments: PDF de reserva → candidato', () => {
  const contenido = 'BT /F1 12 Tf (Pasajero: Ana Ruiz Vuelo VY2222 BCN - MAD 2026-06-02 PNR: XY99ZZ) Tj ET';
  const comprimido = zlib.deflateSync(Buffer.from(contenido, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + comprimido.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'),
    comprimido, Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  const res = ingestDocuments({ pdfs: [{ filename: 'reserva.pdf', bytes: pdf }], isValidAirport: isValid });
  assert.equal(res.candidates.length, 1);
  assert.equal(res.candidates[0].flightNumber, 'VY2222');
});

test('barrido: mapea vuelos y filtra los reclamables (≥180 min)', () => {
  const delayed = mapAvstackFlight({
    flight: { iata: 'IB1234' }, airline: { name: 'Iberia', iata: 'IB' },
    departure: { iata: 'MAD' }, arrival: { iata: 'BCN', scheduled: '2026-05-01T10:00:00+00:00', delay: 200 },
    flight_status: 'landed',
  });
  assert.equal(delayed.claimable, true);
  const onTime = mapAvstackFlight({ flight: { iata: 'VY1' }, arrival: { delay: 25 } });
  assert.equal(onTime.claimable, false);
});

test('barrido: sin clave devuelve instrucción, con clave filtra oportunidades', async () => {
  const noKey = await sweepAirportDay({ airportIata: 'MAD', flightDate: '2026-05-01' });
  assert.equal(noKey.ok, false);
  assert.equal(noKey.error, 'avstack_no_key');
  assert.match(noKey.hint, /AVSTACK_KEY/);

  const fakeFetch = async () => ({
    ok: true, status: 200,
    json: async () => ({
      data: [
        { flight: { iata: 'IB1234' }, airline: { name: 'Iberia', iata: 'IB' }, departure: { iata: 'MAD' }, arrival: { iata: 'BCN', scheduled: '2026-05-01T10:00', delay: 240 }, flight_status: 'landed' },
        { flight: { iata: 'VY2222' }, airline: { name: 'Vueling', iata: 'VY' }, departure: { iata: 'MAD' }, arrival: { iata: 'BCN', scheduled: '2026-05-01T11:00', delay: 20 }, flight_status: 'landed' },
        { flight: { iata: 'UX91' }, airline: { name: 'Air Europa', iata: 'UX' }, departure: { iata: 'MAD' }, arrival: { iata: 'JFK', scheduled: '2026-05-01T12:00', delay: 320 }, flight_status: 'landed' },
      ],
    }),
  });
  const r = await sweepAirportDay({ airportIata: 'MAD', flightDate: '2026-05-01', key: 'TEST', fetcher: fakeFetch });
  assert.equal(r.ok, true);
  assert.equal(r.scanned, 3);
  assert.equal(r.opportunities.length, 2);
  assert.equal(r.opportunities[0].flightNumber, 'UX91'); // mayor retraso primero

  const many = await sweepMany({ airports: ['MAD', 'BCN'], flightDate: '2026-05-01', key: 'TEST', fetcher: fakeFetch });
  assert.equal(many.airports, 2);
  assert.equal(many.opportunities.length, 4);
});
