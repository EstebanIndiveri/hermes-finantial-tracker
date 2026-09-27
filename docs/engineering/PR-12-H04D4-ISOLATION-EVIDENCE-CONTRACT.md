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

### Captura local de metadata Telegram productiva

Para completar la evidencia del bot productivo, el operador ejecuta en su propia
maquina (zsh) con entrada oculta, sin escribir el token como argumento, variable
de entorno ni archivo:

```zsh
read -r -s 'HERMES_BOT_TOKEN?Token productivo (oculto): '
printf '\n'
printf '%s' "$HERMES_BOT_TOKEN" | node scripts/read-telegram-bot-metadata.mjs
unset HERMES_BOT_TOKEN
```

El helper consulta solamente `getMe` y `getWebhookInfo` por GET y emite un
JSON con `botId`, `username` y `webhookUrl` si la URL usa la ruta canónica y no
contiene query, fragmento ni credenciales que puedan ocultar secretos. No
ejecuta cambios ni obtiene updates. El token nunca se imprime; errores no
incluyen token ni URL cruda. Compartir solamente el JSON
resultante como metadata restringida, nunca el token ni la salida de diagnóstico
de otra herramienta. No correr esta consulta desde este corte automatizado.

La salida puede verificarse con respuestas simuladas, sin llamar a Telegram:
`node --test scripts/__tests__/read-telegram-bot-metadata.test.mjs`.

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

## Addendum de implementación H04d.4c — 23/09/2026

El helper `scripts/create-h04d4c-local-manifests.mjs` construye los dos
manifiestos ignorados desde las identidades no secretas documentadas y el
recibo local restringido de fingerprints. Comprueba que proyecto, DB y bot del
recibo sean los de beta y que los seis fingerprints SHA-256 y sus procedencias
sean válidos y distintos. No consulta proveedores ni lee valores secretos.

El manifiesto de staging declara como destino futuro
`https://hermes-finantial-tracker-z2.vercel.app/api/telegram/webhook`. No afirma
que ese webhook esté configurado: la última evidencia efectiva de H04d.2 fue
webhook beta vacío. Una comprobación read-only fresca sigue siendo obligatoria
antes de habilitar tráfico.

El ID `8884948884`, username `HermesFinanceAssistBot` y URL de webhook
productivo `https://hermes-finantial-tracker.vercel.app/api/telegram/webhook`
fueron suministrados por el usuario en el chat. El helper registra esos datos
como declaraciones locales no verificadas; la URL aparente se normalizó desde
el enlace compartido. No equivalen a evidencia autenticada de Telegram ni
demuestran el estado actual del webhook.

Crear los archivos ausentes, sin sobrescribirlos:

```bash
node scripts/create-h04d4c-local-manifests.mjs
npm run staging:verify-isolation -- --staging config/staging-isolation.local.json --production-reference config/production-reference.local.json
```

El helper rehúsa sobrescribir cualquiera de los dos manifiestos si ya existe.
Después de confirmar el commit final del código, refrescar únicamente el campo
`releaseSha` con la opción explícita siguiente; el helper conserva el resto de
los metadatos y fingerprints:

```bash
node scripts/create-h04d4c-local-manifests.mjs --refresh-release-sha
npm run staging:verify-isolation -- --staging config/staging-isolation.local.json --production-reference config/production-reference.local.json
```

Los fingerprints no se imprimen. Aun con `ok: true`, la verificación local
mantiene `isolationVerified: false` y `trustLevel:
unverified-local-declaration`; faltan contraste autenticado actualizado de
proveedores y verificación efectiva de webhooks antes de cualquier actividad
remota.

El recibo local y ambos manifiestos deben tener permisos `0600`. El generador
rechaza un recibo legible por grupo/otros, un `config/` enlazado simbólicamente
y cualquier manifiesto existente al crear. La actualización explícita del SHA
solo acepta los manifiestos generados a partir del mismo recibo y conserva
intacta la referencia productiva. Las seis `secretRefs` se expresan como
`vercel:<project-id>:<environment-variable-name>`; son referencias declaradas,
no prueba de que el binding productivo exista o tenga un valor concreto.

En el ensayo local de este corte, ambos manifiestos fueron creados como
archivos ignorados con permisos `0600` y el verificador devolvió `ok: true`,
`localManifestConsistent: true`, `isolationVerified: false` y
`productionFingerprintComparison: unavailable`. Los fingerprints productivos
permanecen `null`; no se consultó producción para completarlos.

El 24/09/2026 el operador informó que ejecutó el helper con el token productivo
ingresado de forma oculta en su Terminal. La salida reportada fue bot ID
`8884948884`, username `HermesFinanceAssistBot` y webhook canónico
`https://hermes-finantial-tracker.vercel.app/api/telegram/webhook`. El cliente
del chat convirtió la URL en un enlace Markdown al pegarla; el helper local
rechaza URLs con corchetes, parámetros o rutas distintas, por lo que este
registro toma la URL canónica reportada. Codex no ejecutó esa consulta ni vio
el token. La evidencia es una declaración del operador sobre una consulta
autenticada; no verifica por sí sola otros bindings, aliases o el estado beta.

## Addendum H04d.4d — reconciliación beta read-only (24/09/2026)

Se hicieron las consultas beta acotadas siguientes, sin leer tablas financieras
ni modificar proveedores:

- **Telegram beta, 22:51 UTC:** el helper local con el token beta devolvió ID
  `8739389202`, username `Hermes_beta_finantial_bot` y URL vacía. El webhook
  beta seguía sin configurar en esa consulta.
- **Turso beta, 22:48:23 UTC:** `turso db show beta-hermes` devolvió ID
  `01a0c0bd-0601-7f27-b147-915d105b19f2`, host
  `beta-hermes-esteban-indiveri.aws-us-east-2.turso.io` y región
  `aws-us-east-2`; coincide con el manifiesto.
