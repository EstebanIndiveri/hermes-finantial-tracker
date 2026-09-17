# Hermes Finance — auditoría técnica y funcional

Fecha: 16 de septiembre de 2026 UTC (noche del 15/09 en Argentina). Referencia: cambios del 15/09 en Argentina.
Código auditado: `7034107ff322b6331029f493cc0d871c3a2b586f`.
Estado: diagnóstico y propuesta para revisión; no se implementaron correcciones ni se desplegó.

Revisión posterior: [validación contra Copilot y documentación legacy](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/docs/audit/VALIDACION-LEGACY-Y-EJECUCION.md). Mantiene el dictamen central, matiza H08/H19, agrega H21 (permisos de borrado) y confirma por registros GitHub un deployment Production exitoso de este SHA. Esa confirmación no equivale a comprobar salud operativa o datos productivos.

## 1. Dictamen

Hermes tiene un producto funcional considerable, pero **no reúne actualmente condiciones demostradas de estabilidad para ampliar funcionalidades con confianza**. Los problemas exceden al proveedor de IA: hay reglas financieras duplicadas, confirmaciones sin identidad de operación, controles de acceso incompletos, migraciones no reproducibles y pruebas que no funcionan como barrera de publicación.

La hipótesis de regresiones por pérdida de coherencia está respaldada por el código. No hay evidencia suficiente para atribuirlas a un modelo concreto de Copilot, a su ventana de contexto o a Groq en particular. Sí hay evidencia de un proceso que permite corregir un recorrido sin verificar los otros que escriben o leen el mismo dinero.

La recomendación es mantener Next.js, TypeScript y, inicialmente, Turso/Drizzle. Construir un núcleo financiero único y hacer que web, texto, audio, OCR, botones y recurrentes lo usen. No se justifica una reescritura ni una migración de base por volumen sin mediciones.

**Prioridad del producto:** registrar correctamente, en el grupo correcto y una sola vez; informar con certeza qué quedó guardado; ofrecer corrección; mantener consistencia entre Telegram y dashboard.

## 2. Alcance, evidencia y límites

- Inventario completo del repositorio versionado: 313 archivos; aproximadamente 34.280 líneas TypeScript/TSX, incluyendo pruebas.
- Revisión profunda del circuito financiero y Telegram: webhook, handlers, callbacks, OCR, voz, Groq, esquema, migraciones, recurrentes, resúmenes, reintegros, compartidos y autorización asociada.
- Revisión transversal de dashboard, formularios, exportaciones, autenticación, configuración, notificaciones, tests y documentación de diseño/planes. La profundidad no fue idéntica para cada componente visual o archivo histórico; no equivale a certificar línea por línea todo el repositorio.
- Inspección de commits de las últimas correcciones; ejecución de TypeScript y suite Jest aislada; reproducciones sobre código real con dependencias simuladas; migración real sobre SQLite en memoria.
- No se consultaron datos financieros de producción, secretos, panel de Vercel, métricas de Groq ni estado real del webhook. No se enviaron mensajes ni se probaron vulnerabilidades contra el servicio público.
- En la auditoría inicial los despliegues eran contexto aportado por el usuario. La revisión posterior consultó registros GitHub: Production `6472028528`, SHA auditado, estado `success` a las 01:44:09 UTC del 16/09. No se comprobó el alias activo ni salud extremo a extremo. El HEAD incluye además una tercera corrección de recurrentes.
- La copia estaba limpia al comenzar y el HEAD no cambió durante los controles. Los únicos archivos agregados por esta auditoría están en `docs/audit/`.

Clasificación de evidencia:

| Marca | Significado |
|---|---|
| R | Reproducido localmente con código actual; se explicita si hubo mocks. |
| C | Defecto o condición visible en código, sin reproducción de extremo a extremo. |
| V | Riesgo o estado operativo pendiente de validación en entorno aislado/producción. |

Un defecto en código no prueba que ya haya dañado datos reales. La fase inicial debe determinar alcance histórico mediante consultas de solo lectura y conciliación.

## 3. Funcionalidades existentes y grado de madurez

