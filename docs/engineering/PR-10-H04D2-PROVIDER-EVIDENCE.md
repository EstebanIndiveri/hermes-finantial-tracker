# H04d2 — evidencia de proveedores beta

Fecha de corte: 21/09/2026. Alcance: verificación read-only de metadata y estado
beta; no autoriza una migración, una adopción ni un cambio de tráfico.

## Resultado de la verificación

La evidencia disponible respalda que los recursos enumerados abajo existen y
responden como recursos beta. No constituye una prueba de aislamiento total:
la base Turso de producción pertenece a otra cuenta y no se contó con metadata
ni fingerprints de producción para contrastar ambos lados.

| Proveedor | Evidencia no sensible verificada |
| --- | --- |
| Vercel | Proyecto beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`; dominio `hermes-finantial-tracker-z2.vercel.app`; rama `codex/staging`; runtime Node.js 22; configuración de ignorar build con salida 0. En este corte no había deployments. |
| Turso | Base beta `beta-hermes`, ID `01a0c0bd-0601-7f27-b147-915d105b19f2`, host `beta-hermes-esteban-indiveri.aws-us-east-2.turso.io`. La inspección mostró schema vacío y cero escrituras. Export y restore oficiales completaron su verificación de integridad. |
| Telegram | Bot beta numérico `8739389202`, usuario `Hermes_beta_finantial_bot`; webhook vacío y `pending_update_count` igual a 0. |
| Snapshot local | La captura restaurada informó `readOnlyVerified: true`, `inspectionState: empty` y adopción bloqueada. |

La referencia Vercel legacy también fue contrastada de forma autenticada: proyecto
`prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt`, dominio
`hermes-finantial-tracker.vercel.app` y rama `main`. Es distinta del proyecto,
dominio y rama beta. No se cambió su configuración.

El artefacto oficial de backup agrupa SQLite, WAL y metadata. Su copia restaurada
conservó el SHA-256
`f377e8b627c5a39913a695ef61e7281d9e42f28456d112937775ded60f8ed60b`;
`PRAGMA integrity_check` devolvió `ok`. La captura produjo el fingerprint de
schema vacío `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.

## Alcance y límites

Los resultados son metadatos operativos y agregados; no registran tokens,
secretos, hashes/fingerprints de secretos, contenido de mensajes, datos de
usuarios ni rutas locales. La DB beta vacía solo permite verificar el camino de
inspección y restauración; no valida migraciones ni conciliación sobre datos.

No se puede afirmar aislamiento de producción con este material. Falta obtener,
mediante el canal autorizado de la otra cuenta, metadata de la DB Turso de
producción y los fingerprints de referencias de secretos de producción. Esos
datos deben contrastarse con el manifiesto local antes de habilitar actividad
remota.

El plan read-only quedó con `applyAuthorized: false`. Sus blockers son la falta
del ensayo before/after, del fingerprint objetivo, de un forward-fix revisado y
de autorización explícita. Además clasifica correctamente el origen como
`empty`: no corresponde adoptar una base legacy inexistente; el siguiente
ensayo debe reconstruir el schema canónico desde cero sobre otra copia local.

## Acciones no realizadas

- No se modificaron recursos de Vercel, Turso ni Telegram.
- No se creó deployment, alias, dominio, webhook, bot, token o secreto.
- No se ejecutaron migraciones, adopción, escrituras de DB, smokes ni envíos de
  Telegram.
- No se promovió ninguna rama ni se cambió tráfico.

## Condición para el siguiente corte

Mantener `applyAuthorized: false`. Para avanzar se requiere evidencia
autenticada de producción que permita la comparación, un backup/restauración
aprobado para el caso de uso y autorización explícita antes de cualquier
conexión remota con efectos de escritura.
