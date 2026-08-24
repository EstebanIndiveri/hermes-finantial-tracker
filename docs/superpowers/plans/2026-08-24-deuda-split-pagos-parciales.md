# Plan: Deuda Split / Pagos Parciales

**Date:** 2026-08-24  
**Feature:** Completar el ecosistema de splits con balances globales, pagos parciales e historial de pagos

## Objetivo

Extender el sistema de splits existente para permitir:
1. Ver balances **globales** entre partners (agregando todas las sesiones, no solo una)
2. Hacer **pagos parciales** ("te debo 5000, te doy 2000 ahora")
3. Ver **historial de pagos** entre partners
4. Recibir **notificaciones** cuando alguien te paga

## Arquitectura Existente

### Tablas actuales
- `split_sessions` - Sesiones de gastos compartidos
- `split_payments` - Pagos entre participantes (ya tiene `amount`)
- `split_payers`, `split_items` - Quién pagó y quién debe por split

### Lógica existente
- `lib/splits/balances.ts` → `calculateSessionBalances()` calcula balances por sesión
- `simplifyDebts()` → algoritmo greedy para minimizar transferencias

### Bot existente
- `/pague` → muestra deudas y permite confirmar pago TOTAL
- `/balances` → muestra balances de la sesión activa

### Web existente
- `/dashboard/compartidos` → lista sesiones
- `/dashboard/compartidos/[id]` → detalle de sesión con balances

---

## Tareas

### Task 1: Cálculo de Balances Globales

**Objetivo:** Crear función que agregue balances de TODAS las sesiones entre partners.

**Archivos:**
- `lib/splits/global-balances.ts` (nuevo)

**Pasos:**
1. Crear nueva función `calculateGlobalBalances(userId: string)` que:
   - Obtenga todas las sesiones donde participa el usuario
   - Calcule balances por cada sesión usando `calculateSessionBalances()`
   - Agregue los balances por partner (sumar nets de cada sesión)
   - Retorne `GlobalBalanceSummary` con deudas simplificadas globales
2. Agregar tipos a `lib/splits/types.ts`:
   - `GlobalDebt` extiende `Debt` con metadata (sesiones involucradas)
   - `GlobalBalanceSummary` con balances globales y deudas
3. Tests en `lib/splits/__tests__/global-balances.test.ts`

**Verificación:**
```bash
npm test -- lib/splits/__tests__/global-balances.test.ts
```

---

### Task 2: API de Balances Globales

**Objetivo:** Endpoint para obtener balances globales del usuario logueado.

**Archivos:**
- `app/api/splits/global-balances/route.ts` (nuevo)

**Pasos:**
1. Crear endpoint GET que:
   - Autentique al usuario con `getSession()`
   - Llame a `calculateGlobalBalances(userId)`
   - Retorne deudas globales con nombres de partners
2. Incluir info de partners (nombre, métodos de pago si tienen)
3. Incluir desglose por sesión para cada deuda

**Verificación:**
```bash
curl -X GET http://localhost:3000/api/splits/global-balances -H "Cookie: ..."
```

---

### Task 3: UI Dashboard de Balances Globales

**Objetivo:** Nueva página mostrando balances globales con todos los partners.

**Archivos:**
- `app/dashboard/balances/page.tsx` (nuevo)
- `app/dashboard/balances/BalancesClient.tsx` (nuevo)

**Pasos:**
1. Crear página con lista de "Te deben" y "Debés"
2. Por cada partner mostrar:
   - Avatar/nombre
   - Monto total
   - Botón para ver desglose por sesión
   - Botón "Registrar pago" que lleva a Task 5
3. Agregar link en sidebar a `/dashboard/balances`
4. Usar colores verde (te deben) y rojo (debés)

**Verificación:**
Manual: Verificar que se ve lista correcta de balances globales.

---

### Task 4: Pagos Parciales en Bot

**Objetivo:** Permitir pagar montos parciales con `/pague`.

**Archivos:**
- `lib/telegram/splits/commands/pague.ts` (modificar)
- `lib/telegram/splits/callback-handler.ts` (modificar si es necesario)

**Pasos:**
1. Al seleccionar acreedor, agregar opción de monto:
   - Botón "Pago total: $X"
   - Botón "Pago parcial"
2. Si elige parcial, preguntar monto (input de texto)
3. Validar que monto <= deuda
4. Confirmar y registrar en `split_payments`
5. Actualizar mensaje mostrando deuda restante

**Verificación:**
Bot: `/pague` → seleccionar acreedor → elegir parcial → ingresar monto → confirmar

---

### Task 5: Pagos Parciales en Web

**Objetivo:** Modal/formulario para registrar pagos parciales desde web.

**Archivos:**
- `app/dashboard/balances/PagarModal.tsx` (nuevo)
- `app/api/splits/payments/route.ts` (nuevo o extender existente)

**Pasos:**
1. Crear modal que muestre:
   - Nombre del acreedor
   - Deuda total
   - Campo para monto a pagar (con slider o input)
   - Selector de método de pago
   - Botón confirmar
2. POST a `/api/splits/payments` con datos
3. Validar monto <= deuda en servidor
4. Insertar en `split_payments`
5. Refrescar vista de balances

**Verificación:**
Manual: Abrir modal, ingresar monto parcial, confirmar, ver que deuda se reduce.

---

### Task 6: Historial de Pagos

**Objetivo:** Ver todos los pagos realizados/recibidos entre partners.

**Archivos:**
- `app/api/splits/payments/history/route.ts` (nuevo)
- `app/dashboard/balances/historial/page.tsx` (nuevo)

**Pasos:**
1. Endpoint GET que retorne pagos del usuario (como payer o payee)
2. Incluir: fecha, monto, partner, sesión origen, método
3. Página con tabla/lista de pagos ordenados por fecha
4. Filtros por partner y rango de fechas
5. Botón "Ver historial" desde dashboard de balances

**Verificación:**
Manual: Ver lista de pagos correcta con todos los datos.

---

### Task 7: Notificaciones de Pago

**Objetivo:** Notificar al acreedor cuando le pagan.

**Archivos:**
- `lib/telegram/splits/commands/pague.ts` (modificar)
- `lib/splits/notifications.ts` (nuevo)

**Pasos:**
1. Al confirmar pago (bot o web), notificar al acreedor por Telegram
2. Mensaje: "💰 @usuario te pagó $X. Tu deuda restante: $Y"
3. Si acreedor no tiene Telegram vinculado, guardar notificación pendiente
4. Integrar con futuro sistema de notificaciones push

**Verificación:**
Bot: Confirmar pago y verificar que acreedor recibe notificación.

---

## Orden de Ejecución

1. **Task 1** (dependencia base)
2. **Task 2** (usa Task 1)
3. **Task 4** (independiente, bot)
4. **Task 3** (usa Task 2)
5. **Task 5** (usa Task 2 y Task 3)
6. **Task 6** (independiente)
7. **Task 7** (integración final)

## Comandos de Build/Test

```bash
# Tests específicos de splits
npm test -- lib/splits/__tests__

# Build completo
npm run build

# Verificar tipos
npm run lint
```

## Criterios de Éxito

- [ ] Usuario puede ver cuánto debe/le deben globalmente
- [ ] Usuario puede pagar montos parciales desde bot y web
- [ ] Usuario puede ver historial de todos los pagos
- [ ] Acreedor recibe notificación cuando le pagan
- [ ] No se rompe funcionalidad existente de splits
