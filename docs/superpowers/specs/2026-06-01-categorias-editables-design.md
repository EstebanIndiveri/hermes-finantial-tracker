# Categorías Editables desde la Web — Spec de diseño

**Fecha:** 2026-06-01  
**Estado:** Aprobado  
**Alcance:** Web dashboard — página propia `/dashboard/categories`

---

## Resumen

Permitir al usuario crear, editar y eliminar categorías directamente desde la web, sin necesidad de acceder a la base de datos. La edición es inline: hacer clic en una fila la convierte en inputs editables. Categorías con transacciones no pueden eliminarse.

---

## Comportamiento esperado

1. El usuario navega a `/dashboard/categories` desde el sidebar.
2. Ve la lista completa de categorías (activas e inactivas) ordenadas por `sort_order`.
3. Hace clic en ✏️ de cualquier fila → esa fila se convierte en inputs editables (nombre, emoji, orden, límite por defecto). Aparecen botones Guardar / Cancelar.
4. Hace clic en "+ Nueva categoría" → aparece una nueva fila vacía en modo edición al final de la lista.
5. Hace clic en 🗑️:
   - Si la categoría tiene transacciones → toast de error: "No se puede eliminar: tiene N movimientos".
   - Si no tiene transacciones → confirmación inline "¿Eliminar? Sí / No".
6. Solo una fila puede estar en modo edición a la vez. Al editar otra fila, la anterior se descarta (con confirmación si tiene cambios sin guardar).

---

## Campos editables

| Campo | Tipo | Validación |
|-------|------|-----------|
| Nombre | texto | Requerido, max 40 chars, único |
| Emoji | texto | Requerido, máx 2 chars visibles |
| Orden | número | Entero 1–99 |
| Límite por defecto | toggle on/off | Default: on |

**Slug:** Auto-generado del nombre al crear (lowercase, sin acentos, espacios → `_`). No editable una vez creado.

---

## Arquitectura

### Página

`app/dashboard/categories/page.tsx` — Client Component.

- Carga todas las categorías en `useEffect` via `GET /api/categories?all=true`.
- Estado local: array de categorías + `editingId` (cuál fila está en edición).
- Optimistic update: actualiza estado local inmediatamente, revierte si el servidor falla.

### API Routes

#### `GET /api/categories` (extender)

Agregar soporte para `?all=true` (sin filtro `is_active`). Sin ese param, comportamiento existente sin cambios.

#### `POST /api/categories`

Body: `{ name, emoji, sort_order, default_hard_limit }`

Respuesta: `{ id, slug, name, emoji, sort_order, default_hard_limit, is_active }`

Auto-genera `slug` del nombre.

#### `PATCH /api/categories/[id]`

Body parcial: `{ name?, emoji?, sort_order?, default_hard_limit?, is_active? }`

Retorna la categoría actualizada.

#### `DELETE /api/categories/[id]`

Verifica que no existan transacciones con `category_id = id`. Si las hay, responde `409 Conflict` con `{ error, count }`. Si no, elimina.

### DB — migración

Agregar columna a `categories`:

```sql
ALTER TABLE categories ADD COLUMN default_hard_limit INTEGER NOT NULL DEFAULT 1;
```

Aplicar directamente a Turso via script Node (mismo patrón que migraciones anteriores).

Actualizar `lib/db/schema.ts` con el nuevo campo.

---

## Validaciones del servidor

- Nombre vacío → 400
- Nombre duplicado (slug colisión) → 409
- Emoji vacío → 400
- Sort order fuera de rango (< 1 o > 99) → 400
- DELETE con transacciones existentes → 409

---

## Sidebar / Navegación

Agregar ítem "Categorías" en el menú lateral. Posición: entre "Dashboard" y "Ajustes" (o donde encaje visualmente).

---

## Archivos a crear / modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `app/dashboard/categories/page.tsx` | Crear | Página completa con lista inline editable |
| `app/api/categories/route.ts` | Modificar | Extender GET con `?all=true`; agregar POST |
| `app/api/categories/[id]/route.ts` | Crear | PATCH + DELETE con guards |
| `lib/db/schema.ts` | Modificar | Agregar `default_hard_limit` a `categories` |
| `app/hermes.css` | Modificar | Estilos del editor inline de categorías |
| Sidebar/nav component | Modificar | Agregar link a `/dashboard/categories` |

---

## Casos de borde

| Caso | Comportamiento |
|------|---------------|
| Crear categoría con nombre ya existente | 409 del servidor → toast "Ya existe una categoría con ese nombre" |
| Eliminar categoría con transacciones | 409 → toast "No se puede eliminar: tiene N movimientos" |
| Editar mientras hay cambios sin guardar | Prompt: "Tenés cambios sin guardar, ¿salir igual?" |
| Emoji con más de 2 chars visibles | Input limita a 2 grafemas |
| Sort order duplicado | Permitido — las categorías con mismo orden se ordenan por nombre |
| Desactivar categoría (is_active = 0) | Sigue visible en la página de categorías con badge "Inactiva", se oculta del resto de la app |

---

## Fuera de alcance (MVP)

- Drag & drop para reordenar
- Colores personalizados por categoría
- Ícono con selector visual de emoji (se escribe directamente)
- Fusionar dos categorías (reasignar transacciones)
- Categorías por usuario (son globales)