| Área | Implementado | Evaluación actual |
|---|---|---|
| Cuenta | Usuario/contraseña, invitación, sesión firmada, onboarding, vinculación Telegram | Base útil; falta consolidar políticas y recuperación/revocación. |
| Grupos/dashboard | Grupo personal, miembros, roles, invitaciones, cambio de grupo | Existe; web y bot no resuelven el contexto de manera uniforme. |
| Movimientos | Alta web, texto/comandos, audio, ticket, confirmación, borrado lógico | Core desarrollado, pero repartido en rutas con validaciones diferentes. |
| Ingresos | Categoría `ingresos`, suma en resumen mensual, filtrado en gráficos | Hotfix parcial; no es un tipo de movimiento independiente. |
| Presupuestos | Categorías editables, límites duros/blandos, semáforos, metas | Riesgos de concurrencia y validaciones que no se repiten al confirmar. |
| Cotización | Ripio, edición manual, conversión ARS/USD | Política histórica implícita; recurrentes usan 1200 fijo. |
| IA textual | Intenciones, extracción de monto/categoría, consulta/simulación, recurrentes | Prompt amplio; extracción y decisión financiera insuficientemente separadas. |
| Voz | Descarga Telegram y transcripción Groq Whisper | Implementado; bypass del enrutamiento por tipo de chat y deduplicación. |
| OCR | OCR.Space, extracción Groq, fallback regex, edición/confirmación | Utilizable como propuesta supervisada; no confiable como extracción autoritativa. |
| Reintegros | Solicitud, pagador asignado/abierto, pago, cancelación, avisos | Persistencia y notificación acopladas; suite específica con fallos. |
| Recurrentes | CRUD, pausa, confirmación/omisión, pendientes, recordatorios | Desarrollo amplio con defectos financieros, de acceso y calendario. |
| Compartidos | Sesiones, participantes temporales, división, pagos parciales, balances | Cálculo por sesión reutilizable; cálculo global incorrecto para ciertos grupos. |
| Exportación | CSV y XLSX con movimientos/presupuestos | Existe sanitización CSV; ingresos aún aparecen como gastado en resumen XLSX. |
| Push | Suscripciones y emisor servidor | No encontré registro de service worker/pushManager en app/components/public; no asumir recorrido web completo. |
| Operación | Vercel crons, logs console, persistencia conversacional | Sin evidencia local de CI obligatorio, métricas de servicio o recuperación automatizada. |

## 4. Qué resolvieron los cambios recientes

### Registro por lenguaje natural — `603ffe5`

Agrega extracción determinista y pruebas de frases que antes fallaban. Es una mejora real frente al rechazo genérico, pero conserva IA como primer paso. El fallback solo entra ante `unknown` o confianza menor a 0,4, y ni siquiera se ejecuta si falta `GROQ_API_KEY`.

Además, pasa de rechazar ciertos mensajes a proponer gastos sobre cualquier monto/categoría detectados. Esto abre errores de significado: consultas, negaciones o alta de recurrentes pueden convertirse en propuestas de gasto normal. Hay confirmación en estos recorridos; no afirmo que cada mala interpretación se registre automáticamente.

### Ingresos — `81a486a`

`getMonthSummary` separa los movimientos cuyo slug es `ingresos`; el dashboard excluye esos movimientos del gasto/gráficos. Corrige el síntoma principal.

El modelo sigue sin `kind=income|expense`. Exportaciones y alertas diarias mantienen agregaciones que consideran todos los movimientos como gasto; las rutas de alta siguen aplicando presupuestos a categorías de ingreso. El ingreso configurado se suma a todos los ingresos registrados: si el usuario registra el mismo sueldo que ya configuró, puede duplicar su ingreso esperado. Esto último requiere una decisión de producto, no una resta automática.

### Consultas recurrentes — `3947fa0`

Agrega fallback para “Recurrentes” y “Pendientes”, con dos pruebas de handler. No cubre el ciclo completo de creación, autorización, confirmación, conversión monetaria y reflejo en dashboard. Su mensaje de commit reconoce una suite preexistente fallando: señal de publicación con una línea base degradada.

