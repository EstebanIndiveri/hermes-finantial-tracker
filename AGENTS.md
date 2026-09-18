# Hermes Finance — instrucciones del repositorio

Estas reglas aplican a cualquier agente que trabaje en este repositorio. Las instrucciones explícitas del usuario y las políticas de la herramienta tienen precedencia. Un `AGENTS.md` más cercano puede especializar un subárbol sin relajar estas reglas de seguridad y datos.

## Objetivo actual

Estabilizar las funcionalidades existentes antes de ampliar el producto. Mantener operativa la versión legacy publicada en el commit `7034107ff322b6331029f493cc0d871c3a2b586f` mientras la evolución se desarrolla y valida en recursos aislados.

Leer antes de una modificación transversal:

- `docs/audit/VALIDACION-LEGACY-Y-EJECUCION.md`: secuencia vigente, continuidad y rollout.
- `docs/audit/DIAGNOSTICO-2026-09-16.md`: hallazgos H01–H21 y evidencia.
- `docs/audit/PLAN-DE-ACCION.md`: contratos objetivo y criterios de aceptación.
- `docs/codebase/`: mapa orientativo del código; contiene TODO y no reemplaza código ni pruebas.
- `docs/superpowers/specs/`: decisiones históricas. Si contradicen código o documentos vigentes, registrar la decisión; no restaurar una regla antigua por inferencia.

## Stack y límites reales

- Next.js App Router 16, React 19 y TypeScript estricto.
- Turso/libSQL con Drizzle. Los movimientos actuales guardan importes `REAL`; no reinterpretar ni migrar dinero sin conciliación.
- Telegram es un canal core. Texto, voz, OCR, callbacks, web y recurrentes deben converger en las mismas reglas financieras y de autorización.
- Integraciones externas: Telegram, Groq, OCR.Space, Ripio, Vercel y Turso.
- Este proyecto no es Express. No introducir `asyncHandler`, middleware `(err, req, res, next)`, `server.ts` ni patrones de stores en memoria por instrucciones genéricas.

## Seguridad de producción

- Tratar producción como solo lectura salvo autorización explícita para una acción concreta.
- No desplegar, pushear, crear tags remotos, cambiar webhook/secretos/crons ni ejecutar migraciones productivas por inferencia.
- No ejecutar tests, seeds, backfills o E2E contra la DB, bot, chat, dominio o credenciales de producción.
- `playwright.config.ts` aún usa producción como `baseURL` por defecto. Hasta corregirlo, no ejecutar E2E sin una `BASE_URL` de staging comprobada.
- Una preview Git no aísla la DB. Staging necesita DB, bot, secretos, cookies y destinos de notificación independientes.
- No copiar datos reales a servicios, modelos o fixtures. Una copia para diagnóstico requiere autorización, anonimización, acceso restringido y retención definida.
- Las migraciones deben ser aditivas al comienzo. Nunca restaurar un backup viejo sobre la DB activa como rollback rutinario.

## Antes de cambiar código

1. Comprobar `git status --short`, rama y SHA. Preservar cambios ajenos y detenerse si otro agente edita los mismos archivos.
2. Clasificar el trabajo: hotfix legacy, estabilización, refactor compatible, migración o feature. No mezclar categorías en un mismo cambio.
3. Escribir un contrato corto: comportamiento actual, resultado esperado, invariantes, archivos, riesgos, pruebas y exclusiones.
4. Para bugs, crear primero una regresión que falle por la causa observada. Para refactors, caracterizar comportamiento antes de moverlo. Documentación y cambios mecánicos de bajo riesgo no requieren TDD artificial.
5. Identificar todos los canales que consumen la regla cambiada: web, Telegram texto/voz/OCR/callback, recurrentes, dashboard, alertas y exportación.

## Invariantes financieros y de acceso

