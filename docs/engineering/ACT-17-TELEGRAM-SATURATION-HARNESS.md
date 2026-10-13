# ACT-17 — saturación acotada del outbox Telegram

## Contrato del corte

- Actual: la integración prueba una fila con dos workers y un 503, pero no un backlog simultáneo con `429` y reintentos por lote.
- Esperado: un ensayo determinista con libSQL aislado, filas sintéticas, cuatro workers concurrentes y proveedor falso. Todos los intentos `429` pasan a `retryable`, luego el backlog se drena a `sent` sin que un claim duplicado genere una llamada adicional al proveedor.
- Invariantes: cada worker conserva su tope de cinco claims y su cerco por lease; cero escrituras financieras; ninguna llamada a Telegram ni a la DB beta/legacy; sin límites de velocidad frágiles dependientes de la máquina.
- Archivos: test de integración del outbox Telegram y estado de implementación. Riesgo: el ensayo demuestra seguridad funcional bajo esta carga acotada, **no** capacidad real, latencia de proveedor o SLA de staging.
- Pruebas: 40 entregas sintéticas, cuatro workers por ronda, primera respuesta `429` con `retry_after`, segunda respuesta exitosa; conciliar estado, intentos, llamadas y tablas financieras.
- Exclusiones: no alterar scheduler, frecuencia, flags ni política de reintentos; no activar avisos proactivos ni enviar mensajes reales.
