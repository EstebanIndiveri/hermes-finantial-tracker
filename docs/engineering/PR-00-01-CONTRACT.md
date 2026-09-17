# Contrato de trabajo — PR-00 / PR-01a

Fecha: 16/09/2026.

## Punto de partida

- SHA base: `7034107ff322b6331029f493cc0d871c3a2b586f`.
- Rama local: `codex/harness-foundation`.
- Worktree: `/private/tmp/hermes-harness-foundation`.
- Clasificacion: estabilizacion. No cambia politica de producto ni semantica financiera.
- Produccion legacy: permanece en `main` y fuera del alcance de escritura.

## Comportamiento observado

- El shell predeterminado usa Node 14 aunque el proyecto requiere un runtime moderno.
- Jest tiene dos configuraciones y falla sin seleccionar una explicitamente.
- `npm run lint` invoca un comando no valido para la version instalada de Next.js.
- Playwright usa la URL productiva como destino predeterminado.
- No existe un workflow CI versionado que haga obligatorios los controles locales.
- La linea base explicita registra 58 suites aprobadas, 8 fallidas; 482 tests aprobados y 17 fallidos.

## Resultado esperado para este corte

1. Runtime Node 22 declarado y comprobable.
2. Una unica configuracion Jest y comandos separados de unit/integration frente a E2E.
3. Lint, typecheck, test y build con scripts reales y reproducibles.
4. Playwright rechaza por defecto produccion y solo acepta un destino de prueba explicito.
5. CI ejecuta controles locales sin secretos ni acceso a DB, bot, Groq, OCR o Vercel productivos.
6. Los 17 fallos existentes quedan medidos y clasificados; no se ocultan ni debilitan pruebas.

## Invariantes

- Ningun comando de este corte escribe en produccion ni llama al bot real.
- No se leen, copian, imprimen ni modifican secretos de `.env.local`.
- No se cambian rutas de aplicacion, writers financieros, schema, migraciones ni reglas de autorizacion.
- `main`, el deployment, webhook, DB, usuarios y datos productivos permanecen inmutables.
- Un fallo preexistente se informa como tal; nunca se elimina una prueba para obtener verde.

## Archivos permitidos

- `AGENTS.md`, `.agents/**`, `.github/**`.
- `docs/audit/**`, `docs/engineering/**`.
- Archivos de version de runtime y package manager.
- `package.json`, configuracion de Jest, ESLint, TypeScript y Playwright.
- `scripts/verify-runtime.mjs`, `scripts/run-isolated.mjs` y su documentacion.
- `e2e/test-target.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts` y referencias de
  destino/credenciales en specs E2E.
- Tests del propio guard de entorno, si son necesarios.
- Las ocho suites fallidas registradas en H18, exclusivamente para reemplazar
  fixtures/mocks obsoletos y aserciones de texto fuente por comportamiento.

Todo cambio fuera de esta lista requiere revisar y ampliar este contrato antes de editar.

Para estas ocho suites no se permite cambiar implementacion de `app/**`, `lib/**`
o `components/**` solo para satisfacer una expectativa. Si una falla demuestra un
defecto de producto, se conserva como regresion y se deriva a un corte con contrato
de comportamiento propio.

## Verificacion

- Comprobar runtime efectivo antes de cada comando.
- Ejecutar primero checks de configuracion dirigidos.
- Ejecutar Jest con aislamiento local y sin E2E.
- Ejecutar TypeScript sin incremental, lint y build con variables sinteticas cuando corresponda.
- Inspeccionar el diff completo buscando secretos, identificadores productivos y alcance accidental.

## Exclusiones

- Push, PR remoto, tag, merge o deploy.
- Acceso a Turso productivo o restauracion de backups.
- Cambios en Telegram, webhook, cron, Groq, OCR o Vercel.
- Correcciones H01-H21 de comportamiento; se implementan en cortes posteriores con regresion propia.
- Creacion de staging remoto; este corte solo prepara barreras locales y CI.