## 5. Hallazgos prioritarios

P0: contención inmediata por escritura no autorizada o exposición potencial. P1: integridad/core/release. P2: consolidación y experiencia. Son prioridades propuestas, no incidentes de producción confirmados.

### H01 — P0 · Cron con escritura sin autenticar [R/C]

[Ruta de recurrentes](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/cron/recurring/route.ts:18): `?userId=` ejecuta `createMonthlyExecutions` antes del control de secreto. Si hay autoconfirmación, el servicio puede crear movimientos. El middleware excluye `/api/cron` del login.

Reproducción con servicio simulado: una petición sin autorización retorna 200 e invoca la creación para el usuario recibido. No se ejecutó contra producción. Además, cron de recurrentes y recordatorios aceptan solicitudes sin secreto cuando la variable no está configurada.

Corrección: autenticar primero, fallar cerrado ante falta de configuración, retirar bypass público y proteger herramientas operativas por separado.

### H02 — P0 · Confirmación/omisión de recurrentes sin verificar propietario [R/C]

[Endpoint](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/recurring-expenses/executions/[id]/route.ts:36): valida que exista sesión, pero pasa únicamente el ID a `confirmExecution/skipExecution`. Los helpers tampoco reciben al actor ni comprueban membresía.

Reproducción del endpoint con sesión/servicio simulados: usuario A puede despachar confirmación de un identificador etiquetado como de B; retorna 200. La prueba demuestra ausencia del guard en la ruta; la explotación real depende de conocer un ID válido. El servicio debe verificar pertenencia dentro del mismo límite de autorización que la escritura.

### H03 — P0 condicional · Contexto Telegram y notificaciones multiusuario [C/V]

[Webhook](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/telegram/webhook/route.ts:263) confía en `active_telegram_group_id` sin revalidar membresía. [Remoción de miembro](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/groups/[id]/members/[userId]/route.ts) borra membresía sin limpiar ese puntero. Un exmiembro puede conservar contexto para leer/escribir por bot.

[Alerta diaria](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/cron/daily-alerts/route.ts) prioriza el mismo `TELEGRAM_CHAT_ID` global para todos los usuarios. Si está definido en un despliegue multiusuario, puede enviar resúmenes ajenos al mismo chat. No se inspeccionó si esa variable está activa en producción.

Corrección: resolver autorización vigente por operación y destinatario por usuario; invalidar contextos al remover miembros; verificar configuración sin mostrar secretos.

### H04 — P1 · No hay idempotencia uniforme ni atómica [C/R parcial]

[Webhook](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/telegram/webhook/route.ts:199): texto privado comprueba `bot_messages` antes de procesar y lo inserta después. Dos peticiones simultáneas pueden superar ambas la comprobación. Voz, grupos y callbacks no pasan por ese guard.

[Confirmación](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/personal-callback-handler.ts:287): leer estado y escribir `expense_processing` son pasos separados, no una adquisición atómica. Recurrentes también usan “consultar → insertar/actualizar” sin unicidad de ejecución por período.

El probe de voz entregó dos veces el mismo update y observó dos invocaciones al handler. Esto prueba duplicación del procesamiento, no dos movimientos en DB real.

Corrección: inbox con clave única `bot_id/update_id`, estado persistente y lease; ID de operación único también en el movimiento. Conservar reintentos para operaciones recuperables y respuesta ya emitida para duplicados.

### H05 — P1 · Confirmaciones pueden afectar otra propuesta [C]

[Tickets](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/personal-callback-handler.ts:180): `receipt:confirm` busca el último pendiente por usuario. No identifica el recibo del mensaje ni el grupo original. Pulsar Confirmar en ticket A después de enviar B puede registrar B. Cancelar rechaza todos los pendientes.

Los gastos usan `expense:confirm` genérico con un único estado por chat/usuario; un botón viejo puede aplicar al estado nuevo. La heurística “hay un movimiento de hace menos de dos minutos → ya registrado” puede afirmar éxito para otra operación.

