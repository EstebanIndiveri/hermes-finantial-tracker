# ACT-05/06 — decisión de moneda y cotización

Estado: propuesta de contrato; **sin aprobación de producto ni migración**. Owner de la decisión: Esteban. Owner de diseño, pruebas e implementación posterior: Codex. Legacy y sus datos quedan fuera de este corte.

## Estado comprobado en octubre

- Presupuestos y entrada de movimientos están denominados en ARS (`budget_ars`, `amount_ars`).
- Cada transacción conserva además `amount_usd`, calculado al registrar con la `exchange_rate` mensual. El resumen de ingreso/ahorro se presenta en USD. El esquema exige ambos importes y una tasa mensual positiva.
- No hay moneda original ni tasa por transacción; por eso no se puede tratar una operación en USD o una cotización opcional como equivalentes a las entradas ARS existentes sin definir reglas nuevas.
- `exchange_rate=1` es un valor técnico inicial, **no** una cotización válida ARS/USD para el producto. El flujo debe distinguir explícitamente “sin cotización” de “cotización 1”.

## Recomendación de producto: dos etapas compatibles

1. **Modo ARS primero.** Permitir presupuesto, ingreso y gasto en ARS con cotización USD opcional. Sin cotización, mostrar totales, límites y ahorro en ARS; las proyecciones USD deben indicar “no disponibles”, nunca dividir por 1 ni inventar una tasa. Si se proporciona cotización, mostrar USD como dato derivado con fuente/fecha visibles. La tasa y el redondeo del momento deben quedar fijados para el movimiento, no recalcular operaciones históricas al cambiar el mes.
2. **Multimoneda real, después.** Solo tras una decisión separada: moneda de origen por movimiento, moneda base del grupo, reglas de conversión por fecha y proveedor, presupuesto por moneda, reembolsos/splits y exportes conciliados, y pruebas de cambio de tasa/histórico.

## Puertas antes de código o beta

Decidir si el grupo tendrá ARS como moneda base y si el ingreso se configura en ARS, USD o ambos; definir qué muestra `resumen` cuando falta FX y qué fecha/fuente de tasa se usa. Luego escribir contrato monetario/rounding y casos de regresión en web, comando, lenguaje natural, voz, OCR, alertas, exportes y reembolsos. Cualquier esquema debe ser aditivo, con backfill reproducible sobre copia beta y conciliación de `amount_ars`/`amount_usd`; no reinterpretar filas legacy ni activar un cambio de lectura antes de completar backfill y rollback por flags.
