# Contrato de trabajo — PR-01b lint de implementacion

Fecha: 16/09/2026.

## Punto de partida

- SHA: `16f45db` sobre `codex/harness-foundation`.
- Clasificacion: refactor compatible dentro de estabilizacion.
- Baseline: Jest 67/67 suites y 504/504 tests; typecheck verde; ESLint
  ejecutable con 10 errores y 73 advertencias.

## Resultado esperado

Eliminar los 10 errores de ESLint de implementacion sin cambiar reglas de
producto, contratos financieros, autorizacion, persistencia ni salida publica.
Las advertencias quedan visibles como deuda posterior; no se desactivan reglas
de implementacion para declarar verde.

## Archivos permitidos

- `app/api/telegram/webhook/route.ts`
- `app/onboarding/page.tsx`
- `components/ThemeToggle.tsx`
- `components/dashboard/HermesSidebar.tsx`
- `components/dashboard/TransactionList.tsx`
- `components/reimbursements/reimbursements-list.tsx`
- `lib/telegram/handlers.ts`
- `lib/telegram/personal-callback-handler.ts`
- `lib/telegram/splits/commands/activar.ts`
- `lib/telegram/splits/conversation-state.ts`
- `lib/telegram/splits/handler.ts`
- `__tests__/payment-history-page.test.tsx`
- `docs/engineering/QUALITY-GATES.md`
- Pruebas directamente relacionadas con esos componentes/modulos.

## Invariantes

- Telegram conserva el mismo enrutamiento, texto, contexto y escrituras.
- Onboarding conserva polling, cancelacion y transiciones de pasos.
- Tema y sidebar conservan render SSR/hidratacion y navegacion.
- Cambiar filtros reinicia la paginacion de movimientos sin alterar filtrado.
- Reintegros conservan carga, pago y errores actuales.
- Ningun cambio toca DB, secretos, red, webhook real ni produccion.

## Verificacion

- Tests dirigidos existentes y regresiones necesarias.
- `npm run test:harness`, `npm run typecheck`, `npm run test:unit`.
- `npm run lint`; cero errores. Las advertencias se reportan con conteo exacto.
- Diff completo revisado por un agente independiente para detectar cambios de
  comportamiento, especialmente Telegram y ciclos de vida React.

## Exclusiones

- Corregir warnings no relacionados.
- Cambiar UI, copy, permisos, parser, categorias o semantica financiera.
- Push, deploy, E2E, migraciones, servicios externos o produccion.