Corrección: propuesta persistida con ID, actor, grupo, monto, tipo, versión, expiración y estado; callback enlazado a esa propuesta y transición atómica. Confirmación sin movimiento durable nunca debe comunicar éxito.

### H06 — P1 · Voz de grupo se procesa como operación personal [R/C]

[Rama de audio](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/telegram/webhook/route.ts:132) ocurre antes de detectar group/supergroup. Transcribe antes de validar vinculación y luego llama al handler personal con el grupo activo del usuario, respondiendo en el chat de origen.

Probe: audio de supergrupo fue despachado al grupo personal dos veces al repetir update. Riesgo de contexto incorrecto y de exponer datos personales en un chat compartido. Autenticar y enrutar antes de invocar STT; luego usar el mismo pipeline de texto.

### H07 — P1 · Fallback numérico produce montos incorrectos [R]

[Parser](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/expense-fallback.ts:77), ejecutado directamente:

| Entrada | Esperado | Actual |
|---|---:|---:|
| `gasté 1.234,56 en super` | 1.234,56 | 123.456 |
| `gasté mil quinientos en super` | 1.500 | 1.000 |
| `gasté treinta y cinco mil en super` | 35.000 | 5.000 |
| `compré 2 kilos por 5000 en super` | 5.000 | 2 |
| `cobré 50000 por venta de ropa` | ingreso | compras_personales |

El primer número no es necesariamente el monto; retirar todos los separadores destruye los decimales; el orden del diccionario prevalece sobre el significado de ingreso.

### H08 — P1 · El fallback decide gasto antes de distinguir intención [C/R parcial]

[Enrutamiento](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/handlers.ts:1613) usa monto/categoría sin excluir negación o simulación. “No gasté 5000 en super” y “¿puedo gastar 5000 en super?” producen ambos una extracción de gasto. Cuando la IA falla, el handler puede proponer registrarlo.

“Agregar recurrente Spotify 2500 día 10” puede entrar primero en monto-sin-categoría y retornar antes del fallback específico de recurrentes. `requires_reimbursement` se detecta por mera presencia de palabras, también en “sin reintegro”.

Corrección: gramática de comandos y clasificación de intención antes de extracción monetaria; ante ambigüedad, aclarar; conservar separada consulta/simulación/escritura.

Matiz legacy: exigir `/gasto` cuando falta `GROQ_API_KEY` estaba previsto expresamente en el diseño original. Un fallback natural sin IA es mejora propuesta, no incumplimiento de ese contrato. Esto no elimina los defectos de intención y extracción anteriores.

### H09 — P1 · Presupuesto validado antes de proponer, no al persistir [C]

[Preparación](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/handlers.ts:497) controla límites; [registro del callback](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/personal-callback-handler.ts:99) inserta sin repetir ese control. Cambiar monto/categoría o tener otro gasto entre propuesta y confirmación permite superar el límite. OCR confirma por el mismo helper.

La [API web](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/transactions/route.ts) tiene un TOCTOU explícitamente aceptado como deuda. Un control previo no protege contra concurrencia. Corregir en servicio transaccional compartido y probar dos escrituras concurrentes.

### H10 — P1 · Ingresos todavía no son coherentes en todos los consumidores [C]

[Dominio](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/finance/income.ts) depende de slug. [Exportación](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/export/route.ts) y [alertas](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/alerts.ts) acumulan ingresos como gastado. La alerta de categoría vuelve a inferir WARNING por porcentaje, incluso cuando resumen fijó estado OK para ingreso. La API de alta puede rechazar un ingreso por presupuesto duro.

Definir `kind` explícito, preservar clasificación histórica, quitar presupuesto/reintegro de ingresos donde no corresponda y usar una única proyección en todas las superficies.

### H11 — P1 · Recurrentes usan cotización fija y categoría sin aislamiento [C]

[Creación contable](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/recurring-queries.ts:656): `exchangeRate = 1200`. El fallback de categoría busca “imprevistos” sin `group_id`. Grupo nullable y contexto del usuario Telegram se usan también para crear desde web.

