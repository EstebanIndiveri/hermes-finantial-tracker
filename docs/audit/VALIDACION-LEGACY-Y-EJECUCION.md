# Hermes — validación del informe y ejecución segura

Fecha: 16/09/2026. Base: `7034107ff322b6331029f493cc0d871c3a2b586f`.
Estado: propuesta para aprobación. No se cambiaron código de aplicación, infraestructura, secretos, datos ni webhook.

Este documento actualiza la secuencia del plan anterior y registra la revisión del informe de Copilot aportado por el usuario. No reemplaza el detalle técnico H01–H20 del diagnóstico; agrega H21 y matices explícitos.

## 1. Veredicto tras contrastar Copilot y documentación legacy

El diagnóstico central se sostiene: hay un producto valioso y utilizable, pero faltan garantías transversales para cambiarlo con seguridad. No hay evidencia para atribuir los problemas a un modelo específico. Cambiar de modelo sin contratos, pruebas y disciplina de publicación no resuelve la causa.

Copilot confirma varios hallazgos y propone una dirección correcta: contener autorización, corregir parsing y consolidar el dominio. Sin embargo, su respuesta no constituye una certificación independiente: sus reproducciones son afirmaciones de su informe; mis reproducciones y límites están documentados por separado. Tampoco su propuesta de tres tareas cubre continuidad operativa, migraciones ni rollback.

| Afirmación de Copilot | Validación y ajuste |
|---|---|
| H01/H02 son reales | Coincide con revisión de código y reproducciones locales previas. No se explotó producción; falta medir exposición y daño histórico. |
| La urgencia baja si es monousuario | Hipótesis no sustentada: el usuario describe miembros usando el dashboard y bot. Autorización y exactitud importan incluso con un solo usuario; el alcance real se verifica, no se presupone. |
| CSV/PDF pendiente | CSV y XLSX ya existen en `app/api/export/route.ts` y `lib/export/generate.ts`. PDF es una ampliación distinta. Corregir ingresos en exportaciones antes de crear otro formato. |
| Editar/borrar/historial de recurrentes pendientes | Existen callbacks de edición de monto, confirmación de borrado e historial en `personal-callback-handler.ts:953–1143`. No equivalen a edición completa ni calidad certificada; clasificarlos como implementados parcialmente / por validar, no ausentes. |
| USD/ARS pendiente | Hay montos ARS/USD, conversión y vista USD. Moneda original editable, cotización histórica auditable y contabilidad multimoneda completa son otro alcance. |
| Push: VAPID sin configurar | No verificamos secretos de producción. Código de suscripciones/emisor existe; recorrido cliente completo no demostrado. No afirmar estado de VAPID sin evidencia operativa. |
| Migraciones bloqueadas por Node 14/Xcode | Node 22.23.2 instalado permitió ejecutar Jest y libSQL en memoria. Ya se demostró que el journal no reconstruye tablas necesarias. No es un bloqueo general pendiente de Xcode. |
| `docs/codebase/*` actualizado | Es un mapa útil, no una especificación normativa validada: contiene TODO, preguntas y referencias a sesiones locales; no inventaría H01/H02 como resueltos por su ausencia allí. |
| README cron diario incorrecto | Sí hay discrepancia; el diseño original especifica mensual. No cambiarlo a diario automáticamente: decidir política de cotización y documentar lo vigente. |
| 17 tests fallan | Correcto como baseline con configuración explícita: 58 suites pasan / 8 fallan; 482 tests pasan / 17 fallan. No son 17 bugs funcionales ni evidencia de que lo demás esté certificado. |

### Qué modifica la documentación legacy en mi informe

