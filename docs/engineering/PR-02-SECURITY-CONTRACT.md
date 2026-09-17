# Contrato de trabajo — PR-02 contencion de autorizacion

Fecha: 16/09/2026.

## Punto de partida

- SHA: `ccda606` sobre `codex/harness-foundation`.
- Clasificacion: correccion de seguridad compatible; sin migracion ni cambio de
  contratos financieros.
- Hallazgos: H01, H02 y H21. H03 se divide en un corte posterior porque exige
  resolver contexto y destinatarios Telegram de forma transversal.

## Entregas acotadas

### PR-02a — crons fail-closed

- Todos los endpoints cron rechazan la solicitud si `CRON_SECRET` falta, esta
  vacio o no coincide exactamente.
- La autorizacion ocurre antes de consultas, escrituras, red o notificaciones.
- El modo manual `?userId=` de recurrentes queda sujeto al mismo secreto.

Archivos permitidos: rutas y pruebas bajo `app/api/cron/`, y un helper puro de
autorizacion con sus pruebas bajo `lib/auth/`.

### PR-02b — propiedad de movimientos y ejecuciones

- Un Member solo elimina movimientos propios; Owner/Admin conservan la
  capacidad vigente dentro de su grupo.
- Confirmar u omitir una ejecucion recurrente requiere que pertenezca al actor.
- La comprobacion se mantiene junto a la escritura; conocer un ID no concede
  autoridad.

Archivos permitidos: rutas/pruebas de transacciones y ejecuciones recurrentes,
`lib/db/recurring-queries.ts` y pruebas directamente relacionadas. Los flujos
Telegram que llaman esos servicios se adaptan en otro subcorte con sus propias
pruebas, no mediante bypasses opcionales.

## Invariantes

- No cambia monto, categoria, fecha, grupo, estado financiero ni copy exitoso.
- No se consulta ni modifica produccion; las pruebas usan entorno sintetico.
- Ninguna respuesta no autorizada dispara DB, Telegram, Ripio u otra red.
- No se filtra si un ID ajeno existe.
- No se debilitan pruebas ni se agregan secretos de ejemplo utilizables.

## Secuencia y verificacion

1. Agregar regresiones negativas y comprobar que fallan por la causa esperada.
2. Implementar el guard minimo en cada limite de escritura.
3. Ejecutar pruebas dirigidas, harness, typecheck, suite unitaria y lint.
4. Revision Astra independiente del diff antes de cada commit.

## Exclusiones

- Push, PR, deploy, migraciones, cambios de webhook o secretos.
- Hacer E2E contra un destino remoto.
- Refactor financiero, idempotencia durable o rediseño Telegram.
- Declarar cerrados H03/H06 por cambios parciales de este corte.
