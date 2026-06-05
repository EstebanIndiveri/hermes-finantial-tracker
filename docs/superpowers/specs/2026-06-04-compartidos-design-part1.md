# Hermes Compartidos — Spec de Diseño
## Parte 1: Overview, Scope y Base de Datos

**Fecha:** 2026-06-04  
**Estado:** Borrador aprobado — pendiente de implementación  
**Autor:** Brainstorming colaborativo Esteban + Copilot CLI

---

## 1. Overview

Módulo de gastos compartidos al estilo Tricount, completamente separado del dashboard financiero personal de Hermes. Permite registrar tickets, dividir gastos entre personas, calcular balances netos y registrar pagos — tanto desde la web como desde el bot de Telegram en un grupo.

**Lo que NO cambia:** dashboard, categorías, presupuestos, grupos, invitaciones, bot actual, cron de alertas, configuración, cuenta. Cero impacto sobre funcionalidad existente.

---

## 2. Scope del MVP

### Incluido

- Módulo web `/dashboard/compartidos` — sección nueva en el sidebar bajo "Principal"
- Sesiones compartidas: crear, gestionar, cerrar
- Gastos dentro de una sesión: crear desde web y desde bot
- Tres modos de división: partes iguales, porcentajes, montos fijos
- Quién pagó: un pagador o varios con montos distintos
- Selección de participantes por gasto (todos del grupo o subconjunto)
- Balances netos simplificados (estilo Tricount)
- Pagos: manual, comprobante con OCR, pago parcial
- Bot de Telegram en grupos: flujo completo con inline keyboards
- Setup del grupo via `/activar` — owner único, temp_users para externos
- Cierre automático de sesión (balance = $0) y manual (`/cerrar`)
- Alertas en grupo a las 24hs si hay deudas sin saldar
- Editar monto y cancelar split (con advertencia si hay pagos registrados)
- Skeletons en cada pantalla de carga
- Responsive mobile-first, dark mode automático

### Excluido del MVP (backlog)

- DM privado a deudores
- Bot en múltiples grupos simultáneos con diferentes owners
- Export PDF de sesión
- Bot responde en grupos de Telegram tipo C (vinculación automática sin /activar)
- Moneda múltiple (splits usan el número sin conversión)

---

## 3. Principios de diseño

- **Completamente separado del dashboard**: ningún split aparece en presupuestos ni categorías
- **Moneda agnóstica**: el monto es un número; la moneda es contexto conocido por las personas
- **Balance neto**: los balances se calculan como neto acumulado por sesión, no por gasto individual
- **Minimizar transacciones**: al cerrar sesión, Hermes simplifica al mínimo de pagos necesarios
- **UI consistente con Hermes**: clases `h-*`, tokens CSS existentes, mismo layout, dark mode automático

---

## 4. Base de Datos — Tablas nuevas

### 4.1 `temp_users`

Usuarios externos identificados solo por Telegram. No tienen cuenta Hermes completa.

```sql
CREATE TABLE temp_users (
  id                TEXT PRIMARY KEY,          -- UUID
  telegram_user_id  TEXT NOT NULL UNIQUE,       -- ID de Telegram (inmutable)
  telegram_username TEXT,                       -- @username (puede cambiar)
  first_name        TEXT NOT NULL,
  last_name         TEXT,
  created_at        INTEGER NOT NULL,           -- timestamp ms
  upgraded_to       TEXT REFERENCES users(id)   -- NULL hasta que registra cuenta completa
);
```

### 4.2 `split_sessions`

Una sesión agrupa todos los gastos compartidos de un evento (cena, viaje, mes de hogar).

```sql
CREATE TABLE split_sessions (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,                          -- "Cena viernes", "Hogar Junio"
  owner_user_id         TEXT NOT NULL REFERENCES users(id),     -- único owner (usuario Hermes)
  telegram_chat_id      TEXT UNIQUE,                            -- chat_id del grupo Telegram (nullable)
  status                TEXT NOT NULL DEFAULT 'open',           -- 'open' | 'closed'
  created_at            INTEGER NOT NULL,
  closed_at             INTEGER,
  closing_note          TEXT                                     -- resumen al cerrar
);
```

### 4.3 `split_session_members`

Quiénes participan en una sesión. Mezcla de usuarios Hermes y usuarios temporales.