1. **H19: categorías CLOSED.** El diseño del 27/05 admite excepción con límite blando, pero también dice que CLOSED bloquea siempre. El desacuerdo UI/API existe; la conducta deseada es una decisión pendiente, no una regla inequívoca incumplida. Mantener comportamiento público hasta acordar ejemplos de aceptación.
2. **H08: falta de clave Groq.** Volver a `/gasto` sin clave es una decisión original explícita. Habilitar lenguaje natural determinista sin IA es una mejora de resiliencia, no una regresión respecto de aquel contrato. Los errores de negación, intención y monto siguen siendo defectos actuales.
3. **Períodos históricos.** Una especificación temprana los prohibía; la UI actual permite cambios. No restablecer restricciones antiguas sin decisión de producto. Fijar contrato actual aprobado.
4. **Migraciones H16.** Planes legacy prescriben SQL manual y evolución por etapas. Eso explica la divergencia del journal; no demuestra que falten esas tablas en producción ni elimina la necesidad de reconstrucción reproducible.
5. **Ingresos H10.** La especificación de exportación ya prometía distinguir gasto/ingreso. El código no tiene un tipo financiero explícito en el movimiento exportado: es una integración incompleta, no solo mejora cosmética.
6. **OCR H15.** El plan de fallback ya incluye selección del mayor número: parte del defecto proviene del diseño. Implementar fielmente un plan no garantiza que el plan sea correcto.
7. **Nuevo H21 — P1, autorización de borrado dentro del grupo.** La matriz aprobada de grupos permite a Member editar/borrar solo lo propio; Owner/Admin pueden lo ajeno. `app/api/transactions/[id]/route.ts:14` comprueba membresía y luego borra cualquier transacción del grupo sin verificar autor ni rol. Evidencia estática, no explotación productiva. Agregar prueba negativa Member-A → movimiento-B y revisar la misma política en `/borrar_ultimo` y callbacks.

Fuentes locales principales: `docs/superpowers/specs/2026-06-02-multiuser-groups-phase1-design.md`, `2026-06-02-categorias-editables-design.md`, diseño inicial del 27/05, especificaciones de exportación y deuda/split, planes de recurrentes, reintegros y fallback OCR. La revisión prioriza contratos pertinentes, no certifica cada línea de todos los planes históricos.

**Jerarquía propuesta:** código describe comportamiento observado; contrato aprobado describe comportamiento deseado; pruebas demuestran cumplimiento. Cuando discrepan, registrar decisión. Los planes legacy pasan a archivo histórico con vínculo a su reemplazo; no borrarlos ni tratarlos como instrucciones vigentes de ejecución.

## 2. Qué está realmente publicado

Consultas de solo lectura a GitHub reportan:

