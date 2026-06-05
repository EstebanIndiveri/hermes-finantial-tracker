# Hermes Compartidos — Spec de Diseño
## Parte 4: Testing, Rollback y Plan de Implementación

---

## 1. Estrategia de rollback (pre-implementación)

Antes de escribir una sola línea de código de implementación:

```bash
# 1. Tag de git con el estado actual de producción
git tag v1.0-pre-compartidos
git push origin v1.0-pre-compartidos

# 2. Snapshot del schema de DB
# Ejecutar desde la carpeta del proyecto:
npx drizzle-kit generate   # asegura que el schema está limpio
# Guardar el schema actual en docs como referencia de rollback

# 3. Variables de entorno actuales documentadas en .env.example
```

**Rollback si algo sale mal:**
```bash
git checkout v1.0-pre-compartidos   # vuelve al código previo
# La migración de DB es solo ADD tables — no modifica nada existente
# Para hacer rollback de DB: DROP TABLE en el orden inverso de FK
```

El orden de DROP para rollback:
```sql
DROP TABLE IF EXISTS split_payments;
DROP TABLE IF EXISTS split_items;
DROP TABLE IF EXISTS split_payers;
DROP TABLE IF EXISTS splits;
DROP TABLE IF EXISTS split_session_members;
DROP TABLE IF EXISTS split_sessions;
DROP TABLE IF EXISTS bot_conversation_state;
DROP TABLE IF EXISTS temp_users;
```

---

## 2. Testing

### Tests unitarios — `lib/splits/balances.ts`

La lógica de balances y simplificación de deudas es el núcleo del módulo. Debe tener cobertura completa:

```typescript
// Happy path
- calcular balance neto con un pagador y partes iguales
- calcular balance con múltiples pagadores
- simplifyDebts: 3 personas, balances simples
- simplifyDebts: 4+ personas, reduce al mínimo de transacciones
- sesión con pagos parciales recalcula correctamente
- sesión 100% saldada retorna todos los balances en 0

// Edge cases
- sesión con 1 solo participante
- gasto cancelado no afecta balances
- pago de monto mayor a la deuda (sobrepago)
- múltiples gastos, algunos con subconjunto de participantes

// Error cases
- split_items que no suman el total del gasto
- participante en split_items que no está en session_members
```

### Tests unitarios — `lib/telegram/splits/`

```typescript
// Parsing de comandos
- /compartido 50000 Descripción → extrae monto y descripción
- /compartido con monto con puntos (50.000) y comas (50,000)
- /pague esteban → identifica destinatario
- /balances → no requiere parámetros
- Comando inválido → respuesta de ayuda

// Handler de grupo
- mensaje de grupo sin sesión activa → respuesta de activación
- mensaje de externo sin /activar → link de registro
- /activar con usuario ya registrado → crea sesión
- /activar con sesión ya activa → error informativo
- /cerrar con owner → solicita confirmación
- /cerrar con no-owner → error de permisos
```

### Tests de API — routes

```typescript
// GET /api/splits/sessions
- retorna solo sesiones del usuario autenticado
- filtra por status si se pasa query param

// POST /api/splits/sessions
- crea sesión con datos válidos
- falla si falta nombre

// POST /api/splits/sessions/[id]/items
- crea split con partes iguales
- crea split con porcentajes (deben sumar 100%)
- crea split con montos fijos (deben sumar el total)
- falla si participante no está en la sesión

// GET /api/splits/sessions/[id]/balances
- calcula correctamente con pagos parciales
- retorna [] si sesión no tiene gastos

// PATCH /api/splits/sessions/[id] (cerrar)
- solo el owner puede cerrar
- retorna resumen con deudas pendientes si las hay
```

### Tests de integración — flujo bot

No se implementan en MVP (requieren mock de Telegram API). Se documentan como test manual:

**Test manual checklist:**
- [ ] Agregar bot a grupo → mensaje de bienvenida
- [ ] `/activar` como externo → crea temp_user, activa sesión
- [ ] `/compartido 1000 Test` → flujo completo partes iguales
- [ ] Foto de ticket → OCR detecta monto → flujo completo
- [ ] `/pague [nombre]` → registra pago manual
- [ ] Foto de comprobante → OCR detecta → confirma pago
- [ ] `/balances` → muestra estado correcto
- [ ] `/cerrar` → confirmación → sesión cerrada
- [ ] Cierre automático cuando balance = 0
- [ ] Alerta a las 24hs con deuda pendiente

