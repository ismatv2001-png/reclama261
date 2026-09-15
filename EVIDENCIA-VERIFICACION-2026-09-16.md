# Verificación VuelaClaim — 16-sep-2026, 00:11 (hora local)

Lane: chat `deep seek harness` (sesión `session-9d82422e-500f-441e-a125-3837917a6213`).
Puerta de claims: **GO** (`claim-gate.ps1` → "sin writer activo sobre ...\flight-claims").

## 1. Qué se quería comprobar

Si el software de reclamaciones aéreas **funciona de verdad** y si el modelo
"no-win, no-fee" aguanta la promesa de *capital en riesgo = 0 €*.

## 2. Pruebas ejecutadas y resultado

| Prueba | Comando | Resultado |
|---|---|---|
| Suite completa | `npm test` | **35/35 en verde**, 785 ms, 0 fallos |
| Motor EU261 en vivo | `POST /api/check` MAD→JFK, 5 h, motivo técnico, 2 pax | 5760 km, tramo *long*, **600 €/pax → 1200 €**, plazo 2031-08-01 |
| Carta generada | `GET /api/claims/:id/letter` | HTTP 200, 3109 bytes |
| Estados y dinero | `GET /api/stats` | comisión 30 %, potencial y cobrado por aerolínea |
| Fuente de datos | OpenSky `/states/all` | HTTP **200** (posiciones en vivo) |
| Fuente de datos | OpenSky `/flights/arrival` | **404** (2 h, 6 h), **200 con 1 llegada** (12 h), **403** (24 h) |

El motor **rechazó** una entrada mía con campos incorrectos (`delayMinutes`) en vez de
inventar una elegibilidad: `eligible: false`, "Faltan horas de llegada programada/real".
El contrato real es `scheduledArrival` / `actualArrival` en ISO.

Jurisprudencia aplicada correctamente en la prueba: retraso ≥180 min da derecho pleno
(*Sturgeon C-402/07*); "problema técnico" **no** exime (*Wallentin-Hermann C-549/07*).

## 3. Dos defectos reales encontrados (y corregidos)

### 3.1 API sin autenticación escuchando en 0.0.0.0 — CORREGIDO

`authorized()` devuelve `true` cuando `ADMIN_TOKEN` está vacío, y el servidor se ataba
siempre a `0.0.0.0`. El README enseñaba un unit de systemd **sin** token. Esta base
guarda PNR, documentos e **IBAN de clientes**: exponerla así no es un descuido, es una
fuga de datos personales.

Corrección (*fail-closed*): sin `ADMIN_TOKEN` solo se escucha en `127.0.0.1`.

Verificado:

```
sin token  -> 127.0.0.1:8791  + aviso            (Get-NetTCPConnection: 127.0.0.1)
con token  -> 0.0.0.0:8792
POST sin token -> HTTP 401
POST con token -> HTTP 201
```

### 3.2 Documentos de clientes versionados en repos PÚBLICOS — CORREGIDO

`.gitignore` ignoraba `data/db.json` pero **no** `data/docs/`, donde el servidor guarda
las subidas. Cinco `data/docs/<uuid>/tarjeta.png` estaban **cometidos y empujados** a
los dos remotos:

- `github.com/ismatv2001-png/reclama261` → HTTP **200 sin autenticación (PÚBLICO)**
- `gitlab.com/ismatv2001/reclama261` → HTTP **200 sin autenticación (PÚBLICO)**
- API pública de GitHub listaba `data/docs/1ef0120b-.../tarjeta.png`, `sha b6fc4c62...`

**Contenido real de los 5 ficheros: 5 bytes, el texto `hello`.** Son apuntes de prueba,
no tarjetas reales: **no hubo fuga de datos de ningún cliente real**. Fue un aviso, no
una brecha.

Corrección: `data/docs/`, `data/*.bak*` y `data/*.backup*` a `.gitignore`;
`git rm -r --cached data/docs` (los ficheros siguen en disco, dejan de versionarse).

Verificado con una subida simulada (`data/docs/prueba-fuga-.../tarjeta.png`):

```
git check-ignore -v  ->  IGNORADO  .gitignore:11:data/docs/
git status --porcelain | ^\?\?  ->  cero ficheros nuevos sin seguimiento
```

## 4. Estado honesto del negocio

- El software **funciona y calcula importes correctos**. Eso está verificado.
- El "cazador proactivo" **no puede alimentarse** de la capa anónima gratuita de
  OpenSky: el histórico de llegadas devuelve 404/403 y 12 h de Madrid dieron **1**
  llegada (el tráfico real es de cientos). Requiere cuenta OpenSky (gratis, sin
  tarjeta) y aun así tiene límites de crédito.
- La ruina de este negocio **no es financiera** (no se adelanta dinero), sino de
  **datos personales**: los dos defectos de arriba eran exactamente eso.

## 5. Base de datos

Se eliminaron 3 reclamos de prueba creados durante la verificación
(`Cliente Demo`, `Cliente Demo 2`, `X`), solo por id exacto, con copia previa:
9 → 6 reclamos. La copia se borró después por higiene (contenía datos de clientes).
