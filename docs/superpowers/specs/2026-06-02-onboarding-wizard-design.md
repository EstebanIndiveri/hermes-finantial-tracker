# Onboarding Wizard — Diseño

**Fecha:** 2026-06-02  
**Estado:** Aprobado  
**Scope:** Usuarios nuevos que ingresan vía enlace de invitación

---

## Contexto

Cuando un usuario acepta una invitación a Hermes Finance:
1. Abre el enlace `/join/[invite_token]`
2. Completa el formulario de registro: nombre + token personal + confirmar token
3. Se llama `POST /api/auth/register` → cuenta creada, sesión iniciada
4. Hoy: redirige directo a `/dashboard`

**El token personal ya se crea durante el registro** — el onboarding NO necesita ese paso.

---

## Objetivo

Guiar al usuario nuevo por las features principales antes de que llegue al dashboard vacío, reduciendo la sensación de "¿y ahora qué hago?".

---

## Flujo completo

```
/join/[token] → (registro exitoso) → /onboarding → /dashboard
```

El onboarding se muestra **solo una vez**. Se marca como completado en la DB.

---

## Pasos del wizard

### Paso 1 — Bienvenida

- Emoji/icono de bienvenida
- "¡Bienvenido/a, [nombre]!"
- Card con datos del grupo:
  - Nombre del grupo
  - Quién invitó (nombre del owner/invitante)
  - Rol asignado (member / admin)
  - Permisos visibles en bullets: "Podés ver gastos del grupo", "Podés agregar transacciones"
- CTA: **Siguiente →**
- Link secundario: "Ir al dashboard directo" (salta todo el wizard)

### Paso 2 — Tour del dashboard

Slideshow de 4 features con descripción breve. Navega con flechas o swipe.

| Slide | Icono | Título | Descripción |
|-------|-------|--------|-------------|
| 1 | 📊 | Dashboard | Resumen mensual: ingresos, gastos, ahorro, distribución por categoría |
| 2 | ➕ | Registrar gastos | Escribí directamente o usá el bot de Telegram |
| 3 | 🗂️ | Categorías y presupuesto | Configurá límites por categoría y llevá el control |
| 4 | 🤖 | Bot de Telegram | Registrá gastos y consultá saldo desde el chat |

- Indicadores de punto (dots) para saber en qué slide está
- Flechas prev/next
- CTA fijo: **Siguiente →** (avanza al paso 3 desde cualquier slide)

### Paso 3 — Conectar Telegram (opcional)

- Código de vinculación generado automáticamente (llama `POST /api/auth/telegram/code`)
- Botón "Abrir en Telegram" → deep link `https://t.me/HermesFinanceAssistBot?start=link_CODE`
- Botón "Saltar por ahora" → avanza al final
- Nota: "Podés hacerlo después en Configuración"

### Pantalla final

- Ring de check verde ✅
- "¡Todo listo, [nombre]!"
- Lista con lo que quedó configurado (cuenta, grupo, Telegram si fue vinculado)
- CTA: **Ir al dashboard 🚀**

---

## Indicador de progreso

Barra de 2 segmentos en la parte superior (pasos 1 y 2 son "content steps", el 3 es opcional y se muestra con su propio color):

- Inactive: gris claro
- Active: azul
- Done: verde

---

## Marcado como completado

- Campo `onboarding_completed_at TIMESTAMP` en tabla `users`
- Se actualiza con `PATCH /api/auth/me` `{ onboarding_completed: true }` al llegar a la pantalla final o al usar "Ir al dashboard directo"
- Si el usuario ya tiene `onboarding_completed_at` → middleware redirige `/onboarding` → `/dashboard`

---

## Archivos a crear/modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `app/onboarding/page.tsx` | Crear | Wizard completo (client component) |
| `app/join/[token]/JoinClient.tsx` | Modificar | Redirigir a `/onboarding` en lugar de `/dashboard` post-registro |
| `app/api/auth/me/route.ts` | Modificar | Aceptar PATCH para marcar `onboarding_completed` |
| `lib/db/schema.ts` | Modificar | Agregar `onboarding_completed_at` a tabla `users` |
| `drizzle/migrations/` | Crear | Migration para el nuevo campo |
| `middleware.ts` | Modificar | Si tiene sesión activa y va a `/onboarding` pero ya completó → redirect a `/dashboard` |

---

## Decisiones de diseño

- **Mobile-first**: Full-screen, sin sidebar, sin nav. Solo el wizard.
- **Skippable**: En cualquier momento desde paso 1 se puede ir directo al dashboard.
- **Token no incluido**: Ya se crea en el registro — no se repite.
- **Sin brute force protection** aquí (tema separado, backlog).
- El owner/admin original (sin invite) NO ve el onboarding (ya tiene `onboarding_completed_at` nulo pero es la cuenta original — se puede manejar con una migration que lo marque como completado).

---

## Fuera de scope

- Onboarding para el owner (primer usuario que crea el grupo) — puede hacerse en una iteración futura
- Rate limiting en login — backlog separado