```sql
CREATE TABLE split_session_members (
  session_id    TEXT NOT NULL REFERENCES split_sessions(id),
  user_id       TEXT REFERENCES users(id),         -- NULL si es temp
  temp_user_id  TEXT REFERENCES temp_users(id),    -- NULL si es Hermes user
  joined_at     INTEGER NOT NULL,
  -- Constraint: exactamente uno de user_id o temp_user_id debe ser NOT NULL
  CHECK (
    (user_id IS NOT NULL AND temp_user_id IS NULL) OR
    (user_id IS NULL AND temp_user_id IS NOT NULL)
  )
);
```

### 4.4 `splits`

Un gasto compartido dentro de una sesión.

```sql
CREATE TABLE splits (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES split_sessions(id),
  description     TEXT NOT NULL,                   -- "La Parolaccia", "Uber"
  total_amount    REAL NOT NULL,                   -- monto total (número, sin moneda fija)
  split_type      TEXT NOT NULL,                   -- 'equal' | 'percentage' | 'fixed'
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'cancelled'
  created_by_user_id    TEXT REFERENCES users(id),
  created_by_temp_id    TEXT REFERENCES temp_users(id),
  created_at      INTEGER NOT NULL,
  cancelled_at    INTEGER,
  telegram_message_id   TEXT                        -- para editar el mensaje del bot
);
```

### 4.5 `split_payers`

Quién pagó el gasto físicamente (puede ser uno o varios con distintos montos).

```sql
CREATE TABLE split_payers (
  id           TEXT PRIMARY KEY,
  split_id     TEXT NOT NULL REFERENCES splits(id),
  user_id      TEXT REFERENCES users(id),
  temp_user_id TEXT REFERENCES temp_users(id),
  amount_paid  REAL NOT NULL,                  -- cuánto puso esta persona
  CHECK (
    (user_id IS NOT NULL AND temp_user_id IS NULL) OR
    (user_id IS NULL AND temp_user_id IS NOT NULL)
  )
);
```

### 4.6 `split_items`

La distribución del gasto: cuánto le corresponde a cada participante.

```sql
CREATE TABLE split_items (
  id           TEXT PRIMARY KEY,
  split_id     TEXT NOT NULL REFERENCES splits(id),
  user_id      TEXT REFERENCES users(id),
  temp_user_id TEXT REFERENCES temp_users(id),
  amount_owed  REAL NOT NULL,                  -- lo que le corresponde pagar
  percentage   REAL,                           -- si split_type = 'percentage'
  CHECK (
    (user_id IS NOT NULL AND temp_user_id IS NULL) OR
    (user_id IS NULL AND temp_user_id IS NOT NULL)
  )
);
```

### 4.7 `split_payments`

Registro de pagos de deuda (manual o via comprobante).

```sql
CREATE TABLE split_payments (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES split_sessions(id),
  payer_user_id   TEXT REFERENCES users(id),       -- quien pagó
  payer_temp_id   TEXT REFERENCES temp_users(id),
  payee_user_id   TEXT REFERENCES users(id),       -- quien recibió
  payee_temp_id   TEXT REFERENCES temp_users(id),
  amount          REAL NOT NULL,
  method          TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'receipt_ocr'
  receipt_image_url TEXT,                          -- URL del comprobante si aplica
  ocr_raw_text    TEXT,                            -- texto extraído por OCR
  confirmed_at    INTEGER NOT NULL,
  telegram_update_id TEXT                          -- para idempotencia
);
```

---

## 5. Lógica de balances

El balance neto de una persona en una sesión se calcula como:

```
balance = Σ amount_paid (split_payers) 
        - Σ amount_owed (split_items)
        + Σ amount recibido (split_payments donde payee = esta persona)
        - Σ amount pagado (split_payments donde payer = esta persona)
```

- Resultado **positivo** → le deben dinero
- Resultado **negativo** → debe dinero
- Resultado **cero** → saldado

La simplificación de deudas (minimizar transacciones) se calcula al mostrar balances y al cerrar sesión. No se persiste — se recalcula siempre desde los datos.

---

## 6. Migración DB

Una única migración nueva: `0010_add_splits_module.sql`  
No modifica ninguna tabla existente. Solo `CREATE TABLE`.

El campo `telegram_chat_id` en `split_sessions` es `UNIQUE` para garantizar que un grupo de Telegram solo puede tener una sesión activa a la vez (constraint de la DB, no solo de la aplicación).
