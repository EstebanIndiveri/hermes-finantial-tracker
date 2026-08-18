# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|--------------------------|---------|------------|-------------|----------|
| Turso / libSQL | DB | Primary persistent store for users, groups, budgets, transactions, Telegram state | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | High | `lib/db/client.ts`, `drizzle.config.ts`, `.env.example` |
| Telegram Bot API | API | Webhook ingestion, replies, message edits, file downloads | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_SECRET_TOKEN` | High | `app/api/telegram/webhook/route.ts`, `lib/telegram/send-message.ts`, `lib/telegram/ocr.ts` |
| Groq API | API | Natural-language and receipt parsing | `GROQ_API_KEY` | Medium | `lib/ai/groq.ts`, `lib/ai/parse-receipt.ts`, `.env.example` |
| OCR.Space | API | OCR for Telegram images/documents | `OCR_SPACE_API_KEY` | Medium | `lib/telegram/ocr.ts`, `.env.example` |
| Ripio rates endpoint | API | Fetch USDT/ARS exchange rate | None (public request) | Medium | `lib/exchange/ripio.ts`, `app/api/cron/update-exchange-rate/route.ts` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| Turso/libSQL SQLite | Production data store | `lib/db/client.ts` + Drizzle schema | Concurrent writes and stateful business rules need care | `lib/db/client.ts`, `lib/db/schema.ts` |
| `db.sqlite` | Local file artifact present in repo | [TODO] not used as the production client source | Can confuse source-vs-artifact boundaries | `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/db.sqlite` |

### 3) Secrets and Credentials Handling

- Credential sources: environment variables from `.env.example`
- Hardcoding checks: no real secrets were found in source; env placeholders are used instead
- Rotation or lifecycle notes: [TODO] no secret rotation policy or secret-manager integration was found

### 4) Reliability and Failure Behavior

- Retry/backoff behavior: [TODO] no retry/backoff policy was detected for external APIs
- Timeout policy: `app/api/telegram/webhook/route.ts` uses `export const maxDuration = 60`; other per-request timeouts were not found
- Circuit-breaker or fallback behavior: OCR, Groq, and some Telegram helpers return `null` or throw on failure; Ripio throws a typed error

### 5) Observability for Integrations

- Logging around external calls: yes, mostly `console.error(...)` in catch blocks and failure branches
- Metrics/tracing coverage: no metrics/tracing config was detected
- Missing visibility gaps: no structured logger, no alerting/trace pipeline, no SLO instrumentation

### 6) Evidence

- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/db/client.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/telegram/webhook/route.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/ocr.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/ai/groq.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/exchange/ripio.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/.env.example`
