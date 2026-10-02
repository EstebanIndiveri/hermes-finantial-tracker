# ACT-03 — runtime dependency gate, 02/10/2026

Estado: corte local completo en `codex/act03-runtime-deps`; no deployment ni
cambio de datos. Owner de implementación y verificación: Codex.

## Causa y alcance

`npm ci` del lockfile anterior reportó ocho hallazgos: tres altos y cinco
moderados. `npm audit --omit=dev` seguía reportando tres altos y uno moderado.
Los altos transitivos `fast-uri` y `undici` y el moderado `ip-address`
entraban por `shadcn`, una CLI declarada incorrectamente en dependencias de
producción. El alto `brace-expansion` correspondía a la rama 1.x resuelta
en el lockfile. Estos hallazgos nuevos no estaban comprendidos en la
aceptación previa del riesgo dev-only de Drizzle.

## Cambio compatible

- `shadcn` pasó a `devDependencies`. La aplicación solo importa su CSS en
  `app/globals.css` durante el build; no importa la CLI en rutas de runtime.
  Las clases y el CSS resultante siguen compilándose en el build de Next.
- El override `brace-expansion@^1.1.0` fija solo la rama 1.x a `^1.1.21`;
  no fuerza esa versión sobre las ramas 2.x o 5.x usadas por otros paquetes.
- Se regeneró el lockfile con npm 10/Node 22. Las actualizaciones compatibles
  de transitivos incluyeron las versiones corregidas de `fast-uri`,
  `ip-address` y `undici`. `drizzle-kit` subió dentro de su rango de
  `0.31.10` a `0.31.11`; no se generó ni aplicó esquema.

Desde una instalación limpia, `npm audit --omit=dev` reporta **cero**
hallazgos. `npm audit` completo reporta **cuatro moderados**, todos en la
cadena `drizzle-kit` → `@esbuild-kit/esm-loader` →
`@esbuild-kit/core-utils` → `esbuild`, previamente aceptada como riesgo
temporal de tooling de desarrollo. No se usó `npm audit fix --force` ni se
forzó downgrade incompatible. Node 22: 92 suites/783 tests, typecheck,
Webpack build y lint (0 errores/68 warnings existentes) pasaron.

## Límites y siguiente gate

El conteo de advisories no demuestra ausencia absoluta de vulnerabilidades.
El cambio solo reduce el árbol de runtime y el lockfile; no modifica
autorización, dinero ni contratos de proveedor. Antes de la próxima
generación de esquema, Codex reevalúa Drizzle upstream y verifica el nuevo
`drizzle-kit` contra la cadena canónica. Antes de beta deployment, repetir
`npm ci`, audit runtime, tests y el gate H04d del deployment candidato.
Producción legacy permanece inmutable.