- **Vercel beta, 22:49:58 UTC:** el ID local coincidió con el proyecto
  `hermes-finantial-tracker-z2` de `eindi-acme`; el proyecto indica Node.js
  22.x. `vercel ls` no encontró deployments y `vercel inspect` no encontró
  deployment asociado al host beta. `domains inspect` devolvió acceso denegado;
  eso no prueba que el alias exista ni que no exista. No se consultó el
  inventario global de proyectos o aliases.
- La lista de **nombres** de variables del target Preview mostró bindings de DB,
  Telegram, cron y sesión como `Encrypted`; no se leyeron valores. No aparecieron
  `AI_MODE`, `OCR_MODE`, `NOTIFICATIONS_ENABLED`, `SESSION_COOKIE_NAME`,
  `TELEGRAM_INBOX_ENABLED`, `TELEGRAM_OUTBOX_ENABLED`,
  `TELEGRAM_OUTBOX_WORKER_ENABLED` ni `NEXT_PUBLIC_APP_URL`.

La ausencia de controles tiene efectos concretos en el código actual: AI y OCR
quedan en modo `live`, notificaciones habilitadas, la sesión usa el nombre
legacy `hermes_session`, y el webhook usa el handler legacy cuando inbox no está
explícitamente en `true`. Por eso Preview no está listo para deploy o smoke.
El proyecto tampoco tiene deployment y el estado del alias beta sigue sin
confirmación de Vercel.

No se consultó Vercel ni Turso productivos. La metadata productiva sigue siendo
la salida que el operador informó del helper, no una consulta independiente de
Codex. Este addendum no declara aislamiento completo ni autoriza cambios de
configuración, deploy, webhook o tráfico.

### Actualización beta autorizada — alcance Vercel Preview (24/09/2026)

El operador autorizó modificar Vercel y Telegram exclusivamente para los
recursos beta. No se accedió a producción. Para preparar Preview se inspeccionó
`hermes-finantial-tracker-z2` (`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`): Node.js
22.x, rama Production configurada como `codex/staging`. `vercel env ls` confirmó
que los ocho controles de aislamiento (`AI_MODE`, `OCR_MODE`,
`NOTIFICATIONS_ENABLED`, `SESSION_COOKIE_NAME`, `TELEGRAM_INBOX_ENABLED`,
`TELEGRAM_OUTBOX_ENABLED`, `TELEGRAM_OUTBOX_WORKER_ENABLED` y
`NEXT_PUBLIC_APP_URL`) ya aparecen vinculados al target Production de este
proyecto beta. No se recuperaron sus valores.

Preview sigue sin esos ocho bindings. No se pudo crear una configuración
Preview segura: Vercel rechazó `codex/staging` porque es la rama Production, y
rechazó `codex/h04d-staging-rehearsal` porque esa rama local no existe en el
repositorio Git conectado. Los intentos fueron rechazados antes de escribir;
`vercel env ls` confirmó que no se añadieron variables. La CLI tampoco aceptó
el target Preview sin rama explícita. No hacer push ni disparar un deployment
con el estado actual: Preview heredaría defaults runtime inseguros (IA/OCR
live, notificaciones activas y webhook legacy). La rama beta debe estar
disponible para Vercel antes de agregar bindings Preview y confirmar sus
nombres/targets.

No se modificaron Vercel, Telegram, Turso, DB, webhook, aliases ni deployment;
no hubo tráfico beta ni acceso a recursos productivos. Para cerrar este punto
hace falta acordar una rama beta existente/conectada que no sea
`codex/staging` y configurar en ella los ocho valores seguros antes de permitir
un deployment Preview. El nombre de la rama es una decisión operativa; no se
debe sustituir por `main` ni por otra feature branch arbitraria.

### Cierre beta de H04d.4d — Preview preparado y deploys pausados (25/09/2026)

El operador autorizó pausar auto-deploys solo del proyecto beta, publicar la
rama de trabajo, configurar/verificar Preview y mantener los deploys pausados.
La rama `codex/h04d-staging-rehearsal` quedó publicada en el repositorio GitHub
con HEAD `584a27f549df74f4b5e4e07b3bdab1459f9c376f`. La configuración Vercel
se verificó contra el proyecto beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`, no
contra el proyecto legacy.

El Ignored Build Step del proyecto ya estaba configurado como “Don’t build
anything” (`exit 0`); no fue necesario cambiarlo. Vercel mantiene así los
deploys pausados. Después del push, `vercel ls hermes-finantial-tracker-z2`
devolvió cero deployments; la vista de proyecto también mostró “No Production
Deployment”. No se activó ni ejecutó deployment manual. Mantener el build
ignorado hasta autorización posterior; no revertirlo automáticamente.

Se agregaron y luego enumeraron por rama los siguientes Preview bindings; la
consulta de verificación confirmó `target: preview` y
`gitBranch: codex/h04d-staging-rehearsal` en los ocho, tipo `encrypted`:

| Variable | Valor configurado |
| --- | --- |
| `AI_MODE` | `stub` |
| `OCR_MODE` | `stub` |
| `NOTIFICATIONS_ENABLED` | `false` |
| `SESSION_COOKIE_NAME` | `hermes_beta_session` |
| `TELEGRAM_INBOX_ENABLED` | `false` |
| `TELEGRAM_OUTBOX_ENABLED` | `false` |
| `TELEGRAM_OUTBOX_WORKER_ENABLED` | `false` |
| `NEXT_PUBLIC_APP_URL` | `https://hermes-finantial-tracker-z2.vercel.app` |

