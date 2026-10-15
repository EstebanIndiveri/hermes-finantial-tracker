# ACT-17 — observabilidad del piloto beta con canaries cercados

## Alcance y estado

El outbox Telegram conserva respuestas a acciones iniciadas por usuarios.
`NOTIFICATIONS_ENABLED=false` mantiene apagado el envío proactivo general;
hay canaries beta separados para resumen diario, recurrentes y recordatorio
de reintegro, cada uno acotado a usuario/grupo QA. El outbox Web Push
transaccional del canary es independiente. Leer las colas no equivale a
ampliar ninguno de esos envíos.

## Control read-only por corte

El control reproducible está en `scripts/beta-outbox-snapshot.mjs`. Usar
únicamente el perfil Turso beta aislado (ruta absoluta), por ejemplo:

```bash
node scripts/beta-outbox-snapshot.mjs --config-path /private/tmp/hermes-beta-turso.2flp53
```

El comando valida cuenta, nombre, ID y URL exactos antes de ejecutar SQL
fijo. Devuelve un JSON con conteos por estado, entregas vencidas,
leases expirados, purgas terminales vencidas y edad agregada del trabajo
abierto más antiguo. No permite SQL/DB por argumento, no hace escrituras
y no muestra texto, IDs de filas, chats, endpoints ni payloads. No prueba
que las credenciales Turso sean de solo lectura: la seguridad del control
depende además de que el código solo ejecuta `SELECT` y de usar el perfil
beta aislado. Si falla, no interpretar una salida parcial como evidencia.

### Conciliación acotada del recordatorio de reintegro QA

El control específico de ACT-17 está en
`scripts/beta-reimbursement-reminder-snapshot.mjs`:

```bash
node scripts/beta-reimbursement-reminder-snapshot.mjs --config-path /private/tmp/hermes-beta-turso.2flp53
```

Verifica primero la identidad Turso beta y después ejecuta una única consulta
`SELECT` fija, limitada a la solicitud QA aprobada. Emite solo elegibilidad,
conteos de operación/outbox, destinatarios fuera de alcance y un veredicto;
no emite ID, chat, importe ni texto. `awaiting_eligibility` antes de superar
estrictamente tres días es correcto. `eligible_unqueued` después de la
ventana automática requiere investigar el request de Vercel; `queued` exige
observar el worker; `sent` significa una entrega **de ese día argentino**.
`duplicate_today`, `scope_violation`, `dead`, `fixture_missing` u
`operation_without_delivery` son anomalías que detienen el cierre. Las
entregas de días anteriores se cuentan, pero no se confunden con duplicados
del día actual. Este snapshot no prueba por sí solo que Vercel invocó el
cron ni que Telegram mostró el mensaje: contrastar el historial `requests`,
el evento de runtime si aún existe y el recibo del proveedor. Owner Codex.

La lectura manual siguiente sigue siendo una referencia para diagnosticar
un fallo del comando, nunca una autorización para usar el perfil legacy.

1. Reconfirmar en la CLI aislada `auth whoami` = `esteban-indiveri` y
   `db show beta-hermes` con ID
   `01a0c0bd-0601-7f27-b147-915d105b19f2` y host beta exacto.
   No ejecutar este control contra la configuración CLI de legacy.
2. Leer solo agregados, sin IDs, endpoints, mensajes ni payloads:

   ```sql
   SELECT 'push' AS channel, status, COUNT(*) AS jobs
   FROM push_delivery_outbox GROUP BY status
   UNION ALL
   SELECT 'telegram', status, COUNT(*)
   FROM telegram_delivery_outbox GROUP BY status
   ORDER BY channel, status;

   SELECT COUNT(*) AS open_push
   FROM push_delivery_outbox
   WHERE status IN ('pending', 'retryable', 'processing');

   SELECT COUNT(*) AS open_telegram
   FROM telegram_delivery_outbox
   WHERE status IN ('pending', 'retryable', 'processing');

   SELECT COUNT(*) AS push_purge_due
   FROM push_delivery_outbox
   WHERE status IN ('sent', 'dead')
     AND retention_until <= unixepoch() * 1000;
   ```

