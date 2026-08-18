# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `app/` | Next.js App Router pages and API route handlers | `app/layout.tsx`, `app/api/transactions/route.ts` |
| `components/` | Shared UI and dashboard/form components | `components/dashboard/CategoryCard.tsx`, `components/forms/ExpenseForm.tsx` |
| `lib/` | Shared domain logic, DB, integrations, utilities | `lib/db/client.ts`, `lib/telegram/send-message.ts` |
| `__tests__/` | Jest unit tests | `__tests__/middleware.test.ts`, `__tests__/export.test.ts` |
| `e2e/` | Playwright end-to-end tests | `e2e/auth.spec.ts`, `e2e/dashboard.spec.ts` |
| `docs/superpowers/` | Design/spec history | `docs/superpowers/plans/2026-06-02-auth-phase2.md` |
| `.vercel/` | Vercel project metadata | `.vercel/project.json` |
| `lib/db/migrations/` | Versioned SQL migrations | `drizzle.config.ts`, `lib/db/migrations/0000_nervous_bloodstorm.sql` |

### 2) Entry Points

- Main runtime entry: `app/layout.tsx` and `app/page.tsx`
- Secondary entry points: `middleware.ts`, `app/api/**/route.ts`, `e2e/global-setup.ts`
- How entry is selected: Next.js App Router conventions plus `middleware.ts` matcher config

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|-----------------------|
| `app/` | Route handlers, layouts, page-level composition | Shared DB/integration helpers |
| `components/` | Reusable UI and client components | Direct DB access or HTTP integrations |
| `lib/db/` | Client, schema, migrations, data access setup | Page-specific UI logic |
| `lib/telegram/`, `lib/ai/`, `lib/exchange/` | External service adapters and parsing logic | Route-only concerns and JSX |
| `lib/utils/` | Pure helpers and session/date utilities | Side-effectful request handling |

### 4) Naming and Organization Rules

- File naming pattern: route files use kebab-case (`app/api/cron/update-exchange-rate/route.ts`); React components use PascalCase (`components/dashboard/CategoryCard.tsx`)
- Directory organization pattern: domain/feature folders (`dashboard`, `telegram`, `splits`, `groups`, `utils`) with nested subfeatures
- Import aliasing or path conventions: `@/*` maps to the repository root via `tsconfig.json`

### 5) Evidence

- `/Users/estebanindiveri/.copilot/session-state/6e9095bf-c44e-4870-9482-841a839a5589/files/codebase-scan.txt`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/layout.tsx`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/middleware.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/tsconfig.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/client.ts`
