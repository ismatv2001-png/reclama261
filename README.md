# reclama261 — Mesa de reclamaciones EU261/2004

Software de gestión de reclamaciones de compensación aérea (Reglamento CE 261/2004):
motor de elegibilidad, plazos de prescripción, jurisprudencia TJUE, generador de
cartas y panel web. **Cero dependencias** — corre con Node ≥ 20 en cualquier VPS.

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
  [flight-rights-mcp](https://github.com/mikelninh/flight-rights-mcp) (**MIT**, © 2026 Mikel) —
  `src/data/airports.json` y `src/data/jurisprudence.json` son copias directas de ese repo.
- Inspiración de flujo: [AeroCash](https://github.com/brandenpratt/aerocash) (AGPL-3.0, no se copia código).

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
