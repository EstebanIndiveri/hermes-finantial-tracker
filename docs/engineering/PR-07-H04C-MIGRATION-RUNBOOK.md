# Runbook local — cadena canónica y worker de outbox H04c

Fecha: 19/09/2026. Alcance actual: validación local únicamente.

## Estado y autoridad

- `lib/db/migrations/manifest.json` define el orden canónico. El nombre o
  prefijo numérico de un archivo no determina su ejecución.
- `hermes_schema_migrations` registra ID, checksum, fecha y versión del runner.
- `meta/_journal.json` y los SQL marcados como `excluded` se conservan como
  evidencia histórica; no son la autoridad operativa de H04c.
- `npm run db:migrate` ya no lee `TURSO_DATABASE_URL` implícitamente. Exige un
  `--url file:` explícito y rechaza `libsql:`, `https:` y otros destinos.
- Una base no vacía sin ledger propio nunca se adopta automáticamente. H04c la
  inspecciona y se detiene sin crear tablas ni marcas.

Este corte no autoriza ni implementa adopción de staging o producción.

## Verificación sobre una base local desechable

Usar Node 22. Crear una ruta temporal fuera del repositorio y ejecutar:

```bash
npm run db:migrate:inspect -- --url file:/ruta/absoluta/hermes-h04c.db
npm run db:migrate -- --url file:/ruta/absoluta/hermes-h04c.db
npm run db:migrate:inspect -- --url file:/ruta/absoluta/hermes-h04c.db
```

La primera inspección debe devolver `empty`; la migración debe aplicar nueve
IDs; la inspección final debe devolver `canonical`, sin migraciones pendientes,
duplicados recurrentes ni violaciones de claves foráneas. Una segunda ejecución
de `db:migrate` debe informar `appliedMigrationIds: []`.

Estados posibles de inspección:

- `empty`: no hay tablas de aplicación; se permite una instalación nueva.
- `canonical`: ledger completo, checksums válidos y cadena completa.
- `partial`: cadena administrada incompleta o señales H04 parciales en una DB
  no administrada; no habilitar flags.
- `legacy-unadopted`: existen objetos pero no ledger H04c; solo lectura.
- `conflict`: checksum, ID u orden incompatible; requiere investigación.

## Gates de migración

Cada paso corre en su propia transacción y agrega el ledger solamente después
del DDL y de `PRAGMA foreign_key_check`. El runner valida presencia progresiva
de objetos y, al completar la cadena, una huella SHA-256 del DDL canónico
completo; esto detecta también índices o constraints recreados bajo el mismo
nombre con otra definición. Antes de `0010`, rechaza duplicados de
`(recurring_expense_id, scheduled_date)`. Un fallo revierte el paso completo;
los pasos anteriores ya confirmados permanecen registrados.

No editar un SQL ya aplicado: su checksum es parte del contrato. Una corrección
posterior debe ser una nueva migración. Todo `.sql` nuevo debe clasificarse en el
manifiesto como incluido o histórico excluido, o el runner se negará a iniciar.

## Worker de outbox

El cron `/api/cron/telegram-outbox` procesa como máximo cinco entregas por
invocación, en serie, con presupuesto máximo de 55 segundos y leases cercados.
Usa la misma clasificación Telegram que el dispatcher inline. La limpieza se
limita a cien filas `sent/dead`, vencidas y pertenecientes al mismo `bot_id`.

Con la flag del worker apagada, el endpoint autenticado devuelve `skipped` sin
cargar el módulo de DB ni reclamar filas. Si se enciende, devuelve `503` y falla
cerrado salvo que existan todos los demás prerrequisitos:

```text
CRON_SECRET
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
TELEGRAM_BOT_TOKEN
TELEGRAM_INBOX_ENABLED=true
TELEGRAM_OUTBOX_ENABLED=true
TELEGRAM_OUTBOX_WORKER_ENABLED=true
```

Las tres flags Telegram siguen en `false`. El worker nunca ejecuta un writer
financiero; solo progresa filas de entrega ya persistidas. La semántica con el
proveedor es al menos una vez: si Telegram acepta una solicitud y el proceso
muere antes de persistir `sent`, un retry puede repetir el mensaje.

El deadline reduce el timeout HTTP al tiempo restante y omite el purge tardío.
Las operaciones Turso no ofrecen cancelación por consulta en esta capa: una DB
bloqueada aún podría superar el presupuesto interno. Por eso el worker usa un
margen de cinco segundos respecto de `maxDuration`, lotes de cinco y necesita
monitoreo de duración/retries antes de activarse.

## Secuencia futura de adopción (no ejecutable en H04c)

1. Crear DB, bot, secretos y destinos independientes de staging.
2. Tomar backup verificable y snapshot anonimizado; registrar SHA de código.
3. Inspeccionar schema, ledger Drizzle, duplicados recurrentes, columnas
   `operation_id`, índices, FKs y huérfanos, sin escribir.
4. Diseñar y revisar un baseline/adopción específico para el estado observado.
   No marcar IDs por semejanza ni ejecutar toda la carpeta histórica.
5. Ensayar adopción y forward-fix sobre una copia; conciliar conteos y muestras.
6. Aplicar en staging con las tres flags apagadas y repetir la inspección.
7. Habilitar por etapas: inbox, outbox y por último worker; observar retries,
   dead letters, latencia y duplicados antes de cada avance.
8. La reversión de código consiste en apagar flags. Las migraciones aditivas se
   conservan; no se eliminan columnas/tablas ni se restaura un backup viejo sobre
   una base activa como rollback rutinario.

Producción exige una autorización operativa separada, evidencia de staging,
conciliación, smoke tests, plan de forward-fix y ventana de observación.
