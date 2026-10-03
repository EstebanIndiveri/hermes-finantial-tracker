# ACT-05/06 — decisión de moneda y cotización

Estado 03/10/2026: **decisión de producto aprobada; contrato local iniciado; sin migración ni cambio funcional**. Esteban confirmó conservar el modo actual USD/ARS y añadir ARS/ARS. Los límites de categoría siguen en ARS en ambos modos; el modo pertenece a un grupo y mes; no se puede cambiar cuando ese grupo/mes ya tiene cualquier movimiento. Codex es owner de la implementación y sus gates. Legacy y sus datos quedan fuera de este corte.

## Estado comprobado en octubre

- Presupuestos y entrada de movimientos están denominados en ARS (`budget_ars`, `amount_ars`).
- Cada transacción conserva además `amount_usd`, calculado al registrar con la `exchange_rate` mensual. El resumen de ingreso/ahorro se presenta en USD. El esquema exige ambos importes y una tasa mensual positiva.
- No hay moneda original ni tasa por transacción; por eso no se puede tratar una operación en USD o una cotización opcional como equivalentes a las entradas ARS existentes sin definir reglas nuevas.
- `exchange_rate=1` es un valor técnico inicial, **no** una cotización válida ARS/USD para el producto. El flujo debe distinguir explícitamente “sin cotización” de “cotización 1”.

## Recomendación de producto: dos etapas compatibles

1. **USD/ARS actual, preservado.** Ingreso mensual, metas y ahorro proyectado en USD; movimientos y límites de categoría en ARS según el código vigente, con equivalente USD calculado al registrar. No cambiar meses históricos ni presentar una cotización nueva como si se hubiera aplicado a un gasto pasado. Los límites de categoría continúan en ARS por decisión expresa.
2. **ARS/ARS nuevo.** Ingreso, metas, ahorro proyectado, límites y movimientos se evalúan en ARS. La cotización USD no es requisito para guardar ni consultar; si se decide mostrar una referencia USD opcional, debe etiquetarse como derivada, nunca alterar el saldo ARS ni rellenarse con una tasa ficticia de 1.
3. **Multimoneda real, fuera de este corte.** Registrar un gasto original en USD, presupuestos en varias monedas y reembolsos entre monedas requiere un contrato adicional de conversión por operación y fecha.

## Decisión vigente y puertas de implementación

El modo se elige por `group_id` + `month`; las filas históricas sin modo equivalen a `USD_ARS`. El modo no cambia después de **cualquier** movimiento en el período, incluso si fue anulado: borrar un movimiento no reinterpreta historia. El servidor debe verificarlo en la misma frontera de escritura que el ajuste mensual; una comprobación en UI no basta ante concurrencia. Por compatibilidad, el modo por defecto de un mes nuevo será `USD_ARS` hasta que el usuario elija expresamente `ARS_ARS` antes de registrar movimientos. Esto último es una decisión de despliegue conservadora, no una migración automática de preferencias entre meses.

En `ARS_ARS` un movimiento solo tiene importe ARS contable. `amount_usd=NULL` significa «no calculado»; jamás escribir 0, copiar ARS ni dividir por una tasa ficticia de 1. Una cotización opcional de referencia no modifica movimiento, presupuesto ni resumen ARS. En `USD_ARS` el equivalente USD se fija al registrar con tasa positiva vigente, junto con un snapshot de esa tasa y redondeo definido. No se revalúan movimientos pasados por cambios posteriores de la tasa mensual. Los importes `REAL` heredados se conservan sin reescritura; migrar a unidades menores enteras exige otra conciliación.

Gates obligatorios bajo owner Codex: migración compatible ensayada en copias locales con conteos, sumas, índices y claves foráneas; writers/proyecciones que comprendan ambos modos detrás de flag beta apagada; eliminación o bloqueo de la tasa fija 1200 en recurrentes; pruebas cruzadas de todos los canales; backup/restore y migración solo beta; activación, QA manual y conciliación. Ninguna puerta autoriza migración ni deploy legacy.

Los siguientes cortes deben concretar redondeo y casos de regresión en web, comando, lenguaje natural, voz, OCR, recurrentes, alertas, exportes y reembolsos. El cron de Ripio hoy actualiza todos los ajustes del mes, incluidos grupos que en ARS/ARS no necesitarían cotización; deberá filtrar los modos y no sobrescribir una decisión manual. El writer recurrente hoy divide por una tasa fija de 1200 (`lib/db/recurring-queries.ts`); esto es un defecto preexistente que debe corregirse o bloquearse explícitamente antes de activar ARS/ARS.

La migración debe preservar ARS/USD como default y los valores históricos de `income_usd`, metas y `amount_usd`. Hay una puerta técnica adicional: `transactions.amount_usd` es `NOT NULL`, por lo que un gasto ARS/ARS sin cotización **no puede** escribirse correctamente solo con columnas aditivas; guardar `0`, copiar el importe ARS o dividir por 1 sería fabricar un valor USD. Codex debe diseñar y ensayar en copias beta una ampliación compatible que permita ausencia explícita del equivalente USD (por ejemplo, una reconstrucción controlada de la tabla SQLite para volver nullable ese campo), con backup, conciliación de filas/índices/FK y rollback por flags antes de activar el modo nuevo. Un snapshot de moneda/tasa por nueva operación evita que una cotización mensual posterior cambie su interpretación. Nada de esto autoriza cambios en legacy.
