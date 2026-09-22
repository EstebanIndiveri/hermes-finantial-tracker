# H04d.3 — ensayo local de migración canónica

Fecha de corte: 22/09/2026. Alcance: reconstrucción y verificación locales de
una DB beta vacía. No autoriza migración remota, adopción, deploy ni tráfico.

## Resultado

Se partió de `0ab71de`. La fuente fue el backup oficial read-only de la DB
beta, previamente verificada como vacía. No fue un destino de pruebas ni se
escribió sobre ella. Se construyeron dos referencias locales, A y B, mediante
`sqlite .backup` de solo lectura; A y B son copias independientes de la fuente,
no una copia derivada de la otra. Su huella lógica inicial fue
`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.

El directorio temporal del ensayo tuvo modo `0700`. Antes de usar cada
artefacto se comprobó que su ruta resuelta (`realpath`), inode y hash eran los
esperados. El backup se trató como bundle SQLite: archivo principal, WAL y
metadata asociados, sin omitir un WAL al verificar ni al restaurar.

La atestación de la fuente registró el bundle
`f377e8b627c5a39913a695ef61e7281d9e42f28456d112937775ded60f8ed60b`
y sus miembros: SQLite
`3ff56bdcae91e77a29099c90002944bc2eb39fb2167bf0d8f19277ce73cf5689`,
WAL `09308e5231b2fbe388424bfffcc3d91fa59dd531f1350a8cfe5cdadde1375394`
y metadata
`e20052dfdcb1b80444be4d70d13c2f48450700d1ba28f99a0391ad179223a609`.
El WAL oficial medía 32 bytes, sin frames de datos.

En A y B se aplicaron, en el orden del manifiesto, las nueve migraciones
canónicas. La inspección final de ambas informó estado `canonical`, sin
migraciones pendientes, conflictos, drift ni violaciones de claves foráneas.
La huella objetivo observada fue:

```text
309646a60fcdfc1566e6110cc4e5ec8eb32cbfdb1ffa4ee03a3d838d54014701
```

El digest del manifiesto fue:

```text
03e5b07cd70bb5b96c65cccb8ac3565f1e772ab5b0426948505a59c7942c1a3f
```

Una segunda ejecución sobre B devolvió `appliedMigrationIds: []`. La
comparación before/after, con el fingerprint y digest esperados y una allowlist
cerrada de las 16 tablas observadas por el reconciliador, devolvió `ok: true` y
`differences: []`. A y B no se compararon directamente con el reconciliador
porque la firma incluye `databaseEvidenceId`, ligado a la ruta de cada DB; la
verificación cruzada fue que ambas llegaron al mismo fingerprint canónico, sin
pendientes, drift ni violaciones. Las pruebas dirigidas que ejercitan las flags
apagadas pasaron: 6 suites y 46 tests, confirmando el no-op de entregas
proactivas. No se alternaron flags de Vercel ni se ejecutó una release: esta es
evidencia local de idempotencia e invariancia, no un rollback operativo de
runtime.

## Límites del ensayo

"Rollback" en este corte significa reversión funcional de flags a apagadas y
una release compatible con schema aditivo. No significa borrar datos, tablas o
columnas, revertir migraciones, restaurar una DB ni revertir deployment o
tráfico. No se ejecutó rollback de deployment/tráfico.

Beta continúa sin deploy. No se ejecutaron migraciones remotas, `push`, cambios
de webhook ni escrituras en proveedores. La DB beta vacía valida el mecanismo
de instalación desde cero; no valida adopción ni conciliación de datos legacy.

## Contraste de identidad productiva

Mediante un perfil CLI temporal separado se verificó, sin consultar tablas, la
cuenta productiva `eindiveri` y su DB `hermes-acme`: ID
`019e71ab-9501-7c05-a672-b41db7a2cb27`, host
`hermes-acme-eindiveri.aws-ap-northeast-1.turso.io`. ID, host, cuenta y región
son distintos de `beta-hermes`. La sesión beta principal no fue reemplazada.
El perfil temporal productivo se cerró con `turso auth logout` al concluir la
consulta de metadata.

## Gates que permanecen bloqueados

- Falta verificar el ID numérico del bot Telegram productivo: el proyecto
  legacy no declara `TELEGRAM_BOT_ID` y Vercel no devuelve el valor del token
  marcado como sensitive.
- Faltan recibos/fingerprints reales de los secretos de staging. H04d.4 permite
  que los fingerprints productivos permanezcan `null` cuando no existe un
  recibo histórico, para no leer ni rotar legacy por este gate.
- En consecuencia, el manifiesto de aislamiento no puede cerrarse y toda
  conexión o acción remota con efectos permanece bloqueada.

## Siguiente paso autorizado

Obtener por un canal autorizado el ID no secreto del bot Telegram productivo y
los recibos/fingerprints de staging durante una rotación beta controlada, sin
imprimir ni persistir sus valores. Contrastar identidades, bindings y evidencia
disponible contra el manifiesto antes de pedir autorización explícita para un
ensayo remoto.
Mantener A como referencia independiente hasta cerrar esa revisión; no
reutilizar la fuente ni llamar rollback a una restauración de datos.
