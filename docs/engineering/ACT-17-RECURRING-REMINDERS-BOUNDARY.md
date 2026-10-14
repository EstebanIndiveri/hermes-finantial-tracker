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
