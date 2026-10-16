# ACT-08 — deudas globales de compartidos

## Subcorte H13: solo proyección, sin escrituras

Antes, `calculateGlobalBalances` trataba el saldo neto de cada otro miembro
de una sesión como una deuda bilateral con quien consultaba. Esto inventaba
obligaciones: si B pagó 100 solo por C y A era miembro sin participar, A veía
que debía 100 a B y que C le debía 100. La regresión dirigida reprodujo el
fallo antes de cambiar el cálculo.

La vista global ahora parte de las aristas de liquidación que devuelve
`calculateSessionBalances` y conserva solo las que tienen al usuario
consultante como origen o destino. Luego agrega por contraparte entre
sesiones, como antes. Un pago parcial ya incorporado a los saldos de sesión
reduce la arista correspondiente. La política es **liquidación simplificada
por sesión**: no se afirma que la arista identifique qué gasto individual
originó la obligación.

Consumidores revisados: endpoint `/api/splits/global-balances`, dashboard de
balances y formulario/ruta de registro de pagos, que usan el desglose por
sesión. No cambian los writers de web o Telegram, las filas de splits/pagos,
el esquema, las notificaciones ni los crons. No se leen ni escriben datos
beta/legacy en esta prueba.

Pruebas: tercero paga a tercero sin deuda del observador; liquidación de
cuatro participantes; pago parcial; neteo de una contraparte entre sesiones;
API de nombres y cálculo de sesión. La aceptación de beta requiere un pase
posterior con H04d y una sesión QA apta, sin crear pagos reales para fabricar
el caso.

## H14 sigue separado

El alta web en `app/api/splits/sessions/[id]/items/route.ts` conserva los
hallazgos de la auditoría: no comprueba sumas ni pertenencia de cada
participante a la sesión y ejecuta tres inserciones sin transacción. La
edición en `app/api/splits/items/[id]/route.ts` cambia `total_amount` sin
recalcular pagadores/cuotas. H13 no corrige esas escrituras. **Owner Codex:**
preparar regresiones de API/DB real con rollback ante fallo intermedio y
definir una política explícita para editar/cancelar con pagos previos antes
de cambiar escritores. No publicar H13 en beta como cierre completo de ACT-08.

La publicación de este subcorte queda diferida hasta terminar las ventanas
automáticas ACT-17 del 16 y 18/10 para conservar un deployment de cron
estable; el trabajo local puede continuar entretanto.

### Contrato H14a — alta web (15/10, estabilización)

Actual: el endpoint web admite pagos/cuotas que no conservan el total, IDs
ajenos a la sesión y tres escrituras independientes. Esperado: importe
positivo con hasta dos decimales; pagos y cuotas suman exactamente el total
en centavos; cada identidad es única, exclusiva (usuario o temporal) y
miembro actual de la sesión; en porcentaje, los porcentajes suman 100 y
coinciden con las cuotas. Revalidar sesión abierta y membresía del actor al
escribir. Crear cabecera, pagadores y cuotas en una transacción: cualquier
fallo revierte todo. Las entradas inválidas no deben generar filas.

Archivos: ruta de alta, formulario web que hoy ofrece porcentaje sin enviarlo,
pruebas de integración libSQL y este contrato. Riesgos: incompatibilidad de
clientes que enviaban importes inconsistentes; responder 400 explícito es
preferible a almacenar deuda falsa. No migrar montos históricos ni cambiar
Telegram, edición/cancelación, cron o datos beta/legacy en H14a. H14b conserva
owner Codex para política de cambios con pagos previos. Pruebas: caso válido,
sumas erróneas, identidad ajena/duplicada, porcentaje y rollback al fallar
el último insert; luego puertas del repositorio.

### Contrato H14b — edición/cancelación protectora (15/10)

La API `PATCH /api/splits/items/[id]` cambia solo `total_amount`, sin mover
pagadores ni cuotas. Los pagos son de sesión y no tienen `split_id`; por eso
no se puede atribuir con certeza un pago ya efectuado a un split particular.
La política de contención es rechazar toda modificación del importe con
`409` hasta implementar una sustitución transaccional completa. Cancelar un
split activo solo se permite al owner cuando la sesión está abierta y no
existe ningún pago en la sesión; ante pagos, responder `409` sin alterar
contabilidad. Repetir la cancelación ya realizada es idempotente. Un cuerpo
vacío o mixto (importe y cancelación) es inválido. Autorizar y consultar
pagos dentro de la misma transacción que marca cancelado. No borrar pagos,
partidas ni cabecera; preservar auditoría.

Archivos: endpoint de edición/cancelación, prueba libSQL aislada, este
contrato y bitácora. Riesgo: una edición antes ofrecida será rechazada
explícitamente; una compensación/rectificación deberá diseñarse con vínculo
de pago al split o asentamiento contable. No modificar la ruta de pagos,
Telegram, esquema, datos beta/legacy o cron en este corte. **Owner Codex:**
seguir con la edición transaccional de cuotas y la política de pagos
atribuibles en un subcorte posterior; H14b solo contiene corrupción.

### Contrato H14c — reemplazo íntegro antes de pagos (16/10)

Clasificación: estabilización financiera, sin migración. El PATCH ya rechaza
cambiar únicamente `totalAmount`; el comportamiento esperado agrega una
opción de edición con `totalAmount`, `splitType`, `payers` y `participants`
completos. Usa exactamente la validación monetaria/de identidad del alta:
centavos conservados, porcentajes coherentes, IDs exclusivos y miembros
vigentes. Para `equal`, las cuotas solo pueden diferir un centavo como
resultado del reparto. No se aceptan ediciones si la sesión está cerrada,
el split fue cancelado o existe cualquier pago en la sesión. La autorización
del owner, la consulta de pagos, el reemplazo de pagadores/cuotas y el cambio
de cabecera comparten una transacción. Una falla al insertar las cuotas
nuevas conserva íntegramente las filas originales. La repetición de una
edición idéntica deja la misma proyección, aunque no promete IDs de filas
idénticos; no se invoca desde retry automático ni se envían avisos.

Archivos: validador compartido de rutas web, alta, PATCH, regresiones libSQL,
este contrato y bitácora. Riesgo: clientes que envían distribuciones `equal`
incoherentes reciben 400. No reinterpretar historia ni cambiar Telegram,
pagos, esquema, cron, beta o legacy. La edición con pagos sigue prohibida
porque la tabla de pagos no indica qué split liquidó cada pago; **owner Codex**
para un diseño de ajuste/auditoría posterior, no resolver por heurística.
