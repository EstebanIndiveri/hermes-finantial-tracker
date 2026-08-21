# Plan: Gastos Recurrentes

**Fecha**: 2026-08-20
**Feature**: Gastos Recurrentes (Recurring Expenses)
**Branch**: `feature/recurring-expenses`
**Prioridad**: #2 del backlog (valor 9/10, esfuerzo 3/5)

---

## 1. Objetivo

Permitir a los usuarios registrar gastos recurrentes (Netflix, Spotify, alquiler, servicios, tarjetas) que se ejecutan automáticamente al inicio de cada mes con alertas y confirmación. Disponible tanto en la web como en el bot de Telegram con soporte completo de audio.

### Valor para el Usuario
- Nunca olvidar un pago recurrente
- Registro automático de gastos predecibles
- Alertas al inicio del mes para confirmar/saltar gastos
- Control total desde el bot o la web
- Proyección de gastos fijos del mes

---

## 2. Alcance

### En Scope ✅
- CRUD de gastos recurrentes (web + bot)
- Sugerencias de gastos recurrentes comunes
- Ejecución automática configurable (día del mes)
- Alertas al inicio del mes para confirmar/saltar
- Soporte de audio en el bot
- Dashboard con estadísticas de recurrentes
- Marcar como "pausado" temporalmente
- Historial de ejecuciones

### Fuera de Scope ❌
- Integración con débito automático bancario
- Predicción de aumentos de tarifas
- Pagos parciales de recurrentes

---

## 3. Diseño de Base de Datos

### Nueva tabla: `recurring_expenses`

```sql
CREATE TABLE recurring_expenses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,           -- "Netflix", "Alquiler"
  amount_ars DECIMAL(12,2) NOT NULL,    -- Monto fijo
  category_id INTEGER REFERENCES categories(id),
  merchant VARCHAR(100),                 -- Comercio asociado
  frequency VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'weekly', 'yearly'
  day_of_month INTEGER DEFAULT 1,        -- Día de ejecución (1-28)
  is_active BOOLEAN DEFAULT true,        -- Pausado/Activo
  auto_confirm BOOLEAN DEFAULT false,    -- Si true, no pide confirmación
  notes TEXT,                            -- Notas adicionales
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recurring_user ON recurring_expenses(user_id);
CREATE INDEX idx_recurring_active ON recurring_expenses(is_active);
```

### Nueva tabla: `recurring_executions`

```sql
CREATE TABLE recurring_executions (
  id SERIAL PRIMARY KEY,
  recurring_expense_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES transactions(id),
  scheduled_date DATE NOT NULL,          -- Fecha programada
  executed_at TIMESTAMP,                 -- Cuándo se ejecutó
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'confirmed', 'skipped', 'auto_executed'
  amount_ars DECIMAL(12,2),              -- Monto real (puede variar del programado)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_execution_recurring ON recurring_executions(recurring_expense_id);
CREATE INDEX idx_execution_date ON recurring_executions(scheduled_date);
```

---

## 4. Tasks de Implementación

### TASK-1: Database Schema y Migrations
**Archivo**: `lib/db/schema.ts`
**Dependencias**: Ninguna
**Esfuerzo**: S

- [ ] Agregar tabla `recurring_expenses` al schema
- [ ] Agregar tabla `recurring_executions` al schema
- [ ] Crear relaciones con `users`, `categories`, `transactions`
- [ ] Agregar índices para queries frecuentes
- [ ] Test: Verificar que las tablas se crean correctamente

