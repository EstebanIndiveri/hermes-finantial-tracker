# Runbook H04d — staging aislado, adopción y conciliación

Fecha: 20/09/2026. Estado: preparación local; apply remoto bloqueado.

## Qué queda habilitado en este corte

H04d permite validar declaraciones de identidades de staging y ensayar inspección/conciliación
sobre un archivo libSQL local restaurado. Los comandos no aceptan URLs remotas,
no leen `TURSO_DATABASE_URL`, no crean ledger y no aplican adopción.

La salida contiene nombres de objetos, conteos, agregados financieros y HMAC de
conjuntos de IDs/contenido financiero. Se firma con el mismo salt y queda ligada
a la ruta de DB y al manifiesto canónico. Nunca contiene filas, IDs en claro, nombres, descripciones,
comercios, texto Telegram/OCR, payloads, tokens ni el salt de evidencia.

## 1. Preparar identidades sin secretos

Antes de cualquier smoke remoto, configurar en el proyecto beta —nunca en
legacy— los controles de runtime siguientes. Sus valores legacy compatibles son
`AI_MODE=live`, `OCR_MODE=live`, `NOTIFICATIONS_ENABLED=true` y
`SESSION_COOKIE_NAME=hermes_session`; omitirlos conserva esos defaults. Para
una beta aislada deben ser exactamente:

```text
AI_MODE=stub
OCR_MODE=stub
NOTIFICATIONS_ENABLED=false
SESSION_COOKIE_NAME=hermes_beta_session
```

`stub` evita contactar Groq y OCR.Space. `NOTIFICATIONS_ENABLED=false` detiene
solamente entregas proactivas de Telegram y Web Push; una respuesta directa a
un mensaje recibido en un webhook autorizado no queda bloqueada. Un valor
presente distinto de los admitidos falla cerrado antes de contactar el proveedor
o aceptar una configuración ambigua. Estos controles no sustituyen el
aislamiento de DB, bot, webhook, secretos ni flags inbox/outbox/worker.

Copiar fuera del control de versiones:

```bash
cp config/staging-isolation.example.json config/staging-isolation.local.json
cp config/production-reference.example.json config/production-reference.local.json
```

Reemplazar los ejemplos por identificadores/referencias reales, nunca por
tokens. Ambos archivos locales están ignorados. El manifiesto exige:

- ID inmutable de proyecto Vercel, origen, ID/host de DB, ID numérico de bot,
  webhook y cookie distintos de producción;
- referencias distintas y fingerprints SHA-256 de los secretos de staging;
  fingerprints productivos solo cuando existe un recibo previo autorizado;
- host bajo el sufijo de staging aprobado y rechazo explícito del dominio
  productivo conocido y de todos los aliases cargados en la denylist versionada;
- datos exclusivamente sintéticos, notificaciones deshabilitadas y AI/OCR en
  modo stub;
- inbox, outbox y worker en `false`;
- host E2E exactamente igual al host de staging.

Validar:

```bash
npm run staging:verify-isolation -- \
  --staging config/staging-isolation.local.json \
  --production-reference config/production-reference.local.json
```

`ok: true` significa solamente que el manifiesto local es consistente. La salida
mantiene `isolationVerified: false`,
mantiene `providerVerificationRequired: true` y
`trustLevel: unverified-local-declaration`: no habilita uso remoto hasta
contrastar identidades, bindings y los fingerprints disponibles contra metadata
autenticada de Vercel, Turso y Telegram. Un resultado distinto de `ok: true`
bloquea todo el ensayo. `productionFingerprintComparison: unavailable` no
autoriza a leer o rotar producción: hace explícito que esa comparación opcional
no existe.

## 2. Backup y restauración a destino local

Antes de planificar adopción se necesita evidencia externa de:

1. backup consistente de la DB de staging;
2. SHA-256 y timestamp del backup;
3. restauración exitosa en otro destino;
4. retención, acceso y eliminación definidos;
5. si el origen contiene datos reales: autorización, anonimización y bloqueo de
   Telegram/push antes de entregar el archivo al ensayo.