Un recurrente puede tener conversión diferente a un gasto idéntico web o relacionarse con categoría ajena. Debe resolverse contexto, tipo de cambio del período y categoría activa del grupo mediante el mismo servicio financiero.

### H12 — P1 · Calendario de recurrentes no implementa lo que admite la API [C]

[Generador](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/recurring-queries.ts:369) crea una ejecución por mes para todos y recorta todo día mayor que 28. La API admite weekly/yearly y días hasta 31. No hay índice único de recurrente/período ni transacción entre ejecución y movimiento.

[Vercel](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/vercel.json) configura recordatorios pero no el cron `/api/cron/recurring`. Consultar pendientes desde bot sí invoca creación; eso no garantiza generación mensual autónoma. Verificar si existe programación externa.

### H13 — P1 · Balances globales atribuyen deudas ajenas [R]

[Cálculo global](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/splits/global-balances.ts:97) convierte el saldo de cada otro miembro en deuda bilateral con el usuario consultante.

Fixture ejecutado sobre función real con DB simulada: A pertenece a la sesión; B pagó 100 solo por C; A no debe nada. El resultado para A dice que debe 100 a B y que C le debe 100. El neto final de A es cero, pero sus obligaciones bilaterales son falsas.

Derivar la vista de deudas de una política explícita de liquidación por sesión, filtrando aristas donde intervenga el usuario. No inferir deuda bilateral a partir del saldo de terceros. Probar al menos 3–5 participantes y pagos cruzados.

### H14 — P1 · Compartidos permite inconsistencias de suma y edición [C]

[Alta web](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/splits/sessions/[id]/items/route.ts) no comprueba que pagos y cuotas sumen el total, porcentajes sumen 100, ni que todos los IDs pertenezcan a la sesión. Tres inserts separados pueden dejar un split parcial.

[Edición](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/splits/items/[id]/route.ts) cambia `total_amount` sin recalcular cuotas/pagadores. La cancelación y los pagos previos requieren una política explícita. Hay un camino Telegram que sí usa transacción; no alcanza para proteger los otros.

### H15 — P1 · OCR puede extraer subtotal o número de ticket [R]

[Fallback OCR](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/ai/parse-receipt.ts:44) hace match de TOTAL dentro de SUBTOTAL y, como último recurso, usa el mayor número.

- “SUBTOTAL 1000 / DESCUENTO 100 / TOTAL 900” devuelve 1000.
- “TICKET 123456 / GRACIAS POR SU COMPRA” devuelve 123456 sin total real.

La confianza baja no impide siempre mostrar ese monto como propuesta normal. `isReliable` de OCR.Space no se utiliza en la decisión personal; el prompt recibe solo los primeros 2000 caracteres y puede perder el total al final. Se muestra fecha extraída, pero el callback registra fecha/mes actuales y no enlaza `transaction_id` del import.

### H16 — P1 · Migraciones no reconstruyen la aplicación actual [R]

[Journal](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/migrations/meta/_journal.json) registra solo 0000 y 0001_violet. Ejecuté el migrador Drizzle en memoria: crea 12 tablas contando el journal; faltan recurrentes, ejecuciones, estados conversacionales, compartidos, reintegros y push.

Tener otros SQL en la carpeta no implica que `db:migrate` los ejecute. El esquema TypeScript tampoco sustituye al esquema desplegado. Reconciliar con una copia aislada de producción; no aplicar todos los SQL manuales sin revisar solapamientos.

### H17 — P1 · Persistencia y notificación no tienen recuperación consistente [C]

[Alta web](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/transactions/route.ts) inserta y luego crea/notifica reintegro. Una excepción posterior al insert puede devolver error aunque el movimiento exista. En Telegram, errores capturados retornan 200 y el registro de mensaje puede impedir reintentar trabajo incompleto.