No se recuperaron valores desde Vercel. El hostname beta está asignado a este
proyecto; la página de dominios indica “No Deployment”, así que todavía no
resuelve a una release activa. La rama, los bindings y el hostname pertenecen
al proyecto beta aislado. No se tocó el webhook beta ni se consultó producción.

### H04d.4e — backup/restauración beta y preflight local read-only (25/09/2026)

Con `turso db show beta-hermes` se reconfirmó únicamente el recurso beta:
ID `01a0c0bd-0601-7f27-b147-915d105b19f2`, host
`beta-hermes-esteban-indiveri.aws-us-east-2.turso.io`, tamaño reportado 4.1 kB
y `Is Schema: No`. No se consultaron filas ni se escribió en Turso.

Se creó un export local del recurso beta con metadata, fuera del repositorio,
en un directorio temporal modo `0700`. Los tres miembros (`beta-hermes.db`,
`.db-info`, `.db-wal`) se copiaron a un destino de restauración también privado,
quedaron modo `0600` y fueron comparados byte a byte. El digest de bundle
`dde6f8558e7ca94be5ff70f0d4effdebdecce0afcba54c5747040158a213e70c` se calculó
determinísticamente sobre los registros ordenados por nombre de miembro:
`nombre NUL tamaño NUL SHA-256-del-miembro LF`. La restauración devolvió
`PRAGMA integrity_check = ok`, cero violaciones de FK y cero objetos de esquema
de aplicación. El recibo no secreto se actualizó en el archivo local ignorado
`config/staging-backup-evidence.local.json`; el salt y los artefactos permanecen
fuera del repositorio.

La captura `artifacts/staging/before-20260925.json` fue `readOnlyVerified: true`,
con fingerprint de schema vacío
`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`, sin
violaciones de integridad y con agregados financieros vacíos. El plan de
adopción concluyó `decision: blocked`, `applyAuthorized: false`, porque la DB no
es una base legacy administrada y faltan forward-fix, fingerprint objetivo,
reconciliación before/after y autorización explícita de apply. Eso es lo
esperado: no corresponde adoptar ni migrar una DB beta vacía como si tuviera
datos legacy.

El export local es temporal y no se versiona. No se ejecutaron migraciones
remotas, deploy, webhook ni tráfico; no hubo acceso a producción. El siguiente
paso remoto, si se quiere inicializar el schema canónico en `beta-hermes`, debe
ser una autorización específica para ese cambio de schema, manteniendo las
flags apagadas. La autorización de deployment sigue pendiente por separado.

### H04d.4f — bootstrap canónico repetido sobre copias locales (25/09/2026)

Para conservar la exportación restaurada como fuente intacta, se crearon dos
copias independientes A/B mediante SQLite `.backup` en un directorio temporal
privado (`0700`), con cada DB en modo `0600`. Ambas comenzaron vacías: la
inspección inicial indicó `state: empty`, cero tablas y nueve migraciones
pendientes. No se modificó la exportación, Turso ni ningún recurso remoto.

En A se ejecutaron las nueve migraciones del manifiesto canónico. La inspección
final informó `state: canonical`, cero pendientes, conflictos o drift y cero
violaciones FK. La captura before/after, con el mismo salt y el mismo archivo,
se comparó contra el fingerprint canónico
`309646a60fcdfc1566e6110cc4e5ec8eb32cbfdb1ffa4ee03a3d838d54014701` y el
digest de manifiesto
`03e5b07cd70bb5b96c65cccb8ac3565f1e772ab5b0426948505a59c7942c1a3f`;
resultado `ok: true`, `differences: []`. Las 16 tablas monitoreadas se
permitieron explícitamente como adiciones esperadas del bootstrap vacío. La
captura posterior fue `readOnlyVerified: true`, sin findings bloqueantes,
huérfanos, duplicados ni agregados financieros.

En B, independiente de A, se repitió el bootstrap y la inspección final dio el
mismo fingerprint, sin drift, conflictos, pendientes ni violaciones FK. La
segunda ejecución sobre B devolvió `appliedMigrationIds: []`, confirmando
idempotencia. No se compararon firmas A contra B porque la identidad de
evidencia incluye la ruta local de cada destino.

La evidencia detallada queda únicamente fuera del repo en el directorio
temporal restringido del operador; no se versionan DBs, snapshots ni salts. Este
corte completa el ensayo local del bootstrap canónico desde una base vacía, no
valida adopción legacy ni autoriza inicializar el schema en `beta-hermes`.
Continúan apagadas las flags; el proyecto Vercel sigue con builds ignorados y
sin deployment. El próximo gate que requiere decisión del operador es la
autorización específica para escribir el schema canónico en la DB beta. Deploy,
webhook y tráfico requieren autorizaciones separadas.

### H04d.4g — bootstrap remoto autorizado en Turso beta (26/09/2026)

El operador autorizó aplicar únicamente las nueve migraciones canónicas a
`beta-hermes`, sin deploy, webhook ni tráfico. Justo antes de escribir se
reconfirmó por CLI el ID `01a0c0bd-0601-7f27-b147-915d105b19f2` y el host
`beta-hermes-esteban-indiveri.aws-us-east-2.turso.io`; la consulta read-only de
`sqlite_schema` devolvió cero objetos. Una exportación fresca previa fue
inspeccionada localmente: `state: empty`, cero tablas, cero FK inválidas y las
nueve migraciones pendientes.

La ejecución tomó su selección exclusivamente de
`lib/db/migrations/manifest.json`, que define los IDs `0000-base` hasta
`0080-telegram-operations-outbox`, asigna los nueve SQL canónicos y clasifica
los SQL históricos solapados como excluidos. Cada migración se aplicó en una
transacción independiente a través del CLI autenticado de Turso, con su
checksum y orden registrados en `hermes_schema_migrations`. Se verificó el
incremento consecutivo del ledger hasta nueve; la migración de outbox incluyó
el preflight de ejecuciones recurrentes duplicadas y cada transacción exigió
cero violaciones FK antes del commit.

