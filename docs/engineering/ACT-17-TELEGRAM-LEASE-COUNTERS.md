# ACT-17 — contadores de entrega Telegram con lease perdido

## Contrato del corte

- Actual: el dispatcher suma `sent`, `retryable` o `dead` aunque la transición cercada por `lease_token` devuelva `false`. El resumen HTTP puede afirmar una entrega durable que este worker no confirmó.
- Esperado: contar esas transiciones solo cuando la DB devuelve `true`; si devuelve `false`, contar `lostLease`. El worker y el dispatcher inline conservan el mismo contrato de contadores. No cambiar el claim, el payload ni la política de reintentos.
- Invariantes: ninguna escritura financiera adicional; ninguna entrega a otro bot/chat; no reintentar inmediatamente un envío cuyo resultado quedó incierto; no exponer token, texto, chat ni error del proveedor en métricas.
- Archivos: dispatcher, worker y sus tests de unidad/integración. Riesgo: solo cambia el resumen de respuesta de los workers; los consumidores deben aceptar el nuevo contador.
- Pruebas: regresiones fail-first para `mark* = false` en las tres rutas (sent/retryable/dead) y propagación al resumen del worker; suites dirigidas, TypeScript, lint y suite completa según impacto.
- Exclusiones: no activar `NOTIFICATIONS_ENABLED`, no forzar entregas ni modificar legacy o el scheduler desplegado en este corte.
