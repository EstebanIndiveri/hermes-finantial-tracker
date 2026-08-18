# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| high | Hard-budget enforcement has a known TOCTOU race in transaction creation | `app/api/transactions/route.ts` | Two concurrent inserts can exceed a hard limit | Use a transaction/locking or optimistic versioning strategy |
| high | Telegram webhook orchestration is large and complex | `app/api/telegram/webhook/route.ts`, `lib/telegram/handlers.ts` | Harder to reason about failures and regression risk | Split webhook flow into smaller handlers |
| medium | Login rate limiting is in-memory only | `app/api/auth/login/route.ts` | Resets on restart and does not share across instances | Move to durable/shared rate limiting if abuse becomes a problem |
| medium | README stack summary is stale vs. actual package versions | `README.md`, `package.json` | Can mislead contributors and deployers | Update docs to match current Next.js version |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| Large Telegram handler modules | Feature growth accumulated in one area | `lib/telegram/handlers.ts` | More bugs and slower review cycles | Break into smaller command/callback modules |
| Best-effort fallbacks without structured observability | MVP focus and no logging stack | `lib/telegram/ocr.ts`, `lib/ai/groq.ts`, `lib/telegram/send-message.ts` | Silent degradation is hard to diagnose | Add structured logs/metrics for failures |
| No visible CI pipeline in scan output | Repository appears to rely on local checks | `/Users/estebanindiveri/.copilot/session-state/6e9095bf-c44e-4870-9482-841a839a5589/files/codebase-scan.txt` | Risk of inconsistent quality gates | Add CI workflow if this repo is active |

### 3) Security Concerns

| Risk | OWASP category (if applicable) | Evidence | Current mitigation | Gap |
|------|--------------------------------|----------|--------------------|-----|
| In-memory login throttling can be bypassed across instances | A07: Identification and Authentication Failures | `app/api/auth/login/route.ts` | Per-IP counter in process memory | Not durable or shared |
| External API failures are often downgraded to `null` | N/A | `lib/telegram/ocr.ts`, `lib/ai/parse-receipt.ts` | Catch blocks prevent crashes | No structured alerting on repeated failure |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| Sequential external calls in Telegram and OCR flows | `app/api/telegram/webhook/route.ts`, `lib/telegram/ocr.ts` | Slow message handling | Higher latency under load | Parallelize independent work where safe |
| Stateful budget checks are computed from live sums | `app/api/transactions/route.ts` | Extra DB reads per insert | Hot paths can get slower as data grows | Cache or aggregate carefully if volume rises |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| `lib/telegram/handlers.ts` | Large orchestration surface | [TODO] no git churn data was available in the scan | Change one command path at a time and add regression tests |
| `app/api/telegram/webhook/route.ts` | Multiple flows in one handler | [TODO] no git churn data was available in the scan | Extract per-chat-type handlers and keep route thin |

### 6) `[ASK USER]` Questions

1. [ASK USER] Should the README be updated to match the current stack version shown in `package.json` (Next.js 16.2.6)?
2. [ASK USER] Do you want the login rate limiter to stay in-memory, or should it be moved to a shared/durable store?

### 7) Evidence

- `/Users/estebanindiveri/.copilot/session-state/6e9095bf-c44e-4870-9482-841a839a5589/files/codebase-scan.txt`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/transactions/route.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/auth/login/route.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/app/api/telegram/webhook/route.ts`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/README.md`
- `/Users/estebanindiveri/Downloads/hermes-finantial-tracker/lib/telegram/handlers.ts`
