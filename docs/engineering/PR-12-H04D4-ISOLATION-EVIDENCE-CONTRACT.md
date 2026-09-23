# Contrato de trabajo — PR-12/H04d.4 evidencia de aislamiento

Fecha: 22/09/2026.

## Punto de partida y alcance

- Base: `87a69c1` sobre el worktree de rehearsal H04d.
- Clasificacion: tooling local y contrato de evidencia de aislamiento.
- H04d.2 verifico recursos beta y referencia Vercel legacy; H04d.3 verifico
  migracion canonica local sobre DB beta vacia y contraste Turso productivo.
- Este corte no autoriza migracion remota, deploy, cambios de webhook,
  modificacion de variables Vercel, lectura de valores sensibles ni trafico.

El objetivo es cerrar el procedimiento del siguiente corte local: obtener y
registrar fingerprints SHA-256 de staging como metadata restringida para los
manifiestos de aislamiento, sin recuperar secretos marcados como sensitive desde
Vercel y sin mutar producción.

## Resultado esperado

1. El manifiesto local de staging y la referencia local de producción usan la
   misma taxonomía de secretos que valida
   `staging:verify-isolation`.
2. Cada fingerprint se calcula offline, por stdin, con
   `npm run --silent staging:fingerprint-secret`.
3. Los fingerprints de staging se obtienen en el momento de crear o rotar cada
   secreto. No se intenta recuperar el valor sensible desde Vercel después de
   guardarlo. Un fingerprint productivo puede ser `null` si no existe recibo
   histórico; no se rota legacy para fabricarlo.
4. Los aliases Vercel y bindings beta se inventariarían de forma autenticada y
   read-only. Los webhooks y la revalidación fresca del inventario siguen siendo
   gates externos antes de cualquier actividad remota.
5. El ID numerico del bot Telegram productivo se obtiene sin mutar produccion:
   se puede derivar localmente desde el prefijo numerico del token si el token
   ya esta disponible en un canal autorizado de rotacion, o consultar `getMe`
   read-only solamente con autorizacion explicita.

## Mapa canonico de secretos

Los nombres del manifiesto deben mapear exactamente a estas variables de runtime:

| Clave de manifiesto | Variable de runtime |
| --- | --- |
| `database` | `TURSO_AUTH_TOKEN` |
| `telegramBot` | `TELEGRAM_BOT_TOKEN` |
| `telegramWebhook` | `TELEGRAM_SECRET_TOKEN` |
| `session` | `SESSION_SECRET` |
| `cron` | `CRON_SECRET` |
| `webAccess` | `WEB_ACCESS_TOKEN` |

`TURSO_DATABASE_URL` identifica el host/base, no es el secreto que alimenta el
fingerprint `database`. No se requiere relogin de Turso para este corte: la
metadata productiva de H04d.3 ya contrasto cuenta, DB ID y host sin consultar
tablas.

## Procedimiento local de fingerprint

Para cada secreto de staging creado o rotado, calcular el SHA-256 antes de
guardarlo como valor sensitive y conservar solo el digest en el manifiesto
local:

```bash
read -r -s HERMES_SECRET_VALUE
printf '%s' "$HERMES_SECRET_VALUE" | npm run --silent staging:fingerprint-secret
unset HERMES_SECRET_VALUE
```

La herramienta debe:

- leer exclusivamente desde stdin;
- no imprimir el valor de entrada ni su longitud;
- devolver un SHA-256 lowercase de 64 caracteres;
- ejecutarse sin red y sin dependencias de Vercel, Turso ni Telegram;
- rechazar cualquier argumento; el único canal de entrada es stdin.

No pegar secretos en comandos, logs, archivos versionados, tickets ni mensajes de
chat. Si un valor beta ya fue cargado como sensitive y no existe una copia
autorizada en el canal de rotación, el siguiente punto válido para obtener el
fingerprint es una rotación beta controlada, no una lectura retrospectiva desde
Vercel. En producción se deja `null` salvo que ya exista un recibo autorizado.

