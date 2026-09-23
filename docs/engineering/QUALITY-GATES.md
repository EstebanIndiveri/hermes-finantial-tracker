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

El comando canónico de build selecciona Webpack explícitamente. Next 16.3.2
falló en dos intentos con Turbopack al resolver los módulos virtuales de
`next/font/google` para Fraunces y DM Sans: primero con el symlink compartido de
dependencias y luego con un `npm ci` limpio y aislado en este worktree. La misma
fuente compiló y generó las 36 páginas con Webpack. No agregar
`@vercel/turbopack-next` como dependencia:
el módulo faltante pertenece al resolver interno de Next/Turbopack. Se mantiene
Webpack como workaround hasta verificar una versión de Next que corrija el
fallo; cualquier cambio de bundler requiere volver a ejecutar el build aislado.

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

Tras el corte local PR-04/H06, pasan 75/75 suites y 588/588 tests; el harness y
TypeScript pasan, y ESLint termina con 0 errores y 70 advertencias visibles.
Las regresiones cubren routing de voz `group`/`supergroup` sin fuga al handler
personal, callbacks grupales sin desvio al flujo personal, contexto ligado a
chat/sesion/actor/membresia, pasos conversacionales exactos, pagadores y
acreedores vigentes, y revalidacion antes de los writers de gastos y pagos. La
revision independiente no encontro hallazgos P0/P1; sus dos P2 (acreedor
removido durante la seleccion y respuesta de error de voz que podia provocar
un 5xx) se corrigieron con regresiones. El build continua fallando unicamente
por la descarga bloqueada de DM Sans y Fraunces. H04/H05, la ventana de
concurrencia previa al writer, la sincronizacion con `getChatMember` y H13/H14
permanecen fuera de este corte.

Tras el corte local PR-05/H04a, pasan 76/76 suites y 619/619 tests; el harness y
TypeScript pasan, y ESLint conserva 0 errores y 70 advertencias visibles. El
claim se prueba contra la migracion `0009` en libSQL temporal real: diez
intentos secuenciales y diez paralelos producen un owner, el lease vencido se
puede readquirir y el token anterior queda cercado. A nivel webhook, diez POST
concurrentes ejecutan un solo handler; voz, imagen, callbacks, grupos y texto
reclaman antes de sus efectos cuando la flag esta activa. La revision
independiente detecto cuatro observaciones: se corrigieron el guard legacy
entre bots, la validacion de `update_id` y la identidad de bot fail-closed; los
catches terminales heredados quedaron explicitamente clasificados como una
limitacion compatible. La flag permanece apagada por defecto y ninguna
migracion fue ejecutada fuera de la DB temporal. El build continua bloqueado
por las fuentes Google conocidas. La ventana `commit financiero -> completar
inbox`, la entrega/outbox y los IDs de operacion pertenecen a H04b/ACT-06 y no
quedan certificados por H04a.

Tras el corte local PR-06/H04b, pasan 82/82 suites y 675/675 tests; el harness
y TypeScript pasan, y ESLint termina con 0 errores y 63 advertencias visibles
(siete menos que PR-05). Las pruebas nuevas usan libSQL temporal real para la
migracion, constraints, diez claims paralelos, recuperacion de leases y
fencing; tambien cubren identidad/reuso de operaciones, clasificacion de
errores del dispatcher, compatibilidad con flags apagadas, writers personales,
Split, recurrentes y reintegros, incluido `confirm_all` y revalidacion de
membresia dentro del writer. No se usaron recursos externos ni credenciales.
La confirmacion OCR tambien reclama el ticket, enlaza su `transaction_id` y
crea el movimiento dentro de la misma transaccion durable; los reintentos tras
commit recuperan entregas incluso cuando ya quedaron en estado terminal.

Este resultado no autoriza staging ni produccion: el journal Drizzle historico
todavia no registra `0009`/`0010`, la migracion no es reentrante ante una
aplicacion parcial, el indice unico recurrente requiere preflight/conciliacion,
y falta un worker programado para entregas `retryable`. Las consultas de
preflight y la secuencia de rollout estan en
`PR-06-H04B-MIGRATION-PREFLIGHT.sql` y
`PR-06-H04B-OPERATION-OUTBOX-CONTRACT.md`. Las flags permanecen apagadas.

ESLint aplica reglas de produccion sin excepciones globales. En tests permite
`require()` para reinicializar modulos de Jest y mantiene `any` como advertencia
visible mientras se tipan los fixtures. El reproductor forense CommonJS de la
auditoria tiene una excepcion limitada a sus dos reglas incompatibles con CJS.
Los errores de implementacion siguen bloqueando el control.

