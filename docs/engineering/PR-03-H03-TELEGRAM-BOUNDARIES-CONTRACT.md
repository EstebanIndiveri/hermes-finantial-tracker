# Contrato de trabajo — PR-03 límites de contexto Telegram

Fecha: 18/09/2026.

## Punto de partida

- SHA: `486debee23c32e093d1d4e27913cf7ba65073599` sobre
  `codex/h03-telegram-boundaries`.
- Clasificación: corrección de seguridad compatible para H03; sin migración,
  cambio de esquema ni cambio de contratos financieros.
- Estado protegido: `main` permanece en el legacy productivo
  `7034107ff322b6331029f493cc0d871c3a2b586f` y no se consulta ni modifica
  producción.

## Comportamiento actual y riesgo

- El webhook personal confía en `users.active_telegram_group_id` para texto,
  voz/OCR y callbacks sin verificar que la membresía siga vigente.
- Remover un miembro borra `group_members`, pero puede dejar el grupo removido
  como contexto Telegram activo del usuario.
- La alerta diaria prioriza un único `TELEGRAM_CHAT_ID` de entorno para todos
  los usuarios antes de considerar el último chat personal registrado.

## Resultado esperado

### H03a — contexto personal autorizado por operación

- Cada operación personal del webhook (texto/caption/foto/documento, voz y
  callback) valida la membresía del usuario antes de entregar el `groupId` a
  handlers financieros.
- La voz se autentica y resuelve antes de enviar audio al proveedor STT.
- Los callbacks que dependen de estado persistido validan que `user_id` y
  `group_id` sigan coincidiendo con el actor y contexto autorizados; una
  propuesta de otro contexto se invalida antes de leer o escribir finanzas.
- Si el puntero activo quedó obsoleto, se invalida únicamente mediante una
  actualización condicional que no pisa un cambio concurrente y se intenta el
  grupo personal autorizado existente.
- Si no existe un grupo autorizado, el bot informa que no hay grupo activo y
  no invoca el handler financiero.
- `/vincular` y `/start link_` conservan su flujo previo a la vinculación.
- Los mensajes de grupos Telegram del módulo Split quedan fuera de este corte;
  pertenecen a H06 y no usan `active_telegram_group_id`.

### H03b — invalidación al remover membresía

- Al remover a un miembro, la eliminación de membresía y la limpieza
  condicional de `active_telegram_group_id` ocurren en la misma transacción.
- Solo se limpia el puntero si todavía coincide con el grupo removido; un grupo
  activo distinto se preserva.
- Las reglas actuales de autorización y la prohibición de remover al owner no
  cambian.

### H03c — destinatario personal aislado

- La alerta financiera de cada usuario resuelve primero su último chat personal
  persistido en `bot_messages` y, si no existe, su propio
  `users.telegram_user_id` vinculado.
- Antes de leer el resumen, la alerta diaria resuelve el grupo con la misma
  validación de membresía vigente que el webhook; un contexto obsoleto no
  autoriza una lectura programada.
- `TELEGRAM_CHAT_ID` deja de ser un fallback o una prioridad compartida para
  alertas financieras multiusuario.
- Un usuario sin chat persistido ni Telegram vinculado se omite con
  `reason: "no_chat_id"`; no se envía a otro usuario ni a un destino global.
- Los recordatorios de Split conservan el chat asociado a su sesión y los de
  reintegros conservan el Telegram del destinatario; no comparten el destino
  global eliminado.

## Invariantes

- Un exmiembro no lee ni escribe datos del grupo removido mediante el bot
  personal.
- Un request procesa como máximo un contexto de grupo con membresía vigente.
- No cambian monto, moneda, signo, categoría, período, autor, idempotencia ni
  contenido exitoso fuera de los mensajes de ausencia de contexto.
- Ninguna prueba usa DB, bot, webhook, secretos, chat o dominio de producción.
- Las pruebas interceptan toda entrega Telegram y usan datos sintéticos.

## Archivos previstos

- Resolución de contexto: un helper bajo `lib/telegram/` con pruebas unitarias.
- Integración de contexto: `app/api/telegram/webhook/route.ts` y pruebas
  dirigidas del webhook.
- Remoción: `app/api/groups/[id]/members/[userId]/route.ts` y sus pruebas.
- Destinatario: `app/api/cron/daily-alerts/route.ts` y sus pruebas.
- Documentación de gates solo después de obtener evidencia verificable.

## Pruebas de aceptación

1. Contexto activo con membresía vigente se conserva.
2. Contexto activo sin membresía se limpia condicionalmente y nunca llega al
   handler.
3. Un fallback personal vigente puede procesar la operación después de limpiar
   el puntero obsoleto.
4. Texto, voz y callback aplican la misma resolución autorizada.
5. Una propuesta creada en un grupo removido no puede confirmarse desde un
   grupo autorizado distinto, y la voz rechazada no llega al proveedor STT.
6. Remover un miembro limpia el puntero coincidente dentro de la transacción y
   preserva un puntero distinto.
7. Dos usuarios con chats distintos reciben sus propias alertas; una variable
   global definida no altera los destinos.
8. Un usuario sin historial de chat ni Telegram vinculado no recibe alerta y
   no reutiliza un chat ajeno.
9. Una alerta con contexto de grupo obsoleto se omite antes de consultar o
   enviar datos financieros de ese grupo.

## Secuencia y verificación

1. Agregar regresiones y comprobar que fallan por la causa observada.
2. Implementar el mínimo cambio compatible en cada límite.
3. Ejecutar pruebas dirigidas, harness, typecheck, suite unitaria y lint con
   Node 22.
4. Revisión independiente del diff por un subagente GPT-5.6 Luna antes del
   commit local.

## Exclusiones

- Push, PR, merge, deploy, tags, migraciones o cambios de configuración remota.
- Acceso a producción o E2E contra destinos remotos.
- H06 (autorización del módulo Split en chats grupales), idempotencia durable,
  rediseño general del bot o refactor financiero.
- Declarar el producto completo como certificado o listo para producción.
