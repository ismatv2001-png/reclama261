// VuelaClaim — cesión de derechos / poder de representación (POA)
// Permite que la agencia reclame en nombre del pasajero (requisito legal habitual).
const POA_T = {
  es: {
    title: 'Autorización de representación y cesión del crédito',
    body1: 'Yo, el abajo firmante, pasajero del vuelo indicado, AUTORIZO expresamente a la agencia VuelaClaim para que, en mi nombre y representación, gestione y reclame ante la compañía aérea, ante las autoridades competentes (AESA u organismos equivalentes) y ante los tribunales si fuera necesario, la compensación económica que me corresponde conforme al Reglamento (CE) n.º 261/2004 y demás normativa aplicable, incluidos los gastos de asistencia.',
    body2: 'Autorizo igualmente a percibir en su nombre el importe de la compensación en la cuenta de la agencia, que liquidará al pasajero descontando únicamente la comisión de éxito pactada (30 % sobre lo cobrado, sin coste si no se cobra).',
    body3: 'Esta autorización es revocable por escrito en cualquier momento antes del cobro.',
    data: 'Datos del pasajero',
    sign: 'Firma del pasajero',
    dni: 'DNI/NIE/Pasaporte',
  },
  en: {
    title: 'Power of attorney and assignment of the claim',
    body1: 'I, the undersigned, passenger on the indicated flight, hereby AUTHORIZE the agency VuelaClaim to act on my behalf in claiming, before the airline, the competent authorities (AESA or equivalent bodies) and, if necessary, the courts, the compensation due to me under Regulation (EC) No 261/2004 and other applicable rules, including care expenses.',
    body2: 'I further authorize the agency to receive the compensation on its account, settling with the passenger after deducting only the agreed success fee (30 % of the amount collected; no fee if nothing is collected).',
    body3: 'This authorization may be revoked in writing at any time before payment.',
    data: 'Passenger details',
    sign: 'Passenger signature',
    dni: 'ID / Passport',
  },
};

export function generatePoaLetter(claim, lang = 'es') {
  const t = POA_T[lang] || POA_T.es;
  const route = `${claim.departureIata} → ${claim.arrivalIata}`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${t.title}</title>
<style>
  @page { margin: 2.2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5pt; line-height: 1.55; color: #1c1a17; max-width: 17cm; margin: 0 auto; padding: 24px; }
  h1 { font-size: 16pt; margin: 0 0 14px; }
  table.meta { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; }
  table.meta td { border-bottom: 1px solid #d8d3c7; padding: 6px 8px; }
  table.meta td:first-child { width: 38%; color: #6b665c; }
  p { margin: 0 0 12px; }
  .sign { margin-top: 30px; }
  .foot { margin-top: 26px; font-size: 9pt; color: #8a8578; border-top: 1px solid #d8d3c7; padding-top: 8px; }
</style>
</head>
<body>
<h1>${t.title}</h1>
<table class="meta">
  <tr><td>${t.data}</td><td>${claim.passengerName || ''}</td></tr>
  <tr><td>${t.dni}</td><td>____________________</td></tr>
  <tr><td>Vuelo</td><td>${claim.flightNumber || ''} · ${route} · ${claim.flightDate || ''}</td></tr>
</table>
<p>${t.body1}</p>
<p>${t.body2}</p>
<p>${t.body3}</p>
<div class="sign">${t.sign}<br><br><br>${claim.passengerName || ''}</div>
<div class="foot">Documento generado por VuelaClaim · Información orientativa, no constituye asesoramiento jurídico.</div>
</body>
</html>`;
}
