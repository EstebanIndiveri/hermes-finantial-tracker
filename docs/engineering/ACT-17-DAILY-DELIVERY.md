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
