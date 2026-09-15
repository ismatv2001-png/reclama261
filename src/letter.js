// reclama261 — generador de cartas de reclamación (HTML imprimible, ES/EN)
export function generateClaimLetter(claim, lang = 'es') {
  const es = lang !== 'en';
  const ev = claim.evaluation || {};
  const cite = ev.extraordinary?.matched?.[0];
  const iban = claim.iban || (es ? 'IBAN del pasajero' : 'passenger IBAN');
  const route = `${claim.departureIata} → ${claim.arrivalIata}`;
  const status = claim.status || 'DRAFT';

  const t = es ? {
    title: 'Reclamación de compensación — Reglamento (CE) n.º 261/2004',
    to: 'A la atención de:',
    ref: 'Ref.',
    flight: 'Vuelo',
    date: 'Fecha del vuelo',
    route: 'Ruta',
    delay: 'Retraso a la llegada',
    event: 'Incidencia',
    amount: 'Importe reclamado',
    body1: 'Por la presente, el abajo firmante, en calidad de pasajero del vuelo indicado, reclama la compensación económica prevista en el artículo 7 del Reglamento (CE) n.º 261/2004.',
    body2: 'El vuelo sufrió la incidencia descrita, que supera los umbrales establecidos por el Tribunal de Justicia de la UE (asunto C-402/07, Sturgeon, y jurisprudencia concordante), sin que concurran circunstancias extraordinarias que eximan de la obligación.',
    citeIntro: 'La causa alegada por la compañía no la exime de responsabilidad conforme a la jurisprudencia del TJUE:',
    payment: 'Se requiere el pago de la cantidad indicada en un plazo de 14 días desde la recepción de esta carta, mediante transferencia a la siguiente cuenta:',
    deadline: 'Transcurrido dicho plazo sin abono, se presentará reclamación ante la autoridad nacional competente (AESA en España o el organismo equivalente) y, en su caso, la correspondiente demanda judicial, con los intereses y costas que procedan.',
    sign: 'Firmado:',
    eventNames: { delay: 'Retraso ≥ 3 h', cancellation: 'Cancelación', denied_boarding: 'Denegación de embarque' },
  } : {
    title: 'Compensation claim — Regulation (EC) No 261/2004',
    to: 'For the attention of:',
    ref: 'Ref.',
    flight: 'Flight',
    date: 'Flight date',
    route: 'Route',
    delay: 'Arrival delay',
    event: 'Disruption',
    amount: 'Amount claimed',
    body1: 'The undersigned, as a passenger on the flight indicated, claims the compensation provided for in Article 7 of Regulation (EC) No 261/2004.',
    body2: 'The flight suffered the disruption described, exceeding the thresholds set by the Court of Justice of the EU (Case C-402/07, Sturgeon, and related case law), with no extraordinary circumstances exempting the obligation.',
    citeIntro: 'The reason given by the carrier does not exempt it under CJEU case law:',
    payment: 'Payment of the amount stated is required within 14 days of receipt of this letter, by bank transfer to:',
    deadline: 'If payment is not received within that period, a complaint will be filed with the competent national enforcement body and, where necessary, court proceedings initiated, including interest and costs.',
    sign: 'Signed:',
    eventNames: { delay: 'Delay ≥ 3 h', cancellation: 'Cancellation', denied_boarding: 'Denied boarding' },
  };

  const eventLabel = t.eventNames[claim.eventType] || claim.eventType;
  const delayText = ev.delayMin != null ? `${Math.floor(ev.delayMin / 60)} h ${ev.delayMin % 60} min` : '—';
  const amountText = `${ev.totalAmount ?? (ev.amountPerPassenger ?? 0) * (claim.passengers || 1)} €`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${t.title}</title>
<style>
  @page { margin: 2.2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5pt; line-height: 1.55; color: #1c1a17; max-width: 17cm; margin: 0 auto; padding: 24px; }
  h1 { font-size: 16pt; letter-spacing: -0.01em; margin: 0 0 4px; }
  .sub { color: #6b665c; font-size: 10.5pt; margin-bottom: 18px; }
  table.meta { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; }
  table.meta td { border-bottom: 1px solid #d8d3c7; padding: 6px 8px; vertical-align: top; }
  table.meta td:first-child { width: 38%; color: #6b665c; }
  .amount { font-size: 14pt; font-weight: bold; }
  .case { border-left: 3px solid #b8952e; padding: 6px 12px; margin: 10px 0; background: #faf7ee; font-size: 11pt; }
  .sign { margin-top: 34px; }
  .foot { margin-top: 28px; font-size: 9pt; color: #8a8578; border-top: 1px solid #d8d3c7; padding-top: 8px; }
</style>
</head>
<body>
<h1>${t.title}</h1>
<div class="sub">${t.to} ${claim.airline || ''} · ${t.ref} ${claim.id}</div>
<table class="meta">
  <tr><td>${t.flight}</td><td>${claim.flightNumber || ''}</td></tr>
  <tr><td>${t.date}</td><td>${claim.flightDate || ''}</td></tr>
  <tr><td>${t.route}</td><td>${route}${ev.distanceKm ? ` (${ev.distanceKm} km)` : ''}</td></tr>
  <tr><td>${t.event}</td><td>${eventLabel}</td></tr>
  <tr><td>${t.delay}</td><td>${delayText}</td></tr>
  <tr><td>${t.amount}</td><td class="amount">${amountText}</td></tr>
</table>
<p>${t.body1}</p>
<p>${t.body2}</p>
${cite ? `<div class="case"><strong>${t.citeIntro}</strong> ${cite.citation} — ${cite.ruling}</div>` : ''}
<p>${t.payment} <strong>${iban}</strong>.</p>
<p>${t.deadline}</p>
<div class="sign">${t.sign}<br><br><br>${claim.passengerName || ''}</div>
<div class="foot">Documento generado por reclama261 · Información orientativa, no constituye asesoramiento jurídico. Adjuntar: tarjetas de embarque, reserva y justificantes.</div>
</body>
</html>`;
}