3. Si aparecen trabajos `dead`, `retryable` o `processing` persistentes,
   detener la consideración de activar avisos proactivos y revisar solo
   códigos de error/status y antigüedad agregados. No reencolar ni borrar
   financieramente nada desde el control de observabilidad.
4. El worker Push ya barre intenciones vencidas a las 24 horas y purga
   terminales a los 7 días, con lotes máximos de 100. Una fila `sent` no
   está vencida antes de `retention_until`; el canary no se elimina antes
   de ese plazo para simular limpieza. La limpieza de gastos, reintegros,
   categorías y cuentas QA es un corte distinto con inventario exacto y
   comprobación de dependencias.

## Puerta de activación

Este control es una fotografía, no un monitor permanente ni un SLA.
Mantener el switch proactivo **general** apagado; los tres canaries QA ya
activados requieren sus propios scopes, opt-in individual y conciliación
de cada entrega. Ampliar destinatarios exige otro corte y autorización.
Chats de sesiones siguen excluidos hasta tener vínculo chat-grupo comprobable.

## Estado de ejecución del scheduler Push

La ruta Push distingue `processed` de `skipped_worker_disabled` mediante
`X-Hermes-Outbox-Execution`, igual que la ruta Telegram. El scheduler solo
registra ese valor si está en la lista cerrada; cualquier otro encabezado se
convierte en `unknown`. No lee el cuerpo ni registra endpoints, tokens o
datos financieros. Un HTTP 200 con `skipped_worker_disabled` significa que
la petición llegó, **no** que se haya ejecutado la cola Push. Una prueba
local verifica ambos lados del contrato, pero no acredita que el Worker
desplegado esté activo ni que haya entregas reales.

Antes de atribuir latencia o disponibilidad a Push hay que comparar la
configuración efectivamente desplegada en Cloudflare y Vercel con el
repositorio: `PUSH_SCHEDULER_ENABLED` del Worker y `WEB_PUSH_ENABLED` de la
ruta son interruptores distintos. El archivo Wrangler declara el primero
`true`; la evidencia histórica de Vercel indicaba el segundo `false`.
Hasta obtener metadatos actuales de ambos proveedores, tratar esa
diferencia como estado no verificado, no como un envío habilitado. No usar
un HTTP 200 aislado para abrir la puerta de avisos proactivos.

El primer tick observado tras publicar el contrato (13/10, 16:40 UTC)
devolvió `processed` en ambas rutas con HTTP 200; Push duró 634 ms y
Telegram 758 ms medidos desde el scheduler. La cola beta seguía sin
trabajos abiertos en la fotografía de las 16:41 UTC. Este control
confirma invocación de las rutas, no recuperación de un job ni latencia
de proveedor. Sigue pendiente una ventana operativa más larga.

El [corte de actividad agregada](ACT-17-OUTBOX-ACTIVITY-METADATA.md)
agrega `X-Hermes-Outbox-Counts` a las respuestas procesadas. El scheduler
registra únicamente cinco contadores acotados, o `activity:null` si faltan
o son inválidos. Cero claims durante un tick prueba ausencia de trabajo
reclamado por esa invocación; no es evidencia de capacidad o entrega.

El tick del 13/10 a las 17:10 UTC, versión Worker
`7cefe87a-2df0-4192-a8b5-9cd896aac00b`, devolvió `processed`, HTTP 200
y cinco ceros en ambos carriles. El snapshot Turso posterior a las
17:11:33 UTC mantuvo Push 1/Telegram 25 `sent`, cero abiertos, vencidos
o purgas debidas. La lectura de tail había reconectado antes de ese tick;
no extrapolar continuidad al período sin conexión.

Un canary Telegram beta del mismo deployment se inició en `retryable`
intento 1 y el tick de las 17:15 UTC lo registró `claimed:1,sent:1` en
1443 ms. La única fila llegó a `sent`, intento 2, con recibo de proveedor;
los conteos financieros no cambiaron. La inserción sintética manual omitió
el TTL terminal, que el encolador normal sí fija; el snapshot bloqueó el
estado hasta corregir únicamente esa fila QA a `sent_at+30 días`. A las
17:17:51 UTC ambas colas volvieron a cero abiertos. No interpretar este
único envío como capacidad sostenida ni como permiso para avisos proactivos.
