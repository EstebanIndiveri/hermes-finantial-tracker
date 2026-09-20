# Contrato de trabajo — PR-07/H04c migraciones verificables y worker de outbox

Fecha: 19/09/2026.

## Punto de partida y aislamiento

- SHA base: `e932cc4ab9b8a8a8e6cf550ca2a93f4df4073b78`.
- Rama/worktree: `codex/h04c-migration-worker` en
  `/private/tmp/hermes-h04c-migration-worker`.
- Clasificacion: infraestructura de migraciones y procesamiento durable.
- `main`, Vercel, Turso, el bot y webhook productivos, secretos y crons remotos
  quedan fuera de alcance. No se ejecuta SQL contra recursos externos.
- `TELEGRAM_INBOX_ENABLED`, `TELEGRAM_OUTBOX_ENABLED` y la nueva flag del worker
  permanecen apagadas por defecto.

## Problemas a resolver

1. `meta/_journal.json` solo registra `0000` y `0001`, mientras existen
   migraciones manuales posteriores y dos archivos historicos con prefijo
   `0001`. La carpeta no constituye hoy una cadena lineal reproducible.
2. Varias evoluciones historicas se aplicaron por scripts manuales y no tienen
   una migracion SQL canonica. Una instalacion vacia no puede reconstruir el
   schema que usa la aplicacion.
3. El dispatcher H04b solo se invoca inline o por repeticion del update. Una
   entrega `retryable` necesita un worker autenticado y acotado para progresar
   sin volver a ejecutar el writer financiero.
4. Los payloads terminales del outbox tienen retencion, pero no existe una tarea
   segura y limitada que los elimine una vez vencidos.

## Resultado esperado

### Cadena de migraciones

- Definir un unico manifiesto ordenado y versionado para instalaciones nuevas.
- Conservar los archivos historicos incompatibles como evidencia, pero excluirlos
  explicitamente de la cadena canonica; no inferir que fueron aplicados en una
  DB existente.
- Incorporar una migracion de reconciliacion que cubra tablas/columnas presentes
  en `schema.ts` pero ausentes de la cadena historica seleccionada.
- Verificar en libSQL temporal que una DB vacia llega al schema H04b, que una
  segunda ejecucion no reaplica pasos y que una falla no marca el paso como
  aplicado.
- Proveer inspeccion/preflight para una DB existente. Adoptar o marcar una base
  como migrada exige una accion posterior, explicita y respaldada; H04c no lo
  hace automaticamente.

### Worker de outbox

- Reclamar entregas vencidas globalmente mediante los leases y fencing H04b,
  con lote y tiempo maximos acotados.
- Reutilizar la clasificacion de respuestas de Telegram del dispatcher; no
  duplicar reglas de retry.
- Exponer un endpoint cron protegido por `CRON_SECRET` y por una flag dedicada,
  apagada por defecto. Si falta cualquier prerequisito debe fallar cerrado sin
  reclamar filas.
- Eliminar en lotes limitados solamente entregas `sent` o `dead` cuya retencion
  vencio. Nunca limpiar `pending`, `processing` o `retryable`.
- No registrar texto financiero, tokens, chat IDs ni respuestas crudas del
  proveedor.

## Invariantes

- Un worker nunca vuelve a ejecutar un writer financiero.
- Dos workers pueden competir; una fila solo tiene un lease vigente y los owners
  anteriores quedan cercados.
- Completar el inbox significa que el efecto fue aceptado duramente; el worker
  es responsable de la progresion posterior de la entrega.
- Migrar una DB vacia y adoptar una DB existente son operaciones distintas.
- Ningun comando por defecto puede apuntar silenciosamente a una URL remota.
- No se borran datos legacy para satisfacer constraints ni se restauran backups
  viejos sobre una DB activa.

## Pruebas y puertas locales

1. Manifiesto sin tags duplicados, archivos faltantes ni orden ambiguo.
2. Instalacion desde cero en libSQL temporal y verificacion de tablas, columnas,
   indices y FK criticos.
3. Reejecucion idempotente mediante ledger, y rollback/ausencia de marca ante
   una migracion fallida.
4. Worker: auth, flag apagada, prerequisitos, lote, retry/dead/sent, lease
   concurrente y limpieza terminal acotada.
5. Suite unitaria completa, harness, TypeScript, ESLint y `git diff --check`.

## Fuera de alcance

- Ejecutar o adoptar migraciones en staging/produccion.
- Crear recursos, secretos o bots de staging.
- Cambiar modelos de IA, OCR, reglas financieras o representacion monetaria.
- Dashboard operativo, alertas humanas y SLO definitivos del outbox.
- Backfill o conciliacion de datos reales.
