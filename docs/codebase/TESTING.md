# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: Jest 30.4.2
- Assertion/mocking tools: Jest `expect`, `jest.mock`, Playwright `expect`
- Commands:

```bash
npm test
npm run test:e2e
```

### 2) Test Layout

- Test file placement pattern: root `__tests__/`, co-located `**/__tests__/`, and `e2e/` for Playwright
- Naming convention: `*.test.ts`, `*.test.tsx`, `*.spec.ts`
- Setup files and where they run: `jest.config.ts` for Jest; `e2e/global-setup.ts` and `e2e/helpers.ts` for Playwright

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | yes | utilities, parsers, small helpers | Many tests use mocked dependencies |
| Integration | yes | API route handlers, DB client wiring | `__tests__/middleware.test.ts`, `lib/db/__tests__/client.test.ts` |
| E2E | yes | login/dashboard/group flows | `e2e/auth.spec.ts`, `e2e/dashboard.spec.ts`, `e2e/groups.spec.ts` |

### 4) Mocking and Isolation Strategy

- Main mocking approach: module-level `jest.mock(...)` for DB, Telegram, and other external modules
- Isolation guarantees: Playwright starts with empty storage state for unauthenticated scenarios; Jest tests reset modules and clear mocks where needed
- Common failure mode in tests: environment-dependent code can fail if required env vars are missing

### 5) Coverage and Quality Signals

- Coverage tool + threshold: [TODO] no coverage config or threshold was detected
- Current reported coverage: [TODO]
- Known gaps/flaky areas: [TODO] coverage reporting is not configured in the scanned files

### 6) Evidence

- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/jest.config.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/package.json`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/__tests__/middleware.test.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/__tests__/client.test.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/e2e/auth.spec.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/e2e/global-setup.ts`

