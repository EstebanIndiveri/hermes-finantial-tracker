# ACT-08 — deudas globales de compartidos

### Contrato H14l — confirmación de pago por Telegram (16/10)

Actual: `pague_confirm:yes` conserva importe y saldo de la conversación y
escribe directamente `split_payments`; un pago web u otro callback ocurrido
entretanto puede volver obsoleta esa deuda. Esperado: antes de confirmar,
revalidar en la misma transacción sesión abierta, membresía actual de deudor
y acreedor (incluidos participantes temporales), importe positivo en centavos
y deuda confirmada restante. El mensaje muestra el saldo realmente calculado
al commit; un rechazo no crea pago ni aviso al acreedor. El camino con
`TelegramOperationContext` mantiene operación, pago y outbox en una sola
transacción e idempotencia por update. El fallback sin contexto conserva su
entrega heredada pero usa la misma regla financiera; su falta de deduplicación
durable de avisos queda con owner ACT-09. Pruebas: deuda obsoleta, temporal,
repetición y saldo; luego puertas del repositorio. Sin cambios de esquema,
datos QA, cron, bot, beta activa ni legacy; publicar solo tras ACT-17/H04d.

### Contrato ACT-09a — aviso durable del pago web compartido (16/10)

Actual: `POST /api/splits/payments` confirma el pago y luego intenta un
Telegram directo; un fallo tras commit puede perder el aviso y el helper de
envío no acredita HTTP 200. Esperado: cuando inbox, outbox y worker Telegram
estén activos con identidad de bot estable, encolar **un** aviso al acreedor
vinculado dentro de la misma transacción que valida e inserta el pago.
`operationId` UUID identifica la intención web; replay no crea otro aviso.
Si el acreedor no tiene chat vinculado, el pago procede sin outbox. El worker
revalida destinatario y membresía antes de enviar; cambio de chat o baja de
la sesión descarta el aviso. En modo sin outbox se conserva el envío
heredado, sin promesa nueva de entrega. Nombres variables se escapan para
el formato HTML de Telegram. La respuesta distingue `queued`
de entrega efectiva; no debe afirmar que Telegram ya recibió el mensaje.
Pruebas libSQL: pago+outbox, replay, destinatario ausente, rollback ante fallo
de outbox y revocación antes del despacho. Sin esquema, datos beta/legacy,
cron ni despliegue; owner Codex de otras rutas/fallback ACT-09.

### Contrato ACT-09b — segunda API de pago web (16/10)

Actual: `POST /api/splits/sessions/[id]/payments` usa el writer financiero
común, pero no encola aviso para el acreedor. Esperado: con inbox, outbox,
worker y bot configurados, esta ruta usa la misma intención
`web.split.payment` y el mismo helper transaccional que
`POST /api/splits/payments`. El pago y un único aviso para el chat vinculado
se confirman juntos; un fallo al encolar revierte ambos. Repetir la misma
clave de operación no crea otro aviso. Sin chat vinculado o con el outbox
apagado, conserva el pago sin prometer aviso. La respuesta conserva los
campos de pago existentes y agrega `notificationQueued` (`null` en replay),
que no significa entrega. Un acreedor temporal no recibe un chat inferido.
El worker existente revalida membresía y chat antes del envío.

Archivos: ambas rutas de pago web, helper compartido y prueba de integración
libSQL de la ruta de sesión. Riesgos: la ruta antes era silenciosa; en modo
outbox activado ahora puede generar un aviso al acreedor. No cambiar esquema,
cron, bot, deployment beta, datos QA ni legacy. Pendiente ACT-09 para el
fallback Telegram sin contexto y otros envíos directos.

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

### Contrato H14g — reintento seguro del pago web (16/10)

El botón «Registrar pago» hoy inserta la fila y luego llama a Telegram; si
el cliente pierde la respuesta o falla ese aviso, repetir la acción duplica
el pago. El POST exigirá un UUID por intención, guardado en el índice único
existente de `split_payments.operation_id`. Un replay con mismo actor,
acreedor, sesión e importe devuelve éxito sin segunda fila ni segundo aviso;
la misma clave con otra carga devuelve 409. El cliente conserva clave y
carga tras respuesta incierta, sin reintentar automáticamente. La ruta
revalida acceso a la sesión antes de revelar un replay.

Un fallo del aviso después del commit no convierte el pago en un 500: la
respuesta distingue pago registrado de aviso no confirmado. No se promete
entrega diferida en este corte; el outbox durable de notificaciones de
splits queda con owner Codex/ACT-09. Cuerpos antiguos sin UUID reciben 400
y requieren recargar. No alterar bot, cron, esquema, datos ni despliegue beta
activo. Regresiones: clave ausente, replay, colisión de intención, fallo de
Telegram tras commit y unicidad DB; después puertas de repositorio.

