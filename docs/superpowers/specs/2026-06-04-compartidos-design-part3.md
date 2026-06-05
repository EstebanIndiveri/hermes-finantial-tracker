# Hermes Compartidos — Spec de Diseño
## Parte 3: Web UI — Páginas, Componentes y API

---

## 1. Sidebar

Agregar ítem en `HermesSidebar.tsx` bajo la sección "PRINCIPAL", después de "Categorías":

```tsx
<Link
  href="/dashboard/compartidos"
  className={`h-nav-item${pathname.startsWith("/dashboard/compartidos") ? " active" : ""}`}
  onClick={() => setMobileOpen(false)}
>
  <svg>/* handshake icon */</svg>
  Compartidos
</Link>
```

Badge numérico opcional mostrando sesiones activas con deudas pendientes (implementar si hay tiempo, no blocker).

---

## 2. Rutas web

```
/dashboard/compartidos              → Lista de sesiones
/dashboard/compartidos/nueva        → Crear nueva sesión
/dashboard/compartidos/[id]         → Detalle de sesión
/dashboard/compartidos/[id]/nuevo   → Nuevo gasto en sesión
```

Todas dentro del layout existente `DashboardLayout` — usa automáticamente `HermesSidebar` y `h-main`/`h-content`.

---

## 3. Página principal — `/dashboard/compartidos`

### Layout

```
[Header: "🤝 Compartidos" + botón "＋ Nueva sesión"]

[Strip de resumen — 3 cards]
  Te deben | Debés | Balance neto

[Tabs: Activas | Cerradas | Todas]

[Lista de session cards]
```

### Strip de resumen

Tres `h-card` con:
- **Te deben**: suma de balances positivos en sesiones abiertas (color verde `--haccent-green` o verde del sistema)
- **Debés**: suma de balances negativos (color rojo)
- **Balance neto**: suma total (verde si positivo, rojo si negativo)

### Session Card

Cada sesión muestra:
- Nombre + badge de estado ("Abierta" en verde / "Cerrada" en gris)
- Metadata: fecha, número de gastos, origen (Telegram / solo web)
- Chips de miembros con avatar inicial + nombre. Los `temp_users` llevan icono 👤 y borde dashed
- Strip de balance: "Te deben X · Debés Y" + valor neto grande
- Click en la card navega a `/dashboard/compartidos/[id]`

### Skeleton (`loading.tsx`)

```tsx
// Simula strip + 3 cards
<div class="h-skel-summary-strip">  // 3 skeleton cards
<div class="h-skel-session-card">   // x3
  header + chips + balance strip
```

---

## 4. Página de detalle — `/dashboard/compartidos/[id]`

### Layout (desktop)

```
[Back button ← Compartidos]
[Header: nombre sesión + badge + botón "＋ Nuevo gasto"]

[Left column — 2/3]          [Right column — 1/3]
  Lista de gastos              Panel de balances
                               Panel de acciones
```

### Layout (mobile)

Stack vertical: gastos → balances → acciones

### Lista de gastos

Cada row:
- Ícono emoji de descripción (genérico si no aplica)
- Nombre del gasto + metadata (quién pagó, tipo de división, fecha)
- Monto total + "Tu parte: $X"
- Badge de estado: "Tu parte pagada ✅" | "Pendiente 🟡"
- Menú contextual (solo owner): Editar monto | Cancelar

### Panel de balances

Para cada persona con balance != 0:
- Avatar + nombre + tipo (usuario Hermes / temp)
- Monto con color: verde (te debe) / rojo (le debés)
- Botón "Marcar pagado" → modal de confirmación de pago

### Panel de acciones

Botón "Cerrar sesión" (solo owner) — amarillo/warning:
- Si quedan deudas: modal de confirmación con lista de deudas
- Si balance = 0: cierre inmediato con resumen

### Skeleton

```tsx
// Header + 2 columnas
// Left: 3 expense rows skeleton
// Right: 3 balance rows skeleton + action panel skeleton
```

---

## 5. Página de nuevo gasto — `/dashboard/compartidos/[id]/nuevo`

### Formulario

```
[Descripción]        → input text
[Monto total]        → input number
[¿Quién pagó?]       → chips seleccionables de los miembros
                       opción "Pagaron varios" expande sub-form por persona
[¿Participan todos?] → chips con toggle, todos activos por defecto
[¿Cómo dividir?]     → 3 opciones visuales: Igual / % / Fijos
[Preview del split]  → tabla en vivo: nombre | monto | rol
[Botón: Registrar gasto]
```

El preview se recalcula en tiempo real al cambiar monto, participantes o tipo de división.

"Pagaron varios" expande una sub-sección por cada participante con input de monto. El total debe igualar el monto del gasto (validación en tiempo real, botón disabled si no cuadra).

