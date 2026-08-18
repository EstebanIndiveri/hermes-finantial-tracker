# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: layered, feature-oriented Next.js application
- Why this classification: request handling lives in `app/api/**/route.ts`, cross-cutting auth/group resolution lives in `middleware.ts`, and shared domain/integration logic lives under `lib/`
- Primary constraints: middleware injects `x-user-id` / `x-group-id`; many flows depend on Turso/libSQL; Telegram and split flows are deeply stateful

### 2) System Flow

```text
browser/Telegram request -> middleware or webhook auth -> route handler -> lib/domain logic -> db/external API -> JSON response or Telegram message
```

1. `middleware.ts` verifies the `hermes_session` cookie and sets `x-user-id` / `x-group-id` when possible.
2. Page or API routes in `app/` read those headers and enforce membership or onboarding rules.
3. Domain helpers in `lib/` validate input, compute budgets/status, and resolve groups.
4. `lib/db/client.ts` accesses Turso/libSQL through Drizzle using the schema in `lib/db/schema.ts`.
5. Integrations in `lib/telegram/`, `lib/ai/`, and `lib/exchange/` call Telegram, Groq, OCR.Space, and Ripio.
6. Handlers return JSON, update cookies, or send/edit Telegram messages depending on the entry point.

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `middleware.ts` | Session verification, onboarding gating, active-group resolution | Business rules for budgets or Telegram parsing | `middleware.ts` |
| `app/api/*` | HTTP validation, authorization, orchestration, responses | Shared parsing logic or DB setup | `app/api/transactions/route.ts`, `app/api/auth/login/route.ts` |
| `lib/db/*` | Client, schema, relations, migrations | UI rendering or HTTP routes | `lib/db/client.ts`, `lib/db/schema.ts` |
| `lib/telegram/*` | Telegram message/callback handling and API wrappers | Next.js page composition | `app/api/telegram/webhook/route.ts`, `lib/telegram/send-message.ts` |
| `lib/ai/*` and `lib/exchange/*` | External API adapters and parsing | Request routing | `lib/ai/groq.ts`, `lib/exchange/ripio.ts` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Singleton client export | `lib/db/client.ts` | Shared DB access across routes and helpers |
| Adapter wrapper | `lib/telegram/send-message.ts`, `lib/ai/groq.ts`, `lib/exchange/ripio.ts` | Keeps API details out of route handlers |
| Membership guard | `lib/groups/permissions.ts`, `app/api/transactions/route.ts` | Centralizes group access checks |
| Cookie-backed session | `middleware.ts`, `lib/utils/session.ts` | Stateless auth across pages and APIs |

### 5) Known Architectural Risks

- `app/api/transactions/route.ts` documents a TOCTOU race on hard budget limits; concurrent inserts can overshoot a limit
- `lib/telegram/handlers.ts` is large (scan reports ~42KB), which makes Telegram flows harder to reason about and test
- Login rate limiting is in-memory in `app/api/auth/login/route.ts`, so it does not persist across restarts or multiple instances

### 6) Evidence

- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/middleware.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/transactions/route.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/client.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/send-message.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/ai/groq.ts`
- `/Users/estebanindiveri/.copilot/session-state/6e9095bf-c44e-4870-9482-841a839a5589/files/codebase-scan.txt`