Luego se creó y restauró una nueva exportación de beta fuera del repositorio.
El bundle de backup y restauración coincide byte a byte; digest
`29e4ab60de09268199b9cad91f1a1416d5ec8d85225c8f5d388413567925be63` y
`PRAGMA integrity_check = ok`. La inspección del restore con el runner Hermes
informó `state: canonical`, los nueve IDs aplicados, cero pendientes, conflictos
o drift, fingerprint
`309646a60fcdfc1566e6110cc4e5ec8eb32cbfdb1ffa4ee03a3d838d54014701` y cero
violaciones FK. Una segunda ejecución local del runner sobre ese restore
devolvió `appliedMigrationIds: []`. La reconciliación before/after sobre el
mismo destino local, con el manifiesto aprobado y las 16 tablas de aplicación
permitidas como adiciones del bootstrap, devolvió `ok: true` y `differences: []`;
no encontró blockers, huérfanos, duplicados ni agregados financieros.

El manifiesto de Hermes fue la fuente de aplicación; no se ejecutó
`drizzle-kit migrate` ni se modificó el journal histórico de Drizzle. Ese
journal todavía enumera dos entradas antiguas y debe reconciliarse en un corte
local separado antes de considerar otra herramienta de migración sobre beta.
No se realizó deploy, cambio de variables, webhook, envío/recepción Telegram ni
tráfico. La consulta de Vercel confirmó los ocho controles Preview de la rama y
cero deployments; el Ignored Build Step continúa pausando builds. No hubo
acceso ni cambios en producción.

La DB beta ahora está inicializada con schema, no con datos de usuarios. Esta
autorización no extiende permisos a deployment ni tráfico. H04c declara el
manifiesto/ledger Hermes como la ruta activa; el journal Drizzle de dos entradas
es histórico. La inspección de package scripts, CI, runtime y configuración de
build no encontró una llamada nativa a `drizzle-kit migrate`, así que reconstruir
ese journal no es requisito para un Preview de esta rama. No usar el migrator
nativo contra beta salvo que un corte de toolchain separado alinee explícitamente
ambas cadenas. Los quality gates locales ya pasaron; desplegar Preview beta
requiere aprobación separada. H04d.4 sigue abierto porque la evidencia de
proveedor/producción permanece incompleta; no declarar `isolationVerified`.

En la validación local posterior pasaron harness (52/52), Jest (88 suites,
735/735 tests), typecheck, lint (0 errores; 67 warnings) y build Webpack. Lint
conserva warnings preexistentes; el build mostró la deprecación de `middleware`
y avisos de `process.cwd` en dependencias ejecutadas bajo Edge. Estos resultados
no activan un deployment ni sustituyen smoke beta.

### H04d.4h — intento de Preview y bloqueo de plataforma (26/09/2026)

El operador autorizó un deployment Preview de
`codex/h04d-staging-rehearsal`, con flags apagadas y sin webhook ni tráfico
Telegram. El primer intento fue rechazado antes de crear un deployment porque
el plan Hobby no admite el cron por minuto `/api/cron/telegram-outbox`. Un
segundo intento usó `--local-config` temporal, pero Vercel siguió leyendo los
crons del `vercel.json` incluido en el código.

La inspección autoritativa del segundo intento devolvió
`target: production` (ID `dpl_BxEqUeFP7QKoyx9m8VL68eJ3DjR5`), aunque el comando
solicitaba `--target preview`. Se retiró inmediatamente ese deployment exacto;
no se hicieron requests de prueba. En intentos siguientes también se observó
que Vercel bloqueaba deployments por el email local del autor de commit, que no
coincidía con la cuenta autorizada. Estos intentos fallidos fueron retirados.
La resolución del flujo beta queda en H04d.4i.

El deploy autorizado queda **bloqueado** hasta resolver cómo el CLI 54.4.1
apunta de forma verificable a Preview para este proyecto. Antes de otro intento
hay que confirmar target Preview antes de publicar; si la CLI no puede
garantizarlo, usar un flujo Preview de Vercel que se valide por metadato antes
de dejarlo accesible. No asumir que `--target preview` funcionó por la URL o
por el mensaje de la CLI. Las tres flags Telegram continúan `false`. En ese
momento, la vía Preview quedó pendiente por ese bloqueo de CLI. Este estado fue
superado por la aclaración posterior del operador y el deploy beta registrado
en H04d.4i. No declarar H04d.4 completo ni habilitar webhook/tráfico.

### H04d.4i — deployment beta aislado y pausa restaurada (26/09/2026)

El operador aclaró que el target Production del proyecto beta era aceptable,
siempre que no se afectara el proyecto legacy. Se revalidó que la identidad era
el proyecto `hermes-finantial-tracker-z2`, ID
`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`, cuyo Production Branch es
`codex/staging`; el deployment ejecutado provino de la rama local
`codex/h04d-staging-rehearsal`. Ninguna operación usó el proyecto legacy.

Se actualizaron solo variables no-secretas del target Production beta para
asegurar `AI_MODE=stub`, `OCR_MODE=stub`, `NOTIFICATIONS_ENABLED=false`,
`SESSION_COOKIE_NAME=hermes_beta_session`, la URL pública beta y las tres
flags Telegram (`TELEGRAM_INBOX_ENABLED`, `TELEGRAM_OUTBOX_ENABLED`,
`TELEGRAM_OUTBOX_WORKER_ENABLED`) en `false`. Los valores secretos existentes
no se recuperaron, copiaron ni rotaron.