```typescript
// Agregar en schema.ts
export const recurringExpenses = pgTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  amountArs: decimal("amount_ars", { precision: 12, scale: 2 }).notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  merchant: varchar("merchant", { length: 100 }),
  frequency: varchar("frequency", { length: 20 }).default("monthly"),
  dayOfMonth: integer("day_of_month").default(1),
  isActive: boolean("is_active").default(true),
  autoConfirm: boolean("auto_confirm").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const recurringExecutions = pgTable("recurring_executions", {
  id: serial("id").primaryKey(),
  recurringExpenseId: integer("recurring_expense_id").notNull()
    .references(() => recurringExpenses.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactions.id),
  scheduledDate: date("scheduled_date").notNull(),
  executedAt: timestamp("executed_at"),
  status: varchar("status", { length: 20 }).default("pending"),
  amountArs: decimal("amount_ars", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

### TASK-2: Queries de Gastos Recurrentes
**Archivo**: `lib/db/recurring-queries.ts` (nuevo)
**Dependencias**: TASK-1
**Esfuerzo**: M

- [ ] `getUserRecurringExpenses(userId)` - Listar recurrentes activos
- [ ] `createRecurringExpense(data)` - Crear nuevo recurrente
- [ ] `updateRecurringExpense(id, data)` - Actualizar recurrente
- [ ] `deleteRecurringExpense(id)` - Eliminar recurrente
- [ ] `toggleRecurringExpense(id)` - Pausar/Activar
- [ ] `getPendingExecutions(userId, month)` - Ejecuciones pendientes del mes
- [ ] `executeRecurring(executionId, amount?)` - Confirmar y crear transacción
- [ ] `skipExecution(executionId)` - Saltar ejecución
- [ ] `getRecurringStats(userId)` - Estadísticas (total mensual, por categoría)
- [ ] Tests para cada función

---

### TASK-3: API Routes CRUD
**Archivo**: `app/api/recurring-expenses/route.ts` (nuevo)
**Dependencias**: TASK-2
**Esfuerzo**: M

```
GET    /api/recurring-expenses          - Listar todos
POST   /api/recurring-expenses          - Crear nuevo
PATCH  /api/recurring-expenses/[id]     - Actualizar
DELETE /api/recurring-expenses/[id]     - Eliminar
POST   /api/recurring-expenses/[id]/toggle - Pausar/Activar
```

- [ ] Endpoint GET con filtros (active, category)
- [ ] Endpoint POST con validación
- [ ] Endpoint PATCH con validación parcial
- [ ] Endpoint DELETE con confirmación
- [ ] Endpoint toggle para pausar/activar
- [ ] Tests de integración para cada endpoint

---

### TASK-4: API Routes Ejecuciones
**Archivo**: `app/api/recurring-expenses/executions/route.ts` (nuevo)
**Dependencias**: TASK-2, TASK-3
**Esfuerzo**: M

```
GET    /api/recurring-expenses/executions          - Listar pendientes del mes
POST   /api/recurring-expenses/executions/[id]/confirm - Confirmar ejecución
POST   /api/recurring-expenses/executions/[id]/skip    - Saltar ejecución
GET    /api/recurring-expenses/stats               - Estadísticas
```

- [ ] Endpoint GET ejecuciones pendientes con info del recurrente
- [ ] Endpoint confirm que crea la transacción
- [ ] Endpoint skip que marca como saltado
- [ ] Endpoint stats con totales y proyecciones
- [ ] Tests de integración

---

### TASK-5: Cron Job Mensual
**Archivo**: `app/api/cron/recurring/route.ts` (nuevo)
**Dependencias**: TASK-2
**Esfuerzo**: S

- [ ] Crear endpoint para Vercel Cron
- [ ] Lógica: crear ejecuciones pendientes al día 1 del mes
- [ ] Auto-ejecutar las que tienen `auto_confirm = true`
- [ ] Enviar notificaciones Telegram para las pendientes
- [ ] Agregar configuración en `vercel.json`
- [ ] Test de lógica de creación de ejecuciones

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/recurring",
    "schedule": "0 8 1 * *"  // Día 1 de cada mes a las 8am
  }]
}
```

---

### TASK-6: UI Web - Página de Recurrentes
**Archivo**: `app/dashboard/recurrentes/page.tsx` (nuevo)
**Dependencias**: TASK-3, TASK-4
**Esfuerzo**: L

**Diseño UI** (siguiendo frontend-design skill):
- **Estética**: Continuidad con el diseño existente de Hermes
- **Layout**: Grid de cards con los gastos recurrentes
- **Acciones**: Toggle activo/pausado, editar, eliminar
- **Stats**: Total mensual proyectado en header
- **Pendientes**: Sección destacada con ejecuciones a confirmar

Componentes a crear:
- [ ] `page.tsx` - Página principal
- [ ] `recurring-list.tsx` - Lista de gastos recurrentes
- [ ] `recurring-card.tsx` - Card individual con acciones
- [ ] `recurring-form.tsx` - Modal/Form para crear/editar
- [ ] `pending-executions.tsx` - Sección de pendientes del mes
- [ ] `recurring-stats.tsx` - Estadísticas en header
- [ ] Tests de componentes

---

### TASK-7: Sidebar Navigation
**Archivo**: `components/dashboard/HermesSidebar.tsx`
**Dependencias**: TASK-6
**Esfuerzo**: XS

- [ ] Agregar link "Recurrentes" después de "Reintegros"
- [ ] Usar icono `CalendarClock` o `Repeat` de lucide-react
- [ ] Mantener patrón de active state con pathname

---

### TASK-8: Intents del Bot
**Archivo**: `lib/ai/parse-message.ts`
**Dependencias**: Ninguna
**Esfuerzo**: S

Nuevos intents:
- [ ] `add_recurring` - "agregar gasto recurrente 15000 netflix servicios"
- [ ] `list_recurring` - "mis gastos recurrentes", "recurrentes"
- [ ] `toggle_recurring` - "pausar netflix", "activar alquiler"
- [ ] `pending_recurring` - "pendientes del mes", "qué tengo que pagar"
- [ ] `confirm_recurring` - "confirmar netflix", "pagar alquiler"
- [ ] `skip_recurring` - "saltar luz este mes"
- [ ] Tests para cada intent

