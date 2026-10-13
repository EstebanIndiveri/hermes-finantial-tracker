# ACT-17 — actividad agregada del scheduler beta

## Contrato del corte

- Actual: `execution=processed` acredita que la ruta ejecutó el worker, pero no distingue una cola vacía de un claim, reintento o fallo terminal.
- Esperado: las rutas Telegram y Push agregan `X-Hermes-Outbox-Counts` solo después de ejecutar el worker. Formato fijo: `claimed,sent,retryable,dead,lostLease`, cinco enteros entre 0 y 25; el total de resultados no puede exceder `claimed`. En Push `retried` se normaliza a `retryable` solo para esta telemetría.
- El scheduler valida formato, rango y consistencia antes de registrar `activity`. Un encabezado ausente o inválido queda `null`; no se registra el valor crudo. No lee ni registra el cuerpo, otros encabezados, URL, chats, endpoints, importes, texto ni secretos.
- `skipped_worker_disabled`, HTTP no exitoso y respuestas sin encabezado jamás se atribuyen actividad. La ruta conserva su JSON actual para sus consumidores y no modifica claims, colas, finanzas ni consentimientos.
- Archivos: dos rutas cron, serializador acotado, Worker beta y pruebas. Riesgo: la métrica proviene del resumen de una invocación, no acredita recepción del proveedor ni una tasa de servicio; un log perdido no se reconstruye desde esta cabecera.
- Exclusiones: sin canary remoto nuevo, sin escritura en Turso, sin activar `NOTIFICATIONS_ENABLED`, sin cambios en legacy.

## Verificación y siguiente puerta

La regresión falló antes del cambio por cabeceras/actividad ausentes. Después pasaron 1009 pruebas de app, 113 del harness, typecheck y lint con 0 errores (63 advertencias previas) en Node 22. El control agregado de Turso beta de las 16:47:52 UTC mantuvo Push 1 y Telegram 25 `sent`, cero abiertos, vencidos o purgas debidas. Esta fotografía no prueba entregas nuevas.

Tras promover beta y reatestar H04d, observar al menos un tick de ambos canales con `execution=processed` y `activity` numérico. Un tick vacío debe registrar cinco ceros. Para afirmar recuperación real aún hará falta una entrega beta acotada o trabajo naturalmente retryable, conciliado con el outbox sin tocar datos financieros. No extrapolar a SLO ni habilitar avisos proactivos por esta sola evidencia.
