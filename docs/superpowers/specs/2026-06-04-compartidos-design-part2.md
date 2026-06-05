# Hermes Compartidos — Spec de Diseño
## Parte 2: Bot de Telegram — Flujos y Comandos

---

## 1. Arquitectura del bot para grupos

### Setup del grupo

Cuando el bot es agregado a un grupo de Telegram:

1. Bot envía automáticamente:
   ```
   🤖 Hola! Soy Hermes.
   Para activar los gastos compartidos, 
   un usuario registrado debe usar /activar
   ```

2. Un usuario registrado ejecuta `/activar`:
   - Si tiene `telegram_user_id` en tabla `users` → crea `split_session` con `owner_user_id` y `telegram_chat_id`, status `open`, pide nombre de la sesión
   - Si es externo (no está en `users`) → crea `temp_user` con sus datos de Telegram, luego mismo flow
   - Si el chat_id ya tiene sesión abierta → "Este grupo ya tiene una sesión activa"

3. Bot confirma con lista de comandos disponibles

### Constraint de sesión única

`split_sessions.telegram_chat_id` tiene `UNIQUE` constraint en DB. Solo puede existir una sesión `open` por grupo. Intentar `/activar` con sesión ya abierta retorna error informativo.

### ¿Quién puede ejecutar comandos?

- `/activar` — cualquier usuario (Hermes o externo), activa o crea temp_user
- `/compartido`, foto de ticket — solo el owner de la sesión del grupo
- `/pague`, foto de comprobante — cualquier miembro del grupo
- `/balances` — cualquier miembro del grupo
- `/cerrar` — solo el owner de la sesión
- `/editar`, `/cancelar` — solo el owner de la sesión

---

## 2. Flujo: Crear split

### Via comando manual

```
/compartido 50000 Uber a casa
```

**Pasos del bot:**

1. Detecta `/compartido [monto] [descripción]`
2. Pregunta quién pagó (inline keyboard con miembros del grupo):
   ```
   💳 ¿Quién pagó la cuenta?
   [Esteban (vos)] [Sabri]
   [Juan]          [💳 Pagaron varios]
   ```
3. Si "Pagaron varios" → para cada miembro pregunta cuánto puso (secuencial, espera texto)
4. Pregunta si participan todos:
   ```
   👥 ¿Participan todos en este gasto?
   [✅ Sí, todos] [➖ Quitar alguien]
   ```
5. Si "Quitar alguien" → muestra miembros con botones, toca para excluir, "Listo"
6. Pregunta cómo dividir:
   ```
   [⚖️ Partes iguales] [📊 Porcentajes]
   [💰 Montos fijos]
   ```
7. Muestra tabla en monospace + botones de edición por persona (un botón por persona):
   ```
   Esteban   $16.667   pagó
   Sabri     $16.667   debe
   Juan      $16.666   debe
   ─────────────────────────
   Total:    $50.000 ✅
   
   [✏️ Editar Esteban]
   [✏️ Editar Sabri]
   [✏️ Editar Juan]
   [✅ Confirmar split] [🔄 Cambiar tipo]
   ```
8. Al tocar "✏️ Editar X" → bot pregunta "¿Cuánto paga X? (escribí el monto)"
   - Usuario escribe número → bot edita mensaje con tabla actualizada
9. Confirmar → bot crea split en DB, muestra resumen con balances actualizados

### Via foto de ticket (OCR)

1. Usuario envía foto en el grupo
2. Bot detecta imagen → llama OCR (reutiliza pipeline de `receipt_imports` con prompt distinto)
3. OCR extrae: monto total, descripción/lugar
4. Bot pregunta:
   ```
   🧾 Ticket detectado
   Monto: $48.500
   Lugar: La Parolaccia
   
   ¿El monto es correcto?
   [✅ Sí, $48.500] [✏️ Cambiar monto]
   ```
5. Si "Cambiar monto" → bot pregunta, espera texto con número
6. Continúa desde paso 2 del flujo manual (quién pagó)

---

## 3. Flujo: Pagar deuda

### Via comprobante (OCR)

1. Miembro envía foto en el grupo
2. Bot detecta que es comprobante (vs ticket) — diferenciado por prompt de OCR:
   - Comprobante: contiene "transferencia", "pago", CBU, destinatario, monto
   - Ticket: contiene items, subtotal, tabla de productos
3. OCR extrae: monto, nombre del destinatario, fecha
4. Bot cruza con deudas pendientes del sender:
   - Match exacto → confirma directamente
   - Múltiples deudas → lista opciones
   - Sin match → pregunta a qué corresponde