- Deployment Production `6472028528`, commit `7034107ff322b6331029f493cc0d871c3a2b586f`, estado `success`, creado `2026-09-16T01:44:09Z` (15/09 22:44:09 Argentina).
- Es el más reciente de los tres deployments devueltos en esta consulta. Los anteriores corresponden a `21cde82` y `234a07a`.
- [Registro Vercel asociado al commit](https://vercel.com/eindi-acme/hermes-finantial-tracker/Ga5jL5Vh7tP2NoaVRw6cobcTDUVx).

Esto confirma publicación registrada, **no** salud del dominio activo, éxito de todos los flujos, contenido de DB ni backups. No hace falta desplegar de nuevo a ciegas para conservar legacy. Primero verificar alias/dominio y hacer smoke controlado con autorización. No se realizó ninguna publicación en esta revisión.

## 3. Continuidad: legacy productiva y evolución aislada

| Recurso | Legacy productiva | Evolución / staging |
|---|---|---|
| Código | Release identificable del SHA publicado; `main` sigue producción inicialmente | Worktree y rama `codex/stabilization-foundation`; ramas pequeñas por cambio |
| Vercel | Proyecto, dominio y configuración actuales | Segundo proyecto/URL con acceso restringido; sin promoción automática a producción |
| DB | La actual, única fuente de verdad de usuarios y dinero real | DB independiente con credenciales propias; datos sintéticos por defecto |
| Telegram | Mismo bot y webhook actuales | Otro bot/token/webhook y usuarios/chats de prueba |
| Sesiones | Conservar IDs y claves necesarias para compatibilidad | Secretos/cookies independientes; sin invitaciones ni cuentas reales habilitadas por accidente |
| Integraciones | Configuración productiva inventariada sin exponer valores | Credenciales/cuotas de prueba; notificaciones y crons bloqueados por defecto |

Una rama Git o preview **no aísla la DB**. El proceso de prueba debe rechazar URLs/IDs de DB y bot productivos, incluso si alguien copia un `.env`. Los E2E actuales no deben correr con su destino productivo por defecto. Prohibir deploy productivo y migraciones desde scripts de tests.

Turso permite crear una DB independiente desde otra; no sincroniza ni fusiona automáticamente sus cambios. Se propone usarla para ensayos autorizados, no como sustituto futuro de la DB activa. Verificar límites del plan y credenciales con alcance mínimo. [Documentación Turso](https://docs.turso.tech/features/branching).

Si se necesita una copia real para reproducir un caso: autorización, acceso restringido, cifrado, plazo de retención y anonimización. Quitar sesiones/tokens, destinos Telegram/push y bloquear cualquier envío antes de iniciar procesos. No subir dumps al repositorio ni enviarlos a modelos.

**Reglas innegociables:**

- No ejecutar dos agentes editando el mismo checkout. Acordar cierre/punto estable de Copilot antes de crear la línea base; no interrumpirlo o enviarle comandos sin permiso.
- No cambiar ahora el webhook del bot real a staging.
- No reemplazar la DB productiva por una copia antigua de staging.
- No cambiar de stack, proveedor de DB, login ni IDs para poder refactorizar.
- Legacy recibe solo hotfixes acotados y probados; se incorporan también a evolución. Congelar features nuevas, no correcciones de seguridad.
- Antes de cada publicación: revalidar SHA, estado de trabajo y drift del esquema, pues esta auditoría es una fotografía, no un bloqueo del repositorio.

## 4. Plan revisado y entregables por fase

Estimación orientativa para una línea principal de implementación asistida y revisión: 21–37 jornadas efectivas, más 14 días de observación. No es una promesa de calendario; recalibrar al conocer esquema real y restauración. El uso de modelos no elimina tiempos de pruebas y piloto.

| Fase | Duración orientativa | Entrega verificable / puerta de salida |
|---|---|---|
| A. Preservar y aislar | 1–3 jornadas | Manifiesto de release, backup restaurado en destino nuevo, inventario de schema/config, staging separado, pruebas incapaces de tocar prod |
| B. Contener y hacer reproducible | 2–4 | H01/H02 y controles relacionados H03/H21; parser H07 sin reinterpretaciones silenciosas; Node/config Jest/lint/CI reproducibles; ningún P0 abierto |
| C. Núcleo financiero | 5–8 | Contrato ingreso/gasto, contexto autorizado, validación transaccional, idempotencia; web y Telegram usan el mismo servicio; export/saldo coherentes |
| D. Telegram confiable | 4–6 | Inbox/outbox durables, IDs/versiones de propuestas, voz/grupos/callbacks equivalentes, reintentos seguros, OCR vinculado a operación |
| E. IA/OCR y recurrentes | 4–6 | Corpus argentino, extracción supervisada, proveedores intercambiables, calendario/cotización correctos, medición de calidad y costo |
| F. Conciliación y promoción | 5–10 | Ensayos de migración y reversión, comparaciones sin escrituras, piloto acotado, métricas y QA aceptados, expansión progresiva |

Las fases no son un único PR gigante. Cada una entrega cortes funcionales pequeños. C y D requieren diseñar juntas la identidad de operación: idempotencia no puede quedar pendiente hasta después de conectar todos los writers. Los casos críticos de ingresos H10 se contienen antes si siguen afectando uso real. No esperar al final para corregirlos.

### Primer lote propuesto para autorizar

1. **PR-00, salvaguardas:** manifiesto del SHA/despliegue; inventario sin secretos; etiqueta propuesta `legacy/2026-09-15-7034107`; procedimiento de respaldo y restauración con evidencia; aislamiento staging. Creación remota/tag y recursos solo tras aprobación.
2. **PR-01, barrera de calidad:** fijar runtime probado, resolver doble config Jest, comandos lint/test/build reales y CI; caracterizar/reparar las 17 pruebas sin borrarlas para “poner verde”; proteger E2E de producción. Regresión antes de modificación.
3. **PR-02, seguridad legacy:** auth cron fail-closed antes de toda escritura; actor/grupo/rol en recurrentes, pertenencia Telegram y borrado; revisar también toggle/delete callbacks, no solo confirm/skip. Publicación urgente separada con revisión y smoke.
4. **PR-03, registro confiable:** parser compartido probado con decimales, palabras, unidades, negación e ingresos; incertidumbre pide aclaración. Tests de handler + confirmación + DB + resumen, no solo helper.
5. **PR-04, contratos y primera extracción:** servicio compartido de registro con compatibilidad legacy; empezar por un caso completo gasto/ingreso. No mover miles de líneas sin demostrar equivalencia.

PR-01 y pruebas específicas de PR-02 pueden trabajarse sin esperar a sanear toda la suite para contener un P0, pero cualquier excepción debe documentar checks ejecutados, fallos preexistentes y aprobación; nunca publicar con fallos nuevos desconocidos. El parche legacy no incluye migración de dinero ni cambio de modelo IA.

## 5. Migración y rollback sin perder actividad real

### Respaldo antes del primer cambio

Inventariar tablas, índices, constraints, versión de schema, cuentas/grupos/membresías, vínculos Telegram, movimientos activos/borrados, recibos, reintegros, compartidos, recurrentes/ejecuciones y estado conversacional. Registrar conteos, huérfanos y totales por grupo/mes/tipo. No exportar contraseñas ni tokens al informe.

Crear backup consistente con método admitido por el proveedor; restaurar en **otra DB** y comprobar lectura y conciliación. Un archivo descargado no demuestra recuperabilidad. Definir RPO/RTO tras ensayo; objetivo inicial propuesto RPO ≤15 minutos y RTO ≤60 minutos sujeto a capacidad/costo, no garantizado hoy. Identificar responsable de recuperación y acceso de emergencia.

### Expandir → migrar → comparar → activar → retirar

1. Reconstruir una instalación vacía mediante migraciones versionadas. Para la DB existente crear un baseline validado contra su schema real; no marcar migraciones como aplicadas ni ejecutarlas por duplicado por suposición.
2. Cambios aditivos primero: tablas/columnas nuevas sin eliminar las que legacy requiere. Añadir unicidad solo tras detectar/conciliar duplicados; no borrar para satisfacer un índice.
3. Backfills por lotes, idempotentes, con checkpoints, versiones y conciliación. Para dinero conservar valor original y regla de conversión/redondeo; fechas, IDs, autoría y pertenencia no se regeneran. Ingresos históricos dudosos se revisan, no se reclasifican masivamente por texto.
4. Mientras ambos códigos puedan atender tráfico, un adaptador de compatibilidad mantiene representaciones necesarias dentro de la misma transacción. **Una sola escritura lógica por operación**, no dos aplicaciones independientes escribiendo “para comparar”. Probar escritura legacy leída por nuevo y viceversa.
5. Comparar cálculos en modo sombra, solo lectura y sin notificaciones. Se aceptan diferencias de bugs conocidos únicamente con caso, importe y aprobación; no exigir copiar un error para igualar números.
6. Piloto mediante routing determinista y feature flag por grupo/conjunto de sesiones vinculadas. Todos sus canales —web, texto, audio, callbacks, cron— deben respetar la misma decisión. En compartidos con participantes cruzados, ampliar la unidad de piloto o dejar el módulo completo en legacy; no mezclar contabilidades.
7. Mantener un solo receptor productivo de Telegram. Una release puente puede rutear internamente a legacy/nuevo con inbox común; nunca repartir el mismo update entre dos escritores. Propuestas abiertas siguen en su versión o expiran explícitamente; no reinterpretar botones antiguos sobre otro gasto.
8. Retirar columnas/código viejos solo en una release posterior, al cerrar ventana de reversión y probar que no quedan lectores/escritores legacy.

### Si algo falla

Desactivar nueva ruta para nuevos comandos, drenar o recuperar operaciones en curso por su ID, volver al último código **compatible con el esquema y datos actuales**. El deployment original archivado no es necesariamente el rollback correcto después de evolucionar el esquema; conservar una release puente validada.

Vercel ofrece rollback del deployment; se debe ensayar su compatibilidad, no confundirlo con reversión de datos. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback).

**No restaurar un backup sobre la DB activa como rollback rutinario:** descartaría movimientos registrados después de la copia. Ante corrupción real, detener escrituras afectadas, restaurar a destino aparte, reconciliar/reaplicar operaciones posteriores desde registro durable y aprobar el corte. Toda corrección de importes debe dejar trazabilidad. Mientras no exista esa capacidad, no prometer pérdida cero ante desastre.

## 6. Criterios de liberación y estabilidad

Cada defecto H01–H21 debe tener prueba, corrección, verificación y evidencia; lo condicionado por configuración debe verificarse o mitigarse antes de cerrar. No basta marcar tickets como completados.

- Acceso: matriz dueño/admin/miembro/exmiembro, ID ajeno, chat/grupo equivocado, sin sesión y cron sin secreto; ninguna escritura ni revelación no autorizada en pruebas.
- Dinero: montos exactos, ingreso suma/gasto resta, borrado revierte correctamente, mismo resultado en dashboard/export/bot; ningún redondeo no documentado.
- Concurrencia: doble click, update repetido, dos workers, timeout después de commit, presupuesto concurrente, confirmaciones cruzadas, propuesta expirada; una sola operación efectiva.
- Compatibilidad: usuarios y vínculos existentes siguen funcionando; no pérdida de IDs, propuestas ni historial; reversión ensayada con escrituras posteriores a la migración.
- Calidad: unitarias, integración contra DB real aislada, contratos y E2E críticos pasan en CI; typecheck/build/lint reproducibles; ninguna prueba accede a prod.
- IA: corpus versionado inicial ≥200 casos con holdout, incluyendo incidentes reales anonimizados y variaciones argentinas; 100% de regresiones críticas pasan. Propuesta inicial ≥98% de exactitud conjunta monto/tipo/categoría/grupo en mensajes inequívocos y aclaración segura en ambiguos; medir por canal, no confundir éxito JSON con exactitud.
- Operación: métricas por operación/canal, errores de proveedor, latencia, duplicados evitados, conciliación y outbox; logs redactados. Establecer SLO tras baseline de tráfico, sin inventar capacidad actual.
- Piloto de 14 días sin incidencia crítica conocida, sin diferencias inexplicadas de conciliación y con volumen/cobertura mínima acordada. Si hay poco tráfico, completar replay controlado: dos semanas vacías no prueban estabilidad.

Resultado: release validada internamente con dossier de evidencia y riesgos residuales; no “producto sin bugs” ni certificación externa.

## 7. Modelos y ahorro de tokens

### Desarrollo: separar costo de implementación y costo de revisión

Recomendación de trabajo, no cambio automático de configuración ni garantía de disponibilidad en Copilot:

| Trabajo | Modelo sugerido en Codex | Esfuerzo |
|---|---|---|
| Contratos financieros, permisos, migración/rollback y revisión de cambios críticos | `gpt-6-astra` | Medium/high según complejidad |
| Implementación acotada con contrato y pruebas definidos | `gpt-5.6-terra` | Medium por defecto |
| Problema transversal difícil que excede el corte previsto | `gpt-5.6-sol` o Astra | High, uso puntual |
| Documentación, fixtures sintéticas, tareas mecánicas ya especificadas | `gpt-5.6-luna` | Low/medium con checks |

Selección basada en catálogo oficial; disponibilidad depende de cuenta y cliente. No usar Max/Ultra por defecto. Cuota de Codex, licencia Copilot y facturación API del bot son presupuestos distintos. [Modelos de Codex](https://learn.chatgpt.com/docs/models).

Para Copilot usar el modelo disponible que cumpla el mismo rol y medir resultados; no asumir que acepta estos identificadores ni recomendar un catálogo no inspeccionado. La revisión crítica debe evaluar diff y pruebas de forma independiente, no solo aprobar el resumen del autor.

### Bot: preservar primero, comparar después

- Legacy conserva configuración actual. Código usa por defecto `llama-3.3-70b-versatile` y `whisper-large-v3-turbo`; falta verificar overrides/acceso efectivos en producción. No hacer cambio de modelo junto con migración financiera.
- Comandos y datos inequívocos: parser determinista estricto sin LLM. Lenguaje libre: extracción en esquema pequeño, validación y confirmación. Consultas no invocan escritores.
- Candidato a evaluar en staging: Groq `openai/gpt-oss-20b`; comparar contra baseline y, si aporta valor, `openai/gpt-oss-120b`. Ambos admiten structured outputs strict según documentación actual. Es una propuesta de benchmark, no afirmación de mayor calidad ni menor costo real por operación. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs).
- Audio: mantener Whisper actual como baseline; medir monto transcrito, no solo palabras. Preguntar si la transcripción mezcla números/unidades. Cambiar STT solo si el corpus lo justifica.
- OCR: conservar OCR.Space como baseline y corregir selección de total/subtotal/descuento, fecha y vínculo al recibo. Nunca elegir el mayor número como autoridad. Evaluar visión solo en corpus difícil y con política de datos aprobada; no introducir otro proveedor para compensar un bug determinista.
- No montar una cascada cara que consulta tres modelos por mensaje. Un intento acotado, recuperación limitada si es error transitorio y luego aclaración/manual. Un JSON válido no demuestra monto correcto; la confianza autodeclarada no es criterio suficiente.

### Cómo ahorrar sin perder contexto

1. Un contrato canónico breve y ADR por decisión; tickets con objetivo, invariantes, archivos, casos, comandos y salida. No releer 20.000 líneas de planes en cada tarea.
2. Contexto por módulo y diff incremental; resumen de handoff con SHA, cambios, pruebas y pendientes. Evitar sesiones interminables y refactors tangenciales.
3. Pruebas dirigidas durante iteración; suite completa en cierre/CI. No pedir al modelo que vuelva a auditar todo después de cada cambio.
4. IA del bot recibe solo mensaje, estado de propuesta y categorías autorizadas pertinentes; no toda la historia financiera. Cachear configuración, no saldos sin invalidación ni respuestas entre usuarios.
5. Versionar prompt/modelo/esquema/corpus. Medir tokens, costo por movimiento correctamente confirmado, latencia, aclaraciones y correcciones. Comparar con baseline antes de fijar metas de ahorro.
6. Sin agentes paralelos por defecto: suman contexto y coordinación. Si se aprueban, solo tareas independientes con contratos y worktrees separados; un responsable de integración.

## 8. Documentación viva y aprobación

Crear durante implementación: `CURRENT-STATE`, contrato financiero con ejemplos, matriz de permisos, ADR de migración y routing, runbooks deploy/rollback/restore, catálogo de features con estado/evidencia, corpus IA y release checklist. Cada PR actualiza la página que cambia; README enlaza estas fuentes. Archivar planes históricos con estado “implementado/parcial/sustituido”, sin borrarlos.

**Recomendación para comenzar:** aprobar únicamente el lote A/B (preservación, aislamiento, calidad y hotfixes), no un refactor completo con despliegue automático. Revalidar alcance después de restauración y schema real. Mantener legacy disponible durante todo el trabajo.

Acciones que requieren autorización operativa concreta: crear recursos/costos de staging, copiar datos reales, crear tag/remotas, registrar segundo bot, cambiar secretos/configuración, publicar hotfix y ejecutar cualquier migración productiva. Ninguna se ejecutó al preparar esta propuesta.
