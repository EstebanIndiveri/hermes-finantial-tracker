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
npm run test:unit
npm run build
```

`test:unit` y `build` pasan por `scripts/run-isolated.mjs`. El runner:

- rechaza archivos `.env*` cargables desde el worktree sin leerlos;
- no hereda secretos ni proxies del proceso padre;
- usa una DB libSQL temporal y valores sinteticos;
- elimina su directorio temporal al terminar.

Los scripts de migracion, seed, Playwright y servicios externos quedan fuera de
estos controles.

## E2E bloqueado por defecto

`npm run test:e2e` falla si no existe `E2E_BASE_URL`. Solo acepta loopback o un
host remoto HTTPS aprobado de forma exacta con `E2E_ALLOW_REMOTE=1` y
`E2E_ALLOWED_HOST`. El dominio productivo conocido esta prohibido siempre.

Las credenciales se suministran con `E2E_USERNAME` y `E2E_PASSWORD`; no existen
valores por defecto. No ejecutar E2E remoto hasta disponer de proyecto, DB, bot,
secretos y usuario sintetico de staging independientes.

## Estado de la linea base

La incorporacion de CI no convierte la suite existente en verde. El baseline
auditado sigue siendo 58 suites aprobadas y 8 fallidas, con 482 tests aprobados
y 17 fallidos. Se clasificaran y corregiran por comportamiento en el siguiente
corte de PR-01; no se usa `continue-on-error` ni se excluyen esas suites.
