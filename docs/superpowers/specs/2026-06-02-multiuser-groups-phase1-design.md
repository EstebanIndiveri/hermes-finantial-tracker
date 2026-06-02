# Hermes Finance — Multi-usuario / Grupos (Fase 1)
**Fecha:** 2026-06-02  
**Status:** Aprobado  
**Scope:** Grupos, membresías, permisos e invitaciones. Excluye bot multi-grupo y solicitudes de gasto (Fase 2).

---

## 1. Resumen

Permitir que un usuario cree grupos de finanzas compartidos, invite a otras personas con roles específicos y gestione los datos (transacciones, presupuestos, categorías) a nivel de grupo. El usuario existente migra automáticamente a un grupo personal "Hogar" sin pérdida de datos.

---

## 2. Reglas de negocio

- Un usuario puede **crear** hasta `MAX_OWNED_GROUPS = 2` grupos (constante de configuración).
- Un usuario puede **pertenecer** a un número ilimitado de grupos ajenos (como invitado).
- Cada grupo tiene un **nombre editable** por el Owner.
- Los datos (transacciones, presupuestos, categorías, monthly_settings) son **por grupo**.
- El campo `user_id` se mantiene en las tablas de datos para saber quién registró cada ítem.

---

## 3. Roles y permisos

| Acción | Owner | Admin | Member |
|--------|-------|-------|--------|
| Ver transacciones del grupo | ✅ | ✅ | ✅ |
| Agregar transacciones | ✅ | ✅ | ✅ |
| Editar/eliminar propias | ✅ | ✅ | ✅ |
| Editar/eliminar de otros | ✅ | ✅ | ❌ |
| Editar presupuestos | ✅ | ✅ | ❌ |
| Invitar miembros | ✅ | ✅ | ❌ |
| Cambiar roles de miembros | ✅ | ❌ | ❌ |
| Renombrar grupo | ✅ | ❌ | ❌ |
| Eliminar grupo | ✅ | ❌ | ❌ |

- El Owner no puede ser degradado ni removido por nadie (solo puede eliminar el grupo).
- Un Admin no puede modificar el rol de otro Admin ni del Owner.
- Al eliminar un grupo, todos sus datos se eliminan en cascada.

---

## 4. Schema de base de datos

### Tablas nuevas

```sql
-- Grupos
CREATE TABLE groups (
  id        TEXT PRIMARY KEY,       -- UUID
  name      TEXT NOT NULL,
  owner_id  TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Membresías
CREATE TABLE group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (group_id, user_id)
);

-- Invitaciones
CREATE TABLE group_invitations (
  id          TEXT PRIMARY KEY,       -- UUID
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,   -- UUID v4, para la URL pública
  role        TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  created_by  TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,          -- ISO 8601
  used_at     TEXT,                   -- NULL = no usada
  used_by     TEXT REFERENCES users(id)
);
```

### Modificaciones a tablas existentes

```sql
-- +1 columna group_id en cada tabla de datos
ALTER TABLE transactions      ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE budgets            ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE monthly_settings   ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE categories         ADD COLUMN group_id TEXT REFERENCES groups(id);
```

> `group_id` se declara nullable para la migración; se hace NOT NULL tras el backfill.

---

## 5. Migración automática

El script de migración se ejecuta una sola vez en deploy:

1. Verificar que `groups` table existe.
2. Para cada usuario sin grupo personal:
   - `INSERT INTO groups (id, name, owner_id)` → id=UUID, name="Hogar"
   - `INSERT INTO group_members (group_id, user_id, role)` → role='owner'
3. `UPDATE transactions SET group_id = <nuevo_group_id> WHERE user_id = <user_id> AND group_id IS NULL`
4. Mismo UPDATE para `budgets`, `monthly_settings`, `categories`.
5. `ALTER TABLE ... NOT NULL` no es posible en Turso/SQLite sin recrear — se valida en la app con `WHERE group_id IS NOT NULL`.

Script: `scripts/migrate-multiuser-groups.mjs`

---