## Evidencia PR-07 / H04c (19/09/2026)

H04c reemplaza la ejecución implícita del journal histórico por un manifiesto
canónico local, ledger con checksums, pasos transaccionales y verificación de
drift mediante objetos críticos más huella del DDL completo. Una DB vacía se
reconstruye en nueve pasos; una DB no vacía sin ledger se clasifica y rechaza
sin adopción. El preflight bloquea duplicados recurrentes antes de `0010`.

El worker de outbox procesa como máximo cinco filas por bot, comparte la
clasificación del dispatcher, usa leases cercados, timeout limitado por deadline
y purga como máximo cien filas terminales vencidas del mismo bot. El cron exige
secreto, credenciales y las tres flags; sus defaults permanecen apagados.

Puertas locales finales en Node 22:

- harness: 14/14;
- Jest: 84 suites y 689 tests;
- TypeScript: aprobado;
- ESLint: 0 errores y 63 warnings legacy;
- build Next.js con webpack: aprobado;
- `git diff --check`: aprobado.

El build Turbopack no acepta el symlink de `node_modules` usado por este
worktree temporal; la verificación equivalente con webpack compiló y generó
las 36 páginas estáticas. No se ejecutaron E2E, migraciones remotas, adopción,
push, deploy ni cambios de secretos/webhook. Staging y producción continúan
bloqueados por el runbook de adopción y por las flags en `false`.

## Evidencia PR-08 / H04d (20/09/2026)

H04d prepara el ensayo sin conectar proveedores: valida manifests declarativos
de aislamiento, captura snapshots libSQL locales con `query_only`, firma HMAC y
redacción, compara identidad de DB/manifiesto/schema y mantiene la adopción en
`decision: blocked`/`applyAuthorized: false`. El digest abarca migraciones,
archivos, checksums, preflights y exclusiones. Los blockers incluyen backup,
restore, forward-fix, fingerprint objetivo, conciliación y autorización.

La conciliación detecta FKs, huérfanos de negocio, duplicados, estados inválidos,
schema parcial y cambios por fila financiera incluso si dos cambios compensados
preservan la suma global. Un archivo de DB inexistente se rechaza antes de abrir
libSQL; los artefactos manipulados, otro destino/salt o tablas aditivas no
aprobadas también fallan cerrados.

Puertas locales finales en Node 22:

- harness: 33/33;
- Jest: 84 suites y 689 tests;
- TypeScript: aprobado;
- ESLint: 0 errores y 63 warnings legacy;
- build Next.js con webpack: aprobado (solo se habilitó red para descargar DM
  Sans y Fraunces; permanecen los warnings conocidos de middleware/Edge);
- `git diff --check`: aprobado.

No se crearon ni consultaron proyectos Vercel, DB Turso, bots/webhooks Telegram,
secretos, backups o datos remotos. `ok: true` en el manifiesto significa
consistencia local, mantiene `isolationVerified: false` y
`providerVerificationRequired: true`; no prueba
identidades reales. Producción, `main`, flags, E2E, push y deploy permanecieron
inmutables.

## Evidencia PR-12 / H04d.4b (23/09/2026)

En Node 22 pasan el harness (43/43), Jest (88/88 suites; 731/731 tests),
TypeScript y ESLint (0 errores; 64 warnings). El build default con Turbopack
falló al resolver el módulo virtual de Google Fonts de Next.js 16.3.2, pero el
mismo build completó con Webpack. Por eso `npm run build` selecciona ahora
Webpack explícitamente dentro del runner aislado. El intento con Turbopack y
los warnings de ESLint quedan registrados para revisión futura; no se cambió
la configuración de fuentes ni se añadió una dependencia.

`npm ci` reportó 10 avisos de vulnerabilidades del árbol de dependencias
(6 moderadas, 3 altas y 1 crítica); no se aplicaron actualizaciones automáticas.
En H04d.4b se crearon o configuraron credenciales exclusivamente para Turso
beta y el proyecto Vercel beta. No se consultaron ni modificaron tablas o datos,
ni se cambió un webhook, deployment o recurso productivo. Las variables
actualizadas todavía no están aplicadas a un deployment.

La repetición de Turbopack después de reemplazar el symlink confirma que el
diagnóstico anterior de PR-07 no explica este fallo. La evidencia actual apunta
al resolver interno de `next/font/google` en Next 16.3.2; no se agregó ese
módulo privado como dependencia ni se cambió la carga visual de fuentes.
