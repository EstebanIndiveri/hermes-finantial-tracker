# Contrato de trabajo — PR-05/H04a claim durable de updates Telegram

Fecha: 18/09/2026.

## Punto de partida y aislamiento

- SHA base: `16c3c6c63ff2fcd5f7795c8b2068100fe33673ef`.
- Rama/worktree: `codex/h04a-telegram-inbox` en un checkout local aislado.
- Clasificacion: cambio aditivo de persistencia y contencion de duplicados.
- `main`, el deployment legacy, sus secretos, webhook y DB productiva quedan
  fuera de alcance. No se ejecuta ninguna migracion remota.

## Problema acotado

El guard historico de `bot_messages` usa `consultar -> procesar -> insertar`,
solo cubre parte del texto privado y no adquiere ownership atomico. Voz, OCR,
grupos y callbacks pueden procesar el mismo `update_id` mas de una vez.

H04a incorpora un recibo durable y un lease antes de cualquier efecto del
update. No intenta resolver aun la ventana entre un commit financiero y la
confirmacion del inbox: esa garantia requiere IDs de operacion en los writers
y entrega/outbox durable en H04b/ACT-06.

## Contrato de datos aditivo

Nueva tabla `telegram_update_inbox`, sin modificar ni reinterpretar tablas
legacy. Identidad unica: `(bot_id, update_id)`.

Campos minimos:

- `id`, `bot_id`, `update_id`, `update_kind`;
- `status`: `processing | completed | retryable`;
- `attempt_count`, `lease_token`, `lease_expires_at`;
- `last_error_code`, `received_at`, `updated_at`, `completed_at`.

H04a no persiste el JSON crudo del update, texto financiero, OCR, audio ni
respuesta del modelo. Esto reduce datos sensibles, pero implica que la
recuperacion depende de una nueva entrega de Telegram. Payload cifrado con
retencion, replay operativo y outbox quedan para una decision posterior.

La migracion es solo `CREATE TABLE/INDEX IF NOT EXISTS`. Debe aplicarse antes
de habilitar el codigo y nunca se revierte borrando la tabla. El journal de
migraciones legacy no esta reconciliado; el archivo versionado no autoriza ni
demuestra una migracion productiva.

## Claim y fencing

API prevista en `lib/telegram/update-inbox.ts`:

1. `claimTelegramUpdate(...)` intenta un insert atomico en `processing` con
   `attempt_count=1` y lease de 120 segundos.
2. Ante conflicto, solo puede adquirir mediante un update condicional si la
   fila esta `retryable` o su lease `processing` ya expiro.
3. Una fila `completed` devuelve `completed`; un lease vigente devuelve
   `busy`. Ninguno procesa ni responde nuevamente.
4. `completeTelegramUpdate(...)` y `failTelegramUpdate(...)` exigen el mismo
   `lease_token`. Un worker viejo no puede cerrar el intento de otro.
5. `fail` conserva la fila como `retryable`, incrementada al adquirir, y solo
   guarda un codigo estable sin mensajes/PII.

## Integracion compatible

- El claim ocurre despues de validar el secret y parsear JSON, pero antes de
  `answerCallbackQuery`, STT, OCR, IA, handlers, DB financiera o envios.
- `TELEGRAM_INBOX_ENABLED=true` activa el wrapper. El default es apagado para
  permitir rollout `migracion -> verificacion -> flag` sin romper legacy.
- `TELEGRAM_BOT_ID` es el identificador preferido, validado para impedir que se
  persista un token completo; puede derivarse del prefijo numerico de
  `TELEGRAM_BOT_TOKEN`. El fallback de bot unico no se permite en produccion.
- Con la flag activa, un update sin `update_id` se reconoce como malformado y
  no ejecuta handlers.
- Si el claim falla, se responde no-2xx y no se procesa. Un claim `completed`
  o `busy` responde `200 { ok: true }` sin efectos.
- Se conserva `bot_messages` como historial compatible, no como autoridad de
  idempotencia: con la flag activa se omite su guard de lectura y se conserva
  solamente su insercion historica.

Los catches internos heredados de H06 que ya convierten fallos en una respuesta
terminal `200` se conservan y, por compatibilidad, completan el inbox. Solo una
excepcion que escape del pipeline se marca `retryable`. Clasificar errores de
proveedor, separar procesamiento de entrega y reintentar sin duplicar writers
requiere H04b/outbox; H04a no presenta esos catches como recuperacion durable.

## Aceptacion de H04a

1. Diez claims secuenciales o paralelos del mismo `(bot_id, update_id)` dan un
   unico owner mientras el lease esta vigente.
2. El mismo `update_id` para dos bots distintos se puede adquirir por separado.
3. Un intento completado no se readquiere.
4. Un fallo retryable o lease vencido se readquiere con token nuevo y contador
   incrementado; el token viejo no puede completar ni fallar la fila.
5. Con la flag activa, duplicados de texto, voz, imagen y callback no llegan a
   sus handlers ni adaptadores de salida mas de una vez.
6. Con la flag apagada, el comportamiento H06 permanece sin cambios.
7. Pruebas de persistencia/concurrencia usan libSQL local temporal; ninguna
   URL, dato o credencial de produccion.

## No garantizado por este corte

- Exactamente una escritura si el proceso cae despues del commit financiero y
  antes de marcar `completed`.
- Reentrega de una respuesta ya calculada o separacion entre procesamiento y
  entrega Telegram.
- IDs unicos de operacion en movimientos/splits/pagos/recurrentes.
- Propuestas y callbacks versionados (H05), outbox/replay, retencion de payload,
  reparacion operativa o migracion productiva.
