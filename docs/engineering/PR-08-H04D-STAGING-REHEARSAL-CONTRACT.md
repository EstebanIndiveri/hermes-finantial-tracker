# Contrato de trabajo — PR-08/H04d preparación y ensayo de staging

Fecha: 20/09/2026.

## Punto de partida y alcance

- Base: `1433d552005cd4c6d53df1f02bf8d82374b2005e` (H04c).
- Rama/worktree: `codex/h04d-staging-rehearsal` en
  `/private/tmp/hermes-h04d-staging-rehearsal`.
- Clasificación: herramientas de aislamiento, inspección y conciliación.
- Producción, `main`, Turso/Vercel/Telegram remotos, secretos, webhooks y datos
  reales quedan fuera de alcance.
- Este corte prepara y prueba el flujo sobre libSQL local sintético. No crea ni
  adopta recursos externos y no afirma que exista un staging real.

## Resultado esperado

1. Un manifiesto no secreto verifica la consistencia de las identidades declaradas
   de app, DB, bot, webhook, cookies y secretos. No prueba el estado real de los
   proveedores: esa evidencia debe obtenerse de Vercel, Turso y Telegram.
2. La herramienta falla cerrada ante campos faltantes/desconocidos, colisiones,
   URLs inseguras, datos no sintéticos o flags Telegram activadas.
3. Una captura read-only produce evidencia determinista firmada con HMAC, sin
   filas, texto libre, IDs en claro, OCR, Telegram, tokens ni payloads de
   proveedor. La comparación rechaza artefactos manipulados o de otra DB/salt.
4. El planificador de adopción acepta solo una DB local existente, registra el
   fingerprint exacto observado y siempre exige revisión/backup/forward-fix.
   Nunca crea el archivo/ledger ni infiere migraciones aplicadas; toda evidencia
   faltante queda expresada como blocker y la decisión permanece `blocked`.
5. La conciliación compara conteos, hashes de conjuntos de IDs y contenido
   financiero, agregados, FKs, estados, duplicados y huérfanos antes/después.
6. El ensayo demuestra sobre una DB sintética que una migración no-op preserva
   invariantes y que los estados incompatibles permanecen bloqueados.

## Invariantes

- Ninguna URL o credencial se toma implícitamente del ambiente.
- Los comandos de H04d aceptan únicamente `file:`; habilitar staging remoto será
  otro cambio revisado después de validar identidad y permisos mínimos.
- Un plan no es autorización de apply. La adopción requiere backup restaurado,
  fingerprint sin drift, forward-fix revisado y confirmación operativa separada.
- Las tres flags Telegram permanecen en `false` durante migración y conciliación.
- No se copian datos reales al repositorio ni se emiten valores sensibles.
- Rollback significa flags/código compatible; el schema aditivo permanece. Una
  reparación de datos es un forward-fix trazable, no restaurar un backup viejo
  sobre una base activa.

## Pruebas y puertas

- Fixture de aislamiento válido y rechazos por colisión/flags/secret refs.
- Planner read-only: antes y después conservan tablas y fingerprint; no ledger.
- Archivo ausente: planner/captura fallan sin crearlo.
- Evidencia no contiene IDs ni texto de fixtures.
- Firma inválida, cambio financiero con suma compensada y target distinto fallan.
- Duplicados recurrentes, FKs y outbox huérfano bloquean conciliación.
- Captura antes/después de migración no-op conserva conteos, hashes y totales.
- Harness, Jest, TypeScript, ESLint, build y `git diff --check`.

## Fuera de alcance

- Crear DB, proyecto Vercel, bot, dominio, usuarios o secretos de staging.
- Acceder, respaldar, clonar, anonimizar o modificar producción.
- Aplicar un baseline/adopción en una DB remota.
- Encender inbox, outbox, worker, cron o webhook.
- E2E remoto, datos reales, backfills financieros o corrección de duplicados.
