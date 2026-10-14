# ACT-17 — límite de grupo para recordatorios recurrentes

Clasificación: estabilización beta. Owner: Codex. No habilita envíos.

## Contrato del subcorte

- Actual: el cron consulta ejecuciones pendientes con membresía vigente, pero agrupa por usuario y omite el grupo; puede juntar cargos de dos espacios en un aviso.
- Esperado: cada candidato pertenece al grupo activo de Telegram del propietario, conserva su `groupId` explícito y nunca mezcla grupos. Sin grupo activo, membresía vigente, cuenta vinculada o ejecuciones pendientes, no hay candidato.
- Invariantes: no crear ni modificar movimientos, no enviar avisos nuevos, no tocar legacy ni cambiar `NOTIFICATIONS_ENABLED=false`. El cron sigue exigiendo secreto y consentimiento `recurring`.
- Archivos: consulta de recurrentes y sus pruebas. La ruta consume el contrato ampliado sin cambiar aún el mecanismo de entrega.
- Riesgo: un usuario con cargos en un grupo no activo deja de recibir ese recordatorio hasta seleccionar ese grupo; es preferible a un aviso intergrupo ambiguo. La comprobación debe repetirse al despachar en el siguiente subcorte.
- Pruebas: regresión de dos grupos del mismo usuario, grupo inactivo y ausencia de grupo activo; pruebas dirigidas y TypeScript en Node 22.
- Excluido: deduplicación/outbox, canary de recurrentes, recordatorios de reintegros y el cron mensual de ejecución. Esos envíos siguen apagados en beta.

Antes de habilitar recordatorios recurrentes hay que agregar identidad durable por destinatario/grupo/tipo/día, consentimiento y membresía revalidados al despacho, destino privado vinculado sin relink, y pruebas de repetición/concurrencia/fallo incierto del proveedor.

## Siguiente subcorte: entrega durable (sin activación)

- Actual: aun con candidatos separados, cada ejecución del cron llama directamente a Telegram; una repetición puede enviar dos mensajes y un cambio de membresía o consentimiento entre lectura y llamada queda sin revalidar.
- Esperado: encolar un aviso por usuario, grupo, tipo (`upcoming`/`overdue`) y día argentino con identidad permanente; repetición y concurrencia encolan como máximo una vez. El worker comprueba antes de enviar el switch global, consentimiento, bot, chat privado, grupo activo, membresía y que todas las ejecuciones sigan pendientes y correspondan al grupo. Un estado incierto del proveedor no provoca reenvío.
- Archivos: nueva entrega de recurrentes, cron de recordatorios, dispatcher común y pruebas aisladas. Sin migración ni nuevas dependencias.
- Riesgos: un aviso agregado se descarta entero si un cargo cambió de estado antes del despacho; prioriza no enviar datos obsoletos. Un fallo incierto puede perder un aviso, nunca duplicarlo.
- La operación durable liga la lista de ejecuciones, una huella de importe/nombre/categoría/fecha y la huella del texto; un contender con la misma identidad pero snapshot o mensaje distinto no puede completar su outbox. El despacho compara las huellas con los datos actuales. Si cambia un cargo, se descarta el aviso completo.
- Pruebas: ausencia de permiso, replay/concurrencia, cambio de grupo/consentimiento/chat/estado, y respuesta incierta. No activar canary ni switch global, no crear cargos QA, no tocar el cron mensual o reintegros.

## Siguiente subcorte: cerco canary en código (sin activar)

- Actual: el switch global apagado impide probar un recordatorio recurrente real sin abrir también otros avisos proactivos.
- Esperado: una excepción explícita, exclusiva de beta, para el usuario QA `esteban_beta_qa` y su `Mi espacio` propio. El cron filtra destinatarios antes de encolar y el dispatcher repite el mismo filtro antes de enviar. Una configuración parcial, otro proyecto/bot/base, o una mezcla con el switch global encendido falla cerrada.
- Invariantes: los tres bindings del canary recurrente permanecen ausentes en el despliegue de este subcorte. No se configura el canary, no se toca `NOTIFICATIONS_ENABLED=false`, no se envía un Telegram ni se crea un movimiento. La activación requiere un corte separado con consentimiento recurrente y ejecución QA elegible verificados.
- Pruebas: caso positivo aislado; usuario y grupo ajenos, flag parcial, cambio de grupo/consentimiento en despacho, build de beta con bindings ausentes o exactos y rechazo de valores distintos.

## Siguiente subcorte: preparar el vencimiento QA sin registrar gasto

- Actual: crear Netflix guarda la definición, pero no crea `recurring_executions`; el cron mensual que las crea no está programado. Por ello el recordatorio del día 18 no tiene candidato aunque la definición exista.
- Esperado: en modo canary, el cron de recordatorios puede materializar de manera idempotente una ejecución **pendiente**, únicamente para las definiciones mensuales no automáticas del usuario y grupo QA cuyo vencimiento sea exactamente dentro de tres días. Luego ejecuta la lectura y entrega normal. No se toca el generador general ni su rama de confirmación financiera.
- Invariantes: la materialización exige canary completo y grupo/membresía válidos; nunca crea una transacción, nunca marca pagado, no alcanza otros usuarios/grupos ni definiciones `autoConfirm`. Con canary apagado no lee ni escribe. El dispatcher revalida el estado antes de cualquier envío. Los bindings siguen ausentes y `NOTIFICATIONS_ENABLED=false` en este subcorte.
- Pruebas: regresión del vencimiento del 18 sin ejecución previa, repetición sin duplicado, exclusión de grupo/autoConfirm/frecuencias distintas, ningún insert con canary apagado y pruebas existentes de entrega/outbox.

## Regresión adicional: concurrencia local de materialización

- Dos llamadas lanzadas con `Promise.all` contra un archivo libSQL temporal para el mismo Netflix QA y vencimiento del 18/10 dejan una sola ejecución `pending`, sin `transaction_id` y sin transacciones. La restricción única `(recurring_expense_id, scheduled_date)` también está presente en la base de prueba.
- Con el canary apagado, o tras cambiar el grupo activo de Telegram, no se crea ejecución. La prueba es local y no invoca cron ni proveedor; no fuerza una barrera entre las dos llamadas, por lo que no constituye una demostración exhaustiva de todas las intercalaciones posibles.
- Owner Codex: conservar esta regresión y observar el cron automático del 15/10 antes de cerrar la activación. Owner Esteban: confirmar si recibe el aviso QA; no hace falta crear otro movimiento.

## Regresión adicional: destinatario ajeno del mismo grupo

- Con el canary beta limitado al usuario QA, una intención de recordatorio ya encolada para otro miembro del **mismo grupo**, que sí tiene Telegram, membresía y consentimiento válidos, se descarta en el dispatcher antes de llamar al proveedor. El outbox queda `dead`; ninguna respuesta privada llega al chat ajeno.
- Esta prueba local no habilita destinatarios adicionales ni demuestra entrega real del aviso QA. Owner Codex: conservar el aislamiento y reconciliar el único destinatario tras el cron automático. Owner Esteban: reportar solo la recepción del bot beta si ocurre.
