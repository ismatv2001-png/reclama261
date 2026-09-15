// VuelaClaim — factura de comisión de éxito (HTML imprimible, sin dependencias)
const INV_T = {
  es: {
    title: 'FACTURA', number: 'Factura n.º', date: 'Fecha', concept: 'Concepto',
    conceptLine: 'Comisión de éxito (30 %) sobre compensación cobrada — reclamación aérea',
    base: 'Base imponible', vat: 'IVA (si procede)', total: 'TOTAL',
    note: 'Operación exenta/sujeta según normativa fiscal aplicable. Documento informativo — sustituir por factura fiscal del emisor cuando corresponda.',
    to: 'Cliente',
  },
  en: {
    title: 'INVOICE', number: 'Invoice no.', date: 'Date', concept: 'Description',
    conceptLine: 'Success fee (30 %) on collected compensation — air passenger claim',
    base: 'Taxable base', vat: 'VAT (if applicable)', total: 'TOTAL',
    note: 'Informational document — replace with a tax-compliant invoice when applicable.',
    to: 'Client',
  },
};

export function generateInvoiceLetter(claim, { amount = null, lang = 'es' } = {}) {
  const t = INV_T[lang] || INV_T.es;
  const collected = Number(amount ?? claim.paidAmount ?? claim.evaluation?.totalAmount ?? 0);
  const commission = Math.round(collected * 0.30 * 100) / 100;
  const num = `VC-${(claim.id || 'XXXXXXXX').slice(0, 8).toUpperCase()}`;
  const date = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${t.title} ${num}</title>
<style>
  @page { margin: 2cm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5pt; line-height: 1.5; color: #1c1a17; max-width: 17cm; margin: 0 auto; padding: 24px; }
  h1 { font-size: 19pt; margin: 0 0 2px; }
  .head { display: flex; justify-content: space-between; margin-bottom: 18px; }
  .meta { color: #6b665c; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border-bottom: 1px solid #d8d3c7; padding: 8px; text-align: left; font-size: 10.5pt; }
  .total td { font-weight: 700; font-size: 13pt; border-bottom: 2px solid #1c1a17; }
  .num { text-align: right; }
  .note { font-size: 8.5pt; color: #8a8578; margin-top: 18px; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>${t.title}</h1>
<div class="head">
  <span class="meta">VuelaClaim · ${t.number} <span class="mono">${num}</span> · ${t.date} ${date}</span>
  <span class="meta">${t.to}: ${claim.passengerName || ''}</span>
</div>
<table>
  <tr><th>${t.concept}</th><th class="num">${t.base}</th></tr>
  <tr><td>${t.conceptLine}<br><span class="meta">${claim.flightNumber || ''} · ${claim.departureIata} → ${claim.arrivalIata} · ${claim.flightDate || ''}</span></td>
      <td class="num mono">${commission.toFixed(2)} €</td></tr>
  <tr class="total"><td>${t.total}</td><td class="num mono">${commission.toFixed(2)} €</td></tr>
</table>
<p class="note">${t.note}</p>
</body>
</html>`;
}
