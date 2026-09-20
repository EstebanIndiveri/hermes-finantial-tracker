# Contrato de trabajo — PR-06/H04b identidad de operacion y outbox Telegram

Fecha: 19/09/2026.

## Punto de partida y aislamiento

- SHA base: `b096ebd87f9831ac16822f9fbf95f7f768e0fc9d`.
- Rama/worktree: `codex/h04b-operation-outbox` en un checkout local aislado.
- Clasificacion: persistencia aditiva, idempotencia de writers y separacion de
  entrega externa.
- `main`, el deployment legacy, Vercel, el webhook, los secretos y Turso de
  produccion quedan fuera de alcance. Las migraciones solo se prueban en una
  base libSQL temporal.

## Problema y garantia buscada

H04a adquiere un update antes de sus efectos, pero un proceso puede caer luego
de escribir una operacion financiera y antes de completar el inbox. Reintentar
ese update puede duplicar el movimiento. Ademas, la confirmacion Telegram se
envia luego del commit y no queda recuperable si el proveedor falla.

H04b agrega una identidad estable derivada de `(bot_id, update_id, accion)` a
un registro canonico y a los writers financieros alcanzados por Telegram. Cada
writer persiste registro, operacion y al menos una entrega confirmatoria en la
misma transaccion. La entrega se reclama y confirma por separado mediante
lease y fencing.

La garantia se divide deliberadamente:

- la escritura financiera es `at most once` por identidad de operacion;
- el evento de salida se encola una sola vez por `delivery_key`;
- la entrega a Telegram es `at least once`: Telegram no acepta una clave de
  idempotencia para `sendMessage`, por lo que un timeout despues de que el
  proveedor acepto el mensaje puede producir una confirmacion repetida.

No se afirmara entrega exactamente una vez.

## Contrato de identidad

El contexto se propaga explicitamente desde el webhook y no contiene el token
del bot:

```text
botId, updateId, chatId, callbackMessageId?, action
```

La identidad canonica es una cadena versionada y acotada construida por un
unico helper. Acciones compuestas agregan un sufijo estable de entidad; por
ejemplo, confirmar varias ejecuciones recurrentes usa una identidad por
`execution_id`, no una sola identidad para todo el lote.

Las columnas `operation_id` son `NULL` para filas legacy y tienen indices
unicos parciales (`WHERE operation_id IS NOT NULL`). No se rellena historia ni
se deduce identidad retrospectiva.

`telegram_operations` conserva la identidad canonica y el resultado durable:
`operation_id` (PK), `bot_id`, `update_id`, `operation_kind`, `status`,
`resource_type`, `resource_id`, `result_json` y timestamps. Ademas de la PK,
`(bot_id, update_id, operation_kind)` es unico. Un reintento de una operacion
`committed` recupera ese resultado; no vuelve a ejecutar el writer.

## Contrato de outbox

La tabla aditiva `telegram_delivery_outbox` contiene:

- identidad: `id`, `bot_id`, `update_id`, `operation_id`, `delivery_key`;
- destino: `action`, `chat_id`, `message_id`, `parse_mode`;
- payload minimo: `text`, `reply_markup_json`;
- estado: `pending | processing | retryable | sent | dead`;
- recuperacion: `attempt_count`, `next_attempt_at`, `lease_token`,
  `lease_expires_at`, `last_error_code`, `last_http_status`;
- auditoria: `created_at`, `updated_at`, `sent_at`, `retention_until`.

Restricciones:

- `UNIQUE(bot_id, delivery_key)` impide duplicar el mismo efecto logico;
- un indice por estado/fecha/lease permite reclamar pendientes;
- indices por `(bot_id, update_id)` y `operation_id` permiten recuperar las
  entregas de un update sin guardar el JSON crudo recibido;
- no se persisten tokens, audio, imagen, OCR crudo ni prompts del modelo;
- el texto financiero de salida tiene retencion explicita y debe redactarse o
  eliminarse mediante una tarea operativa antes de habilitar produccion.

El claim es atomico y cercado por `lease_token`. Red, timeout, HTTP 429 y 5xx
son reintentables; 401/403 y payloads invalidos terminan en `dead`; editar un
mensaje sin cambios se considera exito. Los codigos almacenados son estables y
no incluyen texto del proveedor ni PII.

## Integracion y compatibilidad

- `TELEGRAM_OUTBOX_ENABLED=true` requiere `TELEGRAM_INBOX_ENABLED=true`.
- Ambas flags permanecen apagadas por defecto.
- Con outbox apagado se conserva exactamente el envio sincrono legacy.
- `answerCallbackQuery` y mensajes transitorios de “procesando” siguen siendo
  best-effort y no se encolan.
- Las confirmaciones de commit se encolan dentro de la transaccion del writer.
- El webhook puede intentar despachar inline para conservar latencia, pero
  completa el procesamiento por aceptacion durable; una caida de Telegram no
  vuelve a ejecutar el writer.
