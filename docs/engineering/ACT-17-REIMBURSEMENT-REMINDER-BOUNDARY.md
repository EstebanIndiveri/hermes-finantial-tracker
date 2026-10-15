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