El plan Hobby vuelve a rechazar cualquier deployment que incluya el cron cada
minuto. Por ello se usó temporalmente `vercel.json` vacío en el árbol local
solo durante el upload del deployment; luego se restauró el archivo original y
el diff local quedó limpio. El deployment beta resultante no tiene ningún
programador cron activo: `vercel cron list` informa los cuatro crons del árbol
local como `not deployed`. No se llamó al endpoint Telegram ni a ningún cron.
La limitación operativa es que el beta desplegado no ejecutará tareas
programadas hasta resolver un plan/estrategia de scheduling.

El proyecto beta se pausó solo durante el deploy al poner
`commandForIgnoringBuildStep=null`; se restauró inmediatamente a `exit 0`.
También se corrigió el email del autor del commit local de documentación para
coincidir con la cuenta Vercel autorizada; el commit local resultante es
`8a3c579` y no fue publicado a Git. Deployment
`dpl_EtQ1id5dBHk5U8HGvbtohzTBZbJq` está `READY`,
`target: production`, con alias `hermes-finantial-tracker-z2.vercel.app`.
El GET de `/` respondió 307 y `/login` respondió 200. Los tres deployments
fallidos/bloqueados de este ensayo se retiraron; queda un deployment Ready.
El build pause está restaurado y `vercel.json` local coincide con Git.

No hubo webhook, tráfico Telegram, llamadas a Groq/OCR, cambios en Turso, ni
acceso/cambio en producción legacy. H04d.4 continúa abierto: esta publicación
no completa la comparación de identidad productiva ni autoriza habilitar
flags, configurar webhook o usar datos reales.

### H04d.4k — smoke financiero parcial y proveedores IA/OCR (27/09/2026)

Esteban confirmó que `esteban_beta_qa` quedó vinculado al bot beta. Una
consulta de solo lectura, acotada a ese usuario en `beta-hermes`, encontró
exactamente un movimiento activo de Telegram: ARS 1.379 en `supermercado`.
Coincide con la captura: el mensaje natural `Gasto de supermercado 1379`
recibió tres veces ayuda para usar `/gasto`; luego `/gasto 1379 supermercado`
registró el movimiento.

#### Causa y cambio local

En `lib/telegram/handlers.ts`, la falta de `GROQ_API_KEY` provocaba un retorno
antes de `parseExpenseFallback`. El parser local ya podía extraer monto y
categoría, pero nunca se invocaba. Se agregó un camino sin Groq conservador:
requiere verbo explícito de gasto, monto y categoría; deriva al flujo existente
de confirmación. Además, `/gasto` ahora informa las categorías reales del
grupo (o que todavía no hay ninguna) y no una lista global hardcoded.

La suite completa pasa en un worktree limpio:

- Harness de aislamiento y reconciliación: aprobado.
- Jest: 88 suites, 739 pruebas aprobadas.
- Typecheck: aprobado.
- Lint: 0 errores; 67 warnings ya existentes.
- Build Webpack: aprobado.

No se desplegó el cambio. El worktree previo ya tenía eliminaciones sin
commit que hacían fallar el harness; para validar sin alterar esos archivos,
se repitieron los gates en `/private/tmp/hermes-h04d-nlp-verification`, un
worktree limpio basado en el mismo corte.

#### Groq, Whisper y OCR

El código usa `GROQ_API_KEY` para interpretación de texto, Whisper y análisis
de texto de recibos. El OCR de imágenes usa OCR.Space y necesita la variable
distinta `OCR_SPACE_API_KEY`. Vercel reporta bindings cifrados de ambos
proveedores para el proyecto beta. Por solicitud del operador se intentó
consultar solo los valores legacy correspondientes; al estar marcados como
Sensitive, la API devolvió `decrypted=false`. No se recuperó/imprimió ninguna
clave, no se modificó producción y no se copiaron valores.

Para poder probar el comportamiento beta se mantuvieron sus bindings propios
y se establecieron `AI_MODE=live` y `OCR_MODE=live` solo en el target
Production del proyecto beta. La versión que está sirviendo beta todavía no
cambia: esos modos aplican en el próximo deployment. Las tres flags Telegram
continúan sin modificación y el outbox/worker siguen apagados. Si las keys
beta existentes no fueran válidas, generar claves dedicadas a beta en las
consolas Groq/OCR.Space y cargarlas directamente en Vercel beta; no publicarlas
en el chat.

#### Owner y reentrada

| Gate | Owner | Reentrada / cierre |
| --- | --- | --- |
| Financial E2E beta | Codex — deploy/concilia; Esteban — envía y confirma canarios | Deployment listo; enviar un gasto natural sintético y una imagen sintética; conciliar cada resultado y mostrarlo en dashboard. |
| Proveedor credentials beta | Codex — activar modos/configurar beta; Esteban — resolver keys si fallan | Si Groq/OCR beta rechazan solicitudes, reemplazar las keys beta desde sus consolas y redesplegar solo beta. |

H04d sigue abierto hasta validar el canario natural, el recorrido de OCR, el
outbox/entrega durable y la decisión pendiente sobre worker/aislamiento formal.

### H04d.4l — corrección NLP desplegada solo a beta (27/09/2026)

Commit local `78f156e` en `codex/h04d-natural-language-e2e` se desplegó al
target Production **del proyecto beta**, no a legacy. El deployment
`dpl_3krXMJ84Z1DsCTMUMhn8xTQRPfAW` quedó `READY`; alias
`https://hermes-finantial-tracker-z2.vercel.app` devuelve `/` → 307 y `/login`
→ 200.

La cuenta Vercel Hobby rechazó el paquete que incluía el cron por minuto. Se
retiraron los dos intentos fallidos de este corte y se repitió la publicación
omitiendo temporalmente el `vercel.json` del paquete. El archivo canónico fue
restaurado en el worktree. `vercel cron ls` confirma las cuatro definiciones
como `not deployed`; en particular, el worker outbox sigue sin scheduler. Las
flags `TELEGRAM_INBOX_ENABLED`, `TELEGRAM_OUTBOX_ENABLED` y
`TELEGRAM_OUTBOX_WORKER_ENABLED` no se modificaron.

