# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | TypeScript | `package.json`, `tsconfig.json` |
| Runtime + version | Node.js [TODO] (version not pinned in repo) | `package.json`, `package-lock.json` |
| Package manager | npm | `package-lock.json`, `package.json` |
| Module/build system | Next.js App Router + TypeScript (`moduleResolution: bundler`) | `package.json`, `tsconfig.json`, `app/layout.tsx` |

### 2) Production Frameworks and Dependencies

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| next | ^16.2.6 | App Router, API routes, middleware, build/runtime | `package.json` |
| react / react-dom | ^19.2.6 | UI rendering | `package.json` |
| drizzle-orm | ^0.45.2 | SQL access layer for SQLite/libSQL | `package.json`, `lib/db/client.ts` |
| @libsql/client | ^0.17.3 | Turso/libSQL database client | `package.json`, `lib/db/client.ts` |
| bcryptjs | ^3.0.3 | Password hashing in auth flows | `package.json`, `app/api/auth/login/route.ts` |
| zod | ^4.4.3 | Input validation | `package.json`, `app/api/transactions/route.ts` |
| next-themes | ^0.4.6 | Theme switching | `package.json`, `app/layout.tsx` |
| sonner | ^2.0.7 | Toast notifications | `package.json`, `app/layout.tsx` |
| xlsx | ^0.18.5 | Excel export generation | `package.json`, `__tests__/export.test.ts` |
| recharts | ^3.8.1 | Dashboard charts | `package.json`, `components/dashboard/SpendingChart.tsx` |
| @base-ui/react | ^1.5.0 | UI primitives | `package.json` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| eslint / eslint-config-next | Linting | `.eslintrc.json`, `package.json` |
| jest / ts-jest | Unit testing | `jest.config.ts`, `package.json` |
| playwright / @playwright/test | E2E testing | `package.json`, `e2e/auth.spec.ts` |
| drizzle-kit | Schema generation/migrations | `drizzle.config.ts`, `package.json` |
| tsx | Running TS seed scripts | `package.json` |
| typescript | Type checking | `tsconfig.json`, `package.json` |

### 4) Key Commands

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run test:e2e
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 5) Environment and Config

- Config sources: `.env.example`, `drizzle.config.ts`, `next.config.ts`, `tsconfig.json`
- Required env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRET_TOKEN`, `SESSION_SECRET`, `WEB_ACCESS_TOKEN`, `CRON_SECRET`, `TELEGRAM_ALLOWED_USER_ID`, `TELEGRAM_CHAT_ID`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `GROQ_API_KEY`, `GROQ_MODEL`, `OCR_SPACE_API_KEY`
- [TODO] `NEXT_PUBLIC_APP_URL` is read in `app/api/telegram/webhook/route.ts` but is not declared in `.env.example`
- Deployment/runtime constraints: README and `.vercel/project.json` indicate Vercel deployment; no Docker or CI config was detected in the scan

### 6) Evidence

- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/package.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/package-lock.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/tsconfig.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/.env.example`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/.eslintrc.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/jest.config.ts`