Agregar al system prompt:
```
- add_recurring: Usuario quiere agregar un gasto recurrente con monto, nombre y categoría
- list_recurring: Usuario quiere ver sus gastos recurrentes configurados
- toggle_recurring: Usuario quiere pausar o activar un gasto recurrente
- pending_recurring: Usuario quiere ver los gastos pendientes de confirmar este mes
- confirm_recurring: Usuario confirma un gasto recurrente pendiente
- skip_recurring: Usuario quiere saltar un gasto recurrente este mes
```

---

### TASK-9: Bot Handlers
**Archivo**: `lib/telegram/handlers.ts`
**Dependencias**: TASK-2, TASK-8
**Esfuerzo**: L

Handlers a implementar:
- [ ] `handleAddRecurring()` - Flujo interactivo para crear recurrente
- [ ] `handleListRecurring()` - Mostrar lista con botones de acción
- [ ] `handleToggleRecurring()` - Pausar/Activar con confirmación
- [ ] `handlePendingRecurring()` - Mostrar pendientes del mes con botones
- [ ] `handleConfirmRecurring()` - Confirmar y crear transacción
- [ ] `handleSkipRecurring()` - Saltar ejecución del mes
- [ ] Keyboards interactivos para cada flujo
- [ ] Tests de handlers

---

### TASK-10: Bot Callback Handlers
**Archivo**: `lib/telegram/personal-callback-handler.ts`
**Dependencias**: TASK-9
**Esfuerzo**: M

Callbacks a implementar:
```
recurring:list              - Ver lista de recurrentes
recurring:add               - Iniciar flujo de agregar
recurring:edit:{id}         - Editar recurrente
recurring:toggle:{id}       - Pausar/Activar
recurring:delete:{id}       - Eliminar
recurring:pending           - Ver pendientes
recurring:confirm:{execId}  - Confirmar ejecución
recurring:skip:{execId}     - Saltar ejecución
recurring:suggest           - Ver sugerencias de recurrentes comunes
```

- [ ] Handler para cada callback
- [ ] Flujo de confirmación con botones de monto editable
- [ ] Tests de callbacks

---

### TASK-11: Sugerencias de Recurrentes Comunes
**Archivo**: `lib/recurring/suggestions.ts` (nuevo)
**Dependencias**: Ninguna
**Esfuerzo**: S

Lista de sugerencias categorizadas:
```typescript
export const RECURRING_SUGGESTIONS = {
  streaming: [
    { name: "Netflix", category: "entretenimiento", suggestedAmount: 5000 },
    { name: "Spotify", category: "entretenimiento", suggestedAmount: 2500 },
    { name: "Disney+", category: "entretenimiento", suggestedAmount: 4000 },
    { name: "HBO Max", category: "entretenimiento", suggestedAmount: 4500 },
    { name: "Amazon Prime", category: "entretenimiento", suggestedAmount: 3000 },
  ],
  servicios: [
    { name: "Electricidad", category: "servicios", suggestedAmount: null },
    { name: "Gas", category: "servicios", suggestedAmount: null },
    { name: "Agua", category: "servicios", suggestedAmount: null },
    { name: "Internet", category: "servicios", suggestedAmount: 15000 },
    { name: "Celular", category: "servicios", suggestedAmount: 8000 },
  ],
  vivienda: [
    { name: "Alquiler", category: "vivienda", suggestedAmount: null },
    { name: "Expensas", category: "vivienda", suggestedAmount: null },
    { name: "ABL", category: "impuestos", suggestedAmount: null },
  ],
  finanzas: [
    { name: "Tarjeta de Crédito", category: "finanzas", suggestedAmount: null },
    { name: "Seguro Auto", category: "transporte", suggestedAmount: null },
    { name: "Prepaga/Obra Social", category: "salud", suggestedAmount: null },
    { name: "Gimnasio", category: "salud", suggestedAmount: null },
  ],
};
```

- [ ] Crear estructura de sugerencias
- [ ] Función para buscar sugerencia por nombre
- [ ] UI de selección rápida en web y bot

---

### TASK-12: Notificaciones Telegram
**Archivo**: `lib/telegram/notifications.ts` (actualizar)
**Dependencias**: TASK-5
**Esfuerzo**: S

- [ ] `notifyPendingRecurring(userId, executions)` - Alerta de inicio de mes
- [ ] `notifyRecurringConfirmed(userId, recurring)` - Confirmación de pago
- [ ] `notifyRecurringSkipped(userId, recurring)` - Aviso de saltado
- [ ] Mensaje con botones inline para confirmar/saltar cada uno
- [ ] Tests de notificaciones