- Un reintento consulta la identidad de operacion y recupera el resultado
  existente; no usa ventanas temporales ni “ultimo movimiento” como heuristica.

## Writers incluidos

1. Transaccion personal confirmada desde propuesta de gasto, excepcion o OCR.
2. Creacion del agregado Split (`splits`, pagador e items).
3. Registro de pago Split.
4. Confirmacion de una ejecucion recurrente y su transaccion.
5. Solicitud, pago y cancelacion de reintegro en cuanto sean disparados por
   Telegram.

Cuando un writer actual realiza varias escrituras relacionadas, el corte debe
convertirlas en una sola transaccion o documentar que ese writer sigue abierto;
no basta con agregar una columna unica.

## Fuera de alcance

- Rediseño H05 de propuestas/callbacks versionados y seleccion “ultimo
  pendiente”.
- Representacion monetaria ACT-05, semantica ingreso/gasto y conciliacion.
- Exactitud de IA, OCR o STT.
- CRUD de recurrentes, onboarding, enlaces, membresias y borrado de ultimo
  movimiento.
- Push web: requiere su propio canal/outbox; H04b no debe fingir que una fila
  Telegram garantiza una notificacion push.
- Crons no originados en el webhook.
- Worker programado, dashboard operativo, politica definitiva de retencion y
  despliegue. El dispatcher queda invocable y probado, pero su scheduler se
  habilita solo con recursos staging aislados.

## Limitaciones abiertas y puertas de liberacion

- El journal historico de Drizzle solo registra `0000` y `0001`; por lo tanto
  `npm run db:migrate` **no es hoy un mecanismo autorizado ni comprobado** para
  aplicar `0009`/`0010`. Reconstruir el historial de migraciones pertenece a
  ACT-04 y debe validarse primero sobre una copia desechable del schema real.
- Los cuatro `ALTER TABLE ... ADD COLUMN` de `0010` no son reentrantes. Una
  aplicacion parcial se detecta con
  `PR-06-H04B-MIGRATION-PREFLIGHT.sql` y se resuelve con un forward fix
  especifico; nunca se reejecuta el archivo a ciegas.
- El indice unico `(recurring_expense_id, scheduled_date)` puede descubrir
  duplicados legacy. El preflight debe devolver cero filas o se requiere una
  conciliacion funcional antes de continuar.
- La confirmacion OCR reclama el `receipt_import` pendiente, fija su
  `transaction_id`, crea el movimiento, confirma la identidad y encola la
  respuesta dentro de la misma transaccion. H05 aun debe versionar la propuesta
  para impedir que dos callbacks distintos representen una intencion obsoleta.
- Las operaciones de reintegro persisten Telegram en outbox. Web Push sigue
  siendo best-effort posterior al commit y necesita su propia outbox en un
  corte futuro.
- No existe aun un worker programado: el webhook despacha inline y un update
  repetido recupera entregas pendientes. Sin scheduler, un fallo transitorio
  que no reciba otro evento puede quedar `retryable`; esto bloquea afirmar
  entrega autonoma en produccion.
- La FK compuesta del outbox exige que `operation_id`, `bot_id` y `update_id`
  pertenezcan a la misma operacion; las pruebas de migracion deben conservar
  `PRAGMA foreign_keys = 1` para que esa garantia no sea solo declarativa.
- La identidad evita duplicar un mismo update. Distintos callbacks manuales
  siguen dependiendo del estado conversacional ligado al update mientras H05
  incorpora IDs/versiones persistentes de propuesta.

## Orden de rollout futuro

1. Reparar y validar el journal de migraciones sobre una DB desechable.
2. Backup verificado y ejecutar el preflight SQL en staging aislado.
3. Conciliar duplicados recurrentes o aplicaciones parciales, si existen.
4. Aplicar la migracion aditiva con flags apagadas.
5. Verificar constraints, indices, FK, permisos y consultas en staging.
6. Instalar y probar el worker programado de outbox con la flag apagada.
7. Habilitar inbox; observar leases y errores.
8. Habilitar worker y outbox para trafico controlado; observar
   `pending/retryable/dead` y probar caidas despues de commit y antes de entrega.
9. Solo con puertas verdes proponer produccion; rollback de codigo/flags, no
   restauracion destructiva de una DB vieja.

## Aceptacion local

1. Diez intentos secuenciales y paralelos de una misma operacion producen una
   fila financiera y una entrega.
2. Dos acciones legitimas del mismo update que tengan sufijos distintos no se
   colisionan.
3. Un fallo al insertar la entrega revierte la escritura financiera.
4. Un commit exitoso sobrevive a una caida del adaptador Telegram y queda
   reclamable sin reejecutar el writer.
5. Lease vencido se readquiere y el token anterior no puede marcar enviado.
6. Fallos reintentables, permanentes y `message is not modified` transicionan
   al estado correcto.
7. Con flags apagadas, todas las pruebas legacy conservan comportamiento.
8. Migracion, constraints y concurrencia se validan contra libSQL temporal
   real; ningun test usa recursos productivos.