## 6. API Routes

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/groups` | session | Todos los grupos del usuario (owned + member) |
| POST | `/api/groups` | session | Crear grupo (verifica límite MAX_OWNED_GROUPS) |
| GET | `/api/groups/[id]` | member | Info del grupo |
| PATCH | `/api/groups/[id]` | owner | Renombrar grupo |
| DELETE | `/api/groups/[id]` | owner | Eliminar grupo + cascade |
| GET | `/api/groups/[id]/members` | member | Lista de miembros |
| PATCH | `/api/groups/[id]/members/[userId]` | owner | Cambiar rol de un miembro |
| DELETE | `/api/groups/[id]/members/[userId]` | owner/self | Remover miembro (o salir del grupo) |
| POST | `/api/groups/[id]/invitations` | owner/admin | Generar link de invitación |
| DELETE | `/api/groups/[id]/invitations/[invId]` | owner/admin | Revocar invitación |
| GET | `/api/join/[token]` | público | Obtener info del grupo por token |
| POST | `/api/join/[token]` | session | Aceptar invitación |

### Selección de grupo activo

El grupo activo se almacena en una **cookie httpOnly** `active_group_id`. El middleware la inyecta como header `x-group-id` a todas las rutas de datos, igual que `x-user-id`. Si la cookie no está, se usa el grupo personal del usuario.

---

## 7. Middleware

`middleware.ts` ya inyecta `x-user-id`. Se extiende para:

1. Leer `active_group_id` de la cookie.
2. Verificar que el usuario es miembro del grupo activo.
3. Si no, usar el grupo personal (fallback).
4. Inyectar `x-group-id` en todas las rutas de datos.

Todas las API routes de datos existentes (`/api/transactions`, `/api/budgets`, `/api/export`, etc.) reemplazan el filtro `WHERE user_id = ?` por `WHERE group_id = ?`.

---

## 8. Flujo de invitación

1. Owner/Admin abre modal en `/dashboard/group/settings`.
2. Elige rol (member o admin).
3. POST `/api/groups/[id]/invitations` → devuelve token UUID.
4. Frontend construye URL: `https://hermes.app/join/<token>`.
5. Usuario copia el link y lo comparte (WhatsApp, Telegram, email, etc.).
6. Invitado abre el link → `/join/[token]` (página pública, no requiere login).
7. Si no tiene cuenta → redirige a `/login?redirect=/join/[token]`.
8. Si ya logueado → GET `/api/join/[token]` muestra info del grupo.
9. POST `/api/join/[token]` → verifica expiración, verifica que no es ya miembro, INSERT group_members, marca `used_at`.
10. Redirect a `/dashboard` con el nuevo grupo activo.

Validaciones en POST `/api/join/[token]`:
- Token existe y `used_at IS NULL`.
- `expires_at` no superado.
- Usuario no es ya miembro del grupo.
- Límite `MAX_OWNED_GROUPS` no aplica aquí (es unirse, no crear).

---

## 9. Componentes UI

| Componente | Path | Descripción |
|-----------|------|-------------|
| `GroupSwitcher` | `components/dashboard/GroupSwitcher.tsx` | Dropdown en sidebar con lista de grupos, rol, botón crear |
| `GroupSettingsPage` | `app/dashboard/group/settings/page.tsx` | Renombrar, lista de miembros, cambio de roles, danger zone |
| `InviteModal` | `components/dashboard/InviteModal.tsx` | Elegir rol, generar link, copiar, regenerar |
| `JoinPage` | `app/join/[token]/page.tsx` | Página pública de aceptación de invitación |
| `CreateGroupModal` | `components/dashboard/CreateGroupModal.tsx` | Formulario nombre del grupo nuevo |

### Cambios a componentes existentes

- `HermesSidebar.tsx`: reemplaza logo/nombre estático por `<GroupSwitcher>`. Agrega sección "Grupo" con links a Miembros y Config grupo.
- Todas las API calls existentes en el frontend ya usan cookies → no cambia nada en el cliente. El `active_group_id` es invisible para el código frontend existente.

---

## 10. Testing

Cada API route tiene su suite en `__tests__/`:

- `groups`: crear, límite MAX_OWNED_GROUPS, listar (owned + member).
- `groups/[id]`: renombrar (owner ✅, admin ❌), eliminar con cascade.
- `groups/[id]/members`: listar, cambiar rol, remover, salir.
- `groups/[id]/invitations`: crear, revocar.
- `join/[token]`: token válido, expirado, ya usado, ya miembro.
- Middleware: inyección `x-group-id`, fallback a grupo personal.

Casos edge cubiertos:
- Token expirado → 410 Gone.
- Token ya usado → 409 Conflict.
- Usuario ya es miembro → 409 Conflict.
- Owner intenta salir del grupo → 403 (debe eliminar el grupo).
- Límite MAX_OWNED_GROUPS superado → 422.
- Cambio de rol del Owner → 403.

---

## 11. Out of scope (Fase 2)

- Bot multi-grupo en Telegram (el bot sigue usando el grupo personal).
- Solicitudes de gasto (aprobar/rechazar compras entre miembros).
- División de gastos estilo Tricount.
- Pasarela de pagos.