Formato del mensaje de alerta:
```
📅 *Inicio de mes - Gastos Recurrentes*

Tienes 5 gastos recurrentes pendientes:

1. 🎬 Netflix - $5,000
2. 🎵 Spotify - $2,500
3. 🏠 Alquiler - $150,000
4. 💡 Electricidad - $8,000
5. 📱 Celular - $8,000

*Total proyectado: $173,500*

[Confirmar Todos] [Ver Detalle]
```

---

### TASK-13: Integración Final y QA
**Dependencias**: TASK-1 a TASK-12
**Esfuerzo**: M

- [ ] Verificar flujo completo web: crear → listar → editar → confirmar → historial
- [ ] Verificar flujo completo bot: audio "agregar recurrente" → confirmar → listar
- [ ] Verificar notificaciones al inicio del mes
- [ ] Verificar toggle pausar/activar
- [ ] Verificar skip de ejecución
- [ ] Verificar estadísticas y proyecciones
- [ ] Code review con agente
- [ ] Deployment a producción

---

## 5. Orden de Ejecución

```
TASK-1 (Schema)
    ↓
TASK-2 (Queries) ←→ TASK-11 (Sugerencias) - paralelo
    ↓
TASK-3 (API CRUD) + TASK-8 (Intents) - paralelo
    ↓
TASK-4 (API Executions) + TASK-5 (Cron) - paralelo
    ↓
TASK-6 (UI Web) + TASK-9 (Bot Handlers) - paralelo
    ↓
TASK-7 (Sidebar) + TASK-10 (Bot Callbacks) - paralelo
    ↓
TASK-12 (Notificaciones)
    ↓
TASK-13 (QA)
```

---

## 6. Definición de Terminado

- [ ] Schema aplicado en la base de datos
- [ ] CRUD completo funcionando en web
- [ ] Gastos recurrentes creables desde el bot (texto y audio)
- [ ] Ejecuciones pendientes visibles y confirmables
- [ ] Notificación automática al inicio del mes
- [ ] Toggle pausar/activar funcionando
- [ ] Estadísticas mostrando total mensual
- [ ] Todos los tests pasando
- [ ] Code review sin issues críticos
- [ ] Desplegado en producción

---

## 7. Comandos de Voz Soportados

Una vez implementado, el bot reconocerá:

| Comando de voz | Intent | Acción |
|----------------|--------|--------|
| "agregar gasto recurrente 15000 netflix" | add_recurring | Crea recurrente |
| "mis gastos recurrentes" | list_recurring | Lista recurrentes |
| "recurrentes" | list_recurring | Lista recurrentes |
| "pausar netflix" | toggle_recurring | Pausa el recurrente |
| "activar alquiler" | toggle_recurring | Activa el recurrente |
| "qué tengo que pagar" | pending_recurring | Muestra pendientes |
| "pendientes del mes" | pending_recurring | Muestra pendientes |
| "confirmar netflix" | confirm_recurring | Confirma y registra |
| "pagar spotify" | confirm_recurring | Confirma y registra |
| "saltar luz este mes" | skip_recurring | Salta ejecución |

---

## 8. Estimación Total

| Tarea | Esfuerzo | Tiempo Est. |
|-------|----------|-------------|
| TASK-1 Schema | S | 20 min |
| TASK-2 Queries | M | 45 min |
| TASK-3 API CRUD | M | 40 min |
| TASK-4 API Executions | M | 40 min |
| TASK-5 Cron | S | 25 min |
| TASK-6 UI Web | L | 90 min |
| TASK-7 Sidebar | XS | 10 min |
| TASK-8 Intents | S | 25 min |
| TASK-9 Bot Handlers | L | 60 min |
| TASK-10 Callbacks | M | 45 min |
| TASK-11 Sugerencias | S | 20 min |
| TASK-12 Notificaciones | S | 25 min |
| TASK-13 QA | M | 45 min |
| **TOTAL** | | ~8 horas |

---

## 9. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Cron de Vercel no ejecuta | Media | Alto | Fallback: botón manual "Generar pendientes del mes" |
| Timezone issues con fechas | Media | Medio | Usar UTC y convertir en display |
| Conflicto con gastos existentes | Baja | Medio | Validar duplicados por nombre+fecha |
| Usuario olvida confirmar | Media | Bajo | Recordatorio a los 3 días |

---

## 10. Métricas de Éxito

- ✅ Usuario puede crear gasto recurrente en < 30 segundos (web)
- ✅ Usuario puede crear gasto recurrente por voz en < 20 segundos (bot)
- ✅ Confirmación de gasto en 1 tap/comando
- ✅ Proyección mensual visible siempre
- ✅ 0 gastos olvidados (notificaciones efectivas)
