# ACT-07/H10 — proyecciones por canal

Estado 30/09/2026: implementación y regresiones locales completas; desplegado
**solo en beta** como `dpl_5jxNMY8Z3iMDToef7N57QKdjTTyV` desde
`bd0269bec6c91125852b6225a32f2f8e827adac0`. Aceptación visual beta de
`resumen` y XLSX pendiente de Esteban; **sin cambio legacy**. El
[plan general](../audit/PLAN-DE-ACCION.md) asigna ACT-07 a las
proyecciones de ingreso/gasto; ACT-10 corresponde a propuestas/callbacks.

## Contrato del corte

Comportamiento previo: el resumen Telegram mostraba USD como `$`; el XLSX
sumaba movimientos `ingresos` en `Gastado (ARS)`; la alerta diaria podía
tratar un ingreso como gasto, e incluso enviar el resumen al último chat del
usuario aunque ese chat fuera grupal. El dashboard obtenía `% Ahorro` de una
conversión al tipo de cambio **actual** mientras su ahorro mostrado venía de
los importes USD guardados con la operación.

Resultado esperado:

- `resumen`, alerta y dashboard identifican la moneda de cada cifra. El
  porcentaje de ahorro usa ingreso y ahorro de la misma proyección USD.
- CSV/XLSX `Movimientos` conserva todos los movimientos; las hojas de
  presupuesto y gasto por categoría excluyen la categoría `ingresos`.
- La alerta diaria cuenta solo gastos y no confunde ingresos con categorías
  al límite. Solo puede enviarse al ID privado de Telegram vinculado al
  usuario; sin ese ID se omite, aun si hay un chat histórico en `bot_messages`.

Invariantes: grupo/mes/estado activo en cada consulta; conservar importes USD
persistidos y ARS originales, sin reconversión silenciosa; cero escritura
financiera, modificación de esquema o cambio de permisos. `NOTIFICATIONS_ENABLED`
sigue `false` en beta. Las pruebas usan libSQL local o límites externos
simulados, nunca proveedores/DB productivos.

## Gates y exclusiones

Las regresiones cubren resumen libSQL por dos grupos/meses; formato USD;
transformación API de exportación para gastos/ingresos; selección de
destinatario privado y filtrado de alerta; porcentaje sobre USD. Ejecutar
suite completa, typecheck, lint y build antes de cerrar el corte local.

Esto **no** certifica conversión ARS→USD al escribir, contabilidad multimoneda,
clasificación histórica más allá del slug legacy `ingresos`, ni todas las
políticas de alertas proactivas. Esos contratos siguen en ACT-05/07/17.
Antes de activar alertas hay que auditar los demás destinatarios y
condiciones de envío. El gate técnico H04d se repitió sobre el nuevo
deployment/alias: assertion de build aprobada, seis fingerprints beta
coincidentes y manifiesto local postactivación consistente. La aceptación
humana del residual para este deployment queda pendiente de Esteban; no se
atribuye automáticamente la aceptación del deployment anterior. Esteban
validará los textos con `resumen` y un XLSX beta; Codex cerrará ACT-07 tras
registrar esa evidencia. Producción legacy permanece inmutable.