5. Bot pregunta al sender:
   ```
   📱 Comprobante detectado
   [preview datos del OCR]
   
   @Juan, ¿este comprobante es el pago de:
   Juan → Esteban $20.000 (La Parolaccia)?
   
   [✅ Sí, confirmar] [🔄 Es otro pago]
   ```
6. Confirmar → registra `split_payment` → actualiza balances → notifica al grupo

### Via comando manual

```
/pague esteban
```

1. Bot identifica al sender y busca deudas pendientes con "esteban"
2. Muestra deuda encontrada + pregunta confirmación:
   ```
   💰 @Sabri tenés $20.000 pendiente con Esteban.
   ¿Confirmás que ya le pagaste?
   
   [✅ Sí, pagué $20.000]
   [⚠️ Pagué otro monto]
   [❌ Cancelar]
   ```
3. "Pagué otro monto" → bot pregunta monto → registra pago parcial
4. Confirmado → registra payment → notifica balances actualizados al grupo

---

## 4. Flujo: Consultar y cerrar

### `/balances`

```
📊 Balances del grupo

Juan  → Esteban   Saldado ✅
Sabri → Esteban   $10.000  🟡

[📋 Desglose por gasto] [✅ Saldar todo]
```

### `/cerrar` (solo owner)

```
Bot: ⚠️ ¿Cerrar la sesión "Amigos Cena"?
Quedan deudas pendientes:
  Sabri → Esteban: $10.000

[✅ Cerrar de todas formas] [❌ Cancelar]
```

Al confirmar → bot envía resumen final → `split_sessions.status = 'closed'` → grupo queda libre para nueva sesión

### Cierre automático

Cron o trigger post-payment: si todos los balances de la sesión son 0, el bot envía:
```
🎉 ¡Todas las deudas están saldadas!
Sesión "Amigos Cena" cerrada automáticamente.

[resumen de totales]
```

---

## 5. Flujo: Editar / Cancelar split

### Editar monto (solo owner)

```
/editar
```
→ Bot lista los últimos splits activos → owner elige cuál → pregunta nuevo monto → actualiza `splits.total_amount` y recalcula `split_items` → notifica si hay pagos ya registrados

### Cancelar split (solo owner)

```
/cancelar
```
→ Bot lista splits activos → owner elige → si tiene pagos registrados, advierte:
```
⚠️ Este split tiene pagos registrados.
Cancelarlo revertirá $X de pagos. ¿Confirmar?
[✅ Cancelar split] [❌ No]
```
→ Confirmar → `splits.status = 'cancelled'`, `splits.cancelled_at = now()` → pagos asociados no se eliminan pero se marcan como revertidos

---

## 6. Alertas automáticas en grupo

Extensión del cron existente (`/api/cron/daily-alerts`):

- Condición: sesión abierta + hay balances > 0 + han pasado 24hs desde la última alerta
- Mensaje en el grupo:
  ```
  ⏰ Recordatorio — deudas pendientes
  Sabri: $20.000 → Esteban (La Parolaccia)
  Han pasado 24hs sin confirmar pago.
  ```
- Intervalo: 24hs por defecto, configurable en el futuro
- Se registra timestamp de última alerta en `split_sessions` para no spamear

---

## 7. Estado conversacional del bot

El bot en grupos necesita mantener estado entre mensajes (ej: esperando que el owner escriba un monto). Implementación:

- Tabla `bot_conversation_state` (nueva):
  ```sql
  CREATE TABLE bot_conversation_state (
    chat_id       TEXT NOT NULL,
    user_id       TEXT NOT NULL,       -- telegram_user_id del interlocutor
    state         TEXT NOT NULL,       -- JSON con el paso actual y datos parciales
    expires_at    INTEGER NOT NULL,    -- timestamp de expiración (5 min)
    PRIMARY KEY (chat_id, user_id)
  );
  ```
- Estado se borra al completar el flujo o al expirar
- Si el usuario manda texto inesperado durante un flujo activo, bot recuerda el contexto
- TTL de 5 minutos: si el flow queda colgado, el próximo mensaje lo resetea

---

## 8. Webhook: cambios al handler existente

El archivo `app/api/telegram/webhook/route.ts` se extiende para:

1. Detectar `msg.chat.type === 'group' || 'supergroup'`
2. Para mensajes de grupo: rutear a `handleSplitGroupMessage()` (nuevo handler)
3. Los mensajes privados existentes NO se modifican — el handler actual sigue igual
4. Idempotencia via `telegram_update_id` — ya existe en `bot_messages`, se replica para splits

El handler de grupos vive en `lib/telegram/splits/handler.ts` (nuevo archivo).