- Una operación autorizada se registra como máximo una vez y en el grupo correcto.
- Monto, moneda, cotización, fecha, período, tipo, categoría, autor y fuente deben quedar explícitos o preservados.
- Ingreso y gasto son semánticas financieras; no deducir el signo únicamente del slug de categoría en código nuevo.
- La IA propone datos. No decide permisos, propietario, signo, presupuesto, idempotencia ni persistencia.
- Revalidar usuario, membresía, rol, grupo y versión de propuesta en el momento de escribir.
- `Member` modifica o elimina solo movimientos propios; `Owner/Admin` siguen la matriz aprobada.
- El límite presupuestario se valida en el writer común dentro de la protección transaccional disponible, no solamente al crear una propuesta.
- Ante lenguaje ambiguo, negación, consulta o múltiples montos plausibles, pedir aclaración. No elegir silenciosamente.
- Un fallo después del commit no debe provocar una segunda escritura al reintentar; persistencia y entrega necesitan correlación durable.

## Pruebas y verificación

Usar Node 22. El shell del equipo puede resolver Node 14: comprobar `node --version` antes de instalar o ejecutar tooling.

La línea base auditada todavía no está verde:

- Existen `jest.config.js` y `jest.config.ts`; Jest sin `--config` falla por configuración duplicada.
- Con configuración explícita: 58 suites pasan, 8 fallan; 482 tests pasan, 17 fallan.
- `npm run lint` llama `next lint`, comando no válido para la versión instalada.
- TypeScript pasó con `tsc --noEmit --incremental false` en Node 22.

Hasta que PR-01 normalice scripts y CI:

```bash
npm test -- --config jest.config.js --runInBand --testPathIgnorePatterns=/e2e/
npx tsc --noEmit --incremental false
```

Registrar el resultado exacto y distinguir fallos previos de regresiones nuevas. No borrar, saltar o debilitar pruebas para declarar verde. Ejecutar primero pruebas dirigidas; ampliar según impacto. Usar mocks en límites externos cuando den aislamiento, y pruebas de integración con libSQL real aislado para persistencia, migraciones y concurrencia.

No imponer cobertura global arbitraria mientras no exista baseline. Para código financiero y autorización, exigir casos positivos, negativos, aislamiento entre usuarios/grupos, repetición y concurrencia relevantes.

## Diseño y cambios

- Preferir un monolito modular; no introducir microservicios por defecto.
- Centralizar contratos y writers antes de extraer carpetas por estética.
- No duplicar reglas entre rutas web y Telegram.
- Evitar dependencias nuevas cuando la plataforma o una dependencia existente resuelvan el problema. Documentar la justificación y el impacto operativo de cada alta.
- No introducir `any` nuevo salvo frontera inevitable, confinada y justificada. Validar `unknown` con Zod u otro guard.
- No exigir JSDoc ceremonial a cada función. Documentar contratos públicos, decisiones financieras y comportamientos no obvios.
- Tratar logging como dato sensible: sin secretos, texto financiero completo, OCR crudo o PII innecesaria; usar IDs de correlación y campos redactados.

## Git, agentes y revisión

- Usar ramas/worktrees aislados para implementación. El prefijo de ramas de Codex es `codex/`.
- Un solo escritor por archivo o módulo en cada ola. No ejecutar Codex y Copilot sobre el mismo checkout.
- El coordinador integra; los subagentes reciben SHA, objetivo, invariantes, archivos permitidos, pruebas y prohibiciones. Paralelizar solo tareas independientes.
- Por defecto, los subagentes de este repositorio usan GPT-5.6 Luna con contexto
  acotado al contrato, archivos y pruebas de su tarea. Reservar modelos mayores
  para el orquestador o una excepcion critica solicitada de forma explicita;
  no sobredimensionar tareas mecanicas o revisiones delimitadas.
- No hacer commit, push, PR, merge o deploy salvo pedido o aprobación que abarque esa acción.
- Conventional Commits cuando se soliciten commits. `Closes #N` solo si existe un issue real.
- La revisión prioriza correctness, seguridad, pérdida/duplicación de datos y regresiones. Evaluar cada observación: aplicar las válidas y documentar las rechazadas; nunca aplicar todas de forma ciega.

## Criterio de finalización

Informar siempre: archivos modificados, comportamiento cambiado, comandos y resultados, fallos preexistentes, riesgos pendientes y acciones externas no realizadas. No declarar “estable”, “certificado”, “sin bugs” o “listo para producción” sin las puertas de liberación y evidencia definidas en el plan vigente.
