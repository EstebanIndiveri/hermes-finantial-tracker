# ACT-17 — entrega diaria beta idempotente y revocable

## Contrato del corte

Estado actual: el cron diario envía directo a Telegram después de verificar el
opt-in, sin recibo durable. Una repetición del cron puede reenviar el mismo
resumen; revocar la preferencia después de preparar el mensaje no detiene una
entrega pendiente. El kill switch beta sigue apagado.

Resultado: una sola intención durable por bot, usuario y fecha Argentina. El
cron construye el mensaje y lo encola con una clave determinística; la operación
padre existente conserva usuario, grupo y tipo de consentimiento sin agregar
columnas ni cambiar el esquema. Antes de llamar al proveedor,
el dispatcher verifica de nuevo el kill switch, el opt-in, el Telegram privado
vinculado y la membresía/grupo activo. Si falla alguno, termina esa intención
sin enviar. El worker existente entrega y observa el resultado.
Fecha, mes y lunes se derivan de una misma fecha calendario Argentina,
independiente del huso horario del servidor; la antigua conversión a ISO
podía pasar al día siguiente a las 21:00 locales.
La búsqueda de movimientos usa el intervalo semiabierto del día local:
incluye hasta `23:59:59.999` y excluye exactamente la medianoche siguiente.
La operación padre queda como recibo permanente de deduplicación aunque la
fila de entrega termine su TTL de 30 días. Si una caída deja solo el padre,
el cron puede completar el hijo durante esa ventana; pasado el TTL no
recrea un envío viejo. El padre conserva solo IDs técnicos de usuario/grupo,
no el texto del resumen, y entra en el inventario de limpieza QA diferida.

Política de incertidumbre para este aviso proactivo del piloto: solo se hace
un intento de `sendMessage`. Una caída, timeout o lease recuperado después de
comenzar el intento queda `dead` para revisión manual, **sin reenvío
automático**. Esto minimiza duplicados, pero puede perder un resumen cuyo
resultado de red sea incierto. La API de Telegram no provee una clave de
idempotencia de envío. Las respuestas iniciadas por usuarios conservan su
política actual de reintento. La unicidad de intención no significa entrega
exactamente una vez.

Invariantes: no cambiar movimientos, proyecciones ni avisos de otras clases;
no enviar a chats de grupo; no enviar tras revocación, relink o cambio de
grupo; no tocar legacy. No hay migración: se reutilizan las tablas e índices
ya aplicados en beta. El kill switch sigue apagado hasta el despliegue
atestado y el canary.

Pruebas del corte: cron repetido y concurrente, A/B, revocación y relink
antes del dispatch, cambio/remoción de grupo, lease vencido e incertidumbre
de proveedor, sin regresión de entregas reintentables iniciadas por usuario.

## Canary beta de alcance exacto

`NOTIFICATIONS_ENABLED=true` no es un canary: abriría otros crons y mensajes
transaccionales, y deshabilitaría el cerco Push que exige el switch global en
`false`. Por eso el resumen diario usa una excepción específica: con
`NOTIFICATIONS_ENABLED=false`, solo
`DAILY_SUMMARY_CANARY_ENABLED=true` junto a
`DAILY_SUMMARY_CANARY_USER_ID` y `DAILY_SUMMARY_CANARY_GROUP_ID` aprobados
permiten el encolado y la entrega de **ese** usuario en **ese** grupo. La
ausencia, valor mal escrito o configuración parcial apaga la excepción. El
runtime exige el origen, bot, base de datos y compuerta de build de beta;
el build y el recibo H04d exigen los IDs QA concretos
`504b3827-a03e-49a6-acc6-c200f225ca80` y
`b5b15f53-f964-4c12-99ca-88fbbee23c55`. Una excepción configurada
jamás se transforma en envío global si cambia el interruptor general. El
cron no recorre reintegros pendientes en modo canary. Antes del proveedor se
revalidan el alcance configurado, consentimiento individual, chat vinculado y
grupo activo autorizado. Cambiar cualquiera de ellos mata una entrega
pendiente sin envío. El build beta atesta también la completitud de este
alcance, sin imprimir IDs ni secretos.

La activación de estos bindings solo corresponde al proyecto y target beta.
Requiere un deployment nuevo y reatestación H04d antes de mover su alias;
el manifiesto debe declarar la excepción acotada sin describir los avisos
proactivos como universalmente apagados. Un canary no demuestra SLO ni
habilita el switch global. Para desactivarlo, apagar el binding, desplegar
de nuevo y observar que no quedan entregas elegibles; nunca borrar los
recibos de operación para forzar un reenvío.

El cron beta emite un único evento operativo `beta_daily_summary_canary_cron`
con fecha Argentina y resultado (`queued`, `already_queued`,
`nothing_relevant`, etc.). No incluye IDs de usuario/grupo/chat, importes ni
texto del aviso. Una respuesta `nothing_relevant` prueba la ejecución del
cron, no una entrega. El cron de Vercel figura activo en beta a `0 0 * * *`;
el recibo del siguiente disparo debe compararse con el outbox y el
consentimiento antes de ampliar destinatarios.