## Evidencia requerida

La evidencia que puede guardarse en `config/staging-isolation.local.json` y
`config/production-reference.local.json` no contiene los secretos, pero se trata
como metadata restringida y permanece ignorada por Git:

- IDs de proyecto, dominios, DB ID/host, bot ID/username, webhook URL y cookie;
- referencias de secretos por nombre/alias, nunca valores;
- fingerprints SHA-256 de staging obtenidos al crear o rotar el secreto;
- fingerprints productivos solo si ya existe un recibo autorizado; de lo
  contrario, `null`;
- fecha, operador autorizado y motivo de creacion/rotacion en el sistema externo
  correspondiente, si el proveedor lo expone sin valor sensible.

La consulta autenticada read-only de Vercel confirmó que los seis bindings
requeridos existen en el proyecto beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`,
apuntan al target `production` de ese proyecto aislado y son de tipo
`sensitive`:

| Variable | Creada (UTC) | Última actualización (UTC) |
| --- | --- | --- |
| `TURSO_AUTH_TOKEN` | 2026-09-20 21:39:20 | 2026-09-20 23:29:07 |
| `TELEGRAM_BOT_TOKEN` | 2026-09-20 21:39:53 | 2026-09-20 23:29:19 |
| `TELEGRAM_SECRET_TOKEN` | 2026-09-20 21:41:44 | 2026-09-20 21:41:44 |
| `SESSION_SECRET` | 2026-09-20 21:41:48 | 2026-09-20 21:41:48 |
| `CRON_SECRET` | 2026-09-20 21:41:52 | 2026-09-20 21:41:52 |
| `WEB_ACCESS_TOKEN` | 2026-09-20 21:41:56 | 2026-09-20 21:41:56 |

El target llamado `production` pertenece al proyecto beta y no es el proyecto
legacy. Esta metadata prueba ubicación/tipo del binding, no el valor ni su
procedencia; los fingerprints de staging siguen pendientes hasta una rotación
beta controlada o un recibo de creación autorizado.

El 22/09/2026 se inventariaron de forma autenticada los 60 aliases de la cuenta
Vercel `eindi-acme` en una sola página (`next: null`). Los hosts del namespace
Hermes legacy observados y que deben entrar en `productionHostDenylist` son:

```text
hermes-finantial-tracker.vercel.app
hermes-finantial-tracker-eindi-acme.vercel.app
hermes-finantial-tracker-estebanindiveri-8013-eindi-acme.vercel.app
hermes-finantial-tracker-git-main-eindi-acme.vercel.app
hermes-finantial-tracker-git-cursor-setup-dev-b9b6be-eindi-acme.vercel.app
hermes-finantial-tracker-git-feature-web-part-061aff-eindi-acme.vercel.app
hermes-finantial-tracker-git-feature-recurrin-371423-eindi-acme.vercel.app
hermes-finantial-tracker-git-feature-splits-d-4ee027-eindi-acme.vercel.app
hermes-finantial-tracker-qtm1t6cxf-eindi-acme.vercel.app
hermes-finantial-tracker-582yi3u42-eindi-acme.vercel.app
hermes-finantial-tracker-9t31lx6s8-eindi-acme.vercel.app
```

El inventario no mostro aliases del proyecto beta y ese proyecto continuaba sin
deployments. Debe repetirse inmediatamente antes de autorizar actividad remota,
porque aliases y deployments son estado mutable del proveedor.

La evidencia que permanece externa al repo y bloquea el cierre de aislamiento:

- evidencia read-only del ID/username y webhook productivos;
- una nueva comprobacion del webhook beta antes de habilitar trafico; H04d.2 lo
  verifico vacío, que es el estado seguro previo al rollout;
- recibos/fingerprints de los seis secretos de staging y su procedencia
  (`generated-for-staging` o `provider-issued-for-distinct-resource`).

## Invariantes

- Produccion es read-only. No se agregan, actualizan ni eliminan env vars,
  domains, aliases, webhooks, deployments, crons, DBs ni tokens productivos.
- No se recuperan valores sensitive desde Vercel ni se guardan secretos en el
  repositorio.
- Un fingerprint solo permite comparar valores conocidos en el momento de
  creación/rotación; no prueba por sí mismo procedencia, scope ni autorización.
- La ausencia de fingerprints productivos se informa como
  `productionFingerprintComparison: unavailable`; no es una razón para leer o
  rotar legacy.
- `staging:verify-isolation` puede pasar localmente y aun asi conservar
  `isolationVerified: false` hasta contrastar metadata autenticada de proveedor.
- Toda consulta Telegram productiva que use token requiere autorizacion explicita
  y debe limitarse a `getMe` read-only; no se ejecuta `setWebhook`,
  `deleteWebhook`, envio de mensajes ni lectura de updates.

## Pruebas y puertas

- `npm run staging:verify-isolation -- --staging ... --production-reference ...`
  debe devolver `ok: true` con fingerprints de staging reales y sin
  placeholders. Si producción permanece `null`, debe informar
  `productionFingerprintComparison: unavailable` y las seis claves pendientes.
- `git diff --check` debe pasar.
- Una revision humana debe comprobar que el diff no incluye secretos, tokens,
  valores de env sensitive, rutas locales sensibles ni comandos con secretos en
  argumentos.
- Antes de cualquier smoke remoto faltan autorizacion explicita, revalidacion
  fresca de aliases, webhook productivo/beta evidenciado y manifiesto
  contrastado.

## Fuera de alcance

- Rotar secretos durante este cambio documental.
- Leer valores sensitive desde Vercel o cualquier proveedor.
- Rehacer login de Turso para repetir metadata ya documentada.
- Ejecutar migraciones, despliegues, smokes, webhooks o trafico real.
- Push, PR, merge o deploy.

## Addendum de cierre H04d.4b — 23/09/2026

Este addendum registra el estado alcanzado en H04d.4b y sustituye las
afirmaciones de estado y pendientes temporales de las secciones históricas
anteriores. Las prohibiciones originales describen el corte documental inicial;
el usuario autorizó después, de forma específica, configurar secretos beta.
Las afirmaciones históricas de que los fingerprints beta seguían pendientes
quedan sustituidas por esta sección.

- Proyecto Vercel beta: `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`.
- Base Turso beta: `01a0c0bd-0601-7f27-b147-915d105b19f2`.
- Bot beta: `8739389202` (`@Hermes_beta_finantial_bot`).
- Los seis bindings sensibles de Vercel beta tienen fingerprints SHA-256
  locales registrados en `config/staging-secret-fingerprints.local.json`, un
  archivo ignorado por Git. Los fingerprints no son los valores secretos y no
  se reproducen aquí. El recibo clasifica la procedencia por secreto.
- Se generaron cuatro secretos propios de staging. Se creó y configuró un
  token Turso para la DB beta. El token anterior sigue válido: el CLI exige
  invalidar tokens del grupo `default`, que también contiene `atlas`, y el
  usuario decidió no revocarlo.
- Se configuró en Vercel el token de Telegram beta suministrado. No se hizo una
  rotación vía BotFather.
- No hubo cambios de esquema ni datos en DB, despliegues, cambios de webhook ni
  modificaciones de recursos productivos.

Una consulta autenticada y read-only de `vercel env ls production` el
23/09/2026, vinculada al ID del proyecto beta anterior, reconfirmó los seis
nombres de variables en el target `Production` de ese proyecto. El CLI no
mostró sus valores. La tabla de fechas del 20/09/2026 arriba es evidencia
histórica, no el estado temporal actual de los bindings.

Este avance no demuestra aislamiento completo: no se declara
`isolationVerified`. Siguen pendientes los manifiestos locales completos, el
ID/username/webhook del bot productivo y una metadata fresca de proveedores
antes de cualquier smoke remoto. Los fingerprints productivos pueden seguir
siendo `null`; no se consultaron ni rotaron secretos productivos para completar
esa comparación.