Antes de este deploy, `AI_MODE=live` y `OCR_MODE=live` se establecieron solo
en las variables Production beta. Se usaron los bindings beta existentes de
Groq/OCR.Space; Vercel impide descifrar las variables legacy Sensitive, así
que no se copiaron claves de producción. El deploy no alteró webhook, Turso,
datos, variables ni tráfico de producción legacy.

#### Estado pendiente

| Gate | Owner | Criterio de cierre |
| --- | --- | --- |
| NLP funcional beta — cerrado, 27/09/2026 | Esteban envió/confirmó; Codex concilió | Una sola fila activa: ARS 1.381, `Supermercado`, source `telegram`, fecha 2026-09-27. La fila DB no demuestra por sí sola qué proveedor/modelo procesó la solicitud. |
| OCR beta | Esteban envía recibo sintético; Codex concilia | OCR.Space lee el recibo sintético, propuesta correcta y movimiento solo tras confirmación. Si falla la key beta, reemplazarla directamente en Vercel beta. |

H04d-BETA-FINANCIAL-E2E permanece parcial hasta cerrar ambos canarios. No
avanzar el cierre outbox/scheduler ni declarar aislamiento formal certificado
en base a este deployment.

### H04d.4m — canario de lenguaje natural conciliado (27/09/2026)

Esteban confirmó que envió `Gasto de supermercado 1381` al bot beta y que este
registró el gasto. La consulta de solo lectura a `beta-hermes`, limitada al
usuario `esteban_beta_qa`, amount ARS 1.381, `source='telegram'` y
`status='active'`, encontró exactamente una fila: categoría `Supermercado`,
fecha 2026-09-27. No se leyó ni cambió ningún dato productivo.

Se cierra el canario funcional de texto natural en beta. Esto confirma el
recorrido usuario → Telegram beta → registro durable en Turso beta; no es por
sí solo una prueba de telemetría que demuestre qué proveedor/modelo atendió la
solicitud. `AI_MODE=live` continúa configurado solo en el proyecto beta.

| Gate restante | Owner | Reentrada/cierre |
| --- | --- | --- |
| OCR imagen beta | Esteban — enviar recibo sintético por el bot beta; Codex — verificar propuesta y reconciliar | Comprobar extracción de OCR.Space, mostrar monto/categoría/fecha correctos, confirmar únicamente si coinciden y verificar una sola transacción en beta + dashboard. Si falla el proveedor, revisar/reemplazar solo la credencial beta. |
| Outbox y worker/scheduler | Se mantienen como cortes posteriores, con owners y decisión de plataforma en `IMPLEMENTATION-STATUS.md` | No habilitar flags ni cron dentro de este canario financiero. |

No se accedió ni modificó producción legacy. El gate financiero H04d queda
parcial hasta la prueba de imagen OCR; el certificado formal de aislamiento
permanece diferido según el alcance ya registrado.

### H04d.4n — diagnóstico de fallo OCR en beta (27/09/2026)

La imagen enviada al bot beta llegó al webhook y el handler inició OCR. La
revisión de logs del deployment beta exacto `dpl_3krXMJ84Z1DsCTMUMhn8xTQRPfAW`,
filtrada al intervalo de la captura, encontró el warning
`OCR_SPACE_API_KEY not set — OCR skipped` para `POST /api/telegram/webhook`
(17:09:53 -03, HTTP 200). La fila `receipt_imports` correspondiente en
`beta-hermes` quedó `failed`, `fail_reason='OCR returned no text'` y
`transaction_id=NULL` (17:09:57 -03). No se consultó el texto OCR ni se creó
un movimiento financiero.

Esto localiza el fallo antes de OCR.Space: no fue un rechazo del formato del
recibo ni un parseo de Groq. Aunque `vercel env ls production` muestra el
nombre `OCR_SPACE_API_KEY` asociado a Production/Preview, el runtime de este
deployment no recibe un valor utilizable. La inspección metadata-only no
permite saber si la variable tiene valor incorrecto/vacío o si el binding no
se propagó a ese deployment. Los valores beta configurados como Secret son
write-only; Vercel los conserva en forma no legible tras guardarlos.

#### Bloqueo y responsable

| Estado | Owner | Reentrada/cierre |
| --- | --- | --- |
| Credencial OCR beta | Esteban — reingresar/reemplazar una clave OCR.Space válida directamente en Production del proyecto beta; Codex — validar metadata de target, volver a desplegar únicamente beta y revisar runtime | Tras actualizar la variable, crear un deployment beta nuevo; verificar que desaparezca el warning, que OCR.Space devuelva texto suficiente y que el bot presente una propuesta antes de cualquier escritura. Si vuelve a faltar la variable, corregir el binding/target beta. No copiar ni rotar secretos legacy. |
| Importe/DB para esta imagen | Cerrado | La importación fallida no produjo transacción (`transaction_id=NULL`); el handler pidió usar `/gasto`. |

No intentar concluir OCR E2E ni habilitar otra feature mientras esta
dependencia beta siga sin resolver. El flujo NLP queda funcional y conciliado;
H04d-BETA-FINANCIAL-E2E continúa parcial. Producción legacy, su configuración,
webhook, DB y tráfico no fueron consultados ni modificados.

### H04d.4o — redeploy beta tras actualizar credencial OCR (27/09/2026)

