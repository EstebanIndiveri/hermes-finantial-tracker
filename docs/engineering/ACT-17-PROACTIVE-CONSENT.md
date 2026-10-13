# ACT-17 — consentimiento de avisos proactivos

Decisión de producto confirmada por Esteban el 12/10/2026: resumen diario,
recurrentes y recordatorios de reintegro son opt-in independientes por usuario
y están apagados por defecto. Los recordatorios a chats de sesiones quedan
apagados hasta vincular explícitamente el chat con el grupo y verificar sus
destinatarios. La suscripción Web Push del dispositivo y el canary
transaccional existente son contratos separados.

## Contrato de este corte

- Estado actual: `NOTIFICATIONS_ENABLED` es un kill switch global, pero las
  rutas no comprueban consentimiento por tipo antes de enviar.
- Resultado: una tabla aditiva `notification_preferences` con una fila por
  usuario y tres booleanos. Fila ausente o valor no exactamente `1` implica
  rechazo. Solo la sesión firmada del usuario puede leer y modificar su fila.
- Cada ruta revalida la preferencia del destinatario en el momento de enviar;
  no basta una selección previa ni el grupo activo. Cambiar o revocar una
  preferencia afecta envíos futuros, no borra mensajes ya entregados.
- Para sesiones, el cron no envía a `telegram_chat_id` persistido en este
  corte. Su identidad y membresía no están suficientemente vinculadas a un
  grupo financiero vigente. No se muestra un interruptor que prometa activarlo.
- Invariantes: nada cambia en importes, movimientos, webhooks, Push ni legacy.
  El kill switch global sigue apagado en beta hasta las puertas restantes.
- Pruebas: default off, opt-in y revocación para cada canal; cuenta A/B,
  autenticación de API, schema aditivo y no envío a un chat de sesión antiguo.

## Exclusiones y riesgos

La migración se aplica solo a `beta-hermes` tras backup, identidad exacta,
preflight de schema/ledger y postflight de integridad. No se hace backfill de
consentimiento a partir de uso anterior. Aun con preferencias activas, el
switch global permanece apagado hasta verificar destinatarios, canary y
decisión explícita de activación. No se certifican URLs legacy retiradas.
