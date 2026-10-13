# ACT-17 — concurrencia acotada del outbox Push

## Contrato del corte

- Actual: las pruebas con libSQL cubren dos claims concurrentes y una fila, pero no un backlog con varias rondas de reintento.
- Esperado: 40 intenciones sintéticas en libSQL local, cuatro consumidores concurrentes por ronda y un máximo de cinco claims por consumidor. La primera ronda aplica directamente la transición `retryable` con código `429`; la segunda confirma `sent`.
- Invariantes: cada fila se reclama una sola vez por fase, termina con dos intentos, respeta el cerco de lease y no se escribe en tablas financieras. No se llama a Web Push ni a DB beta/legacy.
- Archivos: prueba de integración del outbox Push y estado de implementación. Riesgo: prueba funcional de claims/transiciones bajo concurrencia acotada, **no** medición de latencia/capacidad de proveedor o staging.
- Exclusiones: no se invoca `web-push` ni se prueba su parsing de respuestas; este ensayo solo verifica claims y transiciones concurrentes. Sin cambios de runtime, migraciones, flags, retención o envíos proactivos; el ensayo de adaptador/proveedor real queda abierto.
