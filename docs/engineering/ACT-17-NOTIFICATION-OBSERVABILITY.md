# ACT-17 — observabilidad del piloto beta sin envíos proactivos

## Alcance y estado

El outbox Telegram conserva respuestas a acciones iniciadas por usuarios;
`NOTIFICATIONS_ENABLED=false` mantiene apagados resumen diario, recurrentes
y recordatorios proactivos. El outbox Web Push transaccional del canary es
independiente. Leer las colas no equivale a activar ninguno de esos envíos.

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
Mantener el kill switch proactivo apagado hasta cerrar la revisión del
worker/outbox en una ventana suficiente, conservar opt-in individual y
acordar con Esteban el alcance de activación en beta. Chats de sesiones
siguen excluidos hasta tener vínculo chat-grupo comprobable.

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
