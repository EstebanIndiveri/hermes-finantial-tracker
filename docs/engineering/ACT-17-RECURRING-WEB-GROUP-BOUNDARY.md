# ACT-17 — recurrentes en el grupo web activo

Clasificación: estabilización beta. Owner: Codex. No habilita avisos.

- Actual: el formulario crea en `active_telegram_group_id`; la lista, estadísticas y ejecuciones pueden mezclar grupos aunque el selector web muestre otro. El mes seleccionado tampoco llega a la consulta.
- Esperado: las rutas web toman el grupo exclusivamente del contexto autenticado por middleware (`x-group-id`), revalidan la membresía y aplican igualdad exacta de grupo. Nunca aceptan un `groupId` enviado por el cliente como autoridad. Crear, listar, editar, borrar, confirmar y omitir deben respetar ese mismo grupo; el selector de mes debe consultar el mes mostrado.
- Invariantes: no mover ni duplicar Netflix, no generar ejecuciones ni movimientos, no invocar crons, no activar el canary ni `NOTIFICATIONS_ENABLED`, no modificar legacy ni los flujos de Telegram.
- Pruebas: regresión roja de grupo web distinto al de Telegram, aislamiento de dos grupos del mismo usuario y rechazo de mutaciones/confirmaciones por ID fuera del grupo; suite dirigida, tipos y lint en Node 22.
- Exclusión: materialización del vencimiento mensual y envío real del recordatorio. Se retoman solo tras verificar el grupo y la ejecución QA.
