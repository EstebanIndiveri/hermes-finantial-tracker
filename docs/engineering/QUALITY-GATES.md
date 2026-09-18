# Controles locales y CI

Estos controles pertenecen a la linea de evolucion. No publican, migran, hacen
seed ni ejecutan E2E. La produccion legacy permanece fuera de alcance.

## Runtime

Usar Node `22.23.2` y npm 10. El repositorio contiene `.nvmrc`,
`.node-version`, `engines` y `engine-strict` para fallar temprano si el shell
resuelve otra version.

## Comandos

```bash
npm ci
npm run lint
npm run typecheck
npm run test:harness
npm run test:unit
npm run build
```

`test:unit` y `build` pasan por `scripts/run-isolated.mjs`. El runner:

- rechaza archivos `.env*` cargables desde el worktree sin leerlos;
- no hereda secretos ni proxies del proceso padre;
- usa una DB libSQL temporal y valores sinteticos;
- elimina su directorio temporal al terminar.

`test:harness` comprueba que secretos, proxies y `NODE_OPTIONS` centinela no se
propaguen al proceso aislado y que la DB utilizada sea local y temporal.

Los scripts de migracion, seed, Playwright y servicios externos quedan fuera de
estos controles.

## E2E bloqueado por defecto

`npm run test:e2e` falla si no existe `E2E_BASE_URL`. Solo acepta loopback o un
host remoto HTTPS aprobado de forma exacta con `E2E_ALLOW_REMOTE=1` y
`E2E_ALLOWED_HOST`. El dominio productivo conocido esta prohibido siempre.

Las credenciales se suministran con `E2E_USERNAME` y `E2E_PASSWORD`; no existen
valores por defecto. No ejecutar E2E remoto hasta disponer de proyecto, DB, bot,
secretos y usuario sintetico de staging independientes.

## Estado verificado de PR-01

El SHA productivo `7034107` tenia como baseline auditado 58 suites aprobadas y
8 fallidas, con 482 tests aprobados y 17 fallidos. En la rama aislada
`codex/harness-foundation`, esas pruebas se clasificaron y repararon sin
excluirlas: al cierre de PR-01b pasan 67/67 suites y 504/504 tests. TypeScript
pasa y ESLint termina con 0 errores y 73 advertencias visibles.

El build local aun no constituye evidencia verde: `next build` quedo bloqueado
al intentar descargar DM Sans y Fraunces desde Google Fonts en el entorno sin
red. Debe resolverse con fuentes versionadas/locales o verificarse en un CI
aislado con politica de red explicita antes de usar build como puerta de
liberacion. Ninguno de estos resultados certifica por si solo los flujos
financieros ni autoriza una publicacion.

Tras los cortes locales de seguridad PR-02a/H21/H02, pasan 72/72 suites y
548/548 tests. Estas regresiones cubren crons fail-closed, permisos de borrado
y propiedad de ejecuciones recurrentes en web y Telegram. H03, concurrencia e
idempotencia permanecen abiertos y no quedan certificados por este conteo.

Tras el corte local PR-03/H03, pasan 74/74 suites y 565/565 tests; el harness y
TypeScript pasan, y ESLint termina con 0 errores y 71 advertencias existentes.
Las regresiones cubren texto, voz antes de STT, foto/OCR y callbacks personales;
estado persistido ligado a actor/grupo; invalidacion transaccional al remover
miembros; y alertas diarias con membresia y destinatario por usuario. El build
continua fallando unicamente en la descarga bloqueada de DM Sans y Fraunces ya
descrita. Este corte cierra la reproduccion determinista de H03 en local, pero
no certifica H06 ni elimina la ventana de concurrencia entre el ultimo guard de
membresia y un writer todavia no transaccional; esa garantia fuerte depende del
writer comun/atomicidad de ACT-06 y de H04.

ESLint aplica reglas de produccion sin excepciones globales. En tests permite
`require()` para reinicializar modulos de Jest y mantiene `any` como advertencia
visible mientras se tipan los fixtures. El reproductor forense CommonJS de la
auditoria tiene una excepcion limitada a sus dos reglas incompatibles con CJS.
Los errores de implementacion siguen bloqueando el control.