### Contrato H14h — atribución explícita del pago (16/10)

La vista ofrece pagar «Todas las sesiones», pero la fila `split_payments`
siempre pertenece a una sesión y el servidor elige la primera en silencio;
también usa valor absoluto del saldo de sesión, por lo que podría aceptar
un pago allí donde el actor es acreedor. Cada alta web exigirá `sessionId`
explícito. El servidor valida la deuda negativa con esa contraparte y en
esa sesión; el monto no puede superar esa deuda. El selector solo muestra
sesiones con deuda y preselecciona una, con importe inicial limitado a ella.
Los importes de distintas sesiones se registran como pagos separados, nunca
como un pago global implícito. La clave H14g incluye la sesión elegida.

Archivos: POST web, modal y regresiones dirigidas. No cambia el cálculo
global, pagos históricos, Telegram, DB, cron o despliegue. La protección
contra dos operaciones *distintas* concurrentes que exceden la misma deuda
requiere un writer transaccional posterior y sigue con owner Codex.

### Contrato H14i — contener el endpoint de pago por sesión (16/10)

`POST /api/splits/sessions/[id]/payments` no tiene consumidor en el árbol
web actual, pero sigue accesible y hoy admite que cualquier miembro registre
un pago entre terceros, a un no miembro o mayor que la deuda, sin clave de
operación. Se conserva solo el alta manual del pago **propio**: el pagador
debe ser el actor autenticado, el acreedor debe ser miembro vigente de la
sesión, las identidades son exclusivas y distintas, y el importe es positivo
en centavos sin superar la arista de deuda actor→acreedor calculada con
gastos activos y pagos confirmados. La lectura/revalidación/inserción se
hacen en una transacción. UUID obligatorio y índice único existente para
replay del mismo pago; cambiar datos con la misma clave responde 409. El
replay requiere membresía vigente, incluso si la sesión cerró después.

La ruta no confirma comprobantes: `receipt_ocr` se rechaza hasta definir un
flujo de revisión y confirmación que no reduzca deudas por evidencia aún no
aceptada. Telegram mantiene su escritor actual; no se modifica en este
corte. Sin migración, cron, nuevos avisos, datos QA ni despliegue. Pruebas
con libSQL aislado: actor ajeno, tercero, sobrepago, replay, clave colisionada,
rollback y segunda clave secuencial tras pago parcial. La carrera de dos
claves sobre conexiones independientes exige un ensayo separado antes del
pase beta; una sola conexión local no modela ese límite de Turso.

### Contrato H14j — comprobantes pendientes fuera de balances (16/10)

Un `split_payments` con `confirmed_at NULL` es evidencia pendiente, no un
pago. Todas las lecturas que alimentan deuda o la acción de pagar (balance
global, API/vista de sesión, `/balances` y ambas etapas de `/pague`) deben
consultar solo pagos confirmados. El historial de pagos mostrará y contará
el mismo conjunto confirmado, aun sin filtros de fecha. No modificar filas
históricas ni la política conservadora que bloquea editar una sesión cuando
existe cualquier registro de pago; ese cambio requiere decisión aparte.
Sin cambios de esquema, avisos, cron, beta activa o legacy. Probar la
condición SQL con libSQL aislado y una fila pendiente junto a una confirmada
antes de cambiar consumidores.

### Contrato H14k — un solo writer transaccional para pagos web (16/10)

El POST web global todavía calcula una deuda fuera de la transacción y luego
inserta: dos claves diferentes pueden validar contra el mismo saldo. Ambos
POST web deben delegar en el mismo writer manual que, en una transacción,
comprueba sesión abierta, miembros vigentes, arista actor→acreedor y saldo
confirmado antes de insertar. La unicidad por `operation_id` sigue siendo la
fuente de replay; un segundo pago distinto por encima del remanente falla
sin avisar a Telegram. El aviso web solo ocurre tras un insert nuevo; falla
aparte y no cambia el commit. La API por sesión conserva su respuesta.

Una carrera real entre conexiones independientes de libSQL debe dejar como
máximo el importe adeudado registrado; si el perdedor enfrenta contención
transitoria, se devuelve error seguro y se documenta su semántica, sin
reintento automático ni segundo aviso. Probar primero el camino web sobre
libSQL aislado y ensayar dos conexiones; no tocar bot, cron, esquema, beta
activa ni legacy. Una prueba local no certifica serialización remota Turso.
