# ACT-17 — próximo corte: recordatorios de reintegros pendientes

Clasificación: diseño de estabilización beta, sin activación. Owner: Codex.

## Hallazgo verificado

`/api/cron/daily-alerts` solo consulta reintegros vencidos en modo de
notificaciones global. El piloto beta conserva `NOTIFICATIONS_ENABLED=false`,
por lo que ni el consentimiento de `Reintegros pendientes` ni el canary del
resumen diario habilitan esos avisos. En modo global, la ruta usa
`notifyReimbursementReminder` directamente: una repetición del cron puede
duplicar el mensaje, y no hay revalidación en el momento de despacho. La
consulta actual sí exige pagador asignado, solicitud pendiente, gasto fuente
activo y membresía vigente de pagador y solicitante; estas barreras se deben
conservar.

## Corte propuesto, separado de recurrentes

1. Definir scope de reintegros propio, beta-only y limitado a un pagador QA y
   un grupo QA explícitos. El pagador debe ser ese usuario, el gasto fuente
   debe pertenecer a ese grupo y pagador y solicitante deben seguir siendo
   miembros. Configuración ausente, parcial, ajena a beta o mezclada con
   switch global encendido: apagado. Los scopes del resumen y recurrentes no
   conceden permiso a reintegros.
2. Encolar una intención durable por solicitud, pagador y día argentino, con
   identidad estable y snapshot de los datos que aparecen en el texto. Una
   repetición durante ese día no duplica; un día elegible posterior puede
   generar un recordatorio nuevo. No enviar desde el cron.
3. Al despachar, volver a comprobar consentimiento `reimbursements`, chat
   privado vinculado, pagador asignado, solicitud aún pendiente, gasto activo,
   grupo autorizado, membresías y snapshot. Rechazar sin contactar Telegram
   si alguna condición cambió. Actualizar la clasificación at-most-once de
   `lib/telegram/outbox-dispatcher.ts` para el nuevo prefijo del outbox: un
   resultado incierto del proveedor no se reenvía automáticamente.
4. Probar primero sin bindings y sin envíos: destinatario QA positivo;
   usuario/grupo ajeno; consentimiento revocado; solicitud pagada/cancelada;
   gasto eliminado; miembro removido; cambio de chat; repetición/concurrencia,
   `attempt_count > 1` rechazado antes de llamar a Telegram y timeout/5xx
   ambiguo del proveedor. Solo después de la ventana automática de Netflix del
   15/10 considerar un despliegue beta con gates y H04d; activación y entrega
   real requieren un corte posterior y un fixture QA autorizado.

## Invariantes

- No modificar legacy ni habilitar `NOTIFICATIONS_ENABLED` global.
- No crear ni pagar reintegros reales como parte del diseño.
- No desplegar este corte antes de observar el cron automático recurrente
  previsto para el 15/10 sobre el deployment beta ya atestado.
- Mantener los datos QA y registrar por separado evidencia de invocación,
  operación/outbox, acuse del proveedor y cero destinatarios ajenos.

## Primer subcorte local: scope sin activación

Se agregó `getReimbursementReminderScope` con bindings independientes
`REIMBURSEMENT_REMINDER_CANARY_{ENABLED,PAYER_ID,GROUP_ID}`. Valida identidad
beta exacta y falla cerrado para valores incompletos, mal formados, ajenos o
mezclados con switch global. La ruta diaria consulta reintegros por ahora
**solo si este scope es global**: un canary válido tampoco utiliza el envío
directo mientras no existan operación/outbox y revalidación al despacho. Con
bindings ausentes y `NOTIFICATIONS_ENABLED=false`, el comportamiento beta
permanece apagado; el modo global sin bindings conserva el flujo existente.

Este subcorte no configura bindings, no cambia datos, no crea envíos y queda
local hasta cerrar el ensayo automático de Netflix. Las pruebas dirigidas
cubren la ausencia de bindings en la ruta, el canary configurado sin envío y
los fallos cerrados del helper. El siguiente subcorte debe implementar la
entrega durable y su dispatcher antes de conectar el modo canary al cron.

## Segundo subcorte local: intención durable y revalidación

La ruta diaria ya no llama directamente a Telegram para reintegros. Un scope
independiente permite encolar únicamente solicitudes pendientes de más de
tres días, con pagador asignado, consentimiento, gasto fuente activo y ambas
membresías vigentes. En canary, la consulta se acota al pagador configurado y
el grupo fuente se coteja antes de encolar; el resumen diario puede estar
apagado sin impedir el canal de reintegros.

La identidad estable usa bot, solicitud, pagador y fecha argentina. La
operación conserva hash del snapshot y del texto; el outbox tiene una sola
fila por identidad. En el despacho se vuelven a comprobar scope, fecha,
consentimiento, chat privado, solicitud pendiente y asignada, antigüedad,
importe, gasto fuente activo/grupo, ambas membresías y nombre del solicitante.
Un cambio o una segunda tentativa incierta termina en `dead` antes de llamar
a Telegram. El cron canary deja un recibo agregado y redactado con conteos
`queued`, `alreadyQueued` y `failed`, sin IDs ni contenido financiero.

La implementación se publicó en beta después de conciliar la entrega de
Netflix del 15/10, pero **sin bindings del canary** ni envíos de reintegros.
`NOTIFICATIONS_ENABLED=false` permanece. El despliegue incorpora además el
evento redactado del cron recurrente para obtener un recibo directo en una
ventana futura. La activación QA de reintegros sigue siendo un corte separado:
requiere un fixture elegible, nueva atestación de bindings y conciliación de
un único destinatario.

## Tercer subcorte: gates de activación, todavía sin activar

El assert de build acepta los tres bindings de reintegros solo si son
completos, apuntan al pagador/grupo QA aprobados y el switch global sigue
apagado. H04d acepta la declaración opcional equivalente y rechaza campos
ajenos. Ambos fallan cerrado; ni las pruebas locales ni el manifiesto
constituyen un recibo de activación. Owner Codex: verificar estos gates,
publicarlos en un pase beta posterior y preparar la prueba con un reintegro
QA inequívoco antes de habilitar los bindings.
