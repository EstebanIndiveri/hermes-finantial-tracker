# ACT-17 — límite de retención de datos Telegram en beta

## Contrato de este corte

**Antes:** la decisión de preservar QA podía confundirse con suspender los TTL
operativos de los outboxes. La prueba del outbox Telegram cubría purgas
terminales con un TTL sintético, pero no el plazo por defecto de 30 días.

**Después:** se conserva la decisión explícita de Esteban: grupos, cuentas,
movimientos y reintegros QA permanecen durante el piloto; las entregas
terminales Push mantienen 7 días y Telegram 30 días. Una prueba libSQL local
fija el borde de 30 días desde el encolado y comprueba que el texto de una
entrega terminal desaparece al vencer, sin eliminar su operación. No cambia
el runtime, la base beta ni el mecanismo de purga.

**Invariantes:** el worker solo purga entregas `sent`/`dead` vencidas, en lotes
acotados y dentro del namespace del bot. Nunca purga pendientes, reintentos o
procesamiento, ni registros financieros. La decisión de conservar QA no
autoriza usar nombres de grupo para identificar datos a borrar.

**Archivos:** `lib/telegram/__tests__/outbox.test.ts`, inventario QA y estado de
implementación. **Riesgo/exclusión:** una operación, un inbox o un historial
de bot no se borran por esta política; tampoco se activa notificación
proactiva ni se toca legacy.

## Inventario de datos persistidos

| Recurso | Datos relevantes | Borrado automático actual |
| --- | --- | --- |
| `telegram_delivery_outbox` | Texto saliente, chat, markup, estado/proveedor | Terminales `sent`/`dead` tras 30 días **desde encolado**, hasta 100 por ejecución del worker; no terminales retenidos para recuperación |
| `telegram_update_inbox` | ID de update, estado, lease y códigos de error | Ninguno; es parte de la deduplicación durable |
| `telegram_operations` | Identidad de operación, recurso y posible `result_json` | Ninguno; referencia de idempotencia y del outbox |
| `bot_messages` | Texto entrante y respuesta, chat/usuario, intención | Ninguno; también se consulta en rutas heredadas de deduplicación/alertas |
| `receipt_imports` | ID de archivo, caption, OCR/Groq crudos y datos extraídos | Ninguno; algunas filas enlazan un movimiento |
| `bot_conversation_state` | Estado JSON de una conversación | TTL lógico de 30 minutos; lectura de un estado vencido lo elimina. Existe purga global, pero no tiene un llamador periódico |

Lectura agregada de **solo beta** el 13/10/2026: 61 filas en `bot_messages`,
108 en inbox, 20 en operaciones, 25 en outbox Telegram, 11 en
`receipt_imports` y 0 en estado de conversación. Se confirmó previamente la
cuenta Turso aislada `esteban-indiveri` y la DB `beta-hermes` con ID
`01a0c0bd-0601-7f27-b147-915d105b19f2`. No se leyeron textos, IDs de
filas, montos, chats ni payloads. No hubo escritura o envío.

## Puerta siguiente

No aplicar un TTL nuevo a `bot_messages`, inbox, operaciones o recibos por
analogía con el outbox. `bot_messages` participa en lógica heredada;
inbox/operaciones sostienen la deduplicación y la recuperación, y los
recibos pueden estar ligados a movimientos. Primero definir horizonte de
replay, tratamiento de datos crudos, respaldo y conciliación con casos de
reintento. Un borrado irreversible requiere política y alcance explícitos.
Mientras tanto, esos datos QA no se limpian durante el piloto.