Esteban actualizó `OCR_SPACE_API_KEY` para Production y Preview del proyecto
`hermes-finantial-tracker-z2` (evidencia visual compartida). Codex generó un
snapshot temporal desde `codex/h04d-natural-language-e2e` y desplegó al target
Production de ese proyecto como `dpl_Ay2zZnDbMFmFEFicH7fAbZzfqLCy`.
Quedó `READY` y el alias beta responde `/` → 307 y `/login` → 200. Se excluyó
`vercel.json` del paquete para que Vercel Hobby no registre el cron por minuto;
las cuatro definiciones continúan `not deployed`. No se cambiaron flags de
Telegram, código local, webhook ni base de datos.

Los logs del nuevo deployment consultados inmediatamente después del deploy
no contienen todavía solicitudes OCR; no se envió tráfico de prueba. El
resultado del secreto en runtime queda por verificar con una nueva imagen
sintética desde `Hermes_beta_finantial_bot`.

| Estado | Owner | Cierre/reentrada |
| --- | --- | --- |
| Deployment beta actualizado | Codex — completo | `dpl_Ay2zZnDbMFmFEFicH7fAbZzfqLCy`, alias beta Ready. |
| Canario de imagen OCR | Esteban — reenviar una imagen sintética; Codex — inspeccionar log y conciliar | Debe desaparecer `OCR_SPACE_API_KEY not set`, OCR.Space debe extraer texto y la propuesta debe pedir confirmación. Solo después de confirmación verificar una fila en Turso beta y el dashboard. |

Producción legacy permaneció sin intervención. El corte OCR no se declara
cerrado hasta pasar el canario con esta nueva versión.

### H04d.4p — OCR happy path y brecha de reintegro (27/09/2026)

Esteban envió intencionalmente dos veces el mismo ticket por el bot beta. La
consulta read-only a `beta-hermes`, restringida a `esteban_beta_qa` y a los
imports del monto reconocido, encontró exactamente dos imports `confirmed`
y dos transacciones activas: ARS 23.971,15, categoría `Supermercado`, ambas
con `requires_reimbursement=0`. No apareció una tercera fila accidental. El
reconocimiento OCR y la propuesta/confirmación quedaron funcionalmente
validados para gasto ordinario.

#### Hallazgo funcional

El flujo actual de recibo no pregunta si corresponde reintegro. La propuesta
de OCR solo muestra monto, categoría, comercio/fecha y botones de confirmar,
editar o cancelar (`buildReceiptProposalMessage`). Al confirmar, el callback
invoca `registerPersonalTransaction(..., false, ...)`, fijando
`requires_reimbursement=false`. Es consistente con los dos registros, pero
impide que el usuario marque desde OCR un gasto que debe reintegrarse.

No se ejecutó una tercera operación. Los dos gastos duplicados fueron
intencionales y quedaron en beta. Producción legacy no se consultó ni modificó.

| Siguiente tarea | Owner | Criterio de cierre |
| --- | --- | --- |
| Añadir elección de reintegro al flujo de recibo | Codex — implementar en corte propio con pruebas; Esteban — validar UX beta | La propuesta pregunta explícitamente si el gasto requiere reintegro; la elección se conserva al confirmar; “no” conserva el comportamiento actual; cancelar/editar no escribe una transacción. |
| QA de recibos reembolsables/no reembolsables | Esteban — enviar dos canarios sintéticos tras el cambio; Codex — conciliar | Un recibo marcado sí produce `requires_reimbursement=1` y el flujo esperado de solicitud; otro marcado no queda en `0`; cada uno aparece una vez. |
| Duplicados | Codex — evaluar deduplicación sin impedir gastos legítimos iguales | Mantener documentado que cada reenvío explícito crea una importación nueva; proponer confirmación/alerta por mismo `telegram_file_id` o huella solo después de definir falsos positivos. |

H04d-BETA-FINANCIAL-E2E sigue parcial por la brecha de reintegro OCR. El
worker/outbox y la certificación formal de aislamiento continúan siendo gates
separados; no se abrieron en este corte.

### H04d.4q — reintegro inconsistente y voz sin diagnóstico; integración ACT-11/13/14 (27/09/2026)

#### Evidencia beta

Esteban reportó y mostró `Gasté 5000 en supermercado con reintegro`. El bot
respondió que el gasto quedó registrado y que el reintegro fue solicitado
automáticamente, sin una elección Sí/No. Una consulta de solo lectura en
`beta-hermes`, limitada a la cuenta QA y a ese importe, encontró una
transacción activa Telegram ARS 5.000, una solicitud de reintegro `pending`
por ARS 5.000, pero `transactions.requires_reimbursement=0`. Es una
inconsistencia entre intención/proyección y datos persistidos, aunque la
solicitud sí fue creada.

La captura previa del ticket OCR confirmó el otro lado: el callback OCR
confirma el gasto con `requires_reimbursement=false` y el mensaje de propuesta
no contiene una pregunta de reintegro. Para el caso de gasto normal, Esteban
reporta que tampoco vio la opción. No se hizo otra escritura de prueba.

Esteban además probó dos mensajes de voz (1–2 segundos); ambos recibieron
“No pude transcribir el audio”. En `telegram_update_inbox` aparecen dos
updates `voice` completados, `attempt_count=1`, `last_error_code=NULL`; el
webhook los respondió HTTP 200. Los logs consultados en el deployment beta no
contienen excepción ni diagnóstico de STT. El código actual confirma que
`transcribeAudio` puede devolver `null` sin log cuando AI está apagada/no
reconocida o `GROQ_API_KEY` no está disponible; la descarga de Telegram y los
errores HTTP Groq tienen logs, pero no hubo datos que permitan distinguir la
causa de estos dos intentos. Resultado: fallo reportado confirmado; causa
raíz de voz aún no demostrada.

#### Lectura arquitectónica y secuencia recomendada

