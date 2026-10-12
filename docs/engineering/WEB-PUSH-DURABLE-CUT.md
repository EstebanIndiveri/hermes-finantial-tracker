# Web Push durable — contrato previo al corte beta

Estado: implementación, migración aditiva y despliegue beta verificados,
11/10/2026; prueba de dispositivo y activación pendientes. Owner técnico: Codex.
Esteban aprobó solo metadatos, reintentos hasta 24 horas, purga a 7 días y
activación apagada hasta la prueba beta. **No habilita envíos ni autoriza una
migración legacy.**

## Situación observada

`sendPushToUser` busca las suscripciones al momento de enviar y llama al
proveedor de forma síncrona. Tras un commit financiero, un error transitorio
puede perder el aviso: no existe una fila recuperable, lease ni contador de
intentos. La vía Telegram de reintegros sí usa una entrega durable. Web Push
está sometido a `NOTIFICATIONS_ENABLED`; el beta mantiene ese flag apagado.
El 10/10 se cerró localmente una contención independiente: la baja de una
suscripción ahora exige la identidad del usuario autenticado y el endpoint.

## Contrato propuesto

1. Persistir una intención de aviso por **operación financiera + tipo de
   evento + destinatario + suscripción** dentro de la misma transacción que
   deja el reintegro o su pago en estado comprometido. Una clave estable y
   única impide duplicados internos al repetir la operación.
2. Guardar solo referencias y metadatos mínimos: operación, reintegro,
   destinatario, suscripción, tipo, estado, intentos, tiempos y código de
   error estable. No guardar en el outbox texto financiero, nombre, importe,
   endpoint, claves VAPID ni payload Push. El worker compone un mensaje
   genérico y un enlace fijo a la vista de reintegros.
3. Antes de enviar, verificar que la suscripción todavía pertenece al
   destinatario y que el evento sigue siendo pertinente. Una suscripción
   ausente/reasignada y una solicitud anulada no deben redirigir avisos a
   otra cuenta. El worker no cambia el estado financiero.
4. Claim atómico con lease/fencing, límites por tick, reintentos con backoff
   y estado terminal tras agotamiento o expiración. Un timeout posterior a
   una entrega externa puede producir **un Push duplicado**; la unicidad DB
   no promete exactamente una visualización en el dispositivo.
5. Añadir un flag Web Push específico, apagado por defecto y subordinado al
   flag global de notificaciones. Migración aditiva y worker desplegable sin
   activar el envío. No conectar avisos proactivos diarios en este corte.
6. Antes de indexar o depender de `subscription_id`, contar endpoints
   duplicados en beta y resolverlos sin borrar filas por inferencia. El alta
   actual reasigna un endpoint existente a otra cuenta; documentar el caso
   de cambio de sesión en un mismo navegador y probar que nunca recibe un
   aviso de la cuenta anterior.

## Política para decisión de producto

Propuesta conservadora: reintentar por hasta 24 horas y purgar metadatos de
entrega a los 7 días; cero contenido financiero persistido en el outbox.
La activación quedaría apagada hasta una prueba beta explícita con suscripción
de prueba. Esteban confirmó esta política el 11/10/2026. El DDL y el worker
se construyen con esos límites; la activación sigue siendo un corte separado.

## Seguimiento del corte

| Paso | Estado | Owner y salida requerida |
| --- | --- | --- |
| Migración aditiva, outbox metadata-only, lease y retención | Implementado y verificado en beta el 11/10 | Codex: revisar el candidato desplegado; la migración `0100` conservó datos y tablas existentes. |
| Cobertura transaccional de todos los writers de reintegros | Implementado; regresiones locales aprobadas | Codex: verificar web, Telegram directo/callback y rutas sin contexto durante el canary; no activar con un bypass. |
| Worker, endpoint autenticado y scheduler free tier | Worker desplegado en beta; envío y scheduler Push inactivos | Codex: probar canary consentido y solicitar decisión separada antes de activar. |
| Duplicados/suscripciones en Turso beta | Lectura 11/10: 0 endpoints duplicados, 0 suscripciones | Codex: repetir antes de activar; Esteban: consentir la suscripción del dispositivo de prueba. |
| Aislamiento beta/legacy | Paquete técnico del deployment actual aprobado; residual ratificado solo para este beta | Codex: reatestar cada deployment futuro; mantener `isolationVerified:false`. |
| Canary Web Push con dos usuarios y decisión de activación | Abierto | Esteban: prueba real del dispositivo y aprobación; Codex: verificar entrega, idempotencia, exclusión y apagar ante fallo. |

