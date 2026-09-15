# VuelaClaim — Mesa de reclamaciones aéreas (EU261/2004 + APPR Canadá)

Software de gestión de reclamaciones de compensación aérea: motor de elegibilidad
(UE + Canadá), plazos de prescripción, jurisprudencia TJUE, cartas en 6 idiomas,
recordatorios escalonados, escalados a AESA/SÖP/CAA, gastos Art. 9, documentos,
SLA con vencimientos, importación/exportación masiva, 67 aerolíneas con contactos,
base de conocimiento de derechos y **cazador proactivo** (vigila vuelos con datos
gratuitos de OpenSky Network y crea el reclamo automáticamente al detectar retraso
≥3 h). **Cero dependencias** — corre con Node ≥ 20 en cualquier VPS de 512 MB.

## Arrancar

```bash
npm start            # http://0.0.0.0:8787
npm test             # tests del motor (node --test)
```

## API

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/airports` | GET | Lista de aeropuertos |
| `/api/check` | POST | Evalúa elegibilidad sin guardar |
| `/api/claims` | GET/POST | Lista / crea reclamo (calcula y guarda evaluación) |
| `/api/claims/:id` | GET/PATCH | Detalle / actualiza estado (historial automático) |
| `/api/claims/:id/letter` | GET | Carta de reclamación (HTML imprimible, `?lang=en`) |
| `/api/stats` | GET | Potencial, comisión (30 % configurable con `COMMISSION_RATE`), cobrado |

## Estados

`DRAFT → SUBMITTED → RESPONSE → OFFER → PAID`
`… → REJECTED → ESCALATED (AESA/ADR) → COURT → PAID | CLOSED`

## Despliegue gratis

1. Cualquier VPS: `node src/server.js` (systemd unit abajo).
2. En la flota de lanes: un lane = una instancia; los reclamos se reparten vía dispatcher.
3. GitHub Actions: CI en `.github/workflows/ci.yml` (repo público = minutos ilimitados).

```ini
[Unit]
Description=reclama261
After=network.target

[Service]
WorkingDirectory=/opt/reclama261
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=PORT=8787

[Install]
WantedBy=multi-user.target
```

## Origen y créditos

- Reglas, datos de aeropuertos y jurisprudencia adaptados de
  [flight-rights-mcp](https://github.com/mikelninh/flight-rights-mcp) (**MIT**, © 2026 Mikel).
- Régimen APPR (Canadá) portado de [AERO](https://github.com/NathanGrenier/AERO) (**MIT**).
- Recordatorios escalonados inspirados en [Vendetta-Grievance-Agent](https://github.com/vedzilla/Vendetta-Grievance-Agent) (MIT).
- Base de conocimiento inspirada en [agentic-rag-passenger-rights](https://github.com/david-egri/agentic-rag-passenger-rights) y
  [apr_chatbot](https://github.com/maksym-taranukhin/apr_chatbot) (MIT).
- Checklist de pruebas inspirado en [AeroCash](https://github.com/brandenpratt/aerocash) (AGPL, sin copia de código)
  y [claimready-ai](https://github.com/mkumar84/claimready-ai).
- 8 repos OSS clonados en `_upstream/` para referencia (no se distribuyen).

## Aviso legal

Herramienta informativa. No constituye asesoramiento jurídico; antes de escalar a
vía judicial, revisar con abogado. Los plazos de prescripción varían por país y
jurisprudencia (ES: 5 años Art. 1964 CC; DE: 3 años fin de año § 195 BGB; GB: 6 años).

## Próximos pasos

- [ ] Importador de reservas por email/PDF (PNR)
- [ ] Cartas de escalado a AESA (ES) / SÖP (DE) / CAA (GB)
- [ ] Recordatorios legales programados (límites de frecuencia por normativa)
- [ ] Multi-cliente con comisión por caso y payout
- [ ] Integración con el dispatcher de la flota (work-claim-v2)

## Cuentas de la casa

- Repo operativo: GitLab `ismatv2001` (glab, keyring) y GitHub `ismatv2001-png`.
- **Pendiente (paso humano)**: re-autenticar GitHub `ismatv1512-ui` — token del
  keyring inválido. Comando: `gh auth login` (o `gh auth refresh -h github.com -u ismatv1512-ui`)
  y luego `git remote add gh1512 git@github.com:ismatv1512-ui/reclama261.git && git push gh1512 main`.
