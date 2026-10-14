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