La comparación Turso del 11/10 fue read-only: `beta-hermes` pertenece a
`esteban-indiveri` en `aws-us-east-2`, mientras `hermes-acme` pertenece a
`eindiveri` en `aws-ap-northeast-1`; IDs y hosts son distintos. Esto no prueba
por sí solo los secretos de una función Vercel en ejecución ni certifica URLs
de deployments retirados. No se leyeron filas financieras ni se escribió en
legacy. Después se exportó un respaldo beta, se compararon esquema, ledger e
integridad y se aplicó únicamente `0100` en `beta-hermes`; el postflight
verificó el fingerprint canónico, integridad y preservación de las 27 tablas
anteriores. El harness pasó 94/94 y la app 933 pruebas. `WEB_PUSH_ENABLED`
se configuró en `false` para el target Production del proyecto beta; este
binding nuevo exige reatestar H04d en el deployment siguiente.

## Pruebas y condiciones de salida

- Migración desde DB vacía y desde esquema beta aislado; rerun inocuo y sin
  lectura/escritura de DB legacy.
- Commit de reintegro y fila Push atómicos; rollback de ambos ante fallo de
  insert. Repetición y concurrencia no crean filas duplicadas.
- A/B, exmiembro y suscripción reasignada: ningún envío cruzado. Baja ajena
  bloqueada por la regresión libSQL existente.
- Dos workers reclaman una fila una sola vez; lease vencido se recupera; un
  worker viejo no puede finalizar un claim nuevo. 404/410 invalida solo la
  suscripción propia; 429/5xx y timeout reintentan sin reescribir dinero.
- Logs y métricas solo con IDs/códigos redactados; ningún endpoint, clave,
  payload o texto financiero. Purga y backlog observables.
- Prueba beta consentida con dos usuarios y flag activado solo después de
  reatestar H04d para el deployment candidato. No se promociona a legacy.

El corte no cambia OCR, audio, texto, CSV/XLSX, saldos ni Telegram. Sí toca
los puntos de creación/pago de reintegros de web y Telegram, y por ello
requiere regresiones de ambos canales y callbacks.

## Candidato de despliegue 11/10/2026 (registro previo a la promoción)

El commit beta `9642176` quedó en `origin/codex/act05-currency-modes`.
Vercel creó `dpl_AACcct6M78ZCxgJ7kZgkLFe6jt6T` en el target Production
**del proyecto beta aislado** `hermes-finantial-tracker-z2`, con
`--skip-domain`. Está `READY`; el build emitió `passed:true`, los diez checks
de aislamiento y los seis fingerprints beta coincidentes. La ruta
`/api/cron/push-outbox` entró al build. La env beta
`WEB_PUSH_ENABLED=false` y el flag del scheduler Push también están apagados.

El alias canónico `hermes-finantial-tracker-z2.vercel.app` sigue en
`dpl_4r3KhNWKH5hrZ8ZkUMHb32zCKxDX`; el alias legacy
`hermes-finantial-tracker.vercel.app` sigue en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El CLI creó además un alias de equipo
para el deployment nuevo; eso no mueve el alias canónico. **Owner Codex:**
renovar el paquete de evidencia H04d (incluidos recibos provider vencidos),
hacer smoke pasivo del candidato y solo entonces promover el alias beta.
`isolationVerified:false` no cambia. **Owner Esteban:** consentir luego una
suscripción de dispositivo y el canary con dos usuarios antes de autorizar
encender Web Push. Ningún paso de este corte autoriza un despliegue legacy.

### Estado posterior a promoción beta

Los recibos Telegram beta y legacy se renovaron el 11/10 mediante consultas
Bot API de solo lectura ejecutadas por Esteban con entrada de token oculta;
Codex recibió solo ID, username, webhook y hora. Los IDs y URLs son distintos
y coinciden con la separación documentada. Se regeneraron siete recibos
privados para el candidato y el verificador H04d devolvió
`postActivationRuntimeConsistent:true`, `isolationVerified:false`. Las probes
protegidas del candidato devolvieron `/login=200`, Push worker sin credencial
`401` y Telegram worker sin credencial `401`.

Codex promovió **solo** `hermes-finantial-tracker-z2.vercel.app` a
`dpl_AACcct6M78ZCxgJ7kZgkLFe6jt6T`; el read-back confirma `READY` y el
alias legacy continúa en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete
post-promoción en `/private/tmp/hermes-h04d-2026-10-11-post/` pasó otra vez
el runner con siete recibos. `WEB_PUSH_ENABLED=false` y
`PUSH_SCHEDULER_ENABLED=false`: **no hay envío Web Push habilitado**.

**Pendiente con owner Esteban:** ratificar explícitamente el residual H04d
para este deployment, porque se agregó el binding beta `WEB_PUSH_ENABLED`.
La aceptación no activa Push ni cambia legacy. **Pendiente con owner Codex:**
tras esa ratificación, preparar la suscripción consentida y canary de dos
usuarios, conciliar sus filas/entregas, y solicitar una decisión separada
antes de activar el scheduler y el envío. No hay pasos abiertos sin owner.

