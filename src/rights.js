// reclama261 — base de conocimiento de derechos del pasajero (QA sin dependencias)
// Ideas de: david-egri/agentic-rag-passenger-rights (MIT), maksym-taranukhin/apr_chatbot (MIT),
// mkumar84/claimready-ai (ADR readiness). Textos propios, informativos.
import { JURISPRUDENCE, checkExtraordinary } from './ec261.js';

const FAQ = [
  {
    kws: ['comida', 'hotel', 'alojamiento', 'asistencia', 'bebida', 'comunicaciones', 'care', 'manutencion'],
    q: '¿Tengo derecho a comida/hotel durante un retraso largo?',
    a: 'Sí — Art. 9 del Reglamento 261/2004: con retrasos de 2-4+ horas (según distancia) la aerolínea debe ofrecer comida/bebida, hotel y traslados si es necesario pernoctar, y dos llamadas/emails. Guarda todos los tickets: son reembolsables aunque no haya compensación.',
  },
  {
    kws: ['reembolso', 'reembolsar', 'billete', 'refund', 'devolucion', 'rebooking', 'recolocacion', 'rerouting'],
    q: '¿Reembolso o recolocación?',
    a: 'Art. 8: ante cancelación tienes derecho a elegir entre reembolso completo del billete en 7 días, transporte alternativo lo antes posible, o en fecha posterior que te convenga. La compensación del Art. 7 es independiente de esta elección.',
  },
  {
    kws: ['equipaje', 'maleta', 'perdida', 'baggage', 'danada', 'retraso equipaje'],
    q: '¿Y si pierden o dañan mi equipaje?',
    a: 'Convenio de Montreal: la aerolínea responde hasta ~1.600 € por maleta perdida/dañada. Hay que reclamar por escrito (PIR en el aeropuerto) en plazos cortos: 7 días por daños, 21 días por retraso. Es un derecho distinto del EU261.',
  },
  {
    kws: ['overbooking', 'denegacion', 'embarque', 'denied', 'voluntario', 'no embarcar'],
    q: 'Me denegaron el embarque por overbooking, ¿qué me corresponde?',
    a: 'Art. 4 y 7: compensación (250/400/600 € según distancia) salvo recolocación dentro de márgenes, más reembolso o transporte alternativo. Si te ofrecen "renunciar voluntariamente" a cambio de vales, puedes negociar más: los vales no sustituyen tu derecho legal.',
  },
  {
    kws: ['plazo', 'prescripcion', 'prescribe', 'años', 'cuando', 'vencimiento', 'deadline', 'cuantos'],
    q: '¿Hasta cuándo puedo reclamar?',
    a: 'Depende del país del vuelo/jurisdicción: España 5 años (Art. 1964 CC), Alemania 3 años (fin de año), Reino Unido 6 años, Italia 2 años, Francia 5 años, Portugal 3 años, Países Bajos 2 años. Reclama cuanto antes: las aerolíneas pagan más rápido los casos frescos.',
  },
  {
    kws: ['aesa', 'autoridad', 'denunciar', 'escalar', 'organismo', 'adr', 'arbitraje', 'queja'],
    q: 'La aerolínea me ignora, ¿dónde escalo?',
    a: 'España: AESA (sede.seguridadaerea.gob.es). Alemania: SÖP (soep-online.de, gratuito y vinculante para la aerolínea). Reino Unido: CAA. Otros países: organismos ADR. La vía administrativa es gratuita; si no paga, demanda judicial (en España, juicio verbal, sin abogado hasta 2.000 €).',
  },
  {
    kws: ['conexion', 'escala', 'enlace', 'correspondencia', 'connecting', 'perder'],
    q: 'Perdí la conexión y llegué 5 h tarde, ¿cuenta el retraso final?',
    a: 'Sí — lo que cuenta es la hora de llegada al DESTINO FINAL (TJUE, C-11/11 Folkerts). Si la reserva era única y llegas ≥3 h tarde al destino final, hay compensación aunque cada tramo por separado fuera puntual.',
  },
  {
    kws: ['huelga', 'personal', 'tripulacion', 'strike', 'staff'],
    q: 'La aerolínea alega huelga de su personal, ¿me exime?',
    a: 'No. La huelga del PROPIO personal de la aerolínea NO es circunstancia extraordinaria (TJUE C-195/17 Krüsemann): es riesgo empresarial. Solo eximen huelgas ajenas (controladores, seguridad aeroportuaria) con medidas razonables.',
  },
  {
    kws: ['tecnico', 'tecnica', 'averia', 'mantenimiento', 'defecto', 'fallo', 'technical'],
    q: 'Alegan "problema técnico", ¿cuela?',
    a: 'No, salvo defectos ocultos de fabricación. El mantenimiento ordinario y los fallos técnicos habituales NO son circunstancias extraordinarias (TJUE C-549/07 Wallentin-Hermann). Es la excusa más común y la que más juicios pierden.',
  },
  {
    kws: ['meteorologia', 'clima', 'tormenta', 'niebla', 'weather', 'viento'],
    q: 'Alegan mal tiempo, ¿cuela?',
    a: 'Solo si fue realmente excepcional e impidió operar con seguridad (TJUE C-832/18). Lluvia o viento habituales no eximen. Pide siempre el parte meteorológico: si otros vuelos operaron, la excusa cae.',
  },
];

export function answerRights(q) {
  const text = String(q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hits = [];
  for (const f of FAQ) {
    const score = f.kws.reduce((acc, k) => acc + (text.includes(k) ? 1 : 0), 0);
    if (score > 0) hits.push({ ...f, score });
  }
  hits.sort((a, b) => b.score - a.score);
  const jurisprudence = checkExtraordinary(text).matched.slice(0, 3);
  return {
    faq: hits.slice(0, 3).map(({ q: question, a }) => ({ question, answer: a })),
    jurisprudence: jurisprudence.map((c) => ({
      citation: c.citation, topic: c.topic, ruling: c.ruling,
    })),
    source: 'VuelaClaim KB · informativo, no asesoramiento jurídico',
  };
}

export { JURISPRUDENCE };
