# ACT-17 — reintentos del adaptador Push por lotes

## Contrato del corte

- Actual: el worker prueba un único `429` simulado del proveedor, mientras la integración libSQL verifica 40 claims/reintentos sin invocar el adaptador. Falta cubrir el branch completo del worker con varios lotes.
- Esperado: encolar 40 filas sintéticas en libSQL local y ejecutar cuatro workers concurrentes por ronda, cada uno limitado a cinco claims, con `web-push` simulado. El primer intento de cada fila falla con `statusCode: 429` y queda `retryable`; el segundo se confirma `sent`, sin `dead` ni `lostLease`.
- Invariantes: el worker valida el alcance de canary, reembolso, membresía y suscripción antes de cada llamada; ningún proveedor, DB remota ni escritor financiero se usa. El kill switch proactivo no cambia.
- Archivos: test del worker Push, registro de implementación y decisión QA. Riesgo: el proveedor es un mock; claims, cercos y transiciones usan libSQL local. No equivale a capacidad, SLA o aceptación de un proveedor real.
- Pruebas: 40 respuestas `429` y 40 éxitos, hasta cinco claims por ejecución, estados/contadores de los dos ciclos y retraso de reintento acotado.
- Exclusiones: sin cambios de runtime, flags, migraciones, deploy o envíos reales; todos los datos QA de beta se conservan hasta finalizar el piloto por decisión de Esteban.