### Preparación de suscripción consentida — contrato de implementación

Tras la ratificación de Esteban para este deployment, Codex prepara en
«Mi cuenta» un control voluntario por dispositivo. El estado inicial no pide
permiso ni registra service worker; solo un clic explícito inicia la solicitud.
La API autenticada entrega únicamente la clave VAPID pública. El cliente
detecta soporte, registra `/sw.js`, crea/reutiliza la suscripción y la guarda
para el usuario autenticado; también permite revocarla. Fallos de navegador,
permiso, clave o red se explican sin afirmar que hay envíos activos.

Invariantes: no leer ni exponer la clave privada; no crear movimiento,
reintegro ni notificación; no habilitar `WEB_PUSH_ENABLED`,
`NOTIFICATIONS_ENABLED` o el scheduler; no tocar legacy. Verificar con tests
la autenticación de la API y las ramas de alta/baja. Esta preparación no es
el canary real: Esteban consiente cada dispositivo y Codex concilia usuarios,
suscripciones y entregas antes de pedir una decisión separada de activación.

**Owners:** Codex implementa y verifica el control, despliega solo en beta
tras gates y reatesta H04d; Esteban consiente la prueba de dispositivo y
decide después si autoriza habilitar envíos. El caso de navegador compartido,
permisos bloqueados y plataformas sin Push queda explícito en la UI. Ningún
step abierto queda sin owner.

El corte local quedó implementado en la página «Mi cuenta» y en
`GET /api/push/subscribe` autenticado: no se pide permiso al montar la
página, una suscripción preexistente no se atribuye automáticamente a la
cuenta actual y la revocación es explícita. El GET entrega solo la clave
pública con `Cache-Control: no-store`; si falta, responde 503. La clave
privada no pasa al cliente. Verificación con Node 22: 107 suites/937 tests de
app y harness aprobaron, TypeScript y build local aprobaron; lint cerró con
0 errores y 67 warnings existentes. Esto no es prueba de entrega real ni
autoriza encender flags. **Owner Codex:** commit, despliegue beta con H04d
renovado y prueba de dispositivo; **owner Esteban:** consentimiento del
dispositivo y decisión separada de activación.

### Decisión H04d recibida

Esteban ratificó «sí, solo para este beta» para el deployment
`dpl_AACcct6M78ZCxgJ7kZgkLFe6jt6T` con el binding nuevo apagado. El
alcance humano H04d de ese deployment queda cerrado, aunque el resultado
automático sigue `isolationVerified:false`. La preparación del control de
suscripción será un nuevo cambio de código; cualquier nuevo deployment se
reatesta por separado. Esta decisión no enciende Push ni toca legacy.

### Deployment beta del opt-in — 11/10/2026

Commit `8f98a00`, deployment beta `dpl_HSBMb77a9M77RK3hisbxkT9ZtNJb`
READY. Su build pasó la aserción H04d y el alias canónico beta apunta al ID
nuevo; el alias legacy no se movió. Los siete recibos privados del deployment
nuevo pasaron el runner de consistencia con `isolationVerified:false`, como
corresponde al residual beta aceptado. No se cambió ninguna variable de
entorno ni se activó envío/scheduler. **Abierto, owner Esteban:** consentir
desde «Mi cuenta» la preparación de un dispositivo y reportar el resultado.
**Abierto, owner Codex:** reconciliar en beta la suscripción sin exponer
endpoint ni claves, verificar comportamiento de la UI y documentar el canary
antes de pedir una autorización aparte para encender envíos.

### Primer dispositivo consentido — 12/10/2026

Esteban probó la web beta autenticado como `esteban_beta_qa`. Sus capturas
de las 01:46 ART muestran que el navegador pidió permiso después del clic
y que «Mi cuenta» devolvió «Dispositivo preparado. Los envíos beta siguen
apagados». La conciliación read-only de `beta-hermes` a las 01:48 ART
encontró **1 suscripción / 1 usuario**, asociada a
`esteban_beta_qa`, frente a 0 antes de la prueba; el outbox Push conserva
**0 filas**. No se consultaron ni publicaron endpoint, claves ni payload.

**Cerrado:** alta voluntaria del primer dispositivo y respuesta de la UI.
**Abierto, owner Esteban/Sabri:** consentimiento independiente de Sabri en
su dispositivo/cuenta beta. **Abierto, owner Codex:** conciliar que haya dos
usuarios distintos, verificar que no se reasignó la suscripción de Esteban,
preparar el canary de entrega sin tocar movimientos existentes y pedir una
decisión explícita antes de activar `WEB_PUSH_ENABLED`, notificaciones o el
scheduler. La prueba actual no demuestra entrega, retry ni aislamiento A/B
en un dispositivo real.
