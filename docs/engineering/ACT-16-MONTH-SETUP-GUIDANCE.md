# ACT-16 — orientación al iniciar un mes sin configuración

## Contrato acotado

Antes, el dashboard mostraba «Datos contables no disponibles» y Telegram
respondía «No hay configuración para este mes» sin identificar el período o
el grupo. El formulario web ya detenía el registro, pero el enlace decía
«Revisar ajustes», igual que ante datos existentes incompletos.

Ahora, si falta `monthly_settings` para el grupo y mes seleccionados, la
web nombra el mes, explica que no se copiaron presupuestos ni metas y enlaza
a `/dashboard/settings?month=YYYY-MM`. El registro sigue pausado. `/resumen`
y la consulta natural de resumen en Telegram dan la misma explicación de
mes/grupo y la ruta de navegación. Si la configuración existe pero el
resumen no puede calcularse, se conserva el diagnóstico de configuración
incompleta en vez de afirmar falsamente que el mes no existe.

En Ajustes, la carga conserva la distinción entre fila inexistente y un
formulario provisional con ceros. Un aviso del mes seleccionado guía al
owner a guardar primero ingreso y moneda, luego metas y presupuestos. Si
la sesión es Member, indica pedirle la configuración al owner sin sugerir
una escritura que no puede hacer. Al navegar entre meses, la UI muestra
loading hasta que la respuesta corresponda al nuevo `monthQuery`: no
presenta valores del mes anterior con la etiqueta del nuevo período.
Guardar la configuración mensual cambia el aviso a estado existente.

No se copia ningún dato, no se crean movimientos, no se cambia el período
activo ni se añade una regla de rollover automático. Las consultas usan el
grupo ya autorizado por cada canal. El cambio no requiere schema, cron,
secreto ni nueva flag. Pruebas cubren estado vacío web, enlace del mes,
`/resumen`, lenguaje natural, configuración incompleta, cruce de año,
estado ausente/existente en Ajustes y protección ante datos obsoletos.

## Puerta pendiente

**Owner Codex:** publicar este corte solo en beta con los gates y H04d del
deployment exacto; comprobar el estado vacío en una cuenta/grupo QA cuando
se presente naturalmente, sin borrar configuración ni fabricar un mes.
**Owner Esteban:** decidir más adelante si los presupuestos/metas del mes
anterior se proponen para copiar o si se cargan siempre desde cero. Hasta
esa decisión no hay arrastre automático. Legacy queda intacto.
