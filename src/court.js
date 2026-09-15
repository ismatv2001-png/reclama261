// VuelaClaim — documentos de vía judicial y administrativa
// kind: 'demanda_verbal' (España, juicio verbal ≤2000 € sin abogado), 'cta' (Canadá, CTA)
const COURT_T = {
  es: {
    demanda: {
      title: 'DEMANDA DE JUICIO VERBAL — reclamación de cantidad',
      to: 'AL JUZGADO DE PRIMERA INSTANCIA',
      body1: 'El demandante, pasajero del vuelo indicado, formula DEMANDA DE JUICIO VERBAL en reclamación de la cantidad de {AMOUNT} €, en concepto de compensación del artículo 7 del Reglamento (CE) n.º 261/2004, más intereses legales y costas.',
      body2: 'HECHOS: el vuelo sufrió la incidencia descrita; la compañía no abonó la compensación pese a los requerimientos efectuados (se acompañan como documento n.º 1 a n.º 3).',
      body3: 'FUNDAMENTOS DE DERECHO: artículos 5, 7 y 8 del Reglamento 261/2004; jurisprudencia del TJUE (Sturgeon C-402/07 y concordante); artículos 250 y 437 LEC (juicio verbal por razón de la cuantía).',
      body4: 'Competencia territorial: juzgado del domicilio del demandante o del lugar del aeropuerto de llegada (art. 52 LEC / TJUE C-204/08).',
      body5: 'SUPLICA: se dicte sentencia condenando a la demandada al pago de {AMOUNT} €, intereses legales desde la reclamación extrajudicial y costas.',
      docs: 'Acompañar: carta de reclamación enviada, respuesta o silencio, tarjeta de embarque, reserva, certificado de retraso, DNI, justificante de gastos.',
    },
    cta: {
      title: 'QUEJA ANTE LA CTA (Canadian Transportation Agency)',
      to: 'Canadian Transportation Agency — Air Travel Complaints',
      body1: 'El reclamante, pasajero del vuelo indicado, presenta queja conforme a la APPR (Air Passenger Protection Regulations) por la compensación no abonada por la compañía.',
      body2: 'Importe reclamado: {AMOUNT} CAD conforme a la APPR s.19, al estar la interrupción bajo el control de la aerolínea.',
      body3: 'Se acompaña: itinerario, tarjeta de embarque, prueba del retraso y comunicaciones con la aerolínea.',
    },
  },
  en: {
    demanda: {
      title: 'SMALL CLAIMS STATEMENT OF CLAIM — Spain (juicio verbal)',
      to: 'TO THE COURT OF FIRST INSTANCE',
      body1: 'The claimant, passenger on the indicated flight, files this claim for {AMOUNT} EUR as compensation under Article 7 of Regulation (EC) No 261/2004, plus legal interest and costs.',
      body2: 'FACTS: the flight suffered the described disruption; the carrier did not pay despite the demands made (attached as exhibits 1-3).',
      body3: 'LEGAL BASIS: Articles 5, 7 and 8 of Regulation 261/2004; CJEU case law (Sturgeon C-402/07 and related); Articles 250 and 437 LEC (small claims).',
      body4: 'Jurisdiction: court of the claimant’s domicile or of the arrival airport (Art. 52 LEC / CJEU C-204/08).',
      body5: 'PRAYER: judgment ordering the defendant to pay {AMOUNT} EUR, legal interest and costs.',
      docs: 'Attach: prior demand letter, airline response or silence, boarding pass, booking, delay certificate, ID, expense receipts.',
    },
    cta: {
      title: 'COMPLAINT TO THE CTA (Canadian Transportation Agency)',
      to: 'Canadian Transportation Agency — Air Travel Complaints',
      body1: 'The complainant, passenger on the indicated flight, files this complaint under the APPR for compensation not paid by the carrier.',
      body2: 'Amount claimed: {AMOUNT} CAD under APPR s.19, the disruption being within the carrier’s control.',
      body3: 'Attached: itinerary, boarding pass, proof of delay and communications with the carrier.',
    },
  },
};

export function generateCourtLetter(claim, kind = 'demanda_verbal', lang = 'es') {
  const t = COURT_T[lang] || COURT_T.es;
  const section = t[kind] || t.demanda;
  const amount = kind === 'cta'
    ? (claim.evaluation?.totalAmount ?? 0)
    : (claim.evaluation?.totalAmount ?? 0);
  const route = `${claim.departureIata} → ${claim.arrivalIata}`;
  const fill = (s) => s.replace(/\{AMOUNT\}/g, String(amount));
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${section.title}</title>
<style>
  @page { margin: 2.2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5pt; line-height: 1.6; color: #1c1a17; max-width: 17cm; margin: 0 auto; padding: 24px; }
  h1 { font-size: 15pt; margin: 0 0 4px; }
  .sub { color: #6b665c; font-size: 10.5pt; margin-bottom: 16px; }
  table.meta { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; }
  table.meta td { border-bottom: 1px solid #d8d3c7; padding: 6px 8px; }
  table.meta td:first-child { width: 38%; color: #6b665c; }
  p { margin: 0 0 12px; }
  .docs { border-left: 3px solid #b8952e; padding: 6px 12px; background: #faf7ee; font-size: 11pt; margin: 12px 0; }
  .sign { margin-top: 30px; }
  .foot { margin-top: 26px; font-size: 9pt; color: #8a8578; border-top: 1px solid #d8d3c7; padding-top: 8px; }
</style>
</head>
<body>
<h1>${section.title}</h1>
<div class="sub">${section.to} · Reclamo ${claim.id || ''}</div>
<table class="meta">
  <tr><td>Vuelo</td><td>${claim.flightNumber || ''} · ${route} · ${claim.flightDate || ''}</td></tr>
  <tr><td>Pasajero</td><td>${claim.passengerName || ''}</td></tr>
  <tr><td>Aerolínea demandada</td><td>${claim.airline || ''}</td></tr>
  <tr><td>Importe</td><td><strong>${amount} ${kind === 'cta' ? 'CAD' : '€'}</strong></td></tr>
</table>
<p>${fill(section.body1)}</p>
<p>${section.body2 ? fill(section.body2) : ''}</p>
<p>${section.body3 ? fill(section.body3) : ''}</p>
${section.body4 ? `<p>${fill(section.body4)}</p>` : ''}
${section.body5 ? `<p>${fill(section.body5)}</p>` : ''}
<div class="docs">${section.docs}</div>
<div class="sign">Firma<br><br><br>${claim.passengerName || ''}</div>
<div class="foot">Documento generado por VuelaClaim · Modelo orientativo, revisar con abogado antes de presentar.</div>
</body>
</html>`;
}
