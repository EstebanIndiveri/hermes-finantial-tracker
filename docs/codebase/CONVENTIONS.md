# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files | Route files and utility modules use kebab-case; UI components use PascalCase | `app/api/cron/update-exchange-rate/route.ts`, `components/dashboard/CategoryCard.tsx` | `app/api/cron/update-exchange-rate/route.ts`, `components/dashboard/CategoryCard.tsx` |
| Functions/methods | camelCase | `getActiveMonthArgentina`, `verifySession` | `lib/utils/dates.ts`, `lib/utils/session.ts` |
| Types/interfaces | PascalCase | `GroupMembership`, `OcrResult` | `lib/groups/permissions.ts`, `lib/telegram/ocr.ts` |
| Constants/env vars | SCREAMING_SNAKE_CASE | `SESSION_SECRET`, `TURSO_DATABASE_URL` | `.env.example`, `middleware.ts` |

### 2) Formatting and Linting

- Formatter: [TODO] no Prettier config or formatter script was detected
- Linter: ESLint with `next/core-web-vitals` and `next/typescript` (`.eslintrc.json`)
- Most relevant enforced rules: TypeScript `strict: true`, `noEmit: true`, Next.js TypeScript checks
- Run commands: `npm run lint`, `npm run build`

### 3) Import and Module Conventions

- Import grouping/order: standard ES imports, followed by local `@/` imports in most files
- Alias vs relative import policy: `@/*` is the primary alias for repo-root imports; relative imports are used for nearby module siblings
- Public exports/barrel policy: [TODO] no repo-wide barrel convention detected

### 4) Error and Logging Conventions

- Error strategy by layer: route handlers return JSON `{ error: ... }` with HTTP status codes; lower-level helpers often throw on invalid configuration or return `null` for best-effort flows
- Logging style and required context fields: `console.error(...)` is used in catch blocks with short context strings; some logs include source-specific context like `updateId` or `callback_query_id`
- Sensitive-data redaction rules: secrets come from env vars; `.env.example` contains placeholders only

### 5) Testing Conventions

- Test file naming/location rule: Jest tests live in root `__tests__/` or co-located `**/__tests__/`; Playwright tests live in `e2e/`
- Mocking strategy norm: `jest.mock(...)` is used for module isolation; Playwright uses storage state to start unauthenticated when needed
- Coverage expectation: [TODO] no coverage threshold or coverage config was detected

### 6) Evidence

- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/.eslintrc.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/tsconfig.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/utils/session.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/utils/dates.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/__tests__/middleware.test.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/e2e/auth.spec.ts`
