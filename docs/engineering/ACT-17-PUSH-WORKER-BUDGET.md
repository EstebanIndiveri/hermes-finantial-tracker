# ACT-17 — presupuesto de ejecución del worker Push

## Contrato del corte

- Actual: `sweep` y `purge` corren consecutivamente antes de comprobar el deadline. Si el barrido consume el presupuesto, se inicia otra operación de DB sin tiempo útil.
- Esperado: presupuesto medido con reloj monotónico, independiente del reloj de timestamps del outbox. Comprobarlo antes de iniciar cada operación de mantenimiento y cada claim; exponer `budgetExhausted` si el deadline se alcanza durante una operación o impide iniciar la siguiente.
- Invariantes: límite de 25 claims, lotes de mantenimiento de hasta 100, kill switch y elegibilidad del canary sin cambios; no interrumpir una transición DB en curso ni cancelar un envío ya iniciado; no registrar payloads/endpoints.
- Archivos: worker Push, pruebas unitarias y contrato de respuesta del cron. Riesgo: un barrido lento puede posponer `purge` o claims hasta el siguiente tick, nunca convertir una entrega en `sent` sin confirmación.
- Pruebas fail-first: barrido que consume el presupuesto no inicia `purge` ni claims; purga que consume el presupuesto no inicia claims; proveedor lento marca `budgetExhausted` aunque haya alcanzado el máximo de claims; reloj monotónico no altera timestamps de retención.
- Exclusiones: no ajustar frecuencia del scheduler, habilitar proactivos, forzar entregas ni modificar legacy.