Estos casos se asignan a los entregables ya existentes **ACT-11
(enrutamiento voz/texto/foto)**, **ACT-13 (parser monetario e intenciones)** y
**ACT-14 (OCR verificable)**; no se crea un ACT paralelo ni se debe corregir
cada handler con reglas aisladas. El siguiente corte propuesto es un contrato
y luego una implementación vertical de una sola entrada de dominio para
Telegram:

1. Adaptadores finos normalizan comando/texto, transcripción, extracción OCR y
   callback en el mismo `InboundTelegramMessage`, conservando modalidad y
   evidencia sin escribir datos.
2. Un intérprete devuelve un `FinancialDraft` discriminado —gasto/ingreso/
   consulta/acción— con monto, moneda, categoría, fecha, grupo, comercio,
   intención de reintegro (`yes`/`no`/`unknown`), evidencia y confianza. El
   modelo no llama DB ni decide permisos.
3. Una sola política de conversación valida autorización y catálogo, pide
   aclaraciones y produce una propuesta confirmable; comandos son entradas
   deterministas al mismo draft, no writers alternativos.
4. Una sola confirmación versionada dispara el writer financiero y, cuando el
   usuario eligió Sí, el reintegro dentro de la misma operación durable. Nunca
   crear gasto/solicitud por parsear texto ni notificar al grupo antes del
   consentimiento.
5. STT/OCR tienen errores tipados (credencial/modo, descarga, tamaño, timeout,
   rechazo del proveedor, salida vacía). Persistir estado reintentable y
   responder con instrucción concreta; no cerrar inbox como éxito silencioso
   si el contenido no llegó al parser.

No significa enviar todo a un único prompt de IA. El formato se reconoce con
adaptadores deterministas; todos convergen en un único contrato de intención,
validación, propuesta, confirmación y writer. La IA solo apoya interpretación
ambigua. Mantener el monolito modular y migrar un canal a la vez, con flags de
beta, reduce el riesgo de un refactor big-bang.

#### Matriz de aceptación del corte

| Entrada | Caso | Resultado requerido |
| --- | --- | --- |
| `/gasto` y texto natural | gasto claro; monto ambiguo; categoría ausente | Una propuesta compartida; pregunta concreta; sin registro antes de confirmar. |
| Texto explícito de reintegro | `con reintegro` / sin mención / `sin reintegro` | La propuesta ofrece `Gasto + reintegro`, `Solo gasto`, `Cancelar`; persistir gasto y request coherentes únicamente al confirmar. |
| Audio Telegram | frase de gasto/reintegro; Groq key ausente o 401/429/timeout | Transcripción entra al mismo parser; error visible y reintentable con código diagnóstico seguro, cero writer al fallar. |
| Foto/imagen OCR | recibo con total, subtotal, OCR vacío, reintegro sí/no/unknown | Mismo draft/propuesta y política; nada se escribe hasta confirmar. |
| Callback/doble entrega | confirmar dos veces, cancelar, callback viejo | Operación idempotente; una escritura máxima; expirado/cancelado no genera side effects. |

| Owner | Siguiente corte / cierre |
| --- | --- |
| Codex | Definir contrato y regresiones; implementar primero detrás de la beta y migrar texto/comando, luego voz y OCR sin reabrir writers. |
| Esteban | Validar en el bot beta las frases de reintegro sí/no y aprobar copy/acciones de propuesta antes del rollout. |

ACT-11/13/14 queda abierto con owner y criterio de reentrada en el registro
central. H04d-BETA-FINANCIAL-E2E no se cierra hasta validar multimodalidad,
reintegro y errores recuperables en beta. Outbox/scheduler, ACT03 branch gate y
certificado formal de aislamiento siguen siendo cortes separados con sus
owners actuales; producción legacy no se toca.

#### Subcorte local 1 — decisión explícita y escritura conjunta (27/09/2026)

Esteban validó el paso y el copy propuesto. En la rama local
`codex/h04d-natural-language-e2e`, las propuestas de gasto por texto/comando y
OCR ahora muestran las mismas acciones `Gasto + reintegro`, `Solo gasto` y
`Cancelar`; parsear `con reintegro` ya no genera el pedido automáticamente.
La acción elegida controla `transactions.requires_reimbursement`. Para el caso
con reintegro, transacción, solicitud y entregas Telegram a miembros se crean en
una misma operación durable; el push al pagador sigue siendo best-effort y solo
se intenta al primer commit. Las propuestas de ingreso o categoría inválida no
pueden crear un reintegro, y una confirmación sin identidad durable falla sin
escribir.

Las pruebas locales cubren la propuesta de texto, la propuesta OCR, ausencia de
inferencia desde el estado del parser, y la escritura conjunta de transacción,
solicitud y outbox. No implica que el cambio esté desplegado o probado en beta.
El smoke de reintegro requiere `TELEGRAM_OUTBOX_ENABLED=true` exclusivamente en
el proyecto beta para entregar la notificación en línea; no necesita el worker
ni un cron. Esa bandera sigue apagada y H04d-BETA-OUTBOX pasa a ser prerequisito
del siguiente beta canary, con owner Codex; Esteban mantiene el owner de la
validación funcional. El valor efectivo actual de `AI_MODE`/bindings de Groq
beta debe verificarse de nuevo: el ledger solo prueba que un deployment previo
estaba en `stub`; eso es candidato a explicar el audio, no causa actual
confirmada. Sin push, deploy, cambios remotos o acceso a producción en este
subcorte.

ACT-11/13/14 y H04d-BETA-FINANCIAL-E2E siguen abiertos bajo el mismo owner
técnico. Faltan diagnóstico STT tipado/reintentable, convergencia del draft
validado para transcripción y OCR, ejecución del canary con flags beta
reconciliadas y evidencia de conciliación. No se abre otro corte hasta cerrar
estos entregables o registrar un bloqueo con owner, impacto y reentrada exacta.
