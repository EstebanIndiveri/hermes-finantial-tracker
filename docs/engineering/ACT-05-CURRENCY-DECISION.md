# ACT-05/06 — decisión de moneda y cotización

Estado 02/10/2026: **dirección de producto aprobada parcialmente; sin migración ni cambio funcional**. Esteban pidió conservar el modo actual ARS/USD y añadir un modo ARS/ARS para operar en una sola moneda sin exigir cotización. Owner de las decisiones restantes: Esteban. Owner de contrato, pruebas e implementación: Codex. Legacy y sus datos quedan fuera de este corte.

## Estado comprobado en octubre

- Presupuestos y entrada de movimientos están denominados en ARS (`budget_ars`, `amount_ars`).
- Cada transacción conserva además `amount_usd`, calculado al registrar con la `exchange_rate` mensual. El resumen de ingreso/ahorro se presenta en USD. El esquema exige ambos importes y una tasa mensual positiva.
- No hay moneda original ni tasa por transacción; por eso no se puede tratar una operación en USD o una cotización opcional como equivalentes a las entradas ARS existentes sin definir reglas nuevas.
- `exchange_rate=1` es un valor técnico inicial, **no** una cotización válida ARS/USD para el producto. El flujo debe distinguir explícitamente “sin cotización” de “cotización 1”.

## Recomendación de producto: dos etapas compatibles

1. **ARS/USD actual, preservado.** Ingreso mensual, metas y ahorro proyectado en USD; movimientos y límites de categoría en ARS según el código vigente, con equivalente USD calculado al registrar. No cambiar meses históricos ni presentar una cotización nueva como si se hubiera aplicado a un gasto pasado. Esteban debe confirmar si «presupuesto en USD» significa que también quiere cambiar los límites de categoría; el XLSX de octubre muestra ese límite en ARS.
2. **ARS/ARS nuevo.** Ingreso, metas, ahorro proyectado, límites y movimientos se evalúan en ARS. La cotización USD no es requisito para guardar ni consultar; si se decide mostrar una referencia USD opcional, debe etiquetarse como derivada, nunca alterar el saldo ARS ni rellenarse con una tasa ficticia de 1.
3. **Multimoneda real, fuera de este corte.** Registrar un gasto original en USD, presupuestos en varias monedas y reembolsos entre monedas requiere un contrato adicional de conversión por operación y fecha.

## Puertas antes de código o beta

Faltan tres decisiones que cambian el diseño: si los límites de categoría del modo mixto continúan en ARS; si la elección de modo es por mes del grupo o global; y si un mes que ya tiene movimientos puede cambiar de modo. Recomendación de seguridad: modo por mes del grupo, sin cambio de modo tras el primer movimiento, y nuevos meses ARS/ARS con cotización realmente opcional.

Después de esas decisiones, escribir contrato monetario/rounding y casos de regresión en web, comando, lenguaje natural, voz, OCR, recurrentes, alertas, exportes y reembolsos. El cron de Ripio hoy actualiza todos los ajustes del mes, incluidos grupos que en ARS/ARS no necesitarían cotización; deberá filtrar los modos y no sobrescribir una decisión manual. El writer recurrente hoy divide por una tasa fija de 1200 (`lib/db/recurring-queries.ts`); esto es un defecto preexistente que debe corregirse o bloquearse explícitamente antes de activar ARS/ARS.

La migración debe preservar ARS/USD como default y los valores históricos de `income_usd`, metas y `amount_usd`. Hay una puerta técnica adicional: `transactions.amount_usd` es `NOT NULL`, por lo que un gasto ARS/ARS sin cotización **no puede** escribirse correctamente solo con columnas aditivas; guardar `0`, copiar el importe ARS o dividir por 1 sería fabricar un valor USD. Codex debe diseñar y ensayar en copias beta una ampliación compatible que permita ausencia explícita del equivalente USD (por ejemplo, una reconstrucción controlada de la tabla SQLite para volver nullable ese campo), con backup, conciliación de filas/índices/FK y rollback por flags antes de activar el modo nuevo. Un snapshot de moneda/tasa por nueva operación evita que una cotización mensual posterior cambie su interpretación. Nada de esto autoriza cambios en legacy.