---

## 6. Página de nueva sesión — `/dashboard/compartidos/nueva`

### Formulario

```
[Nombre de la sesión]          → input text, requerido
[Participantes]                → búsqueda por nombre/username, chips removibles
                                 siempre incluye al usuario actual
                                 puede agregar externos (nombre libre, opcional @telegram)
[Vincular grupo Telegram]       → campo opcional: pegar chat_id o vincular luego desde el bot
[Botón: Crear sesión]
```

Los participantes agregados sin cuenta Hermes se crean como `temp_users` al guardar. Si el @telegram coincide con un `temp_user` ya existente, se reutiliza.

---

## 7. API Endpoints

### Sesiones

```
GET    /api/splits/sessions              → lista sesiones del usuario (activas y cerradas)
POST   /api/splits/sessions              → crear nueva sesión
GET    /api/splits/sessions/[id]         → detalle de sesión (gastos + balances)
PATCH  /api/splits/sessions/[id]         → actualizar estado (cerrar)
```

### Gastos

```
POST   /api/splits/sessions/[id]/items   → crear nuevo gasto
PATCH  /api/splits/items/[id]            → editar monto del gasto
DELETE /api/splits/items/[id]            → cancelar gasto
```

### Pagos

```
POST   /api/splits/sessions/[id]/payments → registrar pago (manual o con OCR)
GET    /api/splits/sessions/[id]/balances → calcular balances netos de la sesión
```

### Setup bot

```
POST   /api/splits/activate              → activar sesión para un chat_id de Telegram
                                          (llamado internamente desde el webhook)
```

### OCR de comprobante

Reutiliza `lib/ocr/` existente con prompt diferente. No es un endpoint nuevo — el webhook del bot llama directamente a la función de OCR.

---

## 8. Lógica de balances — función utilitaria

Nueva función `lib/splits/balances.ts`:

```typescript
/**
 * Calcula los balances netos de una sesión y simplifica las deudas
 * al mínimo de transacciones necesarias.
 */
export function calculateBalances(
  splits: Split[],
  payers: SplitPayer[],
  items: SplitItem[],
  payments: SplitPayment[]
): Balance[]

export function simplifyDebts(balances: Balance[]): Debt[]
```

`simplifyDebts` implementa el algoritmo greedy de Tricount:
1. Calcula balance neto por persona
2. Separa en deudores (balance < 0) y acreedores (balance > 0)
3. Empareja greedy para minimizar número de transacciones

---

## 9. Constraints de UI

| Elemento | Regla |
|---|---|
| CSS | Solo clases `h-*` y tokens `--haccent`, `--hborder`, `--htext*`, etc. |
| Cards | `h-card` existente como base |
| Inputs | Mismos estilos que settings/budgets |
| Skeletons | Componente `<Skel>` existente, nuevas clases CSS en `hermes.css` |
| Dark mode | Automático via CSS vars, sin lógica adicional |
| Mobile | `h-mobile-menu-btn` ya maneja el sidebar; contenido apila verticalmente con `flex-direction: column` en breakpoint `max-width: 640px` |
| Animaciones | Ninguna nueva — las que ya existen en `hermes.css` |

---

## 10. Archivos nuevos

```
app/dashboard/compartidos/
  page.tsx                 → lista de sesiones
  loading.tsx              → skeleton de lista
  nueva/
    page.tsx               → formulario nueva sesión
  [id]/
    page.tsx               → detalle de sesión
    loading.tsx            → skeleton de detalle
    nuevo/
      page.tsx             → formulario nuevo gasto

app/api/splits/
  sessions/
    route.ts               → GET list, POST create
    [id]/
      route.ts             → GET detail, PATCH close
      items/
        route.ts           → POST new split item
      payments/
        route.ts           → POST payment
      balances/
        route.ts           → GET calculated balances
  items/
    [id]/
      route.ts             → PATCH edit amount, DELETE cancel
  activate/
    route.ts               → POST activate group (called from webhook)

lib/splits/
  balances.ts              → calculateBalances, simplifyDebts
  types.ts                 → interfaces Split, Balance, Debt, etc.

lib/telegram/splits/
  handler.ts               → handleSplitGroupMessage (router de comandos del grupo)
  commands/
    activar.ts
    compartido.ts
    pague.ts
    balances.ts
    cerrar.ts
    editar.ts
    cancelar.ts
  ocr-comprobante.ts       → OCR específico para comprobantes de pago

lib/db/migrations/
  0010_add_splits_module.sql

components/splits/
  SessionCard.tsx
  SplitItemRow.tsx
  BalanceRow.tsx
  SplitForm.tsx
  SessionForm.tsx
  BalanceSummaryStrip.tsx
```
