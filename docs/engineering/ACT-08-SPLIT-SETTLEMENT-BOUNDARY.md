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

### Contrato H14d — editor web del reparto (16/10)

La API H14c admite corregir una distribución completa, pero la vista de
sesión no ofrece un acceso a esa capacidad y el alta web todavía no permite
seleccionar miembros. Este corte expone un editor para un gasto ya creado,
solo al dueño que sigue siendo miembro de una sesión abierta, con pagadores
y participantes vigentes identificados por nombre. La interfaz permite
corregir total, importes pagados y cuotas fijas o iguales; porcentaje usa
porcentajes explícitos y calcula cuotas en centavos. Antes de enviar debe
mostrar las diferencias contra el total y bloquear distribuciones que no
cierren. El servidor vuelve a validar todo bajo transacción.

El enlace de edición no aparece para gastos cancelados ni cuando la sesión
tiene cualquier pago. La ruta del editor verifica de nuevo dueño, membresía,
sesión abierta, split activo y ausencia de pagos; otros visitantes reciben
404 y no datos privados. Si un pago aparece entre carga y guardado, la API
responde 409 y la UI explica que debe recargar. No se ofrecen cambios de
descripción, borrado, reintentos automáticos, ni edición con pagos históricos.
Archivos: detalle de sesión, página del editor, componentes y pruebas de
cálculo/validación. Sin despliegue hasta cerrar la observación ACT-17.

### Contrato H14e — alta web con miembros reales (16/10)

El alta actual presenta modos de reparto, pero siempre registra al actor
como único pagador y participante. La vista de alta debe obtener la sesión
y sus miembros en el servidor, comprobar que el actor sea miembro y que la
sesión esté abierta, y ofrecer los mismos campos conservativos del editor:
descripción, total, pagadores y participantes registrados/temporales. Los
modos igual, fijo y porcentaje generan importes en centavos y bloquean el
envío cuando las dos sumas no cierran. La API transaccional H14a valida de
nuevo pertenencia/estado al momento de escribir. Cualquier miembro vigente
puede registrar un gasto; la política de edición H14d sigue reservada al
owner. No enviar avisos adicionales ni modificar Telegram, pagos, esquema,
cron o datos existentes. Un 400 por cierre o membresía cambiada indica
recargar; no reintentar automáticamente. Publicación diferida por ACT-17.

### Contrato H14f — identidad durable del alta web (16/10)

El formulario H14e bloquea doble clic en memoria, pero un timeout después de
commit o un reenvío desde otra pestaña puede crear dos gastos. El POST de
alta exigirá una `operationId` UUID por intención de alta, generada en el
cliente y reutilizada en sus reintentos. La unicidad existente de
`splits.operation_id` decidirá la carrera en DB; no se agrega migración.
Repetir una operación con el mismo actor, sesión, descripción y distribución
canónica devuelve el mismo ID sin insertar nada. Reutilizar la clave con
otro payload, actor o sesión devuelve conflicto; no se filtra el gasto ajeno.
El cliente conserva la clave si falla la red o hay error incierto y crea una
nueva solo al abrir una intención distinta. La comparación incluye centavos,
tipo y porcentajes, no depende del orden de filas. Una respuesta confirmada
puede navegar al gasto ya existente; no se envían avisos en este corte.

Archivos: ruta POST, formulario, regresiones de integración libSQL y bitácora.
Se rechazan cuerpos web sin clave: una pestaña beta anterior debe recargar
antes de registrar. No tocar Telegram, pagos, esquema, crons ni beta activa.