La restauración debe terminar como un archivo local fuera del repositorio. H04d
se niega a crear un archivo inexistente, para no confundir una DB vacía con la
copia que debía inspeccionarse. La fuente restaurada es siempre origen
read-only, nunca destino del ensayo: crear A y B de forma independiente con
`sqlite .backup`, no copiar B desde A. El directorio temporal debe ser `0700`;
antes de operar, comprobar `realpath`, inode y hash de cada artefacto. Tratar el
backup como bundle SQLite (archivo principal, WAL y metadata), de modo que la
verificación y la restauración no pierdan un WAL asociado.

Crear además un archivo de salt aleatorio, exclusivo de staging, con permisos
restringidos y fuera del repositorio. El salt debe tener al menos 16 caracteres
y se conserva para comparar before/after; no se imprime en la evidencia.

Copiar y completar además el comprobante no secreto del backup restaurado:

```bash
cp config/staging-backup-evidence.example.json \
  config/staging-backup-evidence.local.json
mkdir -p artifacts/staging
```

`backupSha256` y `restoredSha256` deben calcularse fuera de estos comandos sobre
los artefactos correspondientes y coincidir. El ejemplo no constituye evidencia.

## 3. Captura y plan read-only

```bash
npm run --silent staging:reconcile:capture -- \
  --url file:/ruta/absoluta/staging-restaurado.db \
  --salt-file /ruta/segura/evidence-salt \
  > artifacts/staging/before.json

npm run --silent staging:adoption:plan -- \
  --url file:/ruta/absoluta/staging-restaurado.db \
  --salt-file /ruta/segura/evidence-salt \
  --backup-evidence config/staging-backup-evidence.local.json \
  --release-sha 1433d552005cd4c6d53df1f02bf8d82374b2005e \
  > artifacts/staging/adoption-plan.json
```

El plan siempre devuelve `decision: blocked` y `applyAuthorized: false` en este
corte. Vincula el SHA, digest completo del manifiesto (incluye archivos,
checksums, preflights y exclusiones), fingerprint del schema e invariantes
observadas, pero no infiere qué migraciones fueron aplicadas. La ausencia o
inconsistencia del backup también queda como blocker computable.

Bloquean la adopción:

- schema `partial`/`conflict`, drift o fingerprint distinto al revisado;
- FK inválidas, duplicados recurrentes/operation IDs o filas outbox huérfanas;
- backup ausente/no restaurado;
- objetos ambiguos o una reparación no aditiva;
- cambios en DB, código, manifiesto o plan desde la captura.

## 4. Forward-fix y ensayo

Con el schema real observado, un corte posterior debe escribir un plan específico
de forward-fix aditivo. Cada paso tendrá migración nueva, transacción, checksum,
preflight y fingerprint esperado. No se marcan IDs canónicos por similitud.

Sobre copias locales desechables e independientes de la misma fuente (migrar A
primero, verificarla contra el fingerprint canónico y congelarla como
referencia; usar B para el ensayo repetible):

1. capturar `before.json`;
2. aplicar el forward-fix revisado con las tres flags apagadas;
3. capturar `after.json` con el mismo salt;
4. comparar contra el fingerprint objetivo aprobado;
5. repetir la migración en B: debe devolver `appliedMigrationIds: []`;
6. apagar inbox, outbox y worker y verificar invariancia de schema/evidencia.
   Esto es rollback funcional de flags, no rollback de datos, migraciones,
   deployment ni tráfico.

```bash
npm run staging:reconcile:compare -- \
  --before artifacts/staging/before.json \
  --after artifacts/staging/after.json \
  --salt-file /ruta/segura/evidence-salt \
  --expected-schema-fingerprint SHA256_APROBADO \
  --expected-manifest-digest SHA256_MANIFIESTO_APROBADO
```

La comparación valida estructura y firma, exige el mismo destino/salt, y conserva
conteos, HMAC de IDs/contenido y agregados financieros legacy, además de cero
bloqueos posteriores. Una tabla aditiva solo se admite declarando cada nombre
revisado con `--allow-added-table`; una diferencia se investiga, no se ajusta la
expectativa para hacerla pasar.

## 4.1. Siguiente corte local: evidencia de aislamiento

