# Implementation status — H04d staging rehearsal

Living cut ledger. Status reflects committed implementation and evidence, not
production readiness. Source of scope: [stabilization plan](../audit/PLAN-DE-ACCION.md),
[H04d runbook](PR-08-H04D-STAGING-REHEARSAL-RUNBOOK.md), and
[H04d.4 evidence contract and addendum](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md).

## Completed cuts

| Cut | Status and evidence |
| --- | --- |
| H04d.1 — isolated runtime controls | Complete at `1e1f912` (`feat(staging): enforce isolated runtime controls`). Runtime identity, auth/session, AI/OCR, notifications, and cron controls are covered by the [runtime isolation contract](PR-09-H04D1-RUNTIME-ISOLATION-CONTRACT.md). Flags remain off; this does not enable traffic. |
| H04d.2 — provider rehearsal | Complete at `0ab71de` (`docs(staging): record provider rehearsal evidence`). Its historical evidence is summarized in the [H04d.4 contract/addenda](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md). It establishes distinct beta resources, not complete production isolation. |
| H04d.3 — local migration rehearsal | Complete at `80286a0`, with production-identity evidence corrected at `87a69c1`. The [local rehearsal record](PR-11-H04D3-LOCAL-MIGRATION-REHEARSAL.md) reports independent local A/B copies, canonical migration fingerprint, idempotent rerun, and clean before/after comparison. No remote DB was migrated. |
| H04d.4a — isolation evidence tooling | Complete at `1ee9515` (`feat(staging): harden isolation evidence`). Adds the local secret fingerprint helper and isolation policy checks; see the [evidence contract](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md). A local verifier result alone does not establish provider-verified isolation. |
| H04d.4b — beta secret evidence cut | Complete at `ff2bd6f` and recorded at `646d095`. Six beta secret fingerprints and provenance receipts are local/ignored; the beta Telegram token configuration helper is at `ff2bd6f`. The addendum records the beta project/DB/bot identities and confirms no DB data/schema, deployment, webhook, or production resource change. See the [H04d.4b addendum](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md#addendum-de-cierre-h04d4b--23092026). |
| H04d.4c — local manifest consistency | Implemented locally with ignored manifests and a generator; the verifier returns `ok: true`, `localManifestConsistent: true`, `isolationVerified: false`. On 24/09 the operator reported the helper's `getMe`/`getWebhookInfo` output matching the canonical production bot ID, username and webhook URL; Codex has not independently queried production. See the [H04d.4c addendum](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md#addendum-de-implementación-h04d4c--23092026). |
| H04d.4d — beta provider reconciliation/configuration | Complete for beta-only setup, 25/09/2026. Its Preview configuration was superseded by H04d.4i's beta Production-target deployment; see the [H04d.4d addenda](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md#addendum-h04d4d-reconciliacion-beta-read-only-24092026). |
| H04d.4e — fresh beta backup/restore and read-only preflight | Local-only preflight complete, 25/09/2026: a fresh export was copied/restored outside the repository, verified with SQLite, and reconciled read-only. The beta DB is empty; the adoption plan correctly remains `blocked` and `applyAuthorized: false`. No remote migration or deployment. See the [H04d.4e addendum](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md#addendum-h04d4e-backup-restauracion-y-preflight-local-25092026). |
| H04d.4f — repetir bootstrap canónico en copias locales | Complete, 25/09/2026: independent A/B copies from the fresh beta export reached the canonical schema fingerprint; A's before/after reconciliation returned `ok: true`, B's second migration applied zero migrations, and both inspections had no pending migrations, drift, conflicts, or FK violations. Evidence remains in a permission-restricted temporary directory outside the repository. This validates only the empty-DB bootstrap mechanism; it does not authorize a remote schema write. |
| H04d.4g — bootstrap canónico en Turso beta | Complete, 26/09/2026, with specific operator authorization: the nine migrations selected by the verified Hermes manifest were applied to the exact beta DB ID in individual transactions. A fresh post-migration export/restore passed integrity; the local inspector reports `canonical`, zero pending/drift/conflicts/FK violations, and an idempotent rerun applied zero migrations. Same-target before/after reconciliation returned `ok: true`, `differences: []`. No production, webhook, traffic, or deployment action. |
| H04d.4h–4i — beta deployment | Beta-only deployment `dpl_78vn7T9LN4xPwngX7HKi91Z43Uro` is READY with code cut `6acaead` (28/09/2026), target `production` only inside the separate beta project; public beta alias `/login` returns 200. Vercel Hobby rejects the per-minute outbox cron, so this deployment preserves the three permitted daily/monthly crons and omits only `/api/cron/telegram-outbox`. `vercel crons list` confirms the 3 active schedules; the canonical `vercel.json` is restored locally and shows the minute worker as a pending local change only. The worker remains disabled; legacy project is untouched. |
| H04d.4j — beta webhook + inbox-only rehearsal | Complete for the inbox-only gate, 26/09/2026; details and the remaining outbox/worker gates are in the live closure register below. This is not full Telegram certification. |

## Open parent gate and next cuts

> Historical snapshot: the notes in this section predate the later H04d.4i/j
> beta deployment and inbox activation. The authoritative current state, owners,
> blockers, and re-entry criteria are in “Operational closure register” below.

H04d.4 is not closed. The two ignored manifests now exist and pass the local
verifier, but this result is a consistent declaration, not verified provider
state. The production Telegram bot ID/username/webhook are supported by the
operator-reported output of the local read-only helper, not an independent
Codex provider query. Production secret
fingerprints remain `null`; no production secret needs to be read or rotated.
The versioned host denylist and six beta fingerprints/provenance are included
as defined by the [contract](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md).

The beta numeric ID `8739389202` was recorded in H04d.2; its webhook was empty
at that inspection and must be rechecked before any remote activity. The local
helper supports user-operated, read-only `getMe`/`getWebhookInfo` capture with
token stdin and whitelisted output. H04d.4c's local consistency work is done;
provider reconciliation remains an open parent gate.

The beta-only Preview configuration is present and verified for
`codex/h04d-staging-rehearsal`; a fresh environment listing still shows the
eight branch-scoped Preview bindings without exposing values. The Vercel
project’s Ignored Build Step remains “Don’t build anything” (`exit 0`), and its
deployment list is empty. The operator authorized only schema initialization
in the exact beta DB; H04d.4g applied it and verified its canonical fingerprint
from a fresh export/restore. The database now has the canonical schema but no
application traffic or deployment has been started. Production metadata and
fingerprint comparison remain unavailable, so `isolationVerified` stays false.
The beta webhook must be checked read-only immediately before any authorized
traffic. Deployment, webhook configuration and traffic remain separate gates.

Subsequent remote rehearsal gates follow the [runbook](PR-08-H04D-STAGING-REHEARSAL-RUNBOOK.md):

1. The beta bootstrap is complete and backed up. H04c defines the Hermes
   manifest/ledger as the active migration path; the two-entry Drizzle journal
   is historical. Build and CI do not invoke `drizzle-kit migrate`, so journal
   reconstruction is not a prerequisite for this Preview. Do not run the native
   Drizzle migrator against beta unless a separate toolchain cut reconciles it.
2. Before a Preview deployment, obtain its separate authorization and keep the
   ignored-build setting in place until then. The branch's local quality gates
   have passed. A Git push by itself must not publish a build.
3. Before any Telegram traffic, obtain separate webhook/traffic authorization,
   freshly verify the beta bot webhook read-only, and use synthetic staging
   users/chats only. Enable inbox, outbox, then worker in separately observed
   steps, reconciling after each; operational rollback disables worker, outbox,
   inbox in that order. Never reverse schema/data or restore over an active DB.
4. Keep the production reference read-only. Do not claim full isolation until
   the open provider-identity evidence is addressed without reading or rotating
   production secrets by inference.

The first beta deployment attempts exposed two Vercel gates: Hobby rejects the
minute-level cron, and CLI `--target preview` was classified as Production.
Those failed/incorrect attempts were removed. The operator then explicitly
confirmed beta Production is acceptable if the legacy project is untouched; a
later beta-only deployment succeeded with cron scheduling omitted, the three
Telegram flags off, and the build pause restored afterward. No webhook,
Telegram traffic, DB changes, or legacy-production access occurred. See
H04d.4h–4i in the [isolation evidence
contract](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md).

ACT-03 (runtime, Jest, lint, and mandatory CI) is **in progress in a separate
workstream**. Its compatible dependency-security subcut is complete locally:
Next.js and four transitive dependency families were patched, full local gates
passed, and the audit dropped from 10 to 5 findings. A subsequent local XLSX
writer cut replaced the high-risk `xlsx` package without changing the export
response or CSV path; the runtime audit now reports zero findings and the full
audit reports four moderate Drizzle tooling-chain findings. See the
[dependency contract](ACT-03-DEPENDENCY-SECURITY-CONTRACT.md) and
[XLSX writer contract](XLSX-EXPORT-WRITER.md). Neither ACT-03 as a whole nor
all dependency remediation is claimed complete. The isolated build
workaround at `e51f313` (`fix(build): pin isolated production build to webpack`)
is an independent quality gate: it addresses the Next.js/Turbopack build
failure, and does not close ACT-03 or any H04d isolation/rehearsal gate.

A bounded Drizzle Kit tooling assessment is documented in the
[toolchain security contract](DRIZZLE-TOOLCHAIN-SECURITY-CONTRACT.md). Its four
moderate findings come from the dev-only `drizzle-kit` -> `@esbuild-kit` ->
`esbuild` chain. A global override was rejected because it conflicted with
other consumers' peer ranges; package files were restored. A subsequent
remediation cut needs a supported replacement or a scoped compatibility proof
against disposable local migration generation and generated-SQL comparison.
Do not force npm's breaking downgrade or alter the canonical migration runner
merely to reduce an audit count. This assessment does not close ACT-03 or
substitute for H04d.4c's provider-identity gate.

## Scope boundary for this cut

This documentation cut makes no production or beta DB data/schema changes and
no deployment, webhook, traffic, or provider configuration changes. No
production secret values are needed for the open identity gate. H04d remains a
preparation/rehearsal track; it is not a production release authorization.

## Plan central — estado reconciliado (26/09/2026)

La prioridad de ingeniería sigue siendo **ACT-03**, según
[`PLAN-DE-ACCION.md`](../audit/PLAN-DE-ACCION.md) y su secuencia validada. Este
corte incorporó al workflow CI una auditoría bloqueante de dependencias de
producción (`npm audit --omit=dev --audit-level=moderate`). Con Node 22.23.2,
la auditoría encontró cero vulnerabilidades; harness 52/52, Jest 88/88 suites
(735/735 tests), typecheck, lint (0 errores, 67 warnings) y build Webpack
pasaron localmente. El cambio está pendiente de CI remoto y no cierra ACT-03.
Los cuatro hallazgos moderados de Drizzle Kit/esbuild siguen aislados a la
cadena dev-only; se mantienen bajo su evaluación acotada, sin downgrade ni
override incompatible.

El subcorte H04d.4i posterior a este registro histórico sí dejó un deployment
READY en el **proyecto beta** (`hermes-finantial-tracker-z2`), con alias
`hermes-finantial-tracker-z2.vercel.app`. Las tres flags Telegram permanecen
apagadas; la pausa de build fue restaurada. Por limitación Hobby no hay crons
desplegados. No hubo webhook, tráfico Telegram, cambio de DB ni acceso a legacy
Production. H04d.4 sigue abierto y `isolationVerified` no está demostrado.

Siguiente secuencia conforme al plan: obtener el resultado del workflow sobre
un push autorizado de esta rama o una ejecución equivalente; completar ACT-03
sin debilitar controles; mantener H04d separado y bloqueado para cualquier
tráfico Telegram hasta revalidar el webhook beta y obtener autorización
específica. No promover ni desplegar a producción legacy.

## Operational closure register — authoritative (26/09/2026)

The following H04d table preserves an earlier checkpoint for chronology; its
worker and isolation rows are **superseded by the Current closure snapshot at
the end of this file**. Do not use this historical table to choose the next
action. Owners are named so an open item cannot silently become unowned
technical debt. “Codex” is the technical executor in this worktree;
“Esteban Indiveri” is the project, provider, and release decision owner.

### H04d — beta rehearsal and isolation

| Gate | State / evidence | Owner | Remaining work and exact re-entry condition |
| --- | --- | --- | --- |
| H04d-BETA-WEB | Complete. Beta Production alias returns `/` → `/login` (307) and `/login` 200 after deployment `dpl_6JrckEZP5Wj8xHqVzFNqdM5gqQpx`. | Codex | None for basic web availability. This is not account or financial-flow QA. |
| H04d-BETA-QA-ACCOUNT | Complete for account bootstrap, 26/09/2026. The beta DB had zero users/groups/members and public registration requires an invitation; one `esteban_beta_qa` owner/personal group was initialized in beta only. Beta login and `/api/auth/me` returned 200. | Codex | Product follow-up: assign invitation/first-user bootstrap UX before onboarding additional beta users. |
| H04d-BETA-TELEGRAM-LINK | Complete. Esteban confirmed `esteban_beta_qa` is linked to `Hermes_beta_finantial_bot`; the deployed UI has the beta username in onboarding/account surfaces and not the legacy bot. | Codex | None. Production resources unchanged. |
| H04d-BETA-INBOX | Complete. The beta webhook points only to the beta URL; replay of the synthetic update created one completed claim (`attempt_count=1`). The user-authored expense also reached the beta financial handler and yielded the reconciled transaction below. | Codex | None for inbox/deduplication. |
| H04d-BETA-FINANCIAL-E2E | **Closed for the beta functional matrix, 29/09/2026.** Esteban verified consent, natural/slash income, cancellation, text expense yes/no/unknown, financial voice, OCR “Solo gasto”, and the no-write `Resumen`/bare-`Supermercado` canary. The required group canary at 12:39 ART produced exactly one active Telegram transaction for ARS 137 in `supermercado` with reimbursement flag and operation ID. The linked members are Esteban/owner and Sabri/member. One reimbursement request for ARS 137 was paid by Sabri at 12:43 ART. Esteban and Sabri observed the expected bot messages. | Codex — read-only beta reconciliation and local regression; Esteban/Sabri — live operator evidence. | No further action for this functional beta matrix. This does **not** close the separate worker recovery, isolation certificate, broader ACT-11/13/14 quality/eval or release gates. |
| H04d-BETA-OUTBOX-INLINE/GROUP | **Closed for normal inline group delivery, 29/09/2026.** `TELEGRAM_OUTBOX_ENABLED=true`; worker remains `false`. Read-only beta reconciliation found one `send_message` to Sabri for the request, one `edit_message` to Esteban for the expense confirmation, one `send_message` to Esteban for the payment notice and one `edit_message` to Sabri for her payment acknowledgement. All four were `sent` on attempt 1 with provider message IDs; the requester did not receive a duplicate request. One transaction/request; no extra ARS 137 transaction in the test window. Focused request/callback suites passed 21/21. | Codex | No further inline group-delivery action. Recovery after failed sends stays open only under H04d-BETA-WORKER. |
| H04d-BETA-WORKER | Scheduler decision and retry recovery test open; `TELEGRAM_OUTBOX_WORKER_ENABLED=false`. The latest beta deployment has three active daily/monthly schedules and no outbox schedule (`vercel crons list`, 28/09). | Codex — prepare free-tier scheduler and recovery tests; Esteban — select an external provider/account and recovery SLO before remote activation. | The worker drains due durable outbound deliveries and purges up to 100 expired terminal rows; each invocation claims at most 5 deliveries (45-second default budget). Normal replies are attempted inline. Vercel Hobby rejects more frequent than daily. Recommended beta safety sweep: Cloudflare Worker every five minutes after validating its free CPU limit and beta-only target/secret; do not buy Vercel Pro solely for this. A daily Hobby sweep is inadequate for retry liveness. See the [scheduler/FinOps assessment](H04D-WORKER-SCHEDULER-FINOPS.md). |
| H04d-ISOLATION-CERT | Open; `isolationVerified=false`. On 29/09 authenticated Vercel read-only inspection found distinct project IDs: legacy `prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt`, beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`. Fresh beta `getMe`/`getWebhookInfo` found bot ID `8739389202`, username `Hermes_beta_finantial_bot` and only the beta webhook. Earlier authenticated Turso metadata found distinct DB IDs/hosts; current Turso CLI session is logged out. User-supplied legacy Telegram metadata remains historical. Ignored manifests/fingerprints are in the original staging worktree, not this current worktree, and the generator still encodes `AI_MODE/OCR_MODE=stub` and outbox off, while beta QA uses live providers and outbox on; a green local verifier would not attest current runtime. | Codex — update/rebuild current deployment evidence and read-only comparisons; Esteban — supply fresh legacy Turso/Telegram metadata or accept the clearly labelled residual. | Reconcile the manifest to the live beta deployment and six existing secret receipts without reading values; refresh beta aliases/bindings; verify fresh legacy DB ID/host and bot ID/username/webhook read-only; compare with beta; run the verifier on the current evidence. No financial rows, prod secret values or prod writes are needed. This gate is distinct from group delivery and scheduler recovery. |

Historical beta runtime controls recorded for deployment
`dpl_6JrckEZP5Wj8xHqVzFNqdM5gqQpx`:
`AI_MODE=stub`, `OCR_MODE=stub`, `NOTIFICATIONS_ENABLED=false`, beta session
cookie, inbox `true`, outbox/worker `false`. Subsequent QA required Groq and OCR
provider credentials for beta; do not treat these historical mode values as a
current environment inventory. A new beta-only webhook secret was generated
and fingerprinted locally; the bot token was not rotated. Build ignore was
restored to `exit 0` after deployment. Vercel Hobby rejected the minute cron,
so `vercel.json` was omitted only from that deployment package and restored in
the worktree; the four schedules remain undeployed. On 26/09/2026,
the legacy Vercel cron list was read only and showed its three existing jobs;
no production configuration, DB, token, webhook, or traffic was changed, and
no production rows or secret values were read.

### ACT-11 / ACT-13 / ACT-14 — historical functional snapshots

The dated notes below preserve the 27–28/09 implementation trail. Their
"remaining" steps are superseded by the operational register and the 29/09
closure snapshot at the end: query/ambiguity passed in beta and group delivery
is required, not optional.

State: open under Codex. The reimbursement-consent proposal slice (`e8e849e`),
typed/retryable STT errors (`9b4dcdd`), and suppression of duplicate retry
notices (`390d8d9`) are implemented and deployed to the beta public alias
(`dpl_5RGco1Z5rybbAQ5L3NpkrNYL5pGC`). The Groq voice blocker is closed: after
Esteban re-saved the beta key, the same harmless Inbox update completed at
attempt 19 with no error. The earlier retry/alias evidence and owners are in
[H04d.4q](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md#h04d4q-reintegro-inconsistente-y-voz-sin-diagnostico-integracion-act-111314-27092026)
and the subsequent addenda. No legacy resource changed.

The beta canary exposed that feature correctness is still fragmented: command,
natural text, transcript and OCR must converge on a shared validated financial
draft and the same consent/confirmation policy. A shared draft foundation and
tri-state consent are now implemented; beta screenshots then exposed unreadable
long buttons and missing income-category bootstrap, fixed in `b84862a`. Keep
all follow-up changes behind the same shared draft/confirmation boundary.

| Owner | Next deliverable | Closure / re-entry |
| --- | --- | --- |
| Codex | Shared `FinancialDraft` boundary and current fixes are implemented. Read-only reconciliation complete for incomes ARS 2,000/2,001, expenses ARS 5,011/5,012/5,013, cancellation ARS 100, voice ARS 104, and OCR ARS 23,971.15. | Voice and OCR no-reimbursement canaries are closed. Close remaining query/ambiguity/callback-replay/provider-error acceptance matrix; reconcile without legacy access. |
| Esteban | Beta operator; income formats, consent-button readability, cancellation, voice ARS 104 and OCR “Solo gasto” verified. | No further test needed for those cases. Add/link a second beta test member only if group-recipient delivery is part of the certification scope; otherwise defer that optional gate. |

### Ordered closure sequence (reconciled 28/09/2026)

1. **Complete locally:** shared draft contract, adapters, targeted tests, full
   harness/Jest, typecheck, lint and build passed.
2. **Complete in beta:** Esteban supplied screenshot evidence of expense
   consent, reintegro, OCR and the failed income cases. Fix `b84862a` is
   deployed only to `hermes-finantial-tracker-z2` as
   `dpl_BemZAe4afAHepUfdREzoiYffb9pP`; alias and `/login` checked. Outbox is
   enabled in beta Production; worker remains off. No Telegram test update or
   Git push was sent by Codex.
3. **Complete:** Esteban verified compact full-width consent buttons, natural and
   slash income, and cancellation. Codex's read-only reconciliation confirms
   two separate income writes after callbacks, no ARS 100 write, and one sent
   response per observed callback. Text expense reimbursement yes/no/unknown
   and OCR yes are reconciled; the 27/09 repeated receipt submissions were
   intentional.
4. **Voice/OCR canaries complete:** Esteban's voice ARS 104 without reimbursement
   and OCR “Solo gasto” were reconciled in beta. Codex continues the remaining
   query/ambiguity/replay/provider-error acceptance matrix. A second
   beta-linked member is needed only if group-recipient delivery is in scope;
   Esteban owns that scope/setup decision and Codex the subsequent reconciliation.
   Keep worker/cron off and do not promote to `main` or legacy production.

H04d-BETA-FINANCIAL-E2E and ACT-11/13/14 remain open under Codex until the
remaining beta query/ambiguity canaries pass. H04d worker/scheduler and formal
isolation certification are separate owned items; neither blocks the next
local implementation cut.

### ACT-11 / ACT-13 / ACT-14 — corte local de contrato compartido (28/09/2026)

**Foundation implemented locally; beta acceptance remains open.** Added the
provider-independent `FinancialDraft` boundary in
[`lib/telegram/financial-draft.ts`](../../lib/telegram/financial-draft.ts).
The `/gasto` and new `/ingreso` commands, Groq/deterministic text path (also
used after voice transcription), and personal receipt proposal now normalize
through the shared draft contract. It preserves source (`command`, `text`,
`voice`, `receipt`), explicit transaction kind (`expense`/`income`), validated
positive amount, normalized category, and reimbursement language as
`yes`/`no`/`unknown`. Groq's reimbursement boolean is not authoritative;
financial writes still wait for a separate Telegram callback. Income proposals
show a single “Registrar ingreso” action and never offer reimbursement. Clear
income phrases also work through deterministic parsing when Groq is
unavailable. Photo captions classified as `simulate_expense` no longer become
receipt writes.

Local evidence on the work branch: targeted Telegram/webhook tests passed;
full harness 53/53, Jest 89 suites / 759 tests, typecheck, lint (0 errors,
67 existing warnings), and Webpack build passed. This proves local behavior,
not provider delivery or beta financial reconciliation. No secrets, database,
webhook, flags, legacy resources, or deploy were changed by the local cut.

| Owner | State | Remaining work / re-entry |
| --- | --- | --- |
| Codex | Follow-up fix on `codex/h04d-natural-language-e2e`, commit `6acaead`: long reimbursement consent actions use separate rows; income phrases route through the shared draft and group-scoped `ingresos` category; category-only ambiguity gets a category-specific no-write clarification. Harness 53/53, Jest 89 suites / 769 tests, typecheck, Webpack build pass; lint 0 errors / 67 existing warnings. Latest code is deployed only to the linked beta project as `dpl_78vn7T9LN4xPwngX7HKi91Z43Uro`; `/login` returns 200. `vercel crons list` confirms beta retains `/api/cron/daily-alerts`, `/api/cron/recurring-reminders`, and `/api/cron/update-exchange-rate`; only the Hobby-incompatible `/api/cron/telegram-outbox` is not deployed. The tracked canonical config is restored locally. No push, migration, webhook change, or legacy resource change. | Local acceptance covers query fallback, category ambiguity no-write, inbox duplicate suppression, callback replay and provider retry/error behavior. Still need a beta canary for a read-only query and a bare category `supermercado`, checking the latter asks a choice and creates no transaction. Esteban sends the two messages; Codex reconciles beta. Keep worker disabled and retain the three daily/monthly schedules. |
| Esteban Indiveri | Beta test operator; income formats, button layout, cancellation, voice ARS 104, and OCR “Solo gasto” verified. | Next manual gate: send `resumen` (read-only query) and `supermercado` (ambiguous category-only input). For the latter, check the bot asks a choice and creates no financial movement. Group-recipient canary is optional; add/link a second beta member only if group delivery is included in pilot certification. |

**Closure gate:** beta matrix passes across command/text/voice/receipt and
expense/income/query; ambiguity writes nothing; explicit income never offers
or persists a reimbursement; callback replay creates at most one transaction
and request; provider errors are recoverable; outbox is reconciled; and the
beta DB/webhook identities still match the isolated manifest. Voice ARS 104
and OCR “Solo gasto” are now evidenced and closed; a beta query/ambiguity canary,
the optional group-recipient decision, and H04d's separate isolation/scheduler
decisions still prevent full closure. Until then,
ACT-11/13/14 and H04d-BETA-FINANCIAL-E2E stay open. Keep the beta worker and
cron disabled. This is not authorization to promote to `main` or production.

**Beta test handoff (28/09/2026, updated):** the isolated beta alias is
[`hermes-finantial-tracker-z2.vercel.app`](https://hermes-finantial-tracker-z2.vercel.app).
Latest deployment `dpl_78vn7T9LN4xPwngX7HKi91Z43Uro` (SHA `6acaead`) is Ready and
its `/login` route responds 200. It is a Production-target deployment inside
the separate beta Vercel project, not the legacy production project. The beta
project has its three daily/monthly schedules registered; only the per-minute
outbox worker cron is omitted because Vercel Hobby rejects it. `vercel crons
list` confirms the active jobs; the tracked canonical file was restored locally
after upload and displays the worker as a pending local change.
The beta
bot's existing webhook was not changed and no test Telegram update was sent by
Codex. No migration, legacy DB, bot, webhook, secret value, environment
configuration or production deployment was changed. Voice-financial and
OCR-no canaries have since passed and were reconciled. Callback replay,
duplicate inbox delivery, and retryable provider failures are covered locally;
the remaining external acceptance is one read-only query and one ambiguous
category-only canary. A second linked beta member is needed only if
group-recipient delivery is in scope. Codex owns technical verification;
Esteban owns the scope decision for that optional group test.

### ACT-03 — quality barrier (engineering gates complete; bounded Drizzle chore accepted)

| Gate | State / evidence | Owner | Remaining work and exact re-entry condition |
| --- | --- | --- | --- |
| ACT03-LOCAL | Complete for current local baseline: production dependency audit 0 findings; harness 52/52; Jest 88 suites / 735 tests; typecheck; lint 0 errors (67 warnings); Webpack build passed. CI workflow adds `npm audit --omit=dev --audit-level=moderate` at `626026a`. | Codex | No further local action unless remote CI reports a failure. |
| ACT03-REMOTE-CI | Complete on source SHA `c07641fe60786eaa5ad110eafcdf699d2f47de5d`; GitHub Actions run `36254678758` succeeded in 1m30s. `npm ci`, production audit, lint, typecheck, harness, Jest, and build all passed. | Codex | Reopen only if later code/workflow changes fail CI. This documentation-only register update has local `git diff --check`; its push will trigger the same workflow again. |
| ACT03-BRANCH-GATE | Complete, 28/09/2026. Ruleset `24135528` “Protect main — legacy production line” is active and scoped only to `refs/heads/main`; read-back verified `current_user_can_bypass=never` and no bypass actors. | Codex | Enforces PR, strict successful `quality` GitHub Actions check, blocks deletion and non-fast-forward (force-push); zero mandatory approvals and GitHub's extra unattributed-Copilot approval are both disabled to avoid locking the sole maintainer. No change to workflow, branches, code, deploy or legacy production. Reopen only if the ruleset/check needs maintenance or policy changes. |
| ACT03-DRIZZLE | Compatibility investigation complete; four moderate findings remain in the dev-only `drizzle-kit`/esbuild chain. Upstream `drizzle-kit@0.31.11` still includes the deprecated loader; two scoped overrides were rejected as ineffective/invalid. Esteban explicitly accepted the bounded residual temporarily on 28/09/2026; this does not mean advisories are fixed. See the [experiment and accepted-risk record](DRIZZLE-TOOLCHAIN-SECURITY-CONTRACT.md#temporary-owner-acceptance). | Esteban — risk owner; Codex — track/retest upstream and reopen remediation. | Review as a maintenance chore before the next schema-generation/toolchain change, and sooner if Drizzle Kit releases a supported loader replacement or the advisory/exposure materially changes. Keep controls in the contract; no forced downgrade/global override. |

ACT-03's runtime/CI/branch-protection barrier is complete. The only remaining
ACT-03 item is the explicitly accepted Drizzle tooling risk, retained as an
owned maintenance chore with a re-entry condition; it does not block this beta
functional cut. Production legacy remains outside deployment, data, and
webhook scope.

### Latest beta canary reconciliation — 28/09/2026

Esteban reported `Ingreso 2000 sueldo`, `/ingreso 2001 sueldo`, and a canceled
ARS 100 expense to verify the deployed fix and keyboard. Screenshots show the
consent actions fully readable. Read-only queries against `beta-hermes` found
one active Telegram transaction for each income amount in `ingresos`, no
reimbursement requests, and one outbox `edit_message` sent at attempt 1 per
confirmed callback. ARS 100 has zero Telegram transactions, consistent with
cancellation.

The read-only expense reconciliation found ARS 5,011 with
`requires_reimbursement=1`, one pending request and one sent response; ARS
5,012 and 5,013 each have flag 0, no request and one sent response. Receipt
total ARS 23,971.15 has two 27/09 rows with no durable operation ID, matching
the intentional repeated submissions reported by Esteban, plus one distinct
28/09 durable OCR confirmation with flag 1, one pending request and one sent
response. The test group has one member with Telegram linked, so no secondary
recipient delivery can be proven yet. These checks were read-only; no beta data
was changed.

The next-step paragraph in this 28/09 snapshot is superseded by the live
29/09 closure snapshot below.

### Historical closure snapshot — 29/09/2026

| Cut / gate | State | Owner and next evidence |
| --- | --- | --- |
| ACT-03 quality, CI and `main` protection | Closed. Ruleset `24135528` requires PR and passing strict `quality` check; no legacy release was made. | Codex monitors CI; Esteban alone approves a future release. |
| ACT-03 Drizzle toolchain | Accepted residual, **not fixed**; four moderate dev-only findings. | Esteban owns risk; Codex rechecks before the next schema generation/toolchain change or when a compatible upstream fix or material exposure change appears. |
| ACT-11/13/14 individual Telegram financial intake | Local gates and beta command/text/voice/OCR income/expense/consent matrix passed. `Resumen` and bare `Supermercado` passed a beta no-write canary (updates `224783908/909`, zero new transactions in the test window). This closes the individual-channel functional slice, not the multi-member pilot. | Codex keeps shared-draft regression tests and reconciles later provider errors. |
| ACT-07/H10 projection-consumer cut | **Local implementation complete; beta rollout/visual acceptance pending.** Telegram `resumen` and daily alert explicitly label USD; dashboard `% Ahorro` uses the same persisted-USD projection rather than reconverting historical operations at the current rate, and its spending label says ARS. XLSX expense/budget summaries exclude `ingresos` while CSV/XLSX movement rows retain all transactions. Daily alerts exclude income rows/categories; a private proactive summary targets only the user's linked Telegram ID, never the last chat or global destination. [Scoped contract and exclusions](ACT-07-PROJECTION-CONSUMERS.md). | Codex owns the next batch's gated beta deployment and alias/isolation reattestation; Esteban validates `resumen` wording and one XLSX. `NOTIFICATIONS_ENABLED=false` remains in beta; other proactive notification destinations still require an audit before activation (Codex, ACT-17). Do not redeploy beta solely for this cut and invalidate the just-closed H04d pilot certificate. This is ACT-07, **not** ACT-10 (proposal/callback identity) in the canonical plan. |
| ACT-16 reimbursement payment wording | Open product-copy decision: Sabri's `Pagar $137` callback changed the request to `paid` and sent a “te ha pasado” notice, but no external transfer is executed or verified by Hermes. | Esteban decides whether the intended contract is manual payment attestation; Codex then makes button and notification wording explicit (for example, “Marcar como pagado”) with regression tests before a release. This does not invalidate the state-transition/outbox canary. |
| H04d-BETA-FINANCIAL-E2E / GROUP-DELIVERY | **Closed for the functional beta pilot.** Operator and read-only DB evidence agree for the ARS 137 request/payment canary at 12:39–12:43 ART: one active expense and one paid request, Esteban owner/Sabri member both linked, exactly four expected outbox deliveries sent once with Telegram provider IDs. Focused tests 21/21. | Codex retains regression coverage. Worker retry recovery and provider isolation remain independently open. |
| H04d-BETA-WORKER | **Closed for the beta retry-recovery pilot, 29/09/2026.** The beta-only Cloudflare Worker is active on Workers Free at `*/5 * * * *`, using one trigger and a dedicated secret. A synthetic outbox-only row started `retryable`/attempt 1; the 18:40 UTC trigger reported `processed`/HTTP 200 and the row became `sent`/attempt 2 with a Telegram provider ID. Exactly one canary row exists; financial counts remained 14 transactions and 4 reimbursement requests. The local temp-libSQL 503→success/concurrent-worker test passed. Cloudflare showed 7 invocations, 0 errors and 0.79 ms median CPU on the active version, below Free's 10 ms limit. `NOTIFICATIONS_ENABLED` remains `false`: proactive alerts were not enabled to unblock user-reply recovery. | Codex owns operational watch of failed ticks, oldest due row and Free CPU/quota; Esteban owns acceptance of the best-effort 5–10 minute recovery target. The concrete rollback is to redeploy the Worker with `SCHEDULER_ENABLED=false`; details in [scheduler/FinOps assessment](H04D-WORKER-SCHEDULER-FINOPS.md). This is beta evidence, not a production SLA or production rollout. |
| H04d-ISOLATION-CERT | **Closed for the current beta pilot only, 29/09/2026, by Esteban's explicit acceptance of the residual limitation.** Read-only checks confirmed separate Vercel project/deployment IDs and aliases, distinct Turso DB IDs/hosts, and distinct Telegram bot IDs/usernames/webhooks. Beta deployment `dpl_HNDia23nZzffCKety38UUUcPsHdY` from clean source SHA `e019a2fa8120abf0b9c9d16b37c2fb559c060d8f` passed the fail-closed build assertion, including matching all six beta-secret fingerprints; its alias was checked. Seven private redacted receipts and digests passed the local consistency runner. The automated result remains `isolationVerified:false` because it does not directly read every running function or retired URL; this was consciously accepted **only for the current beta pilot**. The [review](H04D-ISOLATION-REVIEW-2026-09-29.md) and [checklist](H04D-ISOLATION-CERTIFICATION-CHECKLIST.md) state scope and evidence. | Codex retains evidence/regression ownership; Esteban owns any future release decision. Reopen/revalidate on a change to active beta deployment, alias, bindings, DB, bot or webhook. Before production promotion, Codex reviews retired deployment URL access and reattests the candidate; Esteban gives separate release authorization. No legacy write, financial-row read or legacy deploy occurred. |

No open item above is ownerless. H04d's financial, group-delivery, worker and
scoped provider-isolation beta gates now have closure evidence. The beta pilot
may continue with its active five-minute worker; none of these closures
authorizes promotion to legacy `main` or certifies retired deployments. The
baseline audit's wider ACT-01–ACT-18 roadmap remains in force; completing H04d
does not close financial-domain, IA/OCR evaluation, observability or release
phase work.

### Current continuation — 30/09/2026

The 29/09 snapshot above remains historical. This is the live follow-up after
the beta-only ACT-07 deployment; no legacy project, DB, bot, webhook, branch
or release was changed. The active beta alias points to
`dpl_5jxNMY8Z3iMDToef7N57QKdjTTyV` from clean source
`bd0269bec6c91125852b6225a32f2f8e827adac0`, target `production` inside
the **separate beta project**. The legacy alias still points to
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. Node 22 gates for that exact source:
92/92 Jest suites and 779/779 tests, typecheck and Webpack build pass, lint
0 errors/68 existing warnings. The build's fail-closed beta assertion passed
all nine checks, including six matching secret fingerprints. Private
post-activation evidence passed `ok:true` and
`postActivationRuntimeConsistent:true`; `isolationVerified:false` remains
intact. See the [30/09 isolation addendum](H04D-ISOLATION-REVIEW-2026-09-29.md#addendum--beta-deployment-30092026).

| Cut / gate | State and closure condition | Owner / follow-up |
| --- | --- | --- |
| ACT-07/H10 projection consumers | Code, regression and beta deployment complete. **Visual beta acceptance open**: `resumen` must show currency explicitly and the September XLSX expense/category summary must exclude `ingresos` while Movimientos retains them. Alerts remain disabled, so their private-recipient behavior is covered locally only. | Esteban performs the two read-only beta checks and reports result; Codex reconciles and records closure or fixes a finding. Do not enable notifications as part of this check. |
| H04d-ISOLATION-CERT renewal | Technical reattestation for the new active beta deployment complete; **human scope decision open** because the 29/09 acceptance named the previous deployment. Automated `isolationVerified:false` is expected, not an error. | Esteban explicitly accepts or rejects the documented residual for the new deployment ID; Codex records the decision and, if rejected, plans the additional runtime proof. No ownerless gap. |
| H04d functional/group/worker pilot | Historical 29/09 beta gates remain closed for the observed flows; the new deployment passed code regression and isolation-build checks but has not received a fresh multimodal/group/worker canary. Do not silently extend the old observations to new code. | Codex retains regression and beta worker watch; Esteban supplies a new functional canary only if ACT-07 checks reveal a regression or before a broader promotion. No new financial test write is needed merely for the read-only ACT-07 cut. |
| ACT-03 Drizzle toolchain | Accepted temporary dev-only residual, not resolved. | Esteban owns the risk decision; Codex rechecks before schema-generation/toolchain changes or a compatible upstream fix, as recorded above. |
| ACT-16 payment wording | Open product-copy decision; no money-transfer integration exists. | Esteban decides whether `Pagar` means manual attestation; Codex implements copy and tests once decided. |

No step in this table is ownerless. The next immediate gate is the read-only
ACT-07 beta acceptance plus the renewed H04d residual decision. After those
are recorded, Codex can select the next bounded cut from the
[general action plan](../audit/PLAN-DE-ACCION.md) without conflating a beta
pilot certificate with a legacy release.

### Current continuation — 02/10/2026

This section supersedes the 30/09 next-step text above without erasing its
deployment record. The beta source and deployment remain the 30/09 versions;
the changes below are **local only** on `codex/act16-export-usability`.

| Cut / gate | Current state | Owner and next closure evidence |
| --- | --- | --- |
| ACT-07 individual projection/export visual check | **Closed for the beta individual flow.** Esteban's October `resumen` screenshot labels income/spending/savings in USD and ARS/USD rate. The October XLSX shows one ARS 10.000 expense and one ARS 20.000 income in Movimientos; only the expense is in category spending. Bounded-budget behavior remains covered by local tests, not this unlimited-budget specimen. Proactive notifications remain off. | Codex maintains regression. ACT-17 owns any future alert activation; no additional manual ACT-07 check is pending. |
| ACT-16 XLSX readability | **Local cut complete**, not deployed: filters, fixed headers, widths, wrapping, ARS formatting and native category-spend data bars. It preserves financial rows and CSV. Node 22 gates passed: 92 suites/783 tests, typecheck, lint 0 errors/68 existing warnings and build. [Contract](ACT-16-XLSX-USABILITY.md). | Codex owns gated beta deployment after the runtime dependency cut below, plus H04d reattestation. Esteban reviews a newly downloaded XLSX. No legacy change. |
| ACT-16-CHARTS | **Local cut complete, not deployed.** Native editable budget-vs-spend chart references category summary cells; unlimited budgets are blank in the budget series. A synthetic workbook reopened with an independent parser showing one `BarChart` and unchanged financial values. 92 suites/784 tests, typecheck, build and runtime audit passed; lint has 0 errors/68 existing warnings. [Contract and limits](ACT-16-XLSX-USABILITY.md). | Codex owns gated beta deploy and monitoring for export size/memory; Esteban accepts the layout in a newly downloaded XLSX. No legacy change. |
| ACT-05/06 currency semantics | **Historical checkpoint, superseded by the 03/10 decision below.** Current budgets and transaction input are ARS; USD projection depends on monthly FX. There is no source currency or per-operation FX snapshot, so general multicurrency is not supported. [Two-stage recommendation and gates](ACT-05-CURRENCY-DECISION.md). | Product choice was made on 03/10; Codex owns staged implementation. Legacy rows must not be reinterpreted. |
| H04d isolation renewal | **Closed for the active 30/09 beta pilot deployment** by Esteban's 02/10 acceptance of a bounded beta-only residual policy. Technical gate passed for `dpl_5jxNMY8Z3iMDToef7N57QKdjTTyV`; `isolationVerified:false` intentionally remains. [Decision and re-entry conditions](H04D-ISOLATION-REVIEW-2026-09-29.md#owner-decision--02102026-bounded-beta-pilot-policy). | Codex reruns build/runtime/provider evidence for each exact beta deployment; if identity, binding, fingerprint or control changes/fails, Esteban makes a fresh decision. Retired URLs and legacy release remain outside scope. |
| Dashboard percentage precision | **Local implementation complete, not deployed.** The dashboard now shows one decimal and caps a sub-100% rounded result at `99,9%`; regression covers October-like figures. The underlying USD projection, ARS transactions and DB are unchanged. [Contract](ACT-16-DASHBOARD-PRECISION.md). | Codex repeats gates and includes the change in a gated beta deployment; Esteban checks the resulting percentage. |
| ACT-03 Drizzle toolchain / payment wording | Historical accepted residual and ACT-16 payment wording decision remain as recorded in the 29/09 table. | Esteban owns the accepted dependency risk and manual-payment wording decision; Codex owns recheck/implementation after triggers or decision. |
| ACT-03 runtime dependency security | **Local gate closed, not deployed.** Moved build-only `shadcn` to dev dependencies; scoped `brace-expansion` 1.x override and compatible lockfile updates. Clean `npm ci`; runtime audit **0** findings, full audit four moderate Drizzle-toolchain findings already accepted. 92 suites/783 tests, typecheck, build and lint passed. [Evidence and limits](ACT-03-RUNTIME-DEPENDENCIES-2026-10-02.md). | Codex repeats audit and H04d gate on a future beta deployment; Esteban remains owner of the previously accepted Drizzle dev-only residual. No new security-risk acceptance required for this local cut. |

Every unfinished item has an owner and a specific gate. No production release,
schema change, financial write, webhook or notification toggle is implied by
this record.

### Beta deployment and acceptance — 02/10/2026, after local cuts

This section supersedes the earlier “local only” wording above for the exact
cuts deployed today. A clean local commit `e724b44` was deployed directly by
CLI to the **separate beta Vercel project** `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`
as `dpl_BeEyrGrvnJb8yMrZSb2QWk7LrPxk` (READY). The beta canonical alias
points there. The build emitted `beta_build_isolation_attested` with
`passed:true`, `beta_secret_fingerprints_match:true`, all nine checks and no
failures. Read-only beta `/login` returned 200; unauthenticated worker route
returned 401. The legacy canonical alias still points to
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. No `main` change, Git push, legacy
deployment, DB/schema/financial write, bot/webhook change or flag toggle was
made by this release.

| Gate | State | Owner / exact closure or re-entry |
| --- | --- | --- |
| ACT-16 XLSX readability and editable chart | **Code deployed to beta; operator acceptance open.** Local gates: 92 suites/784 tests, typecheck/build, lint 0 errors (68 existing warnings), runtime audit 0. A synthetic workbook reopened with one native chart and unchanged numbers. | Esteban downloads a **new October XLSX from beta** and checks chart, filters, category separation and unclipped text in his spreadsheet app; Codex records any finding and fixes it before closure. The old attached XLSX remains historical evidence. |
| ACT-16 dashboard percentage | **Code deployed to beta; visual acceptance open.** October-like values now format to `99,9%`, not false `100%`; financial values unchanged. | Esteban checks `% Ahorro` in October beta; Codex compares with income/ahorro shown and closes or fixes. |
| ACT-16 month rollover UX | **Open product/UX follow-up.** The bot previously answered “no configuration for this month” until October settings existed; this is the current prerequisite, not evidence of a missing transaction. | Codex owns a bounded design/test cut for explicit new-month setup or “copy prior month” without duplicating transactions. Esteban decides whether prior budgets/goals should be proposed or carried automatically; no silent rollover or schema change in this deployment. |
| ACT-03 runtime dependency security | **Deployed in beta.** Clean local audit of production dependencies found zero advisories. Full audit still has four moderate dev-only Drizzle/esbuild findings under the previously accepted temporary risk. | Codex rechecks on the next dependency/schema-generation cut; Esteban remains residual-risk owner. No forced breaking downgrade. |
| H04d per-deployment reattestation | **Closed for this exact beta-pilot deployment under Esteban's 02/10 standing residual acceptance.** Build fingerprint/identity assertion, Vercel project/alias distinction, beta basic probes and unchanged legacy alias passed. Private beta Vercel/runtime receipts were refreshed for `dpl_BeEyrGrvnJb8yMrZSb2QWk7LrPxk`; 29/09 beta/legacy Turso and Telegram identity receipts remain within the seven-day contract window. The post-activation runner returned `ok:true`, `postActivationRuntimeConsistent:true`, `providerMetadataComparison:"distinct-identities-declared"`, `isolationVerified:false`. | Codex retains evidence/expiry watch and repeats the entire gate on each beta deploy. If identity, binding, fingerprint or control changes/fails, Esteban decides anew. This scoped pilot status does not certify retired URLs or authorize a legacy release. |
| ACT-05/06 optional FX | **Historical checkpoint, superseded by the 03/10 decision below; no schema or financial behavior changed.** [ARS-first proposal](ACT-05-CURRENCY-DECISION.md). | Product choice was made on 03/10; Codex owns contract, migration rehearsal and implementation. |

All open gates have explicit owners. The next beta actions are spreadsheet and
dashboard visual QA plus H04d receipt refresh; no additional synthetic expense
is required for either visual check.

### October XLSX feedback and currency decision — 02/10/2026

Esteban downloaded `hermes-2026-10 (2).xlsx` from the new beta release and
reported the XLSX is much improved. Codex inspected it read-only: Movimientos
has the October ARS 10,000 expense and ARS 20,000 income; Resumen por categoría
has only Supermercado, with ARS 100,000 category limit, ARS 10,000 spent and
one native editable bar chart linked to those cells. All three sheets have
filters and frozen headers. This closes **ACT-16 XLSX acceptance for the
observed October specimen**; the longer-description and empty-export cases
remain regression-tested locally. No workbook was edited. The dashboard
percentage visual acceptance is still Esteban-owned and open.

Esteban clarified that ACT-05 must preserve the existing mixed ARS/USD mode
and add a single-currency **ARS/ARS** option for monthly income, saving goal,
projected saving and spending, without mandatory FX. Codex owns contract,
tests and staged implementation. On 03/10 Esteban approved the remaining
choices: category limits stay ARS in mixed mode, mode is per group/month, and
any movement freezes the mode. The pure mode contract and regression tests
are local; no schema, writer or UI is active for ARS/ARS yet. See the [currency
decision record](ACT-05-CURRENCY-DECISION.md). Existing rows and legacy
production must not be reinterpreted. The recurring transaction writer's
hard-coded ARS/USD rate of 1200 is a correctness blocker for a mode-aware
recurring path; Codex owns its removal or fail-closed containment before
ARS/ARS activation, with regression tests. A separate schema gate is owned by
Codex: `transactions.amount_usd` is currently `NOT NULL`; an ARS-only write
without FX must never fabricate a USD amount. Activation requires a
rehearsed, compatible nullable/typed-amount migration on isolated beta copies
with backup and reconciliation, not just a UI flag.

ACT-05 entry gate (historical checkpoint, now closed locally), owner **Codex**: extend the canonical migration runner to
relax USD-column nullability without rebuilding tables or disabling FKs,
preserve all rows and indexes, add group/month mode and ARS settings, then
prove rollback/reconciliation on local copies. No beta or legacy migration was
performed by this local contract cut. Subsequent owner Codex gates are
mode-aware writers/readers, a corrected or disabled recurrent writer, full
regression, then a separately gated beta rehearsal/activation and operator QA.

### ACT-05 local migration foundation — 03/10/2026

The canonical `0090-currency-modes` migration and a transactional add/copy/drop/rename
path with FKs **enabled** are implemented **locally only** on `codex/act05-currency-modes`.
Historical USD/ARS settings and transaction values remain unchanged; new
transactions can explicitly represent ARS/ARS with `amount_usd=NULL`. Tests
cover incoming reimbursement/recurring references, indexes, duplicate
operation identity, all preserved historical columns, invalid pseudo-USD,
idempotent rerun, induced rollback and uninterrupted FK enforcement. The runner now checks
SQLite integrity and both the pre-currency and new canonical fingerprints.
The initial local gates were 93/93 Jest suites and 787/787 tests; migration runner 14/14;
typecheck, lint with zero errors and build passed. Typecheck and build must run
sequentially because `next build` regenerates `.next/types` while TypeScript
reads it; a parallel attempt produced transient missing-file errors, then the
sequential rerun passed. No remote DB, beta, webhook or legacy resource changed.

The 03/10 fresh beta export was restored to independent local copies. Both
copies reached the new canonical fingerprint
`db35d5ebe653dcbc135ca236b9ae83671ef00f2b63bcb57a5ca5b9b30f133de1`;
inventory and financial aggregates were identical before/after, repeat apply
was a no-op, and the beta SQLite version 3.47.0 exceeds the 3.35 requirement.
The isolated CLI session authenticated `esteban-indiveri` and verified
`beta-hermes` (DB ID `01a0c0bd-0601-7f27-b147-915d105b19f2`);
the production CLI login was not changed. The untouched export bundle SHA-256
values were DB `69d2cb13a4184d62c820f888228e4c2ab4e2c44599c895e6bc57263fc2b6b733`,
WAL `abcf56b42fd3cabe4515388808a0e6a0481d76daa1e119719c951d847e11f1b9`,
metadata `f7eb930c6e9ee2ceeedbbfe9ab8120f5e3d1aeea8b343ff7a34b7cb18eed0be2`.
The default strict reconciliation is **not green**: one pre-existing
`telegram_operations` row of kind `outbox.scheduler.canary` is committed with
both `committed_at` and `result_json` absent. It was present before and after
the local migration, references no financial resource, and remains an open
beta data-integrity finding. A signed snapshot v3 and an explicit, narrowly
scoped `acceptedBaselineBlockers: ["invalidOperationStates"]` option make the
local reconciliation green **only** when exactly one such row and its full
HMAC-protected content remain identical before/after. The default remains
strict; other findings still block. The isolated beta rehearsal passed with
this explicit exception. Owner **Codex** retains the canary anomaly for a
separate safe cleanup review; it has not been edited. No remote migration is
authorized by this rehearsal. No financial row content or operation ID was
included in the evidence.

This closes **only the local schema mechanics and the bounded local
reconciliation rehearsal**, not the remote beta migration gate. Owner
**Codex** must verify a fresh beta export and the same one-row canary baseline
immediately before any beta schema write; update all writers,
projections and surfaces behind a disabled beta flag; remove the recurrent
1200-rate path; and run cross-channel money/permission tests. Because the
TypeScript schema now selects the new columns, this branch must **not** be
deployed before the beta schema is migrated and verified. Esteban owns manual
acceptance only after the beta activation gate; production legacy is out of
scope.

### ACT-05 writers y guardas de modo — 03/10/2026

**Corte local cerrado, owner Codex.** El writer de configuración mensual,
las transacciones recurrentes, el cron de cotización y las guardas SQL ya
respetan el modo del grupo/mes. `ARS_ARS` permanece detrás de
`ACT05_ARS_MODE_ENABLED`, apagada por defecto. La base impide cambiar o borrar
el modo de un mes con movimientos (también anulados) y rechaza nuevas
transacciones sin configuración o con un modo distinto. Recurrentes ya no
usan la tasa fija 1200; solo escriben cuando el mes/grupo/categoría y, en
modo mixto, la cotización son válidos. Ripio solo actualiza meses mixtos
marcados previamente como gestionados por Ripio, no meses ARS ni tasas
manuales.

Gates locales: harness 84/84; Jest 94 suites, 804/804 tests; typecheck y
build verdes; lint 0 errores, 68 warnings preexistentes. Dos copias nuevas
del export beta migraron al fingerprint
`db35d5ebe653dcbc135ca236b9ae83671ef00f2b63bcb57a5ca5b9b30f133de1`;
inventario y agregados financieros preservados, reejecución no-op. La
conciliación estricta sigue roja solo por la misma operación canary
preexistente; la excepción firmada y de un único registro pasó nuevamente.
No hubo escritura remota ni deploy. Ver
[ACT-05-CURRENCY-DECISION.md](ACT-05-CURRENCY-DECISION.md).

**Abierto, owner Codex:** adaptar y probar los demás writers/consumidores
(web, Telegram, consultas, alertas, XLSX y reembolsos), evitar cualquier
lectura de campos USD nulos como cero contable, y ofrecer en UI la selección
del modo y la fuente Ripio. Luego generar un backup beta fresco, repetir
identidad/aislamiento y conciliación, aplicar la migración solo a beta y
verificar flags apagadas antes de cualquier activación/QA manual. No se debe
desplegar este código contra el esquema beta actual: ya consulta columnas
de la migración aún no aplicada. El canary anómalo sigue abierto con owner
Codex para revisión y corrección aislada, nunca una limpieza implícita en
ACT-05. Esteban es owner de la aceptación funcional cuando se habilite el
modo en beta. Legacy/main permanece fuera de alcance.

### ACT-05 web writer y proyección contable — 03/10/2026

**Corte local cerrado, owner Codex.** `POST /api/transactions` conserva el
comportamiento USD/ARS y ahora persiste modo y snapshot de cotización. Para
ARS/ARS, solo con `ACT05_ARS_MODE_ENABLED=true`, escribe importe ARS y deja
`amount_usd` y snapshot en `NULL`; con la flag apagada rechaza el modo antes
de escribir. `GET /api/transactions` solo devuelve filas ARS/ARS correctamente
etiquetadas con la flag activa y falla cerrado ante filas de modo/importe
inconsistentes. La proyección contable compartida nueva calcula ingreso,
gasto y ahorro en la moneda propia del mes, sin convertir ni fabricar USD en
ARS/ARS; no sustituye todavía el resumen USD legado consumido por dashboard,
Telegram, alertas y exportación.

Gates de este corte: harness 84/84; Jest 94 suites y 812/812 tests;
typecheck y build verdes; lint 0 errores y 68 warnings preexistentes.

**Checkpoint histórico del siguiente corte (cerrado abajo), owner Codex:** adaptar el writer de confirmación
Telegram en `lib/telegram/personal-callback-handler.ts`, incluyendo rama
transaccional y rama sin contexto de operación, con pruebas de texto/comando,
voz y OCR. Todos convergen allí; hoy el callback exige configuración USD,
convierte siempre a USD y omite modo/snapshot. El helper
`registerTransaction` en `lib/telegram/handlers.ts` no tiene call sites
encontrados y debe confirmarse como código muerto o adaptarse antes de activar
ARS/ARS. Después quedan presentación de dashboard/bot, alertas, exportación,
reembolsos y UI de selección de modo. Ningún cambio se desplegó a beta ni
legacy; la migración beta aún no se aplicó y la flag sigue apagada.

### ACT-05 Telegram confirmation writer — 03/10/2026

**Corte local cerrado, owner Codex.** El callback financiero compartido por
comando, texto, voz y OCR valida el modo del grupo/mes en ambas ramas de
escritura. En `USD_ARS` conserva la conversión y ahora persiste el snapshot de
la tasa positiva; en `ARS_ARS`, solo con `ACT05_ARS_MODE_ENABLED=true`, deja
`amount_usd` y `exchange_rate_snapshot` en `NULL`. Si faltan configuración o
flag, no escribe. El texto durable del outbox omite el ahorro hasta poder
calcularlo después del commit, en vez de afirmar falsamente USD 0; el mensaje
en línea presenta el ahorro en la moneda contable y una falla de proyección
posterior al commit no convierte una operación exitosa en error/reintento. Se
eliminó `registerTransaction` de `handlers.ts` tras comprobar que no tenía
call sites, evitando un tercer writer de Telegram con supuestos USD.

Gates locales Node 22: harness 84/84; Jest 94 suites, 820/820 tests;
typecheck y build verdes; lint 0 errores, 67 warnings preexistentes.
Pruebas enfocadas cubren la rama transaccional con outbox y la rama directa,
modos USD/ARS y ARS/ARS, flag apagada, ajustes incompletos y fallo de
proyección. No hubo migración, deploy, webhook ni cambio en beta o legacy.

**Checkpoint histórico del corte siguiente (cerrado abajo), owner Codex:** adaptar el armado de propuestas y
las consultas Telegram (`resumen`, `disponible`) que aún dependen del resumen
USD, con pruebas de comando, texto natural, voz y OCR; una escritura correcta
en el callback no equivale todavía a un flujo ARS/ARS de extremo a extremo.
Los consumidores web/dashboard, alertas, XLSX, reembolsos y la UI para elegir
modo/fuente Ripio permanecen abiertos con owner Codex. La anomalía canary de
`telegram_operations` sigue a cargo de Codex y no se limpia implícitamente.
Después de esos cortes locales, Codex debe rehacer backup, conciliación y
aislamiento para migrar únicamente la DB beta con autorización separada;
Esteban será owner del QA funcional y de cualquier decisión de release.

### ACT-05 propuestas y consultas Telegram — 03/10/2026

**Corte local cerrado, owner Codex.** El preflight común de propuestas de
gasto por comando, texto natural y voz, y el de tickets OCR/caption/edición,
respeta el modo mensual y la flag ARS/ARS antes de mostrar una confirmación.
La selección de categoría de un ticket editado también comprueba modo,
configuración y monto antes de volver a proponer; ninguna de estas rutas
escribe una transacción antes de la confirmación. El callback vuelve a
validar en la escritura, por lo que un cambio entre propuesta y confirmación
no la saltea.

`/resumen`, `/disponible` y `/puedo`, y sus intents de texto natural, leen y
formatean la proyección ARS/ARS cuando corresponde. El estado y la simulación
usan `saving_goal_yellow_ars` del mes, no un umbral inventado; presupuestos
de categoría siguen en ARS. Con flag apagada, configuración incompleta o
proyección inconsistente, las consultas ARS fallan cerradas. Las rutas
USD/ARS mantienen sus cálculos previos. El mismo handler procesa el texto
transcrito de voz; no se hizo una llamada real a proveedores en este corte.

Gates locales Node 22: harness 84/84; Jest 95 suites y 833/833 tests;
typecheck y build verdes; lint 0 errores, 67 warnings preexistentes. Se
verificaron propuestas de gasto, consultas por comando/texto natural, casos
ARS/ARS con flag apagada, umbral ARS configurado y ticket editado. Ningún
recurso remoto cambió: beta conserva esquema/flag/código desplegado previos y
legacy sigue intacto.

**Checkpoint histórico:** ACT-05c fue implementado localmente el 03/10 (ver abajo).
Después, en cortes separados bajo el mismo owner, quedan alertas, XLSX,
reembolsos y UI para elegir modo/fuente de cotización. La anomalía canary beta
en `telegram_operations` sigue con owner Codex y requiere revisión aislada
antes de migrar beta. Al cerrar esos gates locales,
Codex repetirá export/backup, conciliación, aislamiento y migración solamente
en beta con autorización separada; Esteban conserva el QA funcional y una
eventual decisión de release. No activar `ACT05_ARS_MODE_ENABLED` antes.

### ACT-05c dashboard contable — 03/10/2026

**Corte local cerrado, owner Codex.** El dashboard muestra ingreso, ahorro,
meta y estado en ARS para `ARS_ARS`, usando la proyección contable y el umbral
amarillo configurado para ese mes. Los gastos y límites de categoría siguen
en ARS. El modo mixto conserva sus importes contables en USD y su vista previa
de conversión de gasto ARS→USD. La vista previa USD no aparece en ARS/ARS.

Con la flag apagada, configuración incompleta o proyección inconsistente, la
cabecera informa que los datos contables no están disponibles y pausa el
formulario; nunca convierte `amount_usd=NULL` en cero ni muestra un estado
financiero inventado. La etiqueta del mes se construye en horario local para
que octubre no aparezca como septiembre en Argentina. Las pruebas dirigidas
cubren ambos modos, flag apagada, proyección inválida y regresión del panel de
exportación. Los gates completos de este commit se registran al cierre de la
verificación: Node 22, harness 84/84, Jest 97 suites y 839/839 tests,
typecheck y build verdes; lint 0 errores y 67 warnings preexistentes. Typecheck
y build se ejecutaron secuencialmente porque ambos comparten `.next/types`.
Ninguna DB, flag o implementación remota cambió en este corte.

**Checkpoint histórico:** ACT-05d se cerró localmente el 03/10 (ver abajo).
Seguir con alertas y reintegros en cortes separados. La anomalía canary beta
en `telegram_operations` conserva owner Codex antes de cualquier migración
remota. Esteban conserva la aceptación funcional beta y cualquier release.

### ACT-05d exportación por modo contable — 03/10/2026

**Corte local cerrado, owner Codex.** CSV y XLSX conservan las columnas
históricas iniciales e incorporan tipo (`Ingreso`/`Gasto`), importe y moneda
contables persistidos y la cotización registrada por movimiento. En el modo
mixto el importe contable es el `amount_usd` guardado; en ARS/ARS coincide con
el ARS guardado, sin fabricar USD ni tasa. Los registros legacy sin snapshot
de cotización quedan con la celda vacía; nunca se usa la tasa mensual actual
para inferir una tasa histórica. El resumen por categoría y su gráfico siguen
excluyendo ingresos y midiendo límites/gastos en ARS. No se cambian nombres de
archivo ni el orden de las tres hojas XLSX existentes.

La ruta verifica membresía, grupo de la categoría, modo del mes y de cada
movimiento, montos finitos y flag ARS antes de exportar. Ante ausencia de
configuración o filas contables inconsistentes devuelve 409 sin producir un
archivo con cero ficticio. La documentación legacy de exportación es histórica;
este contrato es el vigente para los nuevos artefactos.

Gates locales Node 22: harness 84/84; Jest 97 suites y 847/847 tests;
typecheck y build verdes; lint 0 errores, 67 warnings preexistentes. Las
pruebas leen el XLSX generado como ZIP/ExcelJS y comprueban cabeceras, tipos
numéricos, filtros y gráfico; no se realizó QA visual en Excel ni descarga
desde beta. No hubo cambio en DB, flags, despliegue o producción legacy.

**Checkpoint histórico:** ACT-05e se cerró localmente el 03/10 (ver abajo).
Después siguen reintegros y la UI para elegir el modo en cortes separados. La
anomalía canary beta en `telegram_operations` mantiene owner Codex antes de
migrar beta; Esteban conserva la aceptación funcional y decisión de release.

### ACT-05e alertas por modo contable — 03/10/2026

**Corte local cerrado, owner Codex.** El resumen proactivo diario consulta el
modo de grupo/mes y usa la proyección ARS/ARS solo con flag habilitada,
configuración completa y umbral amarillo ARS válido. Gastos, ahorro y meta se
formatean en la moneda contable correspondiente; la lista de gastos y los
límites de categoría siguen en ARS. USD/ARS mantiene su cálculo y formato
anteriores. Si falta modo, configuración o proyección, no se envía un resumen
financiero inventado. El control de membresía y el destino privado de Telegram
se preservan. Los recordatorios de compartidos y reintegros no cambiaron.

Gates locales Node 22: harness 84/84; Jest 97 suites y 850/850 tests;
typecheck y build verdes; lint 0 errores y 67 warnings preexistentes. Las
pruebas de alertas y cron usaron proveedores simulados; no hubo envíos reales,
cambio de cron, DB, flag o deploy.

**Checkpoint histórico:** ACT-05f se cerró localmente el 03/10 (ver abajo).
La UI para seleccionar el modo mensual conserva owner Codex y requiere QA de
Esteban en beta. El canary `telegram_operations` se atenderá antes de migrar.

### ACT-05f denominación de reintegros — 03/10/2026

**Corte de moneda local cerrado, owner Codex.** El esquema de solicitudes
conserva `amount` en ARS en ambos modos; los callers web y Telegram pasan
`amount_ars`, nunca `amount_usd` ni una división por cotización. Una regresión
de web prueba explícitamente que ARS/ARS crea gasto con USD/tasa `NULL` y
solicita reintegro por el monto ARS exacto. Los textos de solicitud, pago,
cancelación y recordatorio Telegram explicitan ARS para no presentar el monto
como USD. No se modificaron valores históricos ni el esquema de reintegros.

Gates locales Node 22: harness 84/84; Jest 97 suites y 850/850 tests;
typecheck y build verdes; lint 0 errores y 67 warnings preexistentes. No hubo
envíos reales, DB remota, flags ni deploy.

**Hallazgo separado ACT-06/R-POST, owner Codex, prioridad antes de activar
ARS/ARS beta:** `POST /api/reimbursements` recibe un monto arbitrario del
cliente; requiere validar gasto, autor, grupo, importe ARS y repetición antes
de crear la solicitud. Este corte de denominación no certifica esa frontera.

**Checkpoint histórico:** ACT-05g se implementó localmente el 03/10 (abajo).
ACT-06/R-POST y el canary beta conservan owner Codex antes de cualquier
migración o activación remota. Esteban conserva QA funcional y release.

### ACT-05g selector mensual de moneda — 03/10/2026

**Corte local cerrado, owner Codex.** Ajustes usa el modo del grupo/mes: ingreso
y umbrales en USD para el mixto o ARS para solo pesos; la tasa solo aparece y es
obligatoria en el mixto. Un mes nuevo ya no muestra tasa ficticia 1: empieza
sin cotización válida. El modo ARS solo es elegible si la flag está activa; si
ya existe un mes ARS y la flag se apaga, se muestra sin permitir edición. El
GET entrega disponibilidad de la flag y bloqueo por cualquier movimiento como
metadatos HTTP sin cambiar el payload histórico; el servidor mantiene la
guarda transaccional al guardar. El endpoint legacy de umbrales USD rechaza un
mes ARS. Límites de categoría continúan en ARS en ambos modos.

Tests de API cubren metadatos de flag/bloqueo y rechazo de umbrales USD en ARS;
SSR cubre etiquetas/campos del modo ARS. Harness 84/84, Jest 97 suites y
853/853 tests, typecheck, build y lint 0 errores/67 warnings verificados en
Node 22. No hubo cambios remotos ni flag activada. El uso de `ui-design`
conservó controles y tokens existentes y añadió estados explícitos de bloqueo.

**Checkpoint histórico:** ACT-06/R-POST se cerró localmente el 03/10 (abajo).
Después: conciliar el canary preexistente en `telegram_operations` (owner Codex),
repetir backup/restore y migración solo beta, desplegar con flag apagada,
verificar aislamiento y recién activar ARS con QA de Esteban. Ningún paso
autoriza tocar legacy.

### ACT-06/R-POST frontera web de reintegros — 03/10/2026

**Corte local cerrado, owner Codex.** `POST /api/reimbursements` ya no confía
en el importe del cliente: lo omite o contrasta con `amount_ars` del gasto,
rechaza discrepancias, gastos ajenos/anulados, exmiembros, pagador externo o
igual al solicitante y otro reintegro pendiente. La comprobación y el insert
se serializan en una transacción inmediata; notifica después del commit. No
reescribe solicitudes existentes ni afecta al camino Telegram con operación
durable. Gates Node 22: harness 84/84, Jest 98 suites y 858/858 tests,
typecheck y build verdes, lint 0 errores/67 warnings preexistentes.

**Residual ACT-06/R-DELIVERY, owner Codex, no bloqueo de la migración de
moneda:** la creación web sigue entregando notificaciones inline después de
guardar, por contrato histórico. Un fallo del proveedor puede dejar una
solicitud persistida sin aviso. La separación durable de notificaciones web
requiere un corte posterior con outbox y conciliación; antes de activarlo se
hará un canary específico. No se presenta la entrega web como garantizada.

**Checkpoint histórico:** ACT-05h quedó cerrado como revisión del canary,
export nuevo, restauración y ensayo local (abajo). Esteban conserva QA
funcional solo después de tener una beta aislada y verificable.

### ACT-05h preflight beta de migración — 03/10/2026

**Preflight de solo lectura y ensayo local cerrado, owner Codex.** Se verificó
con `turso -c` aislado que la identidad activa es `esteban-indiveri` y el
target `beta-hermes` conserva el DB ID esperado
`01a0c0bd-0601-7f27-b147-915d105b19f2`; el login Turso predeterminado
`eindiveri` no se utilizó. El ledger remoto llega hasta
`0080-telegram-operations-outbox`, sin `0090`. El export nuevo quedó en un
directorio privado (archivos modo 600); el DB base y metadata conservan los
SHA-256 anteriores, el WAL nuevo tiene SHA-256
`7887c6c2b0a771e2426bea1463ac3f2cad416d6f404a569ff99fc0f756acd3c8`.
La restauración local pasó `integrity_check`, FK, inventario, agregados,
integridad y hash de operaciones iguales al export. La copia migrada aplicó
solo `0090-currency-modes`, llegó al fingerprint canónico
`db35d5ebe653dcbc135ca236b9ae83671ef00f2b63bcb57a5ca5b9b30f133de1`
y concilió sin diferencias bajo la excepción de exactamente un canary
preexistente. La conciliación estricta sigue reportando esa anomalía.

**Decisión de tratamiento del canary, owner Codex:** no se borra ni se fabrica
un `result_json`: la operación está enlazada a una fila de outbox `sent` con
acuse de proveedor. Borrarla perdería auditoría de entrega; completarla con
un resultado inventado falsificaría historial. Se conserva la excepción
firmada y acotada que exige fila y contenido inalterados. Si cambia el número
o hash de operaciones, el gate vuelve a bloquear. Esto cierra la revisión de
limpieza, no convierte la conciliación estricta en verde.

**Checkpoint histórico:** ACT-05i recibió autorización explícita de Esteban y
se cerró el 03/10 con los controles descritos abajo: repetir identidad/export/backup/restore en el
momento de ejecución, aplicar únicamente `0090` a `beta-hermes`, comparar
inventario y sumas, mantener `ACT05_ARS_MODE_ENABLED=false`, y solo después
desplegar beta con attestation de aislamiento. No hay permiso implícito para
`hermes-acme`, `main`, bot productivo o deploy legacy. Si el backup o el canary
derivan, detener sin migrar y volver a investigar.

### ACT-05i migración monetaria beta — 03/10/2026

**Cerrado para esquema e integridad beta, owner Codex, autorizado por Esteban.**
El script dedicado exige por código cuenta `esteban-indiveri`, URL e ID exactos
de `beta-hermes`, ledger 0000–0080 y fingerprint anterior; crea un token beta
de duración 1 día sin imprimirlo. Compara todas las filas históricas del
backup restaurado con la DB remota antes de escribir, aplica exclusivamente
`0090-currency-modes` en transacción y repite integridad, FK, fingerprint,
ledger y hashes de filas después. Una primera ejecución se bloqueó **antes
de token o escritura** por un carácter extra en el ID transcrito en este
registro; CLI y manifiestos anteriores confirmaron el ID correcto
`01a0c0bd-0601-7f27-b147-915d105b19f2`. La constante y el documento
se corrigieron, y un query read-only confirmó que `0090` seguía ausente.

El export fresco se restauró y ensayó localmente: excepción firmada del único
canary estable, sin diferencias financieras. La ejecución remota respondió
`verified:true` con 27 tablas históricas preservadas. Una lectura CLI
independiente confirmó `0090` en el ledger, cero meses/movimientos ARS/ARS y
ninguna violación FK. Un segundo export posterior verificó `integrity_check`,
fingerprint canónico, agregados financieros y hash de operaciones iguales al
pre-export; el único blocker de conciliación estricta sigue siendo el mismo
canary. El backup previo, el restore y el export posterior permanecen fuera
del repositorio en un directorio local privado, no como fixtures públicos.
No se cambió `hermes-acme`, legacy, webhook, flags ni deployment.

Gates del código de migración: harness 85/85, Jest 98 suites/858 tests,
typecheck, build y lint 0 errores/67 warnings. **Siguiente ACT-05j, owner
Codex:** revisar y desplegar el código solo al proyecto Vercel beta con
`ACT05_ARS_MODE_ENABLED` apagada, verificar attestation/identidad de runtime,
sin tocar el proyecto legacy. La aceptación de modo ARS/ARS y QA manual
continúan pendientes con Esteban como operador.

### ACT-05j despliegue compatible beta — 03/10/2026

**Cerrado para el deployment beta y la reatestación H04d del piloto, owner
Codex.** El gate de build ahora falla si se intenta habilitar ARS/ARS antes
del corte de activación: acepta solo `ACT05_ARS_MODE_ENABLED` ausente o `false`.
Pasaron 85/85 pruebas de harness, 98 suites/858 tests, typecheck, build y
lint con 0 errores/67 warnings. Un primer typecheck corrido al mismo tiempo
que el build chocó con archivos generados de `.next/types`; al repetirlo
secuencialmente terminó verde. No fue un defecto de tipos del código.

La inspección autenticada confirmó el proyecto beta
`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`, separado de legacy y sin integración
Git conectada para auto-deploy; se usó CLI directa, sin push. El código limpio
`ca82e2f8545a5de8657e6b472f167903a888ee70` llegó exclusivamente al
target Production **del proyecto beta** como
`dpl_ALk22n7VekTntM9eoWYgVwfUdRcJ` (READY). Su build remoto emitió
`passed:true`, los seis fingerprints beta coincidentes y los diez checks,
incluido `ars_mode_disabled`. `ACT05_ARS_MODE_ENABLED` sigue ausente en los
bindings beta y, por ello, apagada. El alias beta resuelve al nuevo deployment;
el alias legacy sigue resolviendo a `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.
No se modificó `main`, `hermes-acme`, el bot o webhook legacy, ni hubo
escritura financiera o cambio de scheduler.

Los recibos privados beta Vercel/runtime se renovaron para este deployment y
el runner de siete evidencias devolvió `ok:true`,
`postActivationRuntimeConsistent:true` e `isolationVerified:false` por diseño.
El residual ya aceptado por Esteban sigue limitado al piloto beta y a esta
identidad sin cambios; las URL retiradas y una promoción legacy no están
certificadas. [Revisión H04d](H04D-ISOLATION-REVIEW-2026-09-29.md).

**Siguiente ACT-05k, owners Codex y Esteban:** Codex prepara la activación
controlada de la flag **solo beta** y repite build/aislamiento; Esteban aprueba
el cambio de binding y prueba un mes de un grupo beta sin movimientos en
ARS/ARS, conservando octubre existente USD/ARS. Registrar pantalla de ajustes,
un ingreso y gasto sintéticos, `resumen`, exportación y conciliación. No
activar la flag ni alterar octubre por inferencia; la aprobación de Esteban
para ese control es la siguiente validación requerida. ACT-06/R-DELIVERY y
el canary histórico de outbox conservan owner Codex en cortes separados.

### ACT-05k activación controlada ARS/ARS beta — 03/10/2026

**Activación técnica cerrada; aceptación funcional abierta, owners Codex
(conciliación) y Esteban (prueba).** Esteban autorizó expresamente habilitar
`ACT05_ARS_MODE_ENABLED=true` solo en Vercel beta y desplegar de nuevo. El
gate de build de la nueva versión exige `true` exacto: ausente o `false`
aborta el deployment. Su prueba dirigida y los gates Node 22 pasaron:
harness 85/85, Jest 98 suites/858 tests, typecheck, build y lint 0 errores/
67 warnings previos. Una revisión de solo lectura con un subagente GPT-6 Luna
confirmó el orden de gates y la matriz manual de un mes sin movimientos;
Codex verificó el resultado y ejecutó el cambio.

Antes de activar, una inspección read-only con la cuenta Turso aislada
`esteban-indiveri` confirmó el ledger `0090`, la DB beta ID
`01a0c0bd-0601-7f27-b147-915d105b19f2` y 2 meses/16 movimientos
`USD_ARS`, cero `ARS_ARS`. Se agregó el binding no secreto **solo al entorno
Production del proyecto Vercel beta** `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`.
El código limpio `62e06877790f79b65f8ceee170f45e807151e967` se desplegó
por CLI directa, sin push, como `dpl_H7PhfyxS8E68T1WVStoWjsv2Lmad` (READY).
El build emitió `passed:true`, los seis fingerprints beta coincidentes y diez
checks, incluido `ars_mode_enabled`; el alias beta apunta a ese ID. El alias
legacy sigue en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. Después del deploy,
la DB beta aún tenía 2 meses/16 movimientos USD/ARS y cero ARS/ARS: la flag
no reinterpretó datos. El deployment beta anterior
`dpl_ALk22n7VekTntM9eoWYgVwfUdRcJ`, con flag apagada, es la referencia de
rollback si se detecta una regresión; una reversión requerirá además verificar
el estado de la nueva configuración/filas antes de ejecutarla.

Los recibos privados Vercel/runtime se renovaron para el nuevo deployment. El
runner H04d pasó con `ok:true`, `postActivationRuntimeConsistent:true` e
`isolationVerified:false` por diseño. Como cambió un binding, la aceptación
residual permanente del 02/10 **no se extiende automáticamente** al nuevo
deployment: Esteban es owner de ratificar o rechazar el mismo límite de
aislamiento para este piloto. Codex no lo declara certificado todavía.

**QA pendiente, owner Esteban; conciliación y cierre, owner Codex.** Crear un
grupo exclusivo de prueba en beta (o usar otro grupo/mes actual sin ningún
movimiento), configurar octubre 2026 en ARS/ARS antes de registrar nada,
crear categoría y límites ARS si se necesitan, registrar un ingreso y un gasto
sintéticos, comparar dashboard y `resumen` en ARS, descargar CSV/XLSX y
comprobar importe/moneda contable y USD/tasa vacíos. Confirmar que el grupo
existente de octubre mantiene USD/ARS y que su modo está bloqueado por sus
movimientos. No usar el grupo real de QA para la primera prueba ARS. Codex
conciliará las filas beta después del reporte y abrirá un fix con owner si
aparece un hallazgo. ACT-06/R-DELIVERY (notificaciones web inline) y el
canary histórico de outbox siguen bajo owner Codex, en cortes separados; no
bloquean este QA ni se presentan como resueltos.

### ACT-05k primer QA y decisión H04d — 03/10/2026

Esteban creó el grupo beta `test` y guardó octubre 2026 en modo `ARS_ARS` con
ingreso ARS 3.000.000, meta verde ARS 2.000.000 y umbral amarillo
ARS 1.000.000. Las capturas muestran Ajustes sin cotización y dashboard con
ingreso/ahorro/meta ARS, gasto cero y 100 % de ahorro. Codex verificó por
consulta **solo lectura** en `beta-hermes`, autenticado como
`esteban-indiveri`, que la fila de ese grupo/mes tiene exactamente esos tres
valores, `income_usd`, `saving_goal_usd` y `exchange_rate` nulos y cero
movimientos. **Subpaso configuración ARS/ARS: cerrado.** No se creó ni editó
ningún movimiento en esta comprobación.

Esteban ratificó el residual H04d descrito arriba **únicamente para el piloto
beta del deployment `dpl_H7PhfyxS8E68T1WVStoWjsv2Lmad`**. La revisión
técnica había pasado; el alcance humano H04d queda cerrado para ese ID,
sin cambiar `isolationVerified:false` ni certificar URLs retiradas o release
legacy. [Decisión exacta](H04D-ISOLATION-REVIEW-2026-09-29.md#owner-decision--03102026-current-beta-currency-deployment).

**ACT-05k aún abierto, owners Esteban/Codex:** Esteban registra en `test` un
gasto y un ingreso sintéticos de importes convenidos y reporta respuestas;
Codex comprueba categoría, signo, moneda, `amount_usd=NULL`, snapshot de tasa
`NULL`, dashboard/Telegram y exportaciones, y cierra o corrige hallazgos.
Después se verifica que el grupo beta histórico de octubre siga en USD/ARS.
No se adelanta aceptación funcional por haber guardado los ajustes.

### ACT-05k prueba financiera web/Telegram — 03/10/2026

**Subpaso gasto web + ingreso Telegram + resumen: cerrado, owner Codex tras
QA de Esteban.** En el grupo beta `test`, Esteban registró desde la web un
gasto ARS 137 en `supermercado`, sin reintegro, y desde el bot beta `Ingreso
2000 sueldo QA` tras `/grupo test`. Las capturas muestran un solo gasto en la
lista, la respuesta de ingreso y `/resumen` con ingreso ARS 3.002.000,
gastado ARS 137 y ahorro proyectado ARS 3.001.863. Una consulta **solo
lectura** a la DB ID beta confirmó exactamente dos movimientos activos de
octubre en ese grupo: `web/supermercado/137` y
`telegram/ingresos/2000`, ambos `ARS_ARS`, con `amount_usd=NULL` y
`exchange_rate_snapshot=NULL`; el ingreso Telegram tiene identidad durable,
el gasto no pidió reintegro y no hay duplicados en el grupo. Los dos meses de
octubre ahora son uno `ARS_ARS` y otro `USD_ARS`: el grupo histórico no cambió
de modo. No se escribió en DB por esta verificación.

**Subpaso exportación CSV/XLSX: cerrado, owner Codex.** Desde la sesión web
beta autenticada en `test`, Codex actualizó el dashboard: mostró ingreso
ARS 3.002.000, gasto ARS 137 y ahorro ARS 3.001.863. Descargó las
exportaciones de octubre de este grupo, sin escribir movimientos: ambos
archivos contienen solo las filas del gasto web 137 y el ingreso Telegram
2.000, con `Monto contable` numérico 137/2.000, `Moneda contable=ARS` y
`Cotización registrada (ARS/USD)` vacía. El XLSX además contiene tres hojas;
`Resumen por categoría` muestra presupuesto supermercado ARS 10.000,
gastado ARS 137 y saldo ARS 9.863. No hay conversión USD inventada.

**ACT-05k sigue abierto, owners definidos:** el gate de consulta y
cancelación se cierra a continuación; voz y OCR son los próximos canaries.
Reintegro y recurrentes conservan gates posteriores, no se consideran
certificados por estas pruebas. H04d permanece cerrado solo para el
deployment beta actual bajo el residual aceptado; no equivale a release
legacy.

### ACT-05k consulta y cancelación Telegram — 03/10/2026

**Subpaso cerrado, owners Esteban (QA) y Codex (conciliación).** Esteban
consultó `/disponible supermercado` en el bot beta con `test` activo: el bot
mostró presupuesto ARS 10.000, gastado ARS 137 y disponible ARS 9.863, sin
USD ni tasa. Envió `Gasté 101 en supermercado sin reintegro` y canceló el
intento; el bot respondió «Gasto cancelado». Codex volvió a identificar la
cuenta Turso aislada `esteban-indiveri` y la DB `beta-hermes` por su ID antes
de consultar. La DB conserva exactamente dos movimientos activos de octubre
en `test` (137 web y 2.000 Telegram), cero filas de 101: la cancelación no
escribió un gasto, ni siquiera una fila inactiva. No hubo escritura por parte
de Codex. Los tests locales dirigidos de `currency-queries`, `voice` y `ocr`
pasaron: 3 suites, 13 tests (Node 22).

**Checkpoint histórico; resultados abajo.** El QA de audio y OCR se ejecutó:
el audio registró un gasto y OCR reveló un defecto bloqueante. H04d conserva
el alcance del deployment beta ya aceptado; no se extiende a otro deployment
ni a producción legacy.

### ACT-05k bloqueo OCR y discrepancia de reintegro — 03/10/2026

**OCR no aprobado; owner Codex para corrección, Esteban para retest.** Esteban
repitió un ticket cuyo total impreso es ARS 25.548,77. Beta propuso
ARS 1.539,62 dos veces y ARS 3.349,99 una vez; producción legacy propuso
ARS 25.548,77 en una prueba separada que Esteban canceló. Ningún gasto OCR
beta fue confirmado: `receipt_imports` tiene tres intentos `rejected`, todos
sin `transaction_id`; los movimientos del grupo `test` no incluyen importes
OCR. Los tres parseos registraron confianza 0,3 y categoría nula. Logs de
**solo el deployment beta** muestran tres `Groq receipt parse error: Groq API
error: 404` en esos horarios. El código cae al regex de respaldo sin exigir
confianza mínima para mostrar una propuesta. El texto de OCR.Space agrupa
precios en una columna: en dos lecturas `TOTAL` aparece antes de `1539,62`,
seguido más abajo por `28154,71`, descuentos y `25548,77`; en la tercera
`TOTAL` fue leído `TOIAL`. El regex toma el primer número posterior a TOTAL,
o el mayor de respaldo, sin reconstruir la relación subtotal-descuentos-
total. Esa combinación explica las propuestas erróneas. El modelo por defecto
en código, `llama-3.3-70b-versatile`, fue retirado para cuentas free/developer
por Groq el 16/08/2026; `GROQ_MODEL` existe en beta, pero su valor no se
confirmó en esta investigación. No atribuir el 404 a ese modelo específico
sin comprobar el binding/response body. Referencia upstream:
https://console.groq.com/docs/deprecations.

**Gate de seguridad previo a otro OCR, owner Codex:** identificar el modelo
efectivo del deployment beta y validar disponibilidad en Groq; sustituir el
modelo retirado por uno compatible después de comparar costo/calidad;
reproducir los tres OCR guardados en test local redaccionado; rechazar
propuestas de importe bajo confianza o sin validación cruzada de total,
subtotal/descuentos y pago; ofrecer ingreso manual del monto cuando el OCR
sea ambiguo; excluir categorías de ingreso de tickets. Tests deben cubrir
columnas desordenadas, `TOIAL`, varios totales/pagos y cero escrituras antes
de confirmar. Solo entonces desplegar a beta, reatestar H04d para el nuevo
deployment y pedir retest del mismo ticket. Legacy no se modifica.

**Audio: registro correcto, reintegro no certificado.** Esteban aclaró que
hubo propuesta y que seleccionó confirmar con reintegro; se retira la
hipótesis anterior de escritura directa. La DB beta tiene una sola
transacción Telegram ARS 102, categoría supermercado, `ARS_ARS`, y el bot
mostró gastado ARS 239 / disponible ARS 9.761 / ahorro ARS 3.001.761.
Sin embargo, esa fila tiene `requires_reimbursement=0` y cero solicitudes
en `reimbursement_requests`; el resultado durable de la operación tampoco
menciona reintegro. La captura visible muestra únicamente la confirmación
del gasto, no el botón pulsado. Owner Codex: revisar contrato de teclado,
callback y escritura y reproducir con evidencia del botón/resultado; owner
Esteban: repetir QA de reintegro solo después del diagnóstico, idealmente
en grupo beta con pagador para verificar solicitud y entrega. No declarar
reintegro exitoso por el mensaje de gasto. No crear una solicitud retroactiva
ni tocar producción.

### ACT-05k OCR correctivo beta — 03/10/2026

**Código y despliegue beta cerrados; aceptación funcional OCR abierta. Owners:
Codex (implementación, evidencia y conciliación) y Esteban (un retest manual).**
La comparación de solo lectura con el parser del commit legacy `7034107`
confirmó que su regex de respaldo también podía escoger un precio parcial; en
la prueba legacy el modelo sí había devuelto el total. No se cambió legacy.
El nuevo parser beta exige un rótulo `TOTAL`/`TOIAL`, admite un único importe
claro o reconcilia subtotal y descuentos. En el texto OCR redaccionado del
ticket observado obtiene `28.154,71 - 601,98 - 2.003,96 = 25.548,77`;
si no hay prueba suficiente, pide monto manual y no propone el precio de un
producto. Una lectura de baja confianza no pasa al borrador financiero.
El selector OCR ya no ofrece `Ingresos`, y el callback rechaza esa categoría
aun si llega forzado. El cliente Groq usa `openai/gpt-oss-120b` por defecto
y reintenta **una sola vez** con ese modelo cuando un modelo configurado
recibe 404. No se cambió el binding sensible `GROQ_MODEL` ni ninguna clave.

Primero se verificaron regresiones rojas para propuesta OCR de importe parcial,
categoría de ingreso y modelo 404; luego Node 22 pasó 98 suites/868 tests,
typecheck, build y lint con 0 errores/67 warnings preexistentes. El código
quedó en el commit local `8729a7a491938edc4c1cb192950f968ffb2254b6`,
sin push. Un primer despliegue CLI desde cambios locales fue supersedido por
el mismo código ya commiteado. El deployment beta vigente
`dpl_CKDXMSMZ9JeTH5LhdgJ1cureEFnj` está READY en el proyecto beta
`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`; el alias beta apunta a él.
El build remoto informó `passed:true`, diez checks y seis fingerprints beta
coincidentes. Beta `/login` respondió 200; el worker sin autenticación 401.
El alias legacy conserva `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.

Se renovaron los dos recibos privados beta Vercel/runtime y sus digests; los
otros cinco recibos del 29/09 aún están dentro de los siete días permitidos.
El runner H04d para este deployment y SHA devolvió `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false` por diseño.
El residual de snapshot de build/secretos en función y URLs retiradas sigue
aceptado **solo para piloto beta** bajo la política del 02/10, porque no se
alteró identidad, binding ni fingerprint. No es certificación de producción.

**Próximo gate manual, owner Esteban:** enviar una sola vez el mismo ticket al
bot beta y comunicar si propone ARS 25.548,77, pide monto manual o muestra
otra cifra; cancelar cualquier propuesta incorrecta. Codex concilia el
`receipt_imports` resultante y cierra o reabre OCR. **Reintegro del audio
ARS 102 sigue abierto con owner Codex:** los tests de callback comprueban que
`expense:confirm_reimbursement` escribe movimiento y solicitud de modo
atómico, pero el callback elegido en esa prueba no quedó almacenado; el
resultado durable no demuestra que se haya pulsado ese botón. Esteban hará
un nuevo canary de audio con captura del botón y respuesta en un grupo beta
con pagador, después de cerrar OCR; Codex conciliará transacción, solicitud y
entrega. Ninguna solicitud retroactiva fue creada.

### OCR beta: resultado del canary y segundo ajuste — 04/10/2026

El ticket de Esteban muestra `TOTAL 25.548,77`; el OCR persistido en beta
contiene `Subtotal 28154,71`, descuentos `-601,98` y `-2003,96`, y después
`TOIAL 25548,77`. Dos intentos nuevos quedaron `failed`, sin `transaction_id`
ni propuesta de escritura: el parser encontraba el importe, pero lo marcaba
con confianza 0,7 porque la conciliación solo miraba números **posteriores**
al rótulo `TOIAL`; el gate financiero exige 0,8. El cliente Groq devolvió
contenido vacío en esos intentos, así que el fallback era decisivo. Esta es
una abstención segura, no una prueba de OCR aceptado.

**Owner Codex:** la regresión roja reprodujo el 0,7. El parser ahora permite
confianza 0,9 únicamente cuando el último subtotal positivo y los descuentos
inmediatamente anteriores al rótulo reconcilian exactamente con el importe
impreso. Un total que no reconcilia conserva 0,7 y exige corrección manual;
no se relajó el gate ni se usa el precio mayor. El log de JSON inválido ya no
incluye texto OCR/financiero. Node 22: 98 suites/871 tests, typecheck y build
pasaron; lint 0 errores/67 warnings preexistentes. **Estado:** código local
verificado; falta desplegar solo en beta, reatestar H04d para ese deployment y
una prueba manual del mismo ticket sin confirmar nada incorrecto. **Owner
Esteban:** revisar la propuesta y confirmar solo si muestra ARS 25.548,77;
Codex conciliará `receipt_imports` y la ausencia de escrituras previas. El
canary de reintegro por audio sigue abierto con los owners indicados arriba.
**Follow-up no bloqueante, owner Codex:** investigar por separado por qué la
completación Groq de este ticket tuvo contenido vacío; el fallback verificado
cubre este formato, pero el modelo/contrato JSON necesita un gate propio antes
de darlo por estable en todos los tickets. No modificar el binding sensible
`GROQ_MODEL` por inferencia.

**Canary recibido 04/10 15:00 ART, resultado:** Esteban reenvió el mismo
ticket; el bot beta detectó **ARS 25.548,77** y ofreció la categoría
`supermercado`. La captura posterior dice `Ticket cancelado`. La fila beta
`receipt_imports` de las 18:00:11 UTC está `rejected`, con
`parsed_amount_ars=25548.77`, `parsed_category_slug=NULL` (se canceló antes
de elegir categoría) y `transaction_id=NULL`. Por tanto, **cerrado** el gate
funcional de detección de total/propuesta segura y cancelación sin escritura;
**no** se afirma que el OCR haya registrado un gasto ni que la categoría se
haya seleccionado automáticamente. Codex mantiene la regresión. El siguiente
gate abierto es el reintegro por audio de ARS 102 descrito arriba: owner
Codex para conciliación/corrección y Esteban para un único canary manual con
captura del botón pulsado y respuesta. El follow-up Groq sigue a cargo de
Codex, no bloquea esta detección OCR.

### Reintegro por audio beta — canary 04/10 15:04 ART

**Cerrado para solicitud y entrega del piloto; owner de regresión Codex.**
Esteban eligió `Mi espacio` y envió un audio transcrito como «Gasté 103 en
supermercado con reintegro». La propuesta mostró ARS 103, Supermercado y los
botones «Sí, pedir reintegro» / «No, solo gasto». La respuesta confirmó el
gasto y la solicitud. Lectura beta de solo consulta: exactamente una
`transactions` activa de ARS 103 con `requires_reimbursement=1`, grupo
`Mi espacio`; exactamente una `reimbursement_requests` pendiente de ARS 103
referida a esa transacción; `payer_id=NULL` porque la solicitud queda abierta
al miembro. `group_members` contiene un owner y una member Sabri, ambos
vinculados a Telegram. El outbox de la operación tiene un `send_message`
`sent` con ID de proveedor dirigido al Telegram de Sabri y un `edit_message`
`sent` con ID de proveedor para la confirmación del usuario, ambos con un
intento. No hay duplicado observado. Esto prueba aceptación del proveedor,
no lectura humana de Sabri ni pago de esta solicitud. El pago grupal anterior
ARS 137 ya cubrió ese tramo en otro canary. La anomalía histórica del audio
ARS 102 queda documentada como no reproducida aquí; Codex conserva la
regresión y el seguimiento de Groq y H04d. No se requiere repetir este gasto.

**Despliegue y H04d (mismo día):** commit local de código y estado
`e8790a2d6924c790554798a6602fba86470f3a41`, sin push. Deployment
beta-only `dpl_AtyHSVU2H6dw4CpQi9yUUo6yPfdz` READY en proyecto
`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`; el alias beta apunta a él. El build
pasó los diez checks y seis fingerprints de aislamiento; beta `/login` 200,
worker no autenticado 401. Alias legacy sin cambios en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete privado H04d del worktree
anterior solo conservaba dos de siete recibos, por lo que el primer runner
falló `UNKNOWN_OR_MISSING_EVIDENCE_FILE`. Codex reconstruyó el paquete con
consultas autenticadas y de solo lectura **hoy** a Vercel y a ambas cuentas
Turso; los dos recibos Telegram son reconstituciones explícitamente fechadas
de las lecturas del 29/09, no nuevas consultas. Los siete archivos privados y
sus digests pasan el runner con `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false`. Bajo la
política beta acotada de Esteban, H04d queda reatestado para este deployment;
Codex es owner de renovar Telegram antes de vencer los siete días o ante
cualquier drift. La aceptación funcional OCR sigue abierta hasta el canary
manual; ninguna nueva transacción OCR fue creada por esta verificación.