Separar commit financiero de entrega: outbox durable, reintentos acotados, estados visibles y respuesta con ID. Telegram reintenta solicitudes webhook no-2xx; confirmar recepción debe significar que el evento quedó durablemente aceptado, no que fue descartado tras un error. [Bot API oficial](https://core.telegram.org/bots/api#setwebhook).

### H18 — P1 · Barrera de calidad no reproducible [R/C]

- Shell predeterminado: Node 14.16.0, incompatible con herramientas instaladas; el intento inicial falla cargando `node:util/types` y aun devuelve exit code 0.
- Con Node 22.23.2, Jest sin config explícita falla porque existen `jest.config.js` y `jest.config.ts`.
- Forzando config JS y excluyendo E2E: **58 suites pasan, 8 fallan; 482 tests pasan, 17 fallan, 499 total**.
- `tsc --noEmit --incremental false`: pasa. `tsconfig` excluye `__tests__`, por lo que este resultado no valida el conjunto de pruebas.
- `next lint`: falla porque interpreta lint como directorio en la versión instalada.
- No hay workflow CI versionado encontrado; no se verificaron reglas de protección remotas.
- Playwright apunta por defecto a producción y tiene credencial de fixture en código. No fue ejecutado. Si esa cuenta existe en producción, revisar su alcance y rotar.

Parte de los tests inspecciona cadenas del fuente o `Function.toString()`, o mocks del router desactualizados. Eso puede fallar ante un refactor correcto y pasar sin validar comportamiento real. Otros tests verifican helpers aislados sin cubrir webhook → confirmación → DB → saldo.

Detalle de las ocho suites fallidas; la segunda ejecución con reporte JSON reprodujo los mismos totales:

| Suite | Tests fallidos | Señal observada |
|---|---:|---|
| status-badge-and-recurring-list | 1 | Aserción sobre texto del código del componente. |
| personal-reimbursements | 2 | Expectativa de estado antigua y mock sin getReimbursementByTransactionId. |
| payment-history-page | 3 | Contexto/mocks de router y search params insuficientes. |
| reimbursements/[id]/pay | 5 | Espera lógica de pago pero recibe 401; revisar contrato de autenticación del fixture. |
| reimbursements/payment-info | 2 | Helpers de borrado no cumplen expectativas actuales del test; investigar implementación y fixture. |
| reimbursements-dashboard | 1 | Search params no disponibles en el render del test. |
| export-panel-ui | 1 | Verificación de integración de exportación falla; revisar ubicación/contrato del componente. |
| settings-page-month-param | 2 | Busca código del cliente en el wrapper de página. |

Estos 17 fallos no deben reportarse como 17 bugs funcionales confirmados. Son 17 verificaciones fallidas que hoy reducen la confianza de release.

### H19 — P2 · Interfaz y períodos inconsistentes [C]

[Formulario](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/components/forms/HermesExpenseForm.tsx) deshabilita toda categoría CLOSED, incluso sin límite duro: impide seleccionar la categoría para la excepción que la API admite. La revisión legacy encontró reglas contradictorias sobre CLOSED y excepciones blandas: la inconsistencia existe, pero debe aprobarse cuál comportamiento prevalece antes de corregir UI/API. Placeholder “47.000” y `parseFloat` pueden inducir lectura como 47; hace falta normalización explícita del formato argentino.

[Recurrentes UI](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/components/recurring/recurring-list.tsx:102) recibe `month` como `_month` y lo ignora. La API usa contexto de grupo Telegram para creación, en vez del grupo web seleccionado. El alta de movimiento admite fecha y mes independientes y fechas que solo cumplen regex; OCR muestra una fecha que no conserva.

### H20 — P2 · Datos históricos, privacidad y observabilidad [C/V]

Hay dos SQLite y un backup JSON versionados. No se inspeccionó su contenido financiero: confirmar si son fixtures o datos reales, establecer retención y retirar del versionado por un cambio revisado si corresponde.

`raw_text`, OCR y resultados de parseo pueden contener información personal; algunos errores loguean respuestas completas. Faltan política de retención, redacción, trazabilidad por operación y métricas. Groq/OCR/Telegram no tienen deadlines explícitos en las llamadas revisadas. El login usa rate limiting en memoria.

El transporte de identidad por headers de respuesta en middleware merece consolidación y tests reales; **no se declara automáticamente un bypass**: la versión local de Next copia esos headers a la request. La recomendación es usar forwarding explícito, limpiar headers entrantes y validar autorización en el servicio. [NextResponse oficial](https://nextjs.org/docs/app/api-reference/functions/next-response).

## 6. Evaluación de IA, voz y OCR

### Flujo efectivo

Texto/comando → handlers → Groq si no resolvió comando/estado → JSON + Zod → fallback según intención/confianza → propuesta → callback → escritura.

Audio → descarga → Whisper → handler personal → mismo parser textual. Foto → caption con número puede evitar OCR → OCR.Space → Groq/regex → propuesta → callback.

Modelos por defecto en código: `llama-3.3-70b-versatile` para extracción; `whisper-large-v3-turbo` para voz en español. Variables `GROQ_MODEL` y `GROQ_WHISPER_MODEL` pueden reemplazarlos; **no se verificó el valor efectivo en producción**.

### Lo acertado

- Adaptador Groq pequeño, temperatura cero y validación Zod.
- Transcripción reutiliza parte del flujo textual.
- OCR permite revisión humana y edición.
- Fallback determinista y funciones puras recién añadidas permiten construir regresiones.
- Estado conversacional en DB, mejor que depender de memoria de una instancia.

### Lo insuficiente

- JSON pedido por prompt; no `response_format` estructurado.
- Una cifra de confianza autodeclarada decide aceptación desde 0,4; no es una probabilidad calibrada.
- El schema permite campos opcionales sin contrato discriminado por intención; monto/día no están suficientemente acotados ahí.
- Catálogo de categorías hardcodeado, aunque el producto permite categorías personalizadas.
- No hay corpus versionado de mensajes reales anonimizados, negativas, múltiples cifras y dialecto argentino.
- Falta distinguir errores de proveedor, JSON, semántica, falta de contexto y rechazo de reglas.
- Voz en grupo, errores de descarga y límites de tamaño/duración no tienen una política transversal.
- OCR es evidencia de un documento aportado, **no prueba de transferencia efectivamente acreditada**.

### Mejora recomendada

Comandos/botones exactos primero. Normalización común. IA solo propone intención/campos ante lenguaje libre. Validación semántica independiente: moneda, monto, categoría del grupo, fechas, negación y ambigüedad. Si falta certeza, preguntar un dato concreto; nunca fabricar un monto para completar el flujo.

Usar structured outputs cuando el modelo seleccionado los soporte, manteniendo validación de negocio. La compatibilidad depende del modelo y debe verificarse antes de cambiarlo; estructura correcta no garantiza interpretación correcta. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs).

Comparar el modelo actual con candidatos sobre el mismo dataset, midiendo monto/tipo/grupo correctos y falsas escrituras, no solo JSON válido. Elegir por calidad/costo/latencia medidos. No hay fundamento para afirmar que “un modelo más grande” solucionará autorización, duplicados o cálculo de saldos.

OCR: detectar campos con ubicación/línea, preferir TOTAL A PAGAR exacto, excluir subtotal/IVA/códigos/fecha, usar controles aritméticos cuando existan, no elegir el mayor número. Si el total no es verificable, pedir ingreso manual. Mostrar tipo, monto, categoría, grupo, fecha y fuente antes de confirmar.

## 7. Calidad, documentación y escalabilidad

**Fortalezas:** TypeScript estricto; reglas puras en finanzas y balances; validaciones Zod en varias fronteras; cookies httpOnly, HMAC y bcrypt; webhook con comparación timing-safe; soft delete; bastante cobertura unitaria existente; funcionalidades útiles y ya usadas. Hay material para estabilizar sin descartar el trabajo.

**Debilidad principal:** el límite entre canal, dominio y persistencia está roto. Dos archivos personales de Telegram suman 4205 líneas; recurrentes concentra otras 905. Módulos de transporte deciden permisos, parsean, consultan presupuestos, guardan y notifican. La misma regla debe recordarse en múltiples sitios.

**Escalabilidad de desarrollo:** insuficiente hoy. Más features aumentan interacciones sin contratos ni pruebas transversales; es consistente con las regresiones reportadas.

**Escalabilidad de concurrencia:** insuficiente hoy por read-then-write, estado único por conversación y falta de unicidad/atomicidad. Es un problema de corrección aun con pocos usuarios simultáneos.

**Escalabilidad de capacidad:** no medida. Hay consultas sin paginar, agregaciones mensuales, balances globales con consultas por sesión y crons que recorren usuarios secuencialmente. Esto necesita métricas y carga antes de elegir otra infraestructura.

**Escalabilidad operativa:** no demostrada. Una DB fresca no reconstruye el estado requerido; faltan observabilidad, reintentos durables y evidencia de restore/rollback.

Documentación abundante, pero no confiable como única fuente:

- README describe Next 15 frente a dependencia 16, autenticación monousuario obsoleta y scripts de test inexistentes.
- README dice tipo de cambio diario; `vercel.json` lo programa el primer día del mes.
- Planes conservan casillas abiertas para features que ya existen; no constituyen un backlog actualizado.
- Spec de compartidos contiene signos de pagos opuestos a los del cálculo implementado; el código por sesión reduce correctamente deuda al pagar, la documentación debe corregirse.
- Se prometen verificaciones y flujo de PR en documentos; no hay evidencia local de enforcement.
- La documentación de voz admite fallos preexistentes al publicar. La integración del bot fue relegada a QA manual en especificaciones históricas.

No se puede afirmar un porcentaje de cobertura ni ausencia de vulnerabilidades de dependencias: no se generó coverage ni se completó auditoría de suministro. `nanoid` se importa sin declararse directamente en package.json; resolver dependencias directas y reproducibilidad usando el lockfile existente.

## 8. Backlog reconstruido

**Ya desarrollado, requiere consolidación:** todo el core de movimientos, ingresos, grupos, recurrentes, reintegros, OCR, voz, compartidos y exportaciones. No conviene contabilizar estas correcciones como “nuevas features”.

**Prometido/parcial por contrastar:** recorridos de edición/cancelación en grupos y confirmación de cierre; frecuencias semanal/anual; push navegador; calendario histórico recurrente; generación mensual autónoma. La especificación es más amplia que las garantías actuales.

**Histórico post-MVP documentado:** export PDF de sesiones, configuración de intervalos de alerta, vincular sesiones Telegram desde web, avisos privados a deudores, estadísticas por evento, upgrade de temporales. Algunas piezas relacionadas existen; cada propuesta debe reevaluarse con criterio de aceptación antes de declararla pendiente o completa.

**Nuevo backlog obligatorio de estabilidad:** H01–H20, dominio monetario explícito, idempotencia, autorización central, conciliación histórica, corpus IA, integración contra DB real, inbox/outbox, migraciones reproducibles y validación de releases.

## 9. Evidencia ejecutable y controles pendientes

[Reproducciones offline](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/docs/audit/reproduce-findings.cjs): ejecutar desde raíz con Node 22 compatible:

```sh
node docs/audit/reproduce-findings.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
TURSO_DATABASE_URL=file::memory: node node_modules/jest/bin/jest.js --config jest.config.js --runInBand --testPathIgnorePatterns=/e2e/
```

El script de reproducciones imprime resultados observados, no es una suite que hoy deba aprobar. Carga código real; simula proveedores/DB salvo la migración, que usa libSQL real en memoria. No carga archivos .env ni llama servicios externos.

No ejecutado: build de release con configuración aislada, E2E, pruebas de carga, contrato vivo de proveedores, restauración de backup, revisión de DB/despliegue real y revisión remota de CI/protección de ramas. No se presentan como aprobados.

El [plan de acción](/Users/estebanindiveri/Downloads/hermes-finantial-tracker/docs/audit/PLAN-DE-ACCION.md) convierte el diagnóstico en fases y condiciones para una certificación interna de release. No existe una certificación universal de “cero bugs”; sí puede exigirse un conjunto verificable de garantías, pruebas y métricas por versión.