---

## 3. Plan de implementación — fases

La implementación sigue el flujo estricto del workflow:
**Branch → RED (tests) → GREEN (código) → Audit → PR**

### Fase 1: DB + lógica de balances

**Branch:** `feature/splits-db-and-balances`

1. Migración `0010_add_splits_module.sql` — todas las tablas nuevas
2. Schema Drizzle para las nuevas tablas (`lib/db/schema.ts`)
3. `lib/splits/types.ts` — interfaces
4. `lib/splits/balances.ts` — `calculateBalances` + `simplifyDebts`
5. Tests unitarios para `balances.ts` (cobertura completa)

### Fase 2: API REST

**Branch:** `feature/splits-api`

1. Todos los endpoints de `/api/splits/`
2. Tests de API para cada endpoint
3. Validaciones de input con Zod

### Fase 3: Web UI

**Branch:** `feature/splits-web-ui`

1. Sidebar: agregar ítem "Compartidos"
2. Páginas: lista, detalle, nueva sesión, nuevo gasto
3. Componentes: SessionCard, SplitItemRow, BalanceRow, forms
4. Skeletons: `loading.tsx` por ruta + clases CSS en `hermes.css`
5. Responsive mobile + dark mode (automático por CSS vars)

### Fase 4: Bot de Telegram — grupos

**Branch:** `feature/splits-bot`

1. `bot_conversation_state` — tabla + helpers de lectura/escritura
2. Extensión del webhook para detectar mensajes de grupo
3. Handler de grupos: `lib/telegram/splits/handler.ts`
4. Comandos: `/activar`, `/compartido`, `/pague`, `/balances`, `/cerrar`, `/editar`, `/cancelar`
5. OCR de comprobantes: `lib/telegram/splits/ocr-comprobante.ts`
6. OCR de tickets en grupos (reutiliza pipeline existente, prompt diferente)

### Fase 5: Alertas automáticas

**Branch:** `feature/splits-alerts`

1. Extender cron existente `/api/cron/daily-alerts`
2. Detectar sesiones con deudas > 24hs sin actividad
3. Enviar alerta al grupo via `sendTelegramMessage`
4. Registrar timestamp de última alerta en `split_sessions`

---

## 4. Decisiones de diseño registradas

| Decisión | Alternativas consideradas | Razón |
|---|---|---|
| Módulo completamente separado del dashboard | Integración opcional con categorías | Evita confundir al usuario, más simple |
| Un owner único por sesión | Co-administradores | MVP más simple, cubre el 95% de casos |
| Temp_users en lugar de redirigir siempre a registro | Solo usuarios registrados pueden participar | Reduce fricción para externos |
| Bot en grupos como interfaz principal | Solo chat privado | Fricción cero para externos ya en el grupo |
| Inline keyboards (botones) en lugar de texto libre | Parsear comandos complejos | Elimina ambigüedad en grupos con múltiples usuarios |
| Balance neto (no por gasto) | Rastrear deuda por gasto específico | Más simple para el usuario, minimiza transacciones |
| ARS/USD agnóstico (número sin moneda) | Tipo de cambio por split | Participantes externos no tienen config de moneda |
| Cierre automático + manual | Solo manual | Mejor UX, detecta el momento de saldar sin que nadie lo pida |
| Recordatorios en grupo | DM privado | DM requiere que el usuario haya iniciado conversación; en grupo siempre funciona |

---

## 5. Backlog post-MVP (excluido del spec actual)

- DM privado a deudores cuando se crea un split (requiere bot vinculado individualmente)
- Vincular grupo Telegram a sesión desde la web (actualmente solo desde el bot)
- Export PDF de sesión cerrada
- Historial de sesiones con estadísticas (total gastado, promedio por evento)
- Configurar intervalo de alertas desde la web
- Upgrade path de temp_user a cuenta completa (detectar telegram_user_id al registrarse)
- Soporte para bot en múltiples grupos simultáneos con el mismo owner
- Notificación push web (PWA) cuando alguien confirma un pago
