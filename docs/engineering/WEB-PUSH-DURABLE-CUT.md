# Web Push durable — contrato previo al corte beta

Estado: diseño, 10/10/2026. Owner técnico: Codex. Decisión de retención y
activación: Esteban. **No habilita envíos ni autoriza una migración legacy.**

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
de prueba. **Pendiente de confirmación de Esteban** antes de fijar DDL,
retención y worker. Si se prefiere no habilitar Web Push, mantenerlo apagado
y cerrar solo la contención de autorización ya probada.

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