Antes de pedir cualquier smoke remoto, cerrar el manifiesto de aislamiento con
fingerprints reales de los secretos de staging. Calcularlos offline por stdin en
el momento de creación o rotación del secreto, usando la herramienta local
`staging:fingerprint-secret`:

```bash
read -r -s HERMES_SECRET_VALUE
printf '%s' "$HERMES_SECRET_VALUE" | npm run --silent staging:fingerprint-secret
unset HERMES_SECRET_VALUE
```

No pegar secretos en comandos, logs ni archivos. No recuperar valores sensibles
desde Vercel después de cargarlos como sensitive. Si falta un fingerprint de
staging, el punto seguro para obtenerlo es una rotación beta autorizada. Un
fingerprint productivo ausente queda en `null`: nunca se rota ni se lee legacy
solo para satisfacer este gate. Las claves deben mapear exactamente:

| Clave de manifiesto | Variable de runtime |
| --- | --- |
| `database` | `TURSO_AUTH_TOKEN` |
| `telegramBot` | `TELEGRAM_BOT_TOKEN` |
| `telegramWebhook` | `TELEGRAM_SECRET_TOKEN` |
| `session` | `SESSION_SECRET` |
| `cron` | `CRON_SECRET` |
| `webAccess` | `WEB_ACCESS_TOKEN` |

`TURSO_DATABASE_URL` queda cubierto por DB host/ID, no por el fingerprint
`database`. No hace falta relogin de Turso para este corte: H04d.3 ya obtuvo
metadata productiva read-only suficiente para distinguir cuenta, DB ID y host.

El ID numerico del bot Telegram productivo sigue siendo evidencia no sensible.
Puede derivarse localmente del prefijo numerico de un token ya disponible en un
canal autorizado de rotacion, o consultarse con `getMe` read-only solo con
autorizacion explicita. No ejecutar `setWebhook`, `deleteWebhook`, envio de
mensajes, lectura de updates ni ningun cambio de configuracion productiva.

El inventario autenticado de aliases Vercel del 22/09/2026 debe cargarse completo
en `productionHostDenylist` y revalidarse inmediatamente antes de cualquier
actividad remota. La evidencia de H04d.2 confirma que el webhook beta estaba
vacío; falta evidencia read-only del webhook productivo y una nueva comprobación
beta antes de habilitar tráfico. Un `ok: true` local del manifiesto no reemplaza
esos gates ni habilita mutaciones remotas.

## 5. Activación futura por etapas

Después de migración y conciliación verdes:

1. flags apagadas: smoke web/legacy y cron worker `skipped`;
2. inbox únicamente: update duplicado/concurrente produce un claim;
3. outbox, worker apagado: operación, recurso y delivery nacen atómicamente;
4. worker: lote máximo cinco, retry/lease/dead/sent y purga terminal;
5. observación y conciliación después de cada etapa.

No se cambia webhook productivo ni se envía el mismo update a dos escritores.
Los smoke tests usan usuarios/chats sintéticos del bot de staging.

## 6. Rollback ensayable

Rollback operativo: apagar worker, luego outbox, luego inbox; volver a una
release compatible con el schema aditivo. No borrar tablas/columnas, no ejecutar
`0010` a ciegas y no restaurar un backup viejo sobre una DB activa.

Ante fallo de migración, el paso y su marca deben revertirse; los pasos previos
confirmados permanecen. Ante datos inconsistentes, detener la activación,
diagnosticar read-only y producir otro forward-fix idempotente y conciliado.

## Recursos/autorizaciones aún necesarios

- proyecto/URL Vercel de staging sin promoción automática;
- DB Turso independiente y credencial de alcance mínimo;
- segundo bot Telegram, webhook y chat/usuarios sintéticos;
- cookies y secretos independientes;
- metadata autenticada de proveedores: Vercel project ID/dominios/bindings,
  Turso DB ID, Telegram bot ID/webhook y recibos de secretos de staging;
- backup/restauración verificados y, si aplica, autorización de anonimización;
- autorización explícita para conectar, migrar y ejecutar smoke en esos recursos.

Hasta recibirlos, el flujo remoto y cualquier apply permanecen bloqueados.
