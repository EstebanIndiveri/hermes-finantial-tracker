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
autorización no extiende permisos a deployment ni tráfico. El siguiente gate es
cerrar localmente la reconciliación del journal Drizzle y los quality gates de
la rama; después se requerirá aprobación separada para desplegar Preview beta.
H04d.4 sigue abierto porque la evidencia de proveedor/producción permanece
incompleta; no declarar `isolationVerified`.

En la validación local posterior pasaron harness (52/52), Jest (88 suites,
735/735 tests), typecheck, lint (0 errores; 67 warnings) y build Webpack. Lint
conserva warnings preexistentes; el build mostró la deprecación de `middleware`
y avisos de `process.cwd` en dependencias ejecutadas bajo Edge. Estos resultados
no activan un deployment ni sustituyen smoke beta.
