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

### Continuidad local: Groq vacío y entrega web durable — 04/10/2026

**Groq vacío, corte diagnóstico local cerrado; owner Codex para seguimiento.**
Una completación 200 sin texto ahora produce `GROQ_EMPTY_COMPLETION` con solo
metadatos validados y acotados (modelo, motivo de finalización y contadores de
tokens). Texto natural abstiene como `unknown`; OCR mantiene el fallback de
total reconciliado. Ninguna respuesta cruda, ticket o mensaje financiero se
registra al fallar JSON/Zod. No se alteraron `GROQ_MODEL`, claves, prompts,
reintentos ni bindings. La causa upstream/modelo del contenido vacío sigue
**abierta, no bloqueante, owner Codex**; no se declara estable para todos los
tickets sin un gate separado. El canary OCR del 04/10 sí cerró el caso
25.548,77 y cancelación sin escritura; la frase histórica inmediatamente
anterior que lo llama abierto se refiere al estado previo a ese canary.

**ACT-06/R-DELIVERY Telegram web, implementación local verificada; owners
Codex para rollout y Esteban para canary.** Con inbox, outbox y worker beta
habilitados, la solicitud web, su operación de origen explícito
`web.reimbursement.create` y una entrega por miembro Telegram elegible
(excluido el solicitante) se escriben en la misma transacción inmediata. La
entrega se intenta en línea después del commit y queda para reintento del
worker si falla; un error de dispatcher o Web Push posterior al commit no
convierte la solicitud persistida en una respuesta HTTP de fallo. El switch
`NOTIFICATIONS_ENABLED=false` de avisos proactivos **no** desactiva esta
entrega financiera, igual que el flujo financiero Telegram ya operativo.
Con la vía durable apagada se conserva el comportamiento web inline anterior;
ese modo no tiene garantía de recuperación. Web Push sigue best-effort y su
durabilidad permanece **abierta, owner Codex**, en un corte separado. No hay
migración de esquema ni cambio en legacy.

Gates locales Node 22: 99 suites/889 tests, typecheck, build y lint con 0
errores/67 warnings preexistentes. La integración temporal libSQL con FK
activas verifica filas únicas por destinatario y rollback conjunto ante una
violación de namespace; los tests unitarios cubren rechazo, duplicado, flags
y fallo posterior al commit. **No desplegado aún:** beta necesita publicar el
cut, reatestar H04d para el nuevo SHA/deployment y un canary web de
reintegro con conciliación de solicitud, operación, outbox y aceptación del
proveedor. Esteban debe aprobar primero commit/push del preview vinculado a
GitHub; Codex queda owner del preflight, rollout y conciliación. El residual
H04d aceptado solo para beta no certifica aislamiento de producción. Codex
también conserva la renovación de los recibos Telegram del 29/09 antes de
vencer su ventana de siete días. Ninguno de estos pendientes queda sin owner.

### Priorización del siguiente corte local — 04/10/2026

**Web Push durable, diferido con owner Codex.** La auditoría del flujo actual
confirmó que `sendPushToUser` es best-effort: no hay fila recuperable, lease ni
reintento después del commit. Resolverlo exige una tabla outbox aditiva,
worker y política de retención/redacción del payload, además de pruebas de
atomicidad y del proveedor. No se mezclará esa migración con el corte Telegram
web ya verificado ni se activará Web Push proactivo en beta por inferencia.
Codex diseña el corte y valida migración/worker en entorno aislado; Esteban
decidirá retención y activación al llegar a ese gate. Sigue abierto y asignado.

**Groq, gate siguiente owner Codex.** La API oficial documenta que `max_tokens`
está deprecado a favor de `max_completion_tokens` y que GPT-OSS usa tokens de
razonamiento (por defecto esfuerzo medio); el cliente actual limita la
completación a 300 tokens. Un `finish_reason=length` con 300 tokens y contenido
vacío es compatible con agotamiento del presupuesto antes de una respuesta
final, pero **no demuestra** que esa sea la causa del ticket observado.
Primero se agrega una matriz offline con respuestas y tickets sintéticos,
sin uso del proveedor, cambios de modelo ni datos reales. Solo una muestra
posterior, redactada y autorizada en beta permitiría confirmar causa y medir
el efecto/costo de cambiar presupuesto o formato. Referencias:
[API Groq](https://console.groq.com/docs/api-reference) y
[razonamiento GPT-OSS](https://console.groq.com/docs/reasoning).

**Gate offline ejecutado:** siete regresiones nuevas verifican `length` con
300 tokens y texto vacío, `stop` vacío, JSON válido, metadatos malformados,
logs redactados y fallback/abstención de tickets sintéticos. Solo se usó
`fetch` simulado. La suite completa quedó en 100 suites/896 tests verdes en
Node 22. Este gate verifica seguridad local, **no** prueba la causa del
proveedor ni autoriza cambiar el presupuesto de tokens en beta.

**ACT-17, primer corte local owner Codex:** la ruta autenticada
`/api/cron/daily-alerts?test=1` antes forzaba `isMonday` y podía enviar avisos
reales. Ahora rechaza cualquier parámetro `test` con HTTP 400 antes de
consultas, envíos o escrituras; la URL normal del cron no cambia. Regresión
dirigida cubierta. La auditoría también encontró que este cron mezcla el
resumen financiero privado, recordatorios de sesiones a un chat grupal
persistido y recordatorios de reintegro a un pagador. **ACT-17 sigue abierto,
owner Codex** para reglas de destinatario/membresía, consentimiento por tipo
de aviso y pruebas A/B/exmiembro; **Esteban** decide la activación de avisos
proactivos solo después de esos gates. `NOTIFICATIONS_ENABLED=false` se
mantiene en beta; este corte no envía mensajes ni cambia flags.

### ACT-06/R-DELIVERY — commit, push y Preview aislado (04/10/2026)

**Código publicado; aceptación beta todavía abierta.** Con autorización de
Esteban, Codex publicó `2e4ef7e367b2a12476bbc66eef8a28fef13111cf` en
`origin/codex/act05-currency-modes`. Preflight de secretos en el diff y la
rama sin coincidencias; el árbol estaba limpio después del push. La puerta
local completa pasó con Node 22: 100 suites/897 tests, typecheck, build y
lint sin errores (67 warnings preexistentes). El primer deployment Git
`dpl_DxQH1GtWtseyQTnb9PbiFUk64rwt` fue cancelado por el Ignored Build Step
global (`exit 0`), sin build ni cambio de alias.

Los ocho controles de Preview se agregaron y enumeraron **solo** para esta
rama: `AI_MODE=stub`, `OCR_MODE=stub`, `NOTIFICATIONS_ENABLED=false`,
`SESSION_COOKIE_NAME=hermes_beta_session`, las tres flags
`TELEGRAM_*_ENABLED=false` y `NEXT_PUBLIC_APP_URL` beta. Desde el deployment
Git cancelado se hizo un Redeploy del SHA exacto eligiendo Preview y
desmarcando “Use project's Ignore Build Step” únicamente en ese redeploy. El
resultado `dpl_7YmnBnUS99EpydR3U9gAkprqwTBw` está `READY`, target
`preview`, URL
`https://hermes-finantial-tracker-z2-99wmbit5o-eindi-acme.vercel.app`;
el build compiló. El alias beta canónico sigue en
`dpl_AtyHSVU2H6dw4CpQi9yUUo6yPfdz`; no hubo promoción, cambio de webhook,
tráfico Telegram, SQL ni modificación de legacy. La pausa global de builds
permanece en `exit 0`.

**Preview no apto para prueba funcional todavía.** Un HEAD pasivo a `/login`
respondió 500 `MIDDLEWARE_INVOCATION_FAILED`; el log de ese deployment indica
`LibsqlError URL_INVALID` con URL vacía. La lista de Vercel muestra nombres
de secretos Preview, pero los valores `sensitive` no se pueden recuperar por
`env pull`/API; no se infiere su contenido de esa lista. El hecho observable
es que `TURSO_DATABASE_URL` no llegó usable a ese runtime. El build Preview
no ejecutó el contrato H04d de producción beta porque
`HERMES_BETA_ISOLATION_ASSERT` solo está asociado al target Production. No se
debe usar este Preview para canaries financieros ni atribuirle certificación
H04d. **Owner Codex:** diagnosticar y preparar un binding de DB Preview
verificable, repetir smoke pasivo, luego reatestar el deployment que realmente
se active. **Owner Esteban:** decidir si se continúa con un Preview de datos
separados/credenciales propias o se autoriza expresamente activar este SHA en
el target Production del *proyecto beta aislado* para el canary ACT-06. La
decisión no autoriza tocar producción legacy. ACT-06/R-DELIVERY y Web Push
durable siguen abiertos con los owners indicados arriba.

### ACT-06/R-DELIVERY — activación beta aislada y H04d (04/10/2026)

Esteban autorizó expresamente activar el código en el target `production`
**del proyecto beta aislado**, sin tocar el proyecto legacy. Codex verificó
remote, vínculo `.vercel/project.json`, cuenta/equipo CLI y árbol limpio antes
del despliegue. El source SHA fue
`138290a38a22e4dc9b4f2e82b1cff671d728e01e` (incluye el corte de código
`2e4ef7e`). Se creó `dpl_GUd2a4q4kn3zaG5NF8mhyUKsLR8o` con
`--prod --skip-domain`: quedó `READY` en el proyecto
`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`. El build emitió un único
`beta_build_isolation_attested` con `passed:true`, diez checks esperados,
`beta_secret_fingerprints_match:true` y ningún fallo. Antes de mover el alias,
las probes pasivas al deployment devolvieron 200 en `/login` y 401 para el
worker Telegram sin credencial. Después Codex promovió **solo** el alias
`hermes-finantial-tracker-z2.vercel.app` al nuevo ID; el alias legacy siguió
en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. La pausa de autodeploy Git del
proyecto beta sigue en `commandForIgnoringBuildStep: "exit 0"`.

El paquete privado H04d actualizó los recibos redactados beta Vercel/runtime,
SHA-256 y manifest para el nuevo ID/SHA; el runner devolvió `ok:true`,
`postActivationRuntimeConsistent:true`,
`providerMetadataComparison:"distinct-identities-declared"` e
`isolationVerified:false` por diseño. Los recibos Turso y Telegram previos
continúan dentro de su ventana de siete días; los de Telegram del 29/09
requieren renovación antes de vencer alrededor del 06/10. Bajo la política
beta acotada aceptada por Esteban, **H04d queda reatestado únicamente para
este deployment**; no certifica URLs retiradas ni una release legacy.

**ACT-06/R-DELIVERY aceptación funcional abierta, owner Codex + Esteban:**
el código, las regresiones locales y el despliegue beta están cerrados; falta
un canary consentido de reintegro iniciado desde la web en un grupo beta de
prueba, conciliando transacción, solicitud, una entrega Telegram al miembro y
callback de pago. Esteban ejecuta/observa el flujo en sus sesiones web y
Telegram; Codex concilia evidencia y corrige cualquier hallazgo. No se creó
ningún movimiento financiero ni se notificó a miembros como parte de este
despliegue. **ACT-06/R-DELIVERY Web Push durable** permanece separado, owner
Codex. **Preview** con URL de DB vacía permanece abierto, owner Codex, como
deuda de entorno no bloqueante para este beta Production-target. H04d: Codex
renueva recibos antes de expiración y reatesta en el siguiente deploy; Esteban
solo redecide si cambia identidad, binding, fingerprint o falla un control.

### ACT-06/R-DELIVERY — canary Telegram del 04/10, web pendiente

Esteban aportó capturas de la solicitud grupal ARS 100 en Supermercado,
recepción por Sabri y aviso posterior de pago al solicitante. Codex concilió
solo metadatos de las filas beta (sin texto de mensajes ni claves): una
transacción `source=telegram`, `amount_ars=100`, `requires_reimbursement=1`
y `active` creada a las 22:31:38 UTC; su solicitud está `paid` a las 22:33:00
UTC. La operación `personal_transaction:expense` y el callback
`reimbursement.pay` constan `committed`. El outbox de la operación de gasto
tiene dos acciones previstas (`send_message` y `edit_message`), ambas `sent`
en un intento sin error. Esto coincide con las capturas, pero la captura del
mensaje reenviado no prueba por sí sola el botón ni el canal de origen; la
fila `source=telegram` resuelve ese punto.

**Cerrado:** este canary confirma el recorrido grupal financiero Telegram de
este deployment beta y el pago/callback observado. **No cerrado:**
ACT-06/R-DELIVERY *web*; todavía falta una solicitud originada desde el
dashboard beta con `source=web`/operación `web.reimbursement.create`, una
entrega `sent` al miembro y conciliación del callback. Owner Esteban para la
única acción manual en sus sesiones web/Telegram; owner Codex para consultar
los metadatos, verificar unicidad y cerrar o corregir. No se repite OCR,
audio ni otro gasto Telegram para este gate. Web Push durable permanece
abierto aparte, owner Codex.

### ACT-06/R-DELIVERY — hallazgo web y corrección beta (04/10/2026)

Esteban creó desde la web beta un gasto ARS 120 en Supermercado (Disco,
19:43:59 ARG) con `requires_reimbursement=1`, pero Sabri no recibió Telegram.
La conciliación read-only encontró una sola transacción `source=web`, una
solicitud `pending` y `operation_id=NULL`, ninguna operación ni entrega
outbox. El grupo tenía exactamente un miembro Telegram elegible. La causa
estaba en `POST /api/transactions`: llamaba a
`createReimbursementWithNotifications` (vía inline heredada), no a
`createVerifiedWebReimbursement` (vía durable). Con
`NOTIFICATIONS_ENABLED=false` en beta, la vía heredada omitía el envío sin
fallar la creación de la solicitud. El endpoint independiente
`POST /api/reimbursements` ya usaba la vía durable, pero el formulario de
gasto no pasa por él.

Codex cambió el endpoint del gasto para usar la vía durable y actualizó su
regresión de ruta. Node 22: 100 suites/897 tests, typecheck, build y lint
sin errores (67 warnings preexistentes); el typecheck que se lanzó en
paralelo con build falló transitoriamente porque `.next/types` se estaba
reescribiendo, y la repetición secuencial pasó. Código
`e60d3fec095be77474037209da9f5bcca1805c14` publicado a la rama beta.
El deployment beta-only `dpl_4r3KhNWKH5hrZ8ZkUMHb32zCKxDX` fue construido
sin alias, quedó `READY`, pasó la aserción H04d con diez checks y seis
fingerprints coincidentes, y las probes pasivas directas devolvieron
`/login=200`, worker sin credencial `401`. Luego se promovió solo el alias
beta; legacy sigue en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete
privado H04d se renovó para el nuevo ID/SHA y el runner devolvió `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false` por diseño.
La pausa global de autodeploy Git beta continúa en `exit 0`.

Para reparar el caso ya existente, Codex verificó nuevamente la única
solicitud `pending`, el importe y origen, ausencia de operación/entrega y un
solo destinatario vinculado. Una transacción SQL beta con guards exactos
asoció **esa misma solicitud** a una operación de recuperación y una única
entrega pendiente. La conciliación posterior dio 1 transacción, 1 solicitud,
1 operación y 1 outbox; no hubo un segundo gasto ni una segunda solicitud.
Un log del worker de las 21:30 ARG mostró un timeout de conexión Turso, pero
la entrega concreta pasó después a `sent` a las 21:30:35 ARG, en un intento y
sin error de esa fila. La conciliación final mantiene 1 transacción, 1
solicitud `pending`, 1 entrega y 1 entrega `sent`; no hay duplicados.
**Owner Codex:** verificar con Esteban/Sabri recepción única y, si se prueba,
conciliar el pago/callback; vigilar si el timeout aislado se repite. **Owner
Esteban:** confirmar recepción y, si decide probar pago, pulsar el botón una
vez. ACT-06 web sigue abierto hasta esa aceptación humana y callback; Web
Push durable sigue abierto aparte bajo Codex. No se modificó legacy.

### ACT-06/R-DELIVERY — aceptación web beta cerrada (04/10/2026)

Esteban confirmó que Sabri recibió exactamente las dos solicitudes esperadas:
la recuperación del gasto web ARS 120 y la solicitud nueva del gasto web ARS
130 en Supermercado. Sabri marcó pagada **solo** la de ARS 130 y Esteban
recibió el aviso de pago. La captura del dashboard muestra ambos movimientos
web (Disco, ARS 130 y ARS 120), pero no se usa por sí sola para inferir el
estado del reintegro.

Codex concilió metadatos de la DB beta sin leer textos ni credenciales. El
gasto nuevo ARS 130 (`source=web`, `requires_reimbursement=1`) tiene una sola
solicitud, `paid` a las 02:20:36 UTC del 05/10 (23:20:36 ARG del 04/10).
Su operación `web.reimbursement.create` está `committed`; el `send_message`
al miembro figura `sent` a las 02:19:37 UTC, en un intento y sin error.
El callback `reimbursement.pay` está `committed` y sus dos entregas previstas
(`send_message` al solicitante y `edit_message` al pagador) constan `sent`,
ambas en un intento y sin error. Esto concuerda con la recepción y el pago
reportados por Esteban. No hay evidencia de una segunda solicitud ni de un
segundo pago para ese gasto.

La solicitud recuperada ARS 120 conserva una sola transacción, una solicitud
`pending` y su única entrega `sent` (02:30:35 UTC del 05/10); **no** se
marcó pagada ni se volvió a enviar. Esteban decidió dejarla pendiente. Su
resolución futura (pago o cancelación) queda bajo decisión de Esteban; Codex
conciliará el resultado si se solicita. No es requisito para cerrar el canary
del gasto nuevo.

**Cerrado:** ACT-06/R-DELIVERY para reintegros web por Telegram en este
deployment beta: creación automática, entrega durable al miembro, callback
de pago y aviso al solicitante verificados con evidencia humana y DB.
**Sigue abierto con owner Codex:** Web Push durable, separado del camino
Telegram; Preview con DB vacía (deuda de entorno); vigilancia del timeout
Turso aislado y renovación de recibos H04d antes de vencer. H04d mantiene
su aceptación residual acotada a este deployment beta, no a legacy ni a una
promoción de producción. No se modificó producción legacy.

### Web Push — contención de baja ajena (10/10/2026)

**Hallazgo de autorización, owner Codex.** `DELETE /api/push/subscribe`
autenticaba al usuario, pero `removeSubscription` borraba por `endpoint` sin
comprobar `user_id`. Conocer el endpoint de otra cuenta permitía dar de baja
su suscripción. Una regresión nueva contra libSQL aislado se añadió primero
y falló con el código anterior; ahora la ruta transmite la identidad
autenticada y el `DELETE` exige simultáneamente `user_id` y `endpoint`.
La prueba comprueba que A no borra el endpoint de B y sí borra el propio.

**Corte local cerrado; despliegue beta pendiente, owner Codex.** Pasaron 101
suites/898 tests, typecheck y build con Node 22; lint terminó sin errores y
con 67 warnings preexistentes. No se consultaron ni modificaron suscripciones
reales, ni se habilitó Web Push. El alta/reasignación de endpoint y la falta
de índice único siguen bajo revisión como parte del diseño de Web Push
durable; no se alteró su contrato sin un caso de producto. El outbox Push,
su política de retención y su activación permanecen abiertos, owner Codex
para diseño/implementación aislada y Esteban para decidir retención y
activación. Antes de desplegar este SHA al beta, Codex debe renovar los
recibos H04d vencidos y reatestar el deployment candidato; no se toca legacy.

**Siguiente corte diseñado, no implementado:** [Web Push durable](WEB-PUSH-DURABLE-CUT.md).
El contrato propone outbox sin contenido financiero y retención acotada;
Esteban decide esa política antes de fijar DDL/worker. La sesión Turso beta
aislada consultada el 10/10 ya no está autenticada, por lo que Codex no
finge haber renovado recibos ni desplegado este SHA. La reautenticación beta
de Turso es el siguiente gate externo para H04d; Vercel sigue autenticado.
La inspección Vercel read-only del 10/10 encontró el alias beta todavía en
`dpl_4r3KhNWKH5hrZ8ZkUMHb32zCKxDX`, `READY`, target `production` del
proyecto beta; este dato no reemplaza recibos Turso/Telegram frescos ni
autoriza desplegar el parche. Codex inició un login CLI Turso en configuración
aislada y espera que Esteban seleccione la cuenta beta `esteban-indiveri`.

### Web Push durable — implementación y candidato beta (11/10/2026)

La política acotada quedó aprobada por Esteban: outbox de solo metadatos,
reintentos hasta 24 horas, purga a 7 días y envío apagado hasta un canary
consentido. Codex implementó la migración aditiva `0100`, writers financieros
transaccionales, worker con lease/fencing, endpoint autenticado y extensión
inactiva del scheduler free tier. El historial de pruebas previo permanece
arriba como corte de 10/10; no debe leerse como estado actual.

Turso CLI beta está autenticado como `esteban-indiveri` y ve únicamente
`beta-hermes`. Turso CLI legacy, en **otra configuración aislada**, quedó
autenticado como `eindiveri` y ve `hermes-acme`. Se compararon IDs/hosts
distintos y se consultaron solo metadatos legacy. En beta había cero endpoints
Push duplicados y cero suscripciones. Un respaldo fresco, fingerprint,
ledger, integridad y digests de las 27 tablas existentes sirvieron de guard
para aplicar solo `0100` a `beta-hermes`; el postflight verificó preservación
de datos y esquema canónico. No hubo escritura en legacy.

El código `9642176` pasó 94/94 pruebas de harness y 933 pruebas Jest,
typecheck y build. `WEB_PUSH_ENABLED=false` se añadió solo al target
Production del proyecto beta. Vercel creó el deployment beta
`dpl_AACcct6M78ZCxgJ7kZgkLFe6jt6T` con `--skip-domain`: `READY`, build
H04d con diez checks y seis fingerprints coincidentes. El alias canónico beta
permanece en `dpl_4r3KhNWKH5hrZ8ZkUMHb32zCKxDX` y el alias legacy en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. Documentación complementaria:
[corte Web Push](WEB-PUSH-DURABLE-CUT.md).

**Abierto con owner Codex:** renovar recibos provider H04d vencidos, probar
pasivamente el candidato, reatestar y promover exclusivamente el alias beta;
mantener `isolationVerified:false`. Después preparar la prueba de dispositivo
y conciliar outbox/entrega, sin encender Push automáticamente. **Abierto con
owner Esteban:** consentir una suscripción beta y ejecutar el canary con
Sabri; decidir la activación solo con el resultado. No hay step sin owner ni
autorización para tocar el proyecto legacy.

### Web Push durable — promoción beta y H04d técnico (11/10/2026)

El bloque anterior registra el estado **antes** de la promoción. Luego
Esteban generó dos recibos Telegram frescos, beta y legacy, mediante Bot API
de solo lectura y sin entregar tokens a Codex. Los bot IDs, usernames y
webhooks corresponden a recursos distintos y a sus URLs respectivas. Codex
renovó además los metadatos autenticados Turso y Vercel. Un paquete privado
de siete recibos del candidato pasó el runner H04d con `ok:true`,
`postActivationRuntimeConsistent:true` e `isolationVerified:false`.

Las probes pasivas **autenticadas ante la protección Vercel** devolvieron
`/login=200`, Push worker sin credencial `401` y Telegram worker sin
credencial `401`; el `302` obtenido al consultar la URL protegida sin bypass
no se consideró evidencia de la app. Codex asignó solo el alias canónico beta
a `dpl_AACcct6M78ZCxgJ7kZgkLFe6jt6T`. El read-back confirma ese ID READY;
el alias legacy sigue en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete
post-promoción en `/private/tmp/hermes-h04d-2026-10-11-post/` volvió a pasar
el runner. Web Push y su scheduler permanecen apagados.

**Decisión abierta, owner Esteban:** ratificar el residual H04d para este
deployment con el binding nuevo `WEB_PUSH_ENABLED=false`; la aceptación
anterior no se extiende automáticamente ante cambios de bindings. Esto no
autoriza activar Web Push ni afecta legacy. **Ejecución abierta, owner Codex:**
mantener/renovar evidencia y, tras la ratificación, preparar canary de
dispositivo con Esteban y Sabri. Activación del envío requiere decisión
separada de Esteban. No hay corte abierto sin owner.

### Decisión H04d y siguiente corte — 11/10/2026

Esteban ratificó expresamente «sí, solo para este beta» el residual H04d del
deployment `dpl_AACcct6M78ZCxgJ7kZgkLFe6jt6T` con
`WEB_PUSH_ENABLED=false`. El alcance humano del piloto beta queda cerrado
para **ese ID**, con el paquete técnico ya verificado; el resultado del
verificador sigue `isolationVerified:false`. No se extiende a URLs retiradas,
legacy ni a una release futura con identidades/bindings distintos. Codex es
owner de renovar la atestación en cada nuevo deployment.

**En ejecución, owner Codex:** control opt-in de suscripción Web Push en «Mi
cuenta», autenticación y reversión, con tests y sin habilitar envíos. El
contrato, exclusiones y gates están en [Web Push durable](WEB-PUSH-DURABLE-CUT.md).
**Siguiente gate real, owner Esteban:** consentir el dispositivo de prueba
(y coordinar con Sabri el segundo usuario). Codex verificará el estado y las
entregas antes de solicitar una **decisión separada** para activar Web Push y
su scheduler. Hasta entonces ambos flags siguen apagados. No hay paso abierto
sin owner ni cambio legacy.

El control opt-in y la API de clave pública quedaron implementados
localmente. Node 22: 107 suites/937 tests de app y harness verdes,
typecheck y build local aprobados; lint 0 errores/67 avisos existentes.
Una suscripción del navegador no se presume ligada a la cuenta actual al
recargar; asociarla requiere clic. El próximo deployment beta será un ID
nuevo y exige otra reatestación técnica H04d. Ningún canary de dispositivo
ni envío Push se ha ejecutado por este corte.

### Web Push opt-in — deployment beta y siguiente gate (11/10/2026)

Commit `8f98a00` está en origin y deployment
`dpl_HSBMb77a9M77RK3hisbxkT9ZtNJb` READY en el proyecto beta aislado.
El build pasó diez checks de identidad/control y seis fingerprints; el alias
beta apunta al nuevo ID y el alias legacy conserva
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete privado de siete recibos
pasó el verificador H04d (`ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false`). Ningún
binding cambió, por lo que aplica la política residual beta limitada ya
ratificada, sin convertirla en certificación de ejecución independiente.

**Abierto, owner Esteban:** abrir la web beta en un dispositivo compatible,
entrar en «Mi cuenta» y decidir si pulsa «Preparar este dispositivo»; informar
el resultado. **Abierto, owner Codex:** conciliar la suscripción beta y el
estado de UI sin leer endpoint/llaves, resolver defectos y luego diseñar el
canary de dos usuarios. No se hizo smoke HTTP automático por el procedimiento
de despliegue. `WEB_PUSH_ENABLED=false`, `NOTIFICATIONS_ENABLED=false` y el
scheduler Push siguen apagados. Activar cualquier envío es una decisión
separada de Esteban; no hay corte sin owner ni cambio legacy.

### Web Push opt-in — primer dispositivo verificado (12/10/2026)

Las capturas de Esteban a las 01:46 ART prueban prompt de permiso tras el
clic y éxito de «Dispositivo preparado» en la web beta para
`esteban_beta_qa`. Turso beta confirmó read-only 1 suscripción/1 usuario
(`esteban_beta_qa`) frente a 0 antes; `push_delivery_outbox` tiene 0 filas.
No se leyeron endpoint ni claves. **Cerrado:** alta voluntaria del primer
dispositivo y smoke manual de la UI. **Abierto, owner Esteban/Sabri:** alta
voluntaria de Sabri en su propia cuenta/dispositivo beta. **Abierto, owner
Codex:** conciliación de dos destinatarios, prueba controlada de entrega y
decisión de activación separada. No hay gastos de prueba ni envíos habilitados.

### Web Push opt-in — dos usuarios verificados (12/10/2026)

Esteban eligió `esteban_beta_qa2` en vez de Sabri para el segundo dispositivo;
aceptó las notificaciones desde otro navegador y no vinculó Telegram.
Consulta read-only en la DB `beta-hermes`: **2 suscripciones, 2 usuarios y
2 endpoints distintos**, exactamente una suscripción para
`esteban_beta_qa` y una para `esteban_beta_qa2`, **0 grupos de endpoints
duplicados** y **0 filas de `push_delivery_outbox`**. La conciliación de
membresías posterior corrigió un dato: `qa2` pertenece a `Mi espacio`, no
todavía a `test`. La afirmación anterior sobre `test` fue errónea. No se leyeron endpoints ni
claves. **Cerrado:** consentimiento de dos navegadores y verificación de que
el alta de `qa2` no reasignó el endpoint de `qa`.

**Abierto, owner Codex:** incorporar `qa2` por invitación a `test`, desplegar
el cerco beta, reatestar H04d y ejecutar el canary de entrega con prueba de
recepción, idempotencia y exclusión; apagar ante fallo. Esteban autorizó el
12/10 movimientos de prueba y la activación acotada en beta. Hasta esa
activación, `WEB_PUSH_ENABLED=false`, `NOTIFICATIONS_ENABLED=false` y el
scheduler Push siguen apagados. El estado H04d
permanece `isolationVerified:false` bajo la aceptación residual solo beta;
legacy no se tocó.

### Hallazgos de aislamiento multiusuario en legacy — 12/10/2026

**Categorías:** consulta read-only de `hermes-acme` confirmó que el índice
activo sigue siendo `categories_slug_unique` sobre `slug`, global a todos
los grupos. `beta-hermes` ya tiene `categories_slug_group_idx` y la API
beta valida grupo; no se aplicó ninguna migración a legacy. **Beta: causa
corregida en esquema y writer; owner Codex para la regresión/validación
funcional.** Esteban decidió expresamente no arreglar legacy en este plan;
la migración legacy queda fuera de alcance, no como corte abierto de beta.

**Alertas Telegram:** el código del deployment legacy prioriza
`TELEGRAM_CHAT_ID` para cada usuario en `/api/cron/daily-alerts`, y la
variable existe en el proyecto legacy Production (solo se leyó su nombre,
no su valor). Esto explica de forma directa la recepción de resúmenes ajenos
en un mismo chat. La ruta beta ya usa el Telegram privado vinculado por
usuario y revalida la membresía antes de leer finanzas. **Beta: causa
principal corregida; owner Codex para la validación de regresión.** Queda
**abierto, owner Codex**, el endurecimiento beta de recordatorios recurrentes
y reintegros ante exmiembros, como corte separado antes de habilitar esos
avisos. Esteban decidió expresamente no arreglar legacy en este plan; no se
alteró cron, webhook, env, bot ni despliegue productivo. Hasta ese corte,
`NOTIFICATIONS_ENABLED` sigue `false` en beta y el canary Web Push se limita
a un grupo y dos usuarios.

### Corte beta de grupos y canary Push desplegado — 12/10/2026

Los commits `abc5749` (grupos homónimos) y `edfa955` (cerco Push) se
subieron a `codex/act05-currency-modes`. La web ya distingue `Mi espacio`
propio/compartido por owner, la configuración de grupo usa el grupo activo
real, y Telegram acepta `/grupo ID` y rechaza un nombre ambiguo con opciones.
Pasaron 959 tests en 110 suites, TypeScript, build y lint sin errores (66
warnings existentes o no bloqueantes).

El deployment beta `dpl_8RSc4Tnd6bU395q2cx4ajg5TfSCF` quedó READY en el
alias `hermes-finantial-tracker-z2.vercel.app`. La aserción de build pasó diez
checks y fingerprints beta; el paquete privado de siete recibos para el SHA
`edfa955e5c8aa0b2c56cb55f28bafa72aa7d581c` validó
`postActivationRuntimeConsistent:true` e `isolationVerified:false`, bajo el
residual beta aceptado. El alias legacy permanece en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. Se añadieron únicamente las dos env
de scope del canary (`WEB_PUSH_CANARY_GROUP_ID` y
`WEB_PUSH_CANARY_USER_IDS`) al proyecto beta. `WEB_PUSH_ENABLED=false`,
`NOTIFICATIONS_ENABLED=false` y el scheduler Push siguen apagados.

**Abierto, owner Esteban:** aceptar la invitación Member de `qa2` a `test`
desde su propio perfil de navegador. **Abierto, owner Codex:** generar la
invitación tras la confirmación puntual, verificar membresía sin reasignar
suscripciones, activar solo el cerco Push, reatestar el nuevo deployment,
ejecutar/conciliar una entrega real y desactivar ante cualquier desvío.
La validación funcional de nombres homónimos y categorías entre dos cuentas
beta también queda con owner Codex. No se cambió legacy.

### Canary Web Push y aislamiento recurrente — 12/10/2026

Esteban aceptó la invitación normal: `esteban_beta_qa2` es member de `test`
y `esteban_beta_qa` sigue siendo owner. Las dos suscripciones permanecen
asociadas a dos usuarios/endpoints distintos. Codex desplegó únicamente en
el proyecto beta `dpl_EcPXDj4ZLkJjCjSzp3gbMx8wCqpy` (commit de app
`f37ef12`) y movió solo el alias beta después del gate H04d. El build pasó
los diez checks, y el paquete privado post-promoción devolvió
`postActivationRuntimeConsistent:true`, `isolationVerified:false` bajo el
residual aceptado solo para beta. El alias legacy sigue en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.

`WEB_PUSH_ENABLED=true` está cercado al UUID de `test` y a las dos cuentas
QA; `NOTIFICATIONS_ENABLED=false` sigue intacto. El Worker Cloudflare
`hermes-beta-outbox-scheduler` versión
`efb2776f-0470-4500-915c-aa935cf2be1f` usa cron cada cinco minutos,
destino beta fijo y secreto dedicado. El commit `ac7355f` corresponde al
Worker y es posterior al commit de app desplegado. Un gasto sintético de
ARS 1 en `test` creó un reintegro y exactamente una fila Push dirigida a
QA2. La fila terminó `sent` con un intento, sin error, y Esteban confirmó
una sola notificación en el dispositivo con dos capturas. **Canary de
entrega cerrado para ese evento**; no prueba la conducta de todo dispositivo
o cada reintento posible. No se marcó el reintegro como pagado.

El endurecimiento de avisos de reintegro para exmiembros ya pasó regresión
en `f37ef12`. **En trabajo, owner Codex:** filtrar recurrentes por
membresía actual y revalidar antes de cualquier escritura financiera,
verificar el código y desplegarlo solo en beta tras un nuevo H04d. También
quedan con owner Codex los tests funcionales de grupos homónimos y creación
de categoría con el mismo nombre en dos grupos. **Owner Esteban:** ninguna
validación adicional requerida para este canary; avisar si revoca el
consentimiento Push en QA. Legacy permanece fuera de alcance.

### Recurrentes por membresía actual — deployment beta 12/10/2026

El commit `cd8dc5a160080ca73ab843131af53378e5483c9c` filtra
definiciones, ejecuciones pendientes y recordatorios próximos/vencidos por
membresía actual. La confirmación revalida la membresía dentro de la
transacción antes de escribir dinero; la consulta de ejecución también
bloquea confirmar o saltear una ejecución antigua tras la baja. La nueva
regresión comprueba filtro y rechazo de exmiembro sin escritura. Cerraron
110 suites y 963 tests de app, 94 tests del harness, TypeScript, build y
lint de archivos tocados sin errores (4 warnings preexistentes).

Vercel creó `dpl_5hHoZNyCynKA3wWyJao547ZDFQCY` en el proyecto beta,
READY. El build pasó los diez checks H04d y los fingerprints; el smoke
protegido del candidato devolvió `/login=200`, Push sin credencial `401`
y Telegram outbox sin credencial `401`. El alias canónico beta apunta al
nuevo ID; el legacy sigue en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.
El paquete privado renovado para el nuevo SHA/deployment pasó el runner
antes y después del alias con `postActivationRuntimeConsistent:true` e
`isolationVerified:false`, bajo el residual aceptado solo para piloto beta.
La lectura de Turso beta encontró 0 recurrentes sin membresía y 0
ejecuciones pendientes de exmiembros; no se escribieron filas para probar
este borde. **Cerrado en código/despliegue beta, owner Codex:** aislamiento
de recurrentes. **Siguiente, owner Codex:** prueba funcional controlada de
grupos homónimos y categorías idénticas entre cuentas; revisar el gasto
sintético de ARS 1 y cerrar/retirar el canary Push cuando corresponda.

### Verificación funcional de grupos homónimos y categorías — 12/10/2026

En Safari, `esteban_beta_qa2` mostró simultáneamente `Mi espacio · propio`
y `Mi espacio · compartido por @esteban_beta_qa`. Codex cambió de uno a
otro y verificó el rótulo activo y la lista de categorías: el compartido
tenía `Supermercado` e `Ingresos`, mientras el propio estaba vacío. En el
propio creó `Supermercado` desde la web sin error. La conciliación read-only
de `beta-hermes` mostró el slug `supermercado` en tres grupos distintos,
incluidos los dos `Mi espacio` de owners diferentes, sin alterar la
categoría compartida. **Cerrada la prueba web entre cuentas**. La categoría
QA2 queda como dato de prueba en su espacio personal; owner Codex para su
eventual limpieza cuando termine la validación beta.

Telegram `/grupo ID` y rechazo de nombre ambiguo tienen regresiones de
código aprobadas, pero QA2 no vinculó Telegram por decisión de Esteban.
No se exige esa vinculación para este corte; owner Codex conserva la
verificación técnica y Esteban solo decidiría si desea una prueba manual
adicional en otro usuario vinculado. La pantalla «Mi cuenta» todavía decía
que no se enviaban avisos pese al canary activo; Codex corrigió el copy
para expresar el alcance de cuentas/grupos habilitados, con despliegue
beta y H04d pendientes en un corte separado.

### Estado de suscripción Push por cuenta — 12/10/2026

El copy del piloto se desplegó en beta (`dpl_5kzvrBVFM9xM1g6cDms25ogQsc9U`). Se
detectó además que «Mi cuenta» trataba toda suscripción local como potencialmente
ajena, incluso si ya pertenecía a la cuenta activa. El commit `13d8de1`
añadió una consulta autenticada y de solo lectura del endpoint: devuelve
únicamente un booleano, falla cerrada ante duplicados y no reasigna la
suscripción. Pasaron 968 tests de app, 94 del harness, TypeScript, lint de
archivos tocados y build.

El candidato beta `dpl_Dws4UDCWFYDaVYcqEQuFH1QjA5bA` pasó diez checks de
aislamiento en build, `/login=200` y `401` sin sesión para la ruta nueva.
H04d pasó antes y después de mover solo el alias beta con
`postActivationRuntimeConsistent:true` e `isolationVerified:false` bajo el
residual ya aceptado. Legacy conserva `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.
En Safari, QA2 recargó «Mi cuenta» y ahora ve «Desactivar notificaciones»,
confirmando que la suscripción existente corresponde a esa cuenta sin un
nuevo opt-in. El canary sigue limitado a `test` y a las dos cuentas QA;
`NOTIFICATIONS_ENABLED=false` permanece.

**Cerrado, owner Codex:** prueba de entrega de un evento a QA2 (una notificación,
dos capturas), identidad de grupos homónimos en web, categoría del mismo nombre
en espacios distintos y estado Push de QA2. **Abierto, owner Codex:** decidir
el cierre/limpieza del gasto y reintegro sintéticos de ARS 1 y de la categoría
QA2 de prueba al terminar el piloto; mantener el cerco, supervisar fallos del
worker y documentar cualquier ampliación antes de aplicarla. La prueba de
`/grupo ID` con dos nombres homónimos en Telegram sigue pendiente de una cuenta
vinculada apta; las regresiones de código ya pasan y no se exige a QA2 vincular
Telegram. **Owner Esteban:** solo avisar si retira el consentimiento Push o si
quiere ejecutar esa prueba manual de Telegram; no hay validación requerida para
el corte de hoy.

### Alta Push concurrente y seguimiento — 12/10/2026

El único writer activo de `push_subscriptions` era `saveSubscription`: antes
consultaba el endpoint y luego insertaba fuera de una transacción, permitiendo
dos filas para un mismo navegador ante altas simultáneas. La lectura previa
de `beta-hermes` encontró 2 suscripciones, 2 endpoints distintos, 0 grupos
duplicados y una sola fila de outbox (`sent`). El commit `ab5c77b` hizo
atómica la lectura/escritura mediante transacción inmediata y rechaza
endpoints con titularidad ya ambigua sin reasignarlos. La integración libSQL
comprueba que dos altas concurrentes dejan exactamente una fila; no hubo
escrituras en la base real para esta prueba. Pasaron 970 tests de app, 94 del
harness, TypeScript, lint de archivos tocados y build.

El deployment beta `dpl_14jnXpA9N5QNyFjgjATvYgcAGaZD` quedó READY y pasó
los diez checks de build, `/login=200`, `POST /api/push/subscribe` sin sesión
`401` y H04d antes/después de mover solo el alias beta. La relectura del
alias legacy mantuvo `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete
privado `/private/tmp/hermes-h04d-push-active.cawr90/` devolvió `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false` bajo la
política residual aceptada solo para beta. La conciliación Turso posterior
repitió 2 endpoints distintos, 0 duplicados y una fila `sent`.

**Cerrado, owner Codex:** carrera del writer de alta Push en beta, sin
migración ni cambio de flags; el canary permanece cercado a `test` y dos
cuentas QA. **Abierto, owner Codex:** estudiar un índice único de endpoint a
nivel DB para defender también escrituras ajenas al writer, con preflight de
duplicados, backup/restore y migración aditiva; no es un requisito para este
corte, y no se aplicará a legacy. Continúan con owner Codex la supervisión de
fallos del outbox, la limpieza diferida de datos QA y ACT-17 de consentimiento
y destinatarios antes de habilitar avisos proactivos. No se necesita una
validación humana nueva para la corrección de concurrencia.

### ACT-17 — identidad web antes de avisos proactivos (12/10/2026)

La revisión de destinatarios encontró un contrato implícito en el middleware:
escribía `x-user-id` y `x-group-id` en headers de respuesta mientras las rutas
leen headers de request. La auditoría histórica indicaba que la versión local
de Next podía copiarlos internamente, por lo que no se afirma explotación
confirmada; aun así, faltaba sanear IDs aportados por el cliente y declarar
el forwarding verificado. Esteban aprobó la corrección solo en beta.

El corte de código elimina ambos headers entrantes, deriva el usuario de la
sesión firmada y reenvía usuario/grupo autorizado con `NextResponse.next({
request: { headers } })`. Deja de publicar esos IDs en la respuesta. La
regresión falló antes del parche y ahora cubre ID de usuario/grupo falsificados,
membresía revocada sin grupo personal y cookies de onboarding/grupo. Pasaron
972 tests de app y el harness, TypeScript, lint sin errores y build aislado.

El commit `17addb7` está pusheado a la rama de trabajo. El proyecto Vercel
separado `hermes-finantial-tracker-z2` creó el candidato target Production
`dpl_CmesjbMCAh3M7fToJ6pHZnDNtYcd` con `--skip-domain`; quedó READY y su
build pasó los diez checks H04d y el match de fingerprints. Antes de mover
el alias, `vercel inspect` siguió resolviendo el alias beta a
`dpl_14jnXpA9N5QNyFjgjATvYgcAGaZD` y el legacy a
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. No se cambió ningún flag, webhook o DB.

**Owner Codex, abierto:** comprobación funcional con sesión/cuenta QA en el
candidato, reatestar H04d para el nuevo ID/SHA y mover solo el alias beta
después de pasar ambos gates; luego releer los dos aliases. **Owner Esteban:**
validar el login y el dashboard QA en la URL candidata si Codex no dispone
de una sesión aislada apta. La suite local no sustituye este recorrido.
**ACT-17 permanece abierto, owner Codex:** consentimiento separado para
resumen diario, recordatorios de recurrentes, reintegros y sesiones; resolver
destinatarios de chats de sesiones con pertenencia vigente, sanear texto HTML
y ampliar pruebas A/B/exmiembro antes de activar `NOTIFICATIONS_ENABLED`.
**Owner Esteban:** decidir la activación proactiva solo tras esas puertas.

### ACT-17 — cierre del subcorte de identidad beta (12/10/2026)

Esteban abrió el candidato con su sesión y envió capturas de `test · propio`
y `Mi espacio · propio`: el cambio de grupo terminó y cada dashboard mostró
sus propios importes. No hizo falta crear otro movimiento. Esto valida el
recorrido funcional de cambio de grupo; no demuestra que existiera una
explotación del contrato anterior de headers. El caso de IDs falsificados
queda cubierto por la regresión local del middleware.

Codex promovió únicamente el alias beta al deployment READY
`dpl_CmesjbMCAh3M7fToJ6pHZnDNtYcd`, target Production **dentro del proyecto
beta separado** `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`, desde el SHA
`17addb75c1cf0386a9f6460f3281e569d4696947`. La relectura de Vercel
confirmó el alias beta en ese ID y el alias legacy sin cambios en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El build remoto pasó los diez checks
H04d y la comparación de fingerprints. El paquete privado
`/private/tmp/hermes-h04d-auth.quuZEN/` pasó con `ok:true` y
`postActivationRuntimeConsistent:true`; conserva `isolationVerified:false`:
la limitación aceptada se aplica solo al piloto beta, sin certificar lectura
directa de todos los secretos en ejecución ni URLs retiradas. No se cambió
ningún flag, webhook, esquema o dato financiero por parte de Codex.

**Cerrado, owner Codex:** forwarding explícito de identidad verificada,
validación funcional de cambio de grupo y promoción aislada del alias beta.
**Abierto, owner Codex:** el resto de ACT-17 (consentimiento por evento y
destinatarios), supervisión del canary Push y limpieza diferida de datos QA.
`NOTIFICATIONS_ENABLED` permanece apagado. **Owner Esteban:** no se necesita
otra validación para este subcorte; la activación proactiva requerirá su
decisión después de las puertas técnicas pendientes.

### Telegram selector de grupos + siguiente subcorte ACT-17 (12/10/2026)

**Selector, código y beta publicados; aceptación funcional pendiente.**
`/grupos` y `/grupo` sin argumento ofrecen un botón por grupo, con nombre,
titularidad (`propio` o `de @usuario`) y marca del activo. Los nombres
duplicados muestran los botones correspondientes; el ID viaja solo en el
callback, no se pide copiarlo. Si dos etiquetas siguen siendo idénticas,
se numeran visualmente. El callback comprueba la membresía del usuario que
lo tocó y refresca el teclado; un exmiembro no cambia su grupo activo.
Los comandos por nombre único o ID siguen disponibles. No se crea ni mueve
ningún movimiento al cambiar de grupo.

El commit `308eb001da600e0de64f273b6f75d29184c701db` pasó 979 tests de
app, harness, TypeScript, build y lint sin errores (advertencias anteriores).
El deployment beta `dpl_DhcS7BzmzYq6RhAkm3QNhFCMe8JC` quedó READY y pasó
los diez checks H04d con fingerprints coincidentes. Solo el alias beta
`https://hermes-finantial-tracker-z2.vercel.app` pasó a ese ID; la relectura
del alias legacy mantuvo `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete
privado `/private/tmp/hermes-h04d-picker.CAAOYg/` pasó antes y después de
promover el alias (`ok:true`, `postActivationRuntimeConsistent:true`), pero
`isolationVerified:false` sigue expresando el residual aceptado únicamente
para el piloto beta. No se tocó el webhook ni se activaron avisos proactivos.

**Owner Esteban, validación real ahora:** en el bot beta, enviar `/grupos`,
tocar `test`, luego volver a `/grupos` y tocar `Mi espacio`; confirmar que
la marca ✓ y el grupo activo se actualizan sin escribir IDs. No crear gastos.
**Owner Codex:** registrar esa evidencia, corregir cualquier hallazgo y
cerrar la aceptación del selector. El despliegue de este corte no queda
certificado funcionalmente hasta ese recorrido.

**ACT-17, próximo subcorte local owner Codex:** los nombres/emoji de
categorías en el resumen diario y el nombre de la sesión en su recordatorio
se insertaban sin escape en HTML de Telegram. La regresión reprodujo ambos
casos; el parche local escapa `&`, `<`, `>` y comillas. Pasaron 981 tests de
app, harness, TypeScript, build y lint dirigido. Este parche todavía no está
en el alias beta; Codex conserva owner de despliegue aislado y
reatestación H04d en el siguiente corte. Siguen pendientes, también con
owner Codex, consentimiento por tipo de aviso, destinatarios de sesiones,
canary Push y limpieza QA. `NOTIFICATIONS_ENABLED=false` permanece en beta;
Esteban decidirá una activación proactiva solo tras esos gates.

### Selector aceptado y ACT-17 HTML recurrentes — 12/10/2026

Esteban confirmó que `/grupos` muestra botones y ✓ para el grupo activo en
el bot beta. Se cierra la aceptación funcional del selector sin pedir IDs ni
crear movimientos. El parche previo de escape HTML para el resumen diario y
sesiones (`8456a71835d81e333f9d2d518faebe924677bf82`) fue publicado
solo en el alias beta como `dpl_LPcnzc3i2x2ADpUkFEAHMuNYkMdj`. El build
pasó diez checks H04d y la reatestación privada
`/private/tmp/hermes-h04d-alert-html.UyL59W/` devolvió `ok:true` y
`postActivationRuntimeConsistent:true` tras promoverlo.

El siguiente subcorte reprodujo con pruebas fallidas otro texto dinámico sin
escape en avisos de recurrentes. `recurring-reminders` ahora usa HTML en vez
de Markdown y escapa el nombre y emoji configurables; el aviso de inicio de
mes también escapa ambos campos. El commit
`16e8df81c9265dbb23d546ba9ace2bc4bc8bcb24` pasó 983 tests de app,
harness, TypeScript, build y lint dirigido. Se publicó exclusivamente en el
proyecto beta separado como `dpl_Bio129wkVmMZCehMQigRUtRjgGeA` y se
promovió el alias canónico beta a ese ID. La relectura del alias legacy lo
mantuvo en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete privado
`/private/tmp/hermes-h04d-recurring.mbhJ7Q/` pasó antes y después de la
promoción (`ok:true`, `postActivationRuntimeConsistent:true`). En ambos
deployments `isolationVerified:false`: sigue siendo la aceptación acotada del
piloto, no una certificación independiente de todos los secretos en ejecución.

**Cerrado, owner Codex:** selector Telegram y saneamiento de estos mensajes
proactivos, con alias beta y H04d reatestados. **Abierto, owner Codex:**
consentimiento específico por tipo de aviso, destinatarios y pertenencia
vigente de chats de sesiones, canary Push, seguimiento de outbox y limpieza
diferida de QA. `NOTIFICATIONS_ENABLED=false` permanece apagado; Codex no
habilitará avisos proactivos sin cerrar esas puertas y decisión de Esteban.

### ACT-17 — opt-in individual y chats de sesiones cerrados (12/10/2026)

Esteban confirmó opt-in individual, separado para resumen diario,
recurrentes y recordatorios de reintegro, con default apagado. Los avisos
grupales de sesiones esperan vínculo verificable de chat/grupo y destinatarios.
El [contrato del corte](ACT-17-PROACTIVE-CONSENT.md) distingue estas
preferencias de Web Push transaccional. La implementación local agrega
`notification_preferences` sin backfill, API de sesión firmada y controles en
«Mi cuenta». Los tres crons comprueban la preferencia del destinatario en el
momento de enviar; el de sesiones deja de usar un `telegram_chat_id` histórico.
El kill switch beta `NOTIFICATIONS_ENABLED=false` no se cambió.

La migración `0110-notification-preferences` se ensayó sobre una exportación
fresca y se aplicó solo a `beta-hermes`, tras verificar cuenta/base exactas,
schema y ledger anteriores, integridad, claves foráneas y conservación de
las 28 tablas preexistentes. Resultado del aplicador: `verified:true`. El
backup privado previo permanece en
`/private/tmp/hermes-consent-beta-backup.JOvkMl/`; se eliminó únicamente la
copia temporal del ensayo. No se tocó legacy ni se insertó consentimiento
retroactivo. Localmente pasaron 992 pruebas, TypeScript, lint dirigido y
build; la publicación del código y H04d para un nuevo deployment siguen
pendientes en este subcorte.

**Owner Codex:** revisar y promover el código solo a beta con H04d, validar
la UI/API de cuenta y un canary de preferencias sin enviar avisos; mantener
`NOTIFICATIONS_ENABLED=false`. Después revisar destinatarios restantes,
observabilidad del outbox y retención/limpieza QA. **Owner Esteban:** ninguna
activación proactiva solicitada ahora; decidirla solo tras los gates restantes.

### ACT-17 — opt-in publicado en beta, activación pendiente (12/10/2026)

El corte de consentimiento quedó en el commit
`a6ac21142fcada7b9de1e2d71fa9e192d66e33aa`, publicado solo en el
proyecto beta como `dpl_51JzPe9bDJHiCgRXxcZdCDNn8bdY` (READY, target
`production` del proyecto beta). El alias canónico
`https://hermes-finantial-tracker-z2.vercel.app` apunta a ese deployment; la
relectura del alias legacy conservó
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El build remoto pasó los diez checks
H04d y los fingerprints; la reatestación privada posterior a la promoción
`/private/tmp/hermes-h04d-consent.v3BqXB/` devolvió `ok:true` y
`postActivationRuntimeConsistent:true`. Conserva `isolationVerified:false`
por el residual aceptado únicamente para el piloto beta: no es certificación
independiente de cada secreto en ejecución ni de URLs retiradas.

La migración beta `0110-notification-preferences` quedó verificada con las 28
tablas anteriores preservadas; el backup previo está en
`/private/tmp/hermes-consent-beta-backup.JOvkMl/`. La suite local pasó 993
tests de app, además del harness, TypeScript, lint dirigido y build. No se
modificó legacy ni se creó consentimiento retroactivo. En Chrome, la URL
canónica de «Mi cuenta» redirigió a `/login`, por lo que la UI/API autenticada
no se da por validada remotamente. Los envíos proactivos continúan apagados
mediante `NOTIFICATIONS_ENABLED=false`; la suscripción Push transaccional es
independiente.

La lectura agregada y sin datos personales de Turso beta tras el despliegue
encontró 0 filas de preferencias (default off), 25 entregas Telegram `sent`
y 1 Push `sent`; no había filas `pending`, `retryable` ni `processing` en
ninguno de los dos outboxes. Esto verifica ausencia de cola pendiente en ese
instante, no una garantía futura de entrega ni un SLA del worker.

**Owner Codex:** verificar UI/API de preferencias con una sesión beta real y
revocación, observar los destinatarios y el outbox sin habilitar envíos,
reconciliar el canary Push y preparar la retención/limpieza QA. **Owner
Esteban:** cuando corresponda, iniciar sesión en el alias canónico beta para
la validación funcional; decidir una eventual activación proactiva solo tras
los gates técnicos y revisión explícita de alcance.

### ACT-17 — aceptación autenticada de preferencias (12/10/2026)

Esteban inició sesión en el alias canónico beta y aportó capturas de «Mi
cuenta»: las tres casillas aparecían apagadas. Codex verificó en esa sesión
los tres ciclos de activar/revocar (resumen diario, recurrentes y reintegros).
Cada activación mostró el estado marcado y el mensaje de que los envíos beta
siguen apagados; cada revocación devolvió la casilla a apagada. Para resumen
diario se recargó la página entre ambos pasos y la activación persistió.
Turso beta confirmó durante ese ciclo una sola fila de preferencias con
`daily_summary=1`, `recurring=0`, `reimbursements=0`, y al final una fila con
los tres valores en cero. Los conteos de outbox permanecieron en 25 Telegram
y 1 Push: esta prueba no produjo entregas adicionales. El kill switch global
no se alteró. No se usaron ni se expusieron credenciales de la sesión.

**Cerrado, owner Codex:** aceptación funcional autenticada de lectura,
persistencia y revocación de las tres preferencias en beta. **Abierto, owner
Codex:** verificación cruzada de aislamiento entre cuentas, observabilidad
continua del outbox/worker y retención/limpieza QA; los chats de sesiones
permanecen sin envíos. **Owner
Esteban:** no se requiere otra acción para este subcorte. Una activación
proactiva futura sigue requiriendo revisión explícita después de esos gates.

### ACT-17 — unicidad de endpoint Push en beta (12/10/2026)

El [contrato de este corte](ACT-17-PUSH-ENDPOINT-UNIQUENESS.md) quedó en
`eb5309f6ca790017c73c4259ad0cea79f418f9c7`, pusheado a la rama de
trabajo. Una prueba fail-first demostró que el esquema anterior admitía dos
titulares para el mismo endpoint. La migración aditiva
`0120-push-endpoint-unique` agrega el índice único; un preflight rechaza
duplicados sin DDL ni ledger, y las pruebas de migración preservan dos
suscripciones distintas y cubren alta concurrente. No cambió la UX de
asociación explícita entre cuentas.

El export privado fresco previo está en
`/private/tmp/hermes-endpoint-beta-backup.wssN2n/`: integridad y ledger
preíndice válidos, 2 suscripciones, 2 endpoints distintos y 0 grupos
duplicados. El ensayo sobre una copia alcanzó el esquema canónico. El
aplicador limitado a la identidad exacta de `beta-hermes` comparó filas de
29 tablas antes y después y devolvió `verified:true`; la relectura remota
confirmó 2 suscripciones, 2 endpoints, 1 ledger de la nueva migración y 1
índice. Pasaron 100 pruebas del harness, 993 de app, typecheck, lint sin
errores (advertencias preexistentes) y build local.

El proyecto Vercel beta aislado publicó
`dpl_7wQhEjfYbqKWC8BnTqrFT3s8Td13` (READY, target `production` del
proyecto beta), con los diez checks de build H04d aprobados. El alias
canónico beta apunta a ese deployment y el alias legacy permanece en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. El paquete privado
`/private/tmp/hermes-h04d-endpoint.wpuebA/` pasó antes y después de
promover el alias (`ok:true`, `postActivationRuntimeConsistent:true`).
`isolationVerified:false` conserva el residual previamente aceptado solo
para el piloto beta; no es una certificación independiente de los secretos
en ejecución ni de URLs antiguas. La lectura agregada posterior mostró
ambos outboxes sin trabajos abiertos y 0 opt-ins proactivos activos. No se
modificó legacy ni se habilitaron avisos proactivos.

**Cerrado, owner Codex:** índice y rollout beta, preservación de datos y
reatestación H04d. **Abierto, owner Codex:** aislamiento cruzado de
preferencias/destinatarios entre cuentas, observabilidad del worker/outbox y
retención/limpieza QA. **Owner Esteban:** ninguna acción requerida para este
corte; una activación proactiva posterior seguirá necesitando decisión
explícita tras los gates técnicos.

### ACT-17 — aislamiento cruzado de preferencias y destinatarios (12/10/2026)

La revisión independiente de destinatarios y una segunda lectura del código
confirmaron que resumen diario usa el Telegram privado vinculado al usuario
y `resolveAuthorizedTelegramGroup`, que exige membresía actual y sustituye
un puntero obsoleto por el grupo propio. Los recordatorios recurrentes
consultan únicamente recurrentes cuyo titular aún pertenece al grupo; los
de reintegros exigen membresía vigente de pagador y solicitante del grupo
de la transacción fuente. El cron no usa el último chat ni el ID global
para resúmenes personales. No se cambió la semántica de fallback al grupo
propio: que un exmiembro siga recibiendo avisos **de su propio grupo** es
esperable si algún día activa su opt-in, no una filtración del grupo ajeno.

Se añadieron regresiones de integración con DB para dos cuentas: los opt-ins
y revocaciones permanecen separados; un grupo activo obsoleto de B no
resuelve al grupo de A y se limpia; el esquema canónico rechaza un segundo
usuario con el mismo Telegram ID. La API autenticada ya prohíbe sustituir
`userId` y sus tests de cron verifican que el opt-in de A no autoriza un
envío a B. Pasaron 995 tests de app, 101 del harness, typecheck y lint de
los archivos nuevos sin errores.

La consulta **solo agregada** de `beta-hermes` encontró 2 usuarios con
Telegram vinculado, 0 Telegram IDs duplicados, 0 punteros activos a grupos
sin membresía y 0 usuarios sin grupo propio. El outbox observado contiene
solo 1 Push y 25 Telegram en estado `sent`; no hay trabajos abiertos ni
fallidos en ese corte de lectura. Esto acredita reglas de identidad y datos
actuales, no una entrega proactiva real entre dos cuentas: el kill switch
global sigue apagado y no se envió ningún aviso de prueba.

**Cerrado, owner Codex:** gate técnico de aislamiento de preferencias,
pertenencia y destinatario para los avisos personales existentes. **Abierto,
owner Codex:** observabilidad sostenida del worker/outbox, retención y
limpieza diferida de QA; la ruta a chats de sesiones sigue apagada hasta
un contrato explícito de vínculo chat-grupo. **Owner Esteban:** ninguna
validación requerida ahora; no activar avisos proactivos antes del cierre
de los gates restantes y una decisión explícita de alcance.

### ACT-17 — fotografía de colas y criterio operativo (12/10/2026)

El [control read-only del piloto](ACT-17-NOTIFICATION-OBSERVABILITY.md)
fija identidad beta, consultas agregadas, criterio de alarma y exclusión
de limpieza financiera. La lectura actual encontró 1 Push `sent`, 25
Telegram `sent`, 0 trabajos abiertos/fallidos y 0 filas Push cuyo plazo de
purga de siete días ya venció. No se forzó el worker, no se enviaron
mensajes, no se purgó nada y `NOTIFICATIONS_ENABLED=false` permanece.
Una segunda lectura agregada unos diez minutos después mantuvo 1 Push y
25 Telegram `sent`, sin `retryable`, `processing` ni `dead`; no había
trabajos nuevos, por lo que esto tampoco prueba la ruta de reintentos.

**Cerrado, owner Codex:** instrumento y línea base de observabilidad sin
datos personales. **Abierto, owner Codex:** seguimiento en otra ventana
temporal y conciliación de reintentos/fallos si aparecen; el canary Push y
los datos QA siguen intactos. Una única fotografía no prueba supervisión
continua ni autoriza activar envíos proactivos.

### ACT-17 — contadores cercados y presupuesto Push (13/10/2026)

Se implementaron dos cortes locales de confiabilidad del worker: el
[dispatcher Telegram](ACT-17-TELEGRAM-LEASE-COUNTERS.md) solo suma
`sent`/`retryable`/`dead` si su transición cercada por lease se confirmó;
en una carrera o pérdida de lease informa `lostLease` sin reencolar ni
afirmar entrega durable. Una prueba con libSQL aislado fuerza a dos workers
a competir sobre la misma fila y comprueba los contadores y estado final.

El [worker Push](ACT-17-PUSH-WORKER-BUDGET.md) separa reloj monotónico de
los timestamps del outbox, deja de iniciar nuevas tareas al agotar el
presupuesto de ejecución e informa `budgetExhausted`. El límite es blando
para una operación de DB o proveedor ya iniciada; no promete cancelación
de una entrega en curso ni evita por sí solo duplicados de proveedor tras
un timeout.

Pasaron 1004 tests de app y 101 del harness, typecheck, build y lint sin
errores (63 warnings preexistentes fuera de este corte). La revisión
independiente Luna detectó dos ajustes menores que se incorporaron y
reprobaron: fallback de resumen del webhook y presupuesto Push agotado
durante el último envío.

El código `b24c24059798478ae29a38c5723891352326ca65` fue pusheado y
desplegado como `dpl_67LAD82GEnDGpjz6nzM88oD2VSAd` (READY, target
`production` **solo del proyecto beta**). El build remoto emitió los diez
checks H04d `passed:true` con seis fingerprints coincidentes; se releyeron
los nombres de bindings beta y la identidad exacta de `beta-hermes` en Turso.
El paquete privado `/private/tmp/hermes-h04d-act17.VpHoRK/` pasó antes y
después de mover únicamente el alias beta:
`ok:true`, `postActivationRuntimeConsistent:true`, `isolationVerified:false`.
El último valor conserva el residual ya aceptado para este piloto; no es
lectura directa independiente de secretos en ejecución ni certifica URLs
retiradas. La relectura del alias legacy mantuvo
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.

Una lectura agregada posterior de la DB beta encontró 1 Push `sent`, 25
Telegram `sent`, 0 trabajos abiertos, 0 Push vencidos para purga y 0
preferencias proactivas activas. No se disparó un canary funcional nuevo,
no se limpiaron datos QA y el kill switch proactivo sigue apagado.

**Cerrado, owner Codex:** ambos cortes de confiabilidad y promoción beta
acotada. **Abierto, owner Codex:** observación temporal de fallos/reintentos,
prueba de saturación más amplia y política de retención/limpieza QA; mantener
la ruta a chats de sesiones apagada hasta vínculo verificable.
**Owner Esteban:** ninguna acción requerida ahora; el alcance de una futura
activación proactiva deberá decidirse explícitamente tras esos gates.

### ACT-17 — ensayo local de saturación Telegram (13/10/2026)

El [contrato de saturación acotada](ACT-17-TELEGRAM-SATURATION-HARNESS.md)
quedó cubierto con una prueba de integración sobre libSQL aislado: 40
entregas sintéticas, cuatro workers concurrentes por ronda, cinco claims
máximos por worker y un proveedor falso que responde primero `429` con
`retry_after=1` y luego éxito. Las 40 filas pasan por `retryable` y terminan
`sent`, con dos intentos y exactamente dos llamadas por chat, sin pérdidas
de lease ni escrituras en tablas financieras. No hubo llamadas a Telegram
real ni a las bases beta o legacy.

Pasaron 1005 tests de app, 101 del harness y typecheck; la revisión
independiente Luna confirmó el alcance y se agregaron aserciones de
contadores y destinatarios. Este corte solo agrega prueba y documentación;
no modifica el runtime desplegado `b24c240` ni requiere otra promoción.

**Cerrado, owner Codex:** ensayo funcional local de backlog concurrente y
reintento por límite de tasa. **Abierto, owner Codex:** medición de capacidad
y latencia con proveedor/entorno representativos, observación temporal y
política de retención/limpieza QA. No se infiere SLA ni se habilitan envíos
proactivos a partir de este ensayo. **Owner Esteban:** sin acción requerida
en este corte.

### ACT-17 — inventario de retención beta (13/10/2026)

La CLI aislada volvió a confirmar `esteban-indiveri` y el ID exacto de
`beta-hermes`. Una consulta **solo agregada** de los outboxes encontró 1
Push `sent` y 25 Telegram `sent`; no hay filas terminales con
`retention_until` vencido ni trabajos abiertos/fallidos. El código vigente
retiene terminales Push siete días y Telegram treinta días, y sus workers
purgan solo terminales vencidos en lotes acotados. No se invocó una purga
ni se tocó el canary o los movimientos financieros QA.

**Cerrado, owner Codex:** inventario previo a limpieza y confirmación de que
no hay purga de notificaciones debida ahora. **Abierto, owner Codex:**
observar una ventana posterior y definir por separado el inventario exacto
de dependencias antes de proponer cualquier limpieza de gastos, reintegros,
categorías o cuentas QA. Ninguna evidencia de este corte autoriza borrar
datos financieros ni activar avisos proactivos.

### ACT-17 — ensayo local de concurrencia Push (13/10/2026)

El [contrato de este ensayo](ACT-17-PUSH-SATURATION-HARNESS.md) se cubrió
con 40 intenciones sintéticas en libSQL local y cuatro consumidores por
ronda, limitados a cinco claims cada uno. Una primera fase aplica
directamente la transición `retryable` con código `429`; la segunda termina
en `sent`. Cada fase reclamó 40 IDs distintos y todas las filas acabaron
con dos intentos. La fixture crea solo la tabla del outbox Push; no llama a
`web-push`, bases remotas ni escritores financieros. El adaptador del
proveedor y la capacidad real **no** quedan probados por este ensayo.

Pasaron 1006 tests de app, 101 del harness, typecheck y lint dirigido. La
revisión independiente Luna confirmó el cerco y acotó explícitamente la
interpretación de `429` a una transición simulada. Este corte agrega solo
prueba y documentación; no modifica el runtime publicado en beta.

**Cerrado, owner Codex:** saturación funcional local de claims/transiciones
Push. **Abierto, owner Codex:** prueba de adaptador y capacidad con entorno
representativo, observación temporal de colas y política de retención de
datos Telegram; la limpieza financiera QA permanece separada y requiere
inventario exacto antes de cualquier borrado. **Owner Esteban:** ninguna
acción requerida ahora.

### ACT-17 — dependencias QA para limpieza futura (13/10/2026)

El [inventario beta read-only](ACT-17-QA-CLEANUP-INVENTORY.md) separa los
dos «Mi espacio» por propietario y cuenta dependencias agregadas de QA1 y
QA2. QA2 no tiene movimientos en su espacio propio, pero sí membresías en
los dos grupos de QA1, una suscripción y entrega Push, y un rol de
reintegro. Por ello, ni el nombre del grupo ni un dashboard vacío son
criterio seguro de borrado. No hubo escrituras, envíos ni limpieza.

**Cerrado, owner Codex:** inventario agregado previo a la limpieza.
**Abierto, owner Codex:** identificar IDs y dependencias transitivas solo
después de una selección de alcance; preparar dry-run y conciliación antes
de cualquier eliminación. **Owner Esteban:** decidir qué datos QA conservar
o retirar cuando se abra ese corte; no se requiere decisión para mantener
el piloto actual.

### ACT-17 — decisión QA y adaptador Push por lotes (13/10/2026)

Esteban decidió conservar los datos QA hasta terminar el piloto beta. Esta
decisión queda registrada en el
[inventario QA](ACT-17-QA-CLEANUP-INVENTORY.md): no se ejecutará un borrado
manual financiero, de grupos o de cuentas durante el piloto. Queda
documentada abajo la decisión posterior sobre el historial de entregas
terminales; los TTL operativos existentes de los outboxes no cambiaron.

El [contrato del adaptador Push](ACT-17-PUSH-ADAPTER-BATCH-HARNESS.md) se
probó con 40 intenciones sintéticas en libSQL local, cuatro workers reales
por ronda y `web-push` simulado. Cada endpoint recibió un `429` en su primer
intento y éxito en el segundo; los 40 pasaron por `retryable` y terminaron
`sent`, con dos intentos, una única confirmación por endpoint, sin
`lostLease` y con contadores financieros idénticos antes/después. Un
destinatario canary sin membresía actual quedó `dead/ineligible` sin llamada
al proveedor. No se accedió a Turso beta/legacy ni se enviaron Push reales.

Pasaron 1007 tests de app, 101 del harness, typecheck y lint dirigido en
Node 22. La revisión Luna confirmó el alcance y se reforzó el caso negativo
de membresía. Este corte solo cambia pruebas y documentación; no requiere
deploy ni reatestación H04d para el runtime beta actual.

**Cerrado, owner Codex:** reintentos `429` del adaptador simulado bajo
backlog concurrente y decisión de preservar datos QA. **Abierto, owner
Codex:** observación prolongada, capacidad/latencia con proveedor real,
política de retención del texto Telegram y gate de activación proactiva.
Una relectura agregada, con identidad beta verificada, encontró 1 Push y 25
Telegram `sent`, 0 purgas vencidas y primeros vencimientos operativos el
19/10 y 28/10 UTC respectivamente. No hubo purga ni lectura de payloads.
**Decisión Esteban, 13/10:** conservar datos QA hasta el cierre del piloto,
pero mantener los TTL actuales de entregas terminales (Push 7 días,
Telegram 30 días). No requiere cambio de runtime ni de configuración.
La limpieza QA manual se reabre solo al terminarlo.

### ACT-17 — borde de retención Telegram y decisión confirmada (13/10/2026)

Esteban confirmó mantener los TTL existentes de entregas terminales: Push
7 días y Telegram 30 días. El [contrato e inventario de retención
Telegram](ACT-17-TELEGRAM-DATA-RETENTION-BOUNDARY.md) distingue estos
outboxes de `bot_messages`, inbox, operaciones, recibos y estados de
conversación. Una lectura agregada y de solo lectura, después de verificar
la identidad de `beta-hermes`, encontró 61 mensajes, 108 updates inbox, 20
operaciones, 25 entregas Telegram, 11 importaciones de recibo y 0 estados
de conversación. No se consultó contenido ni hubo purga.

Una nueva prueba libSQL fija el límite Telegram por defecto: una entrega
`sent` permanece hasta el milisegundo anterior a los 30 días desde su
encolado; en el vencimiento se borra su texto y la operación durable queda.
Pasaron el test dirigido, 1008 tests de app y 101 del harness, typecheck,
lint dirigido y `git diff --check` en Node 22. Este corte no cambia
runtime, por lo que no requiere deploy o reatestación H04d. Los datos QA
financieros, grupos y cuentas permanecen hasta el cierre del piloto.

**Cerrado, owner Codex:** ambigüedad entre preservación QA y TTLs de
entrega, más regresión del límite Telegram. **Abierto, owner Codex:**
observación temporal y capacidad con proveedor representativo; estudiar el
horizonte de replay y minimización de texto antes de cualquier nueva
retención/purga. `NOTIFICATIONS_ENABLED=false` permanece vigente. No se
aplicará un TTL nuevo a las otras tablas solo por analogía con el outbox.

### ACT-17 — fotografía agregada reproducible (13/10/2026)

El [contrato](ACT-17-BETA-OUTBOX-SNAPSHOT-CONTRACT.md) y el
[runbook](ACT-17-NOTIFICATION-OBSERVABILITY.md) incorporan un comando
local de observabilidad que exige `--config-path` absoluto y confirma
cuenta, nombre, ID y URL exactos de `beta-hermes` antes de ejecutar SQL
constante. Solo emite conteos por estado, trabajos vencidos para entrega
o purga, leases expirados y edad agregada; errores/formatos inesperados
se bloquean sin imprimir resultados crudos.

La primera ejecución real, de solo lectura, produjo una fotografía a las
16:03:07 UTC; se repitió a las 16:06:22 UTC tras reforzar la validación
de estados y tiempos malformados. Ambas mostraron Push 1 `sent`, Telegram
25 `sent`, cero abiertos, `dead`,
leases expirados o purgas vencidas en ambos canales. Coincide con los
agregados anteriores, pero no demuestra un SLA ni capacidad de proveedor.
No hubo escrituras, envíos, borrados ni cambios de flags.

Pasaron 7 pruebas nuevas del comando (incluida SQL real en libSQL local),
108 del harness, 1008 de la app, typecheck, lint dirigido y
`git diff --check` en Node 22. La revisión independiente Luna confirmó el
alcance y señaló el riesgo de que una fila malformada no entre al conteo;
se incorporaron contadores que bloquean estado nulo y tiempos inválidos.

**Cerrado, owner Codex:** herramienta y primer corte reproducible.
**Abierto, owner Codex:** comparaciones temporales en varios cortes y
capacidad/latencia con proveedor representativo antes de reconsiderar
avisos proactivos; la decisión de activación beta permanece separada.

### ACT-17 — semántica observable del scheduler Push (13/10/2026)

El siguiente corte corrige una ambigüedad: un HTTP 200 de
`/api/cron/push-outbox` podía significar cola procesada o Push deshabilitado,
pero el scheduler registraba ambos como ejecución completada. La ruta ahora
emite el estado cerrado `processed` o `skipped_worker_disabled` en
`X-Hermes-Outbox-Execution`; el Worker lo registra solo tras validarlo y
convierte cualquier valor inesperado en `unknown`, sin leer cuerpos.
Pruebas dirigidas de ruta y scheduler fijan el contrato. No se han activado
envíos, alterado datos QA ni consultado secretos con este cambio.
Pasaron 1008 pruebas de app, 110 del harness, typecheck, lint (0 errores;
63 advertencias preexistentes) y `git diff --check` con Node 22.

**Abierto, owner Codex:** revisar estado real de
Cloudflare/Vercel y promover el runtime solo a beta con reatestación H04d.
El Wrangler versionado tiene `PUSH_SCHEDULER_ENABLED=true`, mientras la
evidencia histórica de Vercel señalaba `WEB_PUSH_ENABLED=false`; no se
infiere el estado desplegado de ninguno a partir del repositorio. La
fotografía limpia de Turso no prueba liveness del scheduler. Avisos
proactivos siguen apagados y su activación requiere un gate distinto.

**Lectura operativa posterior, sin escrituras (16:23 UTC):** Vercel CLI
reconfirmó el proyecto beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`. Su listado
Production muestra las variables de Push cifradas, pero no sus valores;
por eso no acredita `WEB_PUSH_ENABLED`. Cloudflare CLI confirmó que la
última versión del Worker beta fue desplegada el 12/10 a las 06:18 UTC,
con 100 % del tráfico, URLs pinneadas al beta y
`SCHEDULER_ENABLED=PUSH_SCHEDULER_ENABLED=true`. Una tercera fotografía
Turso, a las 16:23:13 UTC, mantuvo Push 1 y Telegram 25 `sent`, con cero
abiertos, vencidos o purgas pendientes. Estos metadatos no demuestran
ejecuciones recientes, entrega Push real ni estado efectivo de la ruta
Vercel. Owner Codex: comprobar una ventana de logs/métricas y hacer el
rollout beta con la reatestación H04d antes de atribuir el nuevo encabezado
al runtime desplegado.

### ACT-17 — promoción beta del estado Push observable (13/10/2026)

La rama quedó en `aefe1a57fc254a7859beefacd96ef5de5fe8260a` con
1008 pruebas de app, 110 del harness, typecheck y lint aprobados; la
revisión Luna del diff no halló un defecto crítico. Vercel creó el
candidato `dpl_EdcTTLMTDGESu3cfUrYQLRH36tFd` con target `production`
**dentro del proyecto beta** y `--skip-domain`. Quedó `READY`. El build
remoto pasó los diez checks H04d y los seis fingerprints de secretos beta.
Antes de mover el alias, el paquete privado de siete recibos actualizado
para este ID/SHA devolvió `ok:true`, `postActivationRuntimeConsistent:true`,
`isolationVerified:false`. Codex movió solo
`hermes-finantial-tracker-z2.vercel.app` a ese candidato y releyó los dos
aliases: beta apunta al ID nuevo; legacy sigue en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. La reatestación privada volvió a
pasar después de la promoción. El residual H04d sigue aceptado **solo
para el piloto beta**, sin certificar secretos en función ni URLs retiradas.

Cloudflare publicó únicamente `hermes-beta-outbox-scheduler` versión
`c2a503cb-e72e-4972-9d7f-bf3359816156` a las 16:36 UTC, 100 % del
tráfico, cron `*/5 * * * *`, dos URLs beta exactas, flags de scheduler
`true` y dos bindings de secreto por nombre (sin leer valores). No se
tocó el proyecto legacy ni se activó `NOTIFICATIONS_ENABLED`.

**Abierto, owner Codex:** observar ticks actuales y la diferencia
`processed`/`skipped_worker_disabled`; las lecturas de cola sin trabajos
abiertos no prueban recuperación, capacidad ni latencia de entrega. La
activación de avisos proactivos sigue siendo una decisión separada, con
opt-in y evidencia operativa sostenida.

Una observación read-only del tick de las 16:40 UTC, filtrada a campos
permitidos del Worker ya desplegado, registró Push HTTP 200
`execution=processed` en 634 ms y Telegram HTTP 200
`execution=processed` en 758 ms. La fotografía Turso posterior, a las
16:41:04 UTC, mantuvo Push 1 y Telegram 25 `sent`, sin trabajo abierto,
vencido ni purga pendiente. Esto confirma que ambas rutas de recuperación
se invocaron y no se omitieron por flag en ese tick; **no** mide latencia
de una entrega real ni valida reintentos bajo carga. Owner Codex:
mantener la observación en una ventana mayor y un canary de reintento
acotado antes de considerar un SLO o avisos proactivos.

### ACT-17 — actividad agregada del outbox (13/10/2026)

El [contrato de este corte](ACT-17-OUTBOX-ACTIVITY-METADATA.md) añade una
cabecera de cinco contadores acotados (`claimed`, `sent`, `retryable`,
`dead`, `lostLease`) a las respuestas procesadas de ambos outboxes. El
scheduler beta valida rangos y consistencia, registra solo los agregados y
descarta los valores crudos inválidos. Así diferencia un tick procesado con
cola vacía de uno con actividad, sin leer cuerpos ni datos personales.
Las regresiones fallaron primero por ausencia de la cabecera/actividad y
luego pasaron 1009 pruebas de app y 113 del harness, typecheck, lint sin
errores (63 advertencias previas) y `git diff --check` en Node 22.

La fotografía beta read-only de las 16:47:52 UTC conservó Push 1 y Telegram
25 `sent`, sin trabajos abiertos, vencidos ni purgas debidas. Este código
no altera datos QA ni activa avisos proactivos. La revisión independiente
Luna no encontró defectos concretos en la cabecera ni en la validación.

**Rollout beta (17:06 UTC):** commit `d97a185f5abc3c12dfe2f00f4ffc74b5013e9326`
pusheado; Vercel creó `dpl_5euJyd1xRaQ8fQjnBHeEj3n4MaFE` como target
`production` **solo en el proyecto beta**. Quedó `READY`, con los diez checks
H04d del build y los seis fingerprints beta aprobados. El paquete privado
de recibos actualizado pasó antes y después de mover únicamente el alias
`hermes-finantial-tracker-z2.vercel.app`: `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false`.
El alias legacy conserva `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. Cloudflare
publicó solo `hermes-beta-outbox-scheduler` versión
`7cefe87a-2df0-4192-a8b5-9cd896aac00b`, con cron de cinco minutos,
flags de ambos carriles en `true` y dos bindings secretos presentes por
nombre. No se leyeron valores secretos.

La fotografía beta read-only de las 17:00:40 UTC seguía Push 1 y Telegram
25 `sent`, cero abiertos, vencidos o purgas debidas. El tick de las 17:10 UTC
del Worker nuevo registró ambos carriles `processed`, HTTP 200, con
`activity={claimed:0,sent:0,retryable:0,dead:0,lostLease:0}` y duración
de 1639/1640 ms. La fotografía Turso posterior a las 17:11:33 UTC conservó
Push 1 y Telegram 25 `sent`, sin trabajo abierto, vencido ni purga debida.
La conexión de tail se reconectó antes del tick; el evento registrado
identifica la versión desplegada y no se infiere actividad durante el
intervalo desconectado. **Cerrado, owner Codex:** promoción y primer tick
con metadatos agregados. **Abierto, owner Codex:** observación temporal y
prueba de reintento real acotada; el canary histórico Telegram no acredita
por sí solo este deployment y el ensayo local no mide latencia de proveedor.

### ACT-17 — canary de recuperación Telegram beta (13/10/2026)

La cuenta QA `esteban_beta_qa` era única, tenía Telegram vinculado y 47
mensajes privados previos con el chat correspondiente; el bot del outbox
coincidía con la identidad beta. Se insertaron solo una `telegram_operations`
sintética y una `telegram_delivery_outbox` sintética para su chat privado,
con texto explícito de prueba técnica y estado inicial `retryable`, intento
1, código estable `provider_unavailable`. No se creó gasto, reintegro,
split ni pago. La fotografía previa a las 17:14:28 UTC mostraba Telegram
1 `retryable` vencido y Push sin trabajo abierto.

El tick del Worker beta de las 17:15 UTC registró Telegram HTTP 200,
`processed`, `activity={claimed:1,sent:1,retryable:0,dead:0,lostLease:0}`
en 1443 ms. Push permaneció `processed` con cinco ceros. En Turso la única
fila del canary quedó `sent`, intento 2, con recibo de proveedor presente,
lease y error limpios. Los conteos financieros antes/después se mantuvieron
en 24 transacciones, 9 reintegros, 0 splits y 0 pagos. Esto acredita una
recuperación beta con proveedor, no tasa sostenida ni ausencia de duplicados
ante fallos de red inciertos.

La inserción manual del fixture omitió `retention_until`: el snapshot
estricto lo bloqueó y la consulta agregada confirmó que era la única fila
terminal sin TTL. El encolador normal sí establece el TTL de 30 días. Se
completó **solo esa fila QA**, condicionada a `sent`/intento 2/TTL nulo, con
`retention_until=sent_at+30 días`; no hubo cambio de código ni purga. A las
17:17:51 UTC el snapshot volvió a pasar: Telegram 26 `sent`, Push 1 `sent`,
cero abiertos, vencidos, leases expirados o purgas debidas. En futuros
canaries, usar el encolador o incluir el TTL en el fixture antes del envío.

**Cerrado, owner Codex:** recuperación Telegram en el deployment vigente y
conciliación financiera/retención. **Abierto, owner Codex:** ventana más
larga de capacidad/latencia y validación Push con proveedor representativo.
Los opt-ins proactivos siguen en cero y `NOTIFICATIONS_ENABLED=false`;
ningún aviso proactivo fue activado. Los datos QA y sus movimientos se
conservan hasta el cierre del piloto, sujetos únicamente a TTLs terminales
de entrega.

Un tercer tick observado a las 17:20 UTC, con el mismo Worker beta, devolvió
ambos carriles `processed`, HTTP 200 y cinco ceros; duró 643/660 ms. La
fotografía posterior de las 17:21:26 UTC conservó Telegram 26 y Push 1
`sent`, sin abiertos, vencidos o purgas debidas. Esta ventana de tres ticks
incluye un canary de recuperación y dos colas vacías, pero sigue sin ser
una medición sostenida de capacidad o un SLO. **Owner Codex:** mantener
observabilidad del piloto y no activar avisos proactivos hasta consentimiento
individual y decisión de alcance; el único canary Push con confirmación
humana previa sigue siendo el del 12/10.

### ACT-17 — opt-in de resumen diario recibido (13/10/2026)

Esteban activó «Resumen diario» en `Mi cuenta` del alias beta y aportó la
captura de confirmación. La lectura de la base aislada `beta-hermes` a las
18:09 UTC verificó exactamente una fila de preferencias: `daily_summary=1`,
`recurring=0`, `reimbursements=0`, con Telegram privado vinculado para
`esteban_beta_qa`. El grupo Telegram activo conserva membresía válida y
configuración `USD_ARS` de octubre. La fotografía agregada de outboxes a
las 18:09:29 UTC mostró Push 1 y Telegram 26 `sent`, cero abiertos,
vencidos, leases expirados o purgas debidas. No se creó movimiento ni se
envió aviso por esta verificación.

**Consentimiento individual cerrado, owner Esteban. Activación proactiva
abierta, owner Codex.** La preferencia no enciende por sí sola el kill switch
`NOTIFICATIONS_ENABLED=false`; recurrentes y reintegros no tienen opt-in.
Antes de habilitar el cron diario en beta, cerrar su entrega idempotente y
observable: hoy `/api/cron/daily-alerts` llama a Telegram directamente, sin
recibo durable por destinatario/fecha/tipo. Un reintento de la ruta puede
duplicar un resumen, y la cola monitoreada no acredita ese envío. Conservar
el switch apagado hasta resolver ese borde, revalidar consentimiento al
entregar y observar una ventana operativa suficiente. No tocar legacy ni
los datos financieros QA retenidos durante el piloto.

### ACT-17 — corte local de entrega diaria durable (13/10/2026)

El cron de resumen diario ya no llama directamente a Telegram: prepara una
intención por bot, usuario y fecha calendario Argentina en el outbox Telegram
beta. Reutiliza la operación padre persistente como recibo de deduplicación,
incluso después del TTL de 30 días del hijo. Si cae entre padre e hijo puede
completar el hijo dentro de esa ventana, sin recrearlo después. La misma fecha
Argentina gobierna el mes, la clave y la condición de lunes; se corrigió el
borde de las 21:00 locales que la conversión a ISO movía al día siguiente.

Antes del envío el dispatcher exige `NOTIFICATIONS_ENABLED=true`, preferencia
diaria vigente, chat privado aún vinculado y grupo activo autorizado e igual
al preparado. Una revocación, cambio de chat/grupo o falta de metadatos mata
la entrega sin proveedor. Para este aviso proactivo se permite un solo intento
de proveedor: timeout, resultado incierto o lease recuperado quedan `dead`
para revisión, sin reintento automático. El proveedor no ofrece idempotencia
de envío; se prioriza evitar un duplicado a costa de poder perder un resumen.
Las respuestas a acciones del usuario conservan sus reintentos actuales.

El contrato y sus exclusiones están en `ACT-17-DAILY-DELIVERY.md`. Pruebas
dirigidas e integración libSQL cubren concurrencia, deduplicación, caída
parcial, revocación, relink, cambio de grupo, flag apagado y resultado incierto.
La batería completa pasó con Node 22: 120 suites/1022 tests de Jest, 113
pruebas del harness, lint sin errores (63 warnings previos), build Next y
`tsc --noEmit --incremental false`. `git diff --check` pasó. La revisión
independiente no encontró bloqueos de código; señaló como condición operativa
verificar flags, worker, bot y base beta antes de un canary.

**Cerrado, owner Codex:** implementación y verificación local del borde de
idempotencia/revocación diario. **Abierto, owner Codex:** commit/push,
atestación H04d, despliegue únicamente del proyecto beta, canary de cola y
observación operacional. **No activar aún** `NOTIFICATIONS_ENABLED`: el
consentimiento individual está guardado, pero el envío proactivo permanece
apagado hasta que ese corte y sus controles queden aprobados. No se alteraron
movimientos financieros ni datos QA ni legacy.

### ACT-17 — promoción beta del resumen diario durable (13/10/2026)

Commit `c17adc0b0d54f3958a424b98be69da2172b34135` pusheado a
`codex/act05-currency-modes`. El primer candidato beta
`dpl_4GpzbToXg7wGYw1TLFqMFwc3ZAYC` falló exclusivamente durante el build
de `next/font`/DM Sans; ya había pasado el evento de diez checks H04d y seis
fingerprints beta. No se promovió. Un reintento del mismo SHA creó
`dpl_5a69XMd873KM1vb3VXgqZz1iui6c`, target `production` **dentro del
proyecto beta** con `--skip-domain`. Quedó `READY` y su build remoto volvió
a registrar los diez checks H04d y los fingerprints coincidentes.

El paquete privado `/private/tmp/hermes-h04d-daily.eUVL42/` se actualizó
para este deployment/SHA y pasó antes y después de mover **solo** el alias
`hermes-finantial-tracker-z2.vercel.app`: `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false`. El
residual continúa aceptado solo para el piloto beta, sin transformar una
declaración local en certificación. La lectura autenticada posterior mostró
el alias beta en `dpl_5a69XMd873KM1vb3VXgqZz1iui6c` `READY` y el alias
legacy aún en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx` `READY`.

La fotografía agregada y read-only de `beta-hermes` a las 19:04:41 UTC
conservó Push 1 y Telegram 26 `sent`, sin pendientes, reintentos, procesando,
`dead`, vencidos ni purgas debidas. No se creó ni envió una intención diaria;
`NOTIFICATIONS_ENABLED=false` sigue siendo condición del build y del runtime
de este corte. Los datos QA se conservan. **Cerrado, owner Codex:** promoción
beta, aislamiento y snapshot posterior. **Abierto, owner Codex:** definir un
canary diario acotado que no habilite por accidente otras familias
proactivas, verificar operativamente el worker/cron vigente y observar una
ventana suficiente antes de activar envíos. El costo de at-most-once ante
fallos de red inciertos permanece documentado; no hay prueba de entrega
diaria real todavía.

### ACT-17 — cerco para canary diario beta (13/10/2026)

La revisión independiente Luna confirmó que cambiar directamente
`NOTIFICATIONS_ENABLED=true` habilitaría otros cron y el emisor Telegram
transaccional no sujeto a esas preferencias, y desactivaría el cerco Push
existente que requiere el switch global en `false`. Se descartó esa
activación amplia pese a contar con permiso: no sería un canary acotado.

El siguiente corte agrega `DAILY_SUMMARY_CANARY_ENABLED`,
`DAILY_SUMMARY_CANARY_USER_ID` y `DAILY_SUMMARY_CANARY_GROUP_ID` como excepción
exacta de un usuario/grupo mientras `NOTIFICATIONS_ENABLED=false`. El cron
omite cualquier otro usuario y no examina los reintegros viejos en ese modo;
el dispatcher vuelve a exigir el mismo alcance, el opt-in diario, el chat
privado y la membresía/grupo vigente antes del proveedor. Una configuración
ausente/parcial/mal escrita falla cerrada. El build beta atesta la forma del
alcance y el validador H04d admite una declaración opcional explícita sin
confundirla con la activación global. Se documentó el contrato en
`ACT-17-DAILY-DELIVERY.md` y la excepción en
`H04D-POST-ACTIVATION-RUNTIME-ISOLATION.md`.

La cuenta `esteban_beta_qa` tiene consentimiento y chat privado vinculados;
su grupo Telegram activo corresponde a su espacio propio. La consulta beta
read-only de movimientos del 13/10 en ese grupo dio cero; un cron hoy no
constituiría prueba de entrega. **Owner Codex:** terminar pruebas, desplegar
el código y los tres bindings solo en beta con H04d nuevo; después preparar
una intención técnica identificada como QA (sin crear movimientos) y
conciliar un único envío o la causa exacta del rechazo. Mantener el switch
global apagado, preservar datos QA y no tocar legacy.

### ACT-17 — canary diario beta activado sin switch global (13/10/2026)

Commit `b5d98fe1e4654af5bfa86af97423e329b9554c79` pusheado a
`codex/act05-currency-modes`. La revisión independiente detectó que tres
bindings por sí solos podían activar el canary fuera de beta; se cerró antes
de desplegar. El runtime exige la compuerta de aislamiento, origen, host
Turso y bot beta; el build y H04d solo aceptan el usuario QA
`504b3827-a03e-49a6-acc6-c200f225ca80` y grupo
`b5b15f53-f964-4c12-99ca-88fbbee23c55`. Si aparece un binding canary y
el switch global pasa a `true`, el resumen falla cerrado en vez de ampliar
destinatarios. Los tres bindings canary se agregaron solo al target
Production del proyecto **beta**, mientras `NOTIFICATIONS_ENABLED=false`.

La batería completa pasó: 121 suites/1040 tests Jest y harness, lint 0
errores/63 warnings preexistentes, build Next y `git diff --check`. El nuevo
deployment beta `dpl_66Zq8jQrGN63u11TDMjfdWzUVneS` quedó `READY`; el build
remoto emitió once checks H04d aprobados, incluido
`daily_summary_canary_scope`, con seis fingerprints coincidentes. El paquete
privado `/private/tmp/hermes-h04d-daily.eUVL42/` pasó antes y después de
mover únicamente `hermes-finantial-tracker-z2.vercel.app` al nuevo deployment:
`ok:true`, `postActivationRuntimeConsistent:true`, `isolationVerified:false`.
La consulta autenticada posterior mostró el alias legacy todavía en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx` `READY`.

Se insertó **solo en beta** una intención outbox identificada
`daily-summary-qa-canary-b5d98fe-20261013`, con texto explícito de prueba
técnica, al Telegram privado vinculado de `esteban_beta_qa`; no hubo gasto,
ingreso ni reintegro. La siguiente barrida del worker la llevó a `sent` en
un intento, con ID de proveedor. Reconciliación read-only: una operación,
una entrega `sent`, cero filas financieras del 13/10 en el grupo QA.
La operación/entrega técnica se conserva con los demás datos QA hasta terminar
el piloto. Esto prueba el despacho del canary y su revalidación, **no** el
formateo ni disparo cron de un resumen real; hoy no había movimientos en
ese grupo para gatillarlo.

**Cerrado, owner Codex:** alcance beta-only, despliegue, reatestación y
despacho técnico único. **Abierto, owner Codex:** observar al menos un cron
diario elegible y su resultado, confirmar ausencia de envíos a otros usuarios
o grupos y vigilar las colas/errores durante la ventana operativa antes de
considerar cualquier ampliación. `NOTIFICATIONS_ENABLED` permanece `false`;
no se habilitaron los otros avisos proactivos ni se tocó legacy. Si hay
resultado de red incierto, la política sigue siendo no reintentar
automáticamente este aviso.

### ACT-17 — siguiente corte: borde horario y recibo del cron (13/10/2026)

La lectura autenticada de `vercel crons ls` confirmó tres tareas activas en
el proyecto beta, entre ellas `/api/cron/daily-alerts` a `0 0 * * *` (00:00
UTC / 21:00 Argentina). Esto acredita la configuración del disparador, **no**
su ejecución concreta. La revisión independiente Luna no encontró una ruta
de envío cruzado en el cerco canary, pero sí que el filtro de movimientos
terminaba en `23:59:59.000` y perdía los últimos 999 ms del día. El corte
lo reemplaza por el intervalo semiabierto de fecha Argentina y añade pruebas
de la medianoche.

Para poder observar el disparo aunque no haya movimientos elegibles, el cron
canary ahora emite solo `beta_daily_summary_canary_cron` con fecha local y
resultado fijo; no registra IDs, chats, importes ni el mensaje. **Owner
Codex:** desplegar este corte únicamente a beta con H04d fresco y revisar el
recibo del siguiente horario junto con el outbox. Sin contenido elegible,
`nothing_relevant` no debe confundirse con un resumen entregado. Se mantiene
el switch global apagado y no se fuerza un gasto en el espacio personal QA.

**Promovido solo a beta:** commit
`5dfb11ed5ee3d033f28fed7c11091fd8126f2003` pusheado; 121 suites/1042
tests Jest y harness pasaron, lint 0 errores/63 warnings previos, build y
typecheck correctos. El deployment
`dpl_4BDbtrarrNHpRVz39U8TzXZqBEks` quedó `READY` y emitió once checks
H04d aprobados, incluidos fingerprints y alcance diario. El paquete privado
`/private/tmp/hermes-h04d-daily.eUVL42/` pasó antes y después de mover solo
el alias beta al nuevo deployment; mantiene `isolationVerified:false`.
El alias legacy siguió en `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx` `READY`.
Foto posterior read-only: un único `cron:daily` técnico `sent`, cero
operaciones diarias para otros usuarios, preferencia QA activa y grupo
autorizado sin cambios.

El seguimiento del próximo horario quedó encargado a la automatización del
hilo `ACT-17 cron diario beta` a las 21:15 de Argentina, silenciosa mientras
no haya cambio accionable. **Owner Codex:** conciliar su evento redaccionado
con el outbox y registrar el resultado; no inferir entrega real de
`nothing_relevant`. Sin permiso nuevo no se expandirá el canary ni se
habilitará el switch global.

### ACT-17 — observación del cron diario del 13/10 (21:18 ART)

La consulta read-only de logs del proyecto Vercel beta entre las 20:58 y
21:18 ART no mostró ninguna invocación de `/api/cron/daily-alerts` ni el
evento redaccionado `beta_daily_summary_canary_cron`. Sí mostró barridas
`/api/cron/telegram-outbox` y `/api/cron/push-outbox` a las 21:00, 21:05,
21:10 y 21:15, por lo que la ventana de logs tenía actividad. La lista de
crons de Vercel continuó mostrando `/api/cron/daily-alerts` con horario
`0 0 * * *`.

La lectura de `beta-hermes` mantuvo exactamente una operación
`proactive.daily_summary` y una entrega `sent`, ambas de la prueba técnica
anterior (19:54/19:55 UTC); no apareció una intención nueva del horario y el
conteo de operaciones diarias de otros usuarios siguió en cero. **No hay
evidencia de ejecución del cron diario ni de entrega nueva**; tampoco se
deduce de esta ausencia que un aviso se haya perdido. La consulta no creó
movimientos ni reintentó mensajes. `NOTIFICATIONS_ENABLED=false` y el alcance
canary permanecen sin cambios.

Según la [documentación de Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
en plan Hobby una tarea diaria puede dispararse en cualquier momento de la
hora configurada. No está verificado aquí el plan del equipo, así que la
ausencia a 21:18 no se clasifica todavía como fallo del scheduler.

**Owner Codex, abierto:** ampliar la observación de logs pasada la hora
configurada para descartar demora del scheduler; si persiste la ausencia,
diagnosticar el disparador beta antes
de realizar otra prueba de entrega. Conservar los recibos QA y no promover el
switch global ni tocar legacy. El seguimiento del hilo se reprogramó para
22:05 ART, sin alterar la configuración de Vercel.

### ACT-17 — destino real del cron y corte de observación (13/10, 21:54 ART)

Una nueva lectura de logs del **proyecto beta** mostró el pedido
`/api/cron/daily-alerts` a las 00:43:37 UTC del 14/10 (21:43:37 ART), con
HTTP 200, pero atribuido al deployment anterior
`dpl_7wQhEjfYbqKWC8BnTqrFT3s8Td13` (creado el 12/10 a las 23:07 ART).
No hubo entrada del mismo pedido en el deployment del canary
`dpl_4BDbtrarrNHpRVz39U8TzXZqBEks`, creado el 13/10 a las 17:16 ART.
El alias visible `hermes-finantial-tracker-z2.vercel.app` sí resuelve al
deployment nuevo; esta reasignación manual del alias no demuestra que el
scheduler esté invocando ese build. El registro obtenido fue de middleware,
sin evento `beta_daily_summary_canary_cron`; un HTTP 200 aislado no prueba
que el handler nuevo haya construido un resumen.

En `beta-hermes` continuó exactamente una operación diaria técnica, creada
19:54:44 UTC y entregada 19:55:27 UTC al Telegram **privado** de
`esteban_beta_qa`, con contexto de grupo `Mi espacio` propio
`b5b15f53-f964-4c12-99ca-88fbbee23c55`. No apareció operación diaria
nueva ni para este usuario ni para otros. La cuenta QA tiene ahora seleccionado
el grupo `test` (`6a7c238e-8467-4333-8e7e-7db2c626aa07`), fuera del
alcance autorizado del canary personal; no se conoce a partir de esta foto
cuándo cambió de grupo respecto de las 21:43. Un mensaje diario para `test`
debe quedar bloqueado por diseño.

**Diagnóstico:** el disparo programado existió, pero la evidencia lo ubica
en un build beta anterior, no en el canary. La reprogramación del seguimiento
de Codex a 22:05 no alteró el cron Vercel y no podía reparar el destino.
El corte diario real sigue sin validar. **Owner Codex:** confirmar el mecanismo
de promoción `Current` del proyecto beta, distinguirlo de `alias set`,
reatestar H04d si se modifica el deployment servido al scheduler y volver
a probar solo con grupo/usuario autorizado y contenido elegible. Mantener
`NOTIFICATIONS_ENABLED=false`, conservar QA, no tocar legacy ni afirmar entrega.
Se pausó el seguimiento automático de este horario: repetir la lectura de
logs sin corregir el destino no cerraría el corte.

### ACT-17 — registro del cron reparado en beta (14/10/2026)

La consulta autenticada `GET /v9/projects/prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`
confirmó la causa operativa: `crons.deploymentId` aún era
`dpl_7wQhEjfYbqKWC8BnTqrFT3s8Td13` y las tres definiciones apuntaban al
host generado de ese deployment. Aunque el alias visible y el estado
`Current` resolvían al build nuevo `dpl_4BDbtrarrNHpRVz39U8TzXZqBEks`,
`vercel promote` devolvió 409 («already the current production deployment»).
Por tanto, la explicación anterior de que faltaba promoverlo era incompleta:
el **registro del scheduler** seguía obsoleto; la evidencia no demuestra por
qué Vercel lo conservó tras `--skip-domain` y `alias set`.

Se publicó el mismo código (HEAD `0a9040ec7dd371f38530c79f8bf61f51bb2d3d2f`,
solo documentación adicional desde el build anterior) mediante
`vercel deploy --prod` **sin** `--skip-domain`, exclusivamente en el proyecto
beta. El deployment `dpl_CuKg4ct2wGWXX2soiesvi18Pj6nh` quedó `READY`; su
build pasó los once checks de aislamiento, incluida la huella de secretos,
`beta_notifications_disabled` y `daily_summary_canary_scope`. La lectura
posterior del proyecto mostró `crons.deploymentId` igual a ese nuevo ID y
las tres definiciones con su host generado. Ambos dominios beta resuelven
al nuevo deployment; el alias legacy siguió en
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx` `READY`.

Se renovó el paquete H04d privado `/private/tmp/hermes-h04d-daily.eUVL42/`
para el nuevo ID y SHA. El validador pasó con
`postActivationRuntimeConsistent:true`, `isolationVerified:false` y la
excepción diaria limitada a un usuario/grupo QA; este resultado no equivale
a una certificación independiente de secretos en runtime.

Una sola ejecución manual con `vercel crons run /api/cron/daily-alerts` a
01:34:17 UTC entró al **nuevo** deployment y registró el evento redaccionado
`beta_daily_summary_canary_cron` para 2026-10-13 con
`outcome:nothing_relevant`. La comprobación previa de la fila
`active_telegram_group_id` mostró en ese instante el grupo personal
`b5b15f53-f964-4c12-99ca-88fbbee23c55`; una lectura anterior lo había
mostrado como `test`, sin timestamp de cambio disponible. No se creó ninguna
operación diaria nueva: sigue un único outbox técnico `sent` del 13/10 y
cero operaciones diarias de otros usuarios. `nothing_relevant` prueba que el
handler actual respondió, **no** una entrega de resumen real. No se crearon
movimientos financieros ni se modificó legacy.

**Owner Codex, abierto:** observar el siguiente disparo *programado* y
confirmar que usa este deployment; la prueba integral de entrega requiere
contenido elegible en el grupo canary o una decisión explícita para mover el
alcance QA. El switch `NOTIFICATIONS_ENABLED` permanece `false`.

### ACT-17 — prueba manual integral con gasto QA (13/10, 22:48–22:50 ART)

Esteban creó en el beta un gasto activo de ARS 300, comercio `Cordiez`, en
`Mi espacio` personal de `esteban_beta_qa` a las 01:45:29 UTC del 14/10.
Antes del disparo se verificaron el grupo Telegram activo
`b5b15f53-f964-4c12-99ca-88fbbee23c55`, el vínculo privado y la
preferencia `daily_summary=1`. Solo existía la operación técnica previa.

Por pedido de Esteban se ejecutó **una sola vez**
`vercel crons run /api/cron/daily-alerts --scope eindi-acme` a
01:48:17.842 UTC. El proyecto beta la dirigió a
`dpl_CuKg4ct2wGWXX2soiesvi18Pj6nh`; el handler respondió HTTP 200 y
registró `beta_daily_summary_canary_cron` con fecha Argentina 2026-10-13 y
`outcome:queued`. Se creó una operación nueva `proactive.daily_summary`
`daily-summary-3e1f1467ed1c70bbd336c27674af30f6a8536e833e399fccbfe54247d981783e`.
El worker entregó su única fila de outbox a las 01:50:09 UTC: `sent`, un
intento, recibo de Telegram presente y ningún error. La consulta de
operaciones diarias de otros usuarios devolvió cero. No se repitió el cron
ni se creó otro movimiento.

Esteban confirmó que recibió el aviso en su Telegram. Queda validado el
camino **manual** completo, pero esto **no** acredita que el próximo disparo
automático use el deployment correcto. **Owner Codex:** observar el siguiente
cron programado, conciliando
evento redaccionado y outbox sin duplicar el resumen. Mantener
`NOTIFICATIONS_ENABLED=false`, el cerco canary y los datos QA; no tocar legacy.

### ACT-17 — recibo visual y distinción de schedulers (13/10, 22:58 ART)

Esteban aportó la captura del bot beta con «Resumen del día — martes, 13 de
octubre», un gasto de Supermercado por ARS 300 y total ARS 300. Confirma la
recepción visual del envío manual anterior; no es evidencia del disparo
automático de las 21:00. La pantalla de preferencias muestra las tres
casillas activadas: son opt-ins almacenados, no prueba de que los tres tipos
de envío estén habilitados. Con `NOTIFICATIONS_ENABLED=false`, únicamente el
resumen diario del usuario/grupo QA autorizado tiene excepción canary;
recordatorios proactivos de recurrentes y reintegros siguen apagados.

La lectura read-only de logs del deployment beta vigente en la ventana
01:49:50–01:50:30 UTC mostró HTTP 200 en `/api/cron/telegram-outbox` y
`/api/cron/push-outbox` a las 01:50:08 UTC. Esto concuerda con el outbox
Telegram `sent` a las 01:50:09 UTC. El cron Vercel `/api/cron/daily-alerts`
crea la intención diaria; el scheduler Cloudflare cada cinco minutos llama a
los dos workers de outbox para entregar/reintentar mensajes. Las respuestas
interactivas del bot y los avisos transaccionales no dependen del cron diario.

Se corrigió en código el texto de «Mi cuenta» para separar claramente
preferencia de disponibilidad real durante el piloto; prueba enfocada,
typecheck, ESLint y detector de interfaz aprobaron. **Owner Codex:** mantener
este ajuste sin promover al alias beta hasta observar el siguiente disparo
automático sobre `dpl_CuKg4ct2wGWXX2soiesvi18Pj6nh`; después reatestar H04d
y desplegar solo en el proyecto beta sin `--skip-domain`, verificando el nuevo
registro `crons.deploymentId`. No ampliar el canary ni tocar legacy.

### ACT-17 — promoción de la aclaración de preferencias a beta (13/10, 23:15 ART)

El diferimiento anterior fue innecesario: preservar el ID viejo no era una
condición del plan si se volvía a comprobar el registro del scheduler. El
commit `f13d2818b088c3619a7d8c25f38855c38f191953` se desplegó con
`vercel deploy --prod --yes --no-wait --scope eindi-acme`, sin
`--skip-domain`, **solo** en el proyecto beta. El deployment
`dpl_Exkk9buxrLLsMwpwuUvMzksBkuVv` quedó `READY`; el build remoto emitió
once checks H04d aprobados, incluidas las huellas, el switch global apagado y
el alcance diario QA. La lectura posterior de proyecto mostró
`crons.deploymentId=dpl_Exkk9buxrLLsMwpwuUvMzksBkuVv` y las tres tareas
apuntando a su host generado. El alias beta resuelve al nuevo deployment;
el alias legacy aún resuelve a `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`
`READY`.

Se refrescó el paquete privado H04d para el nuevo ID/SHA y pasó con
`postActivationRuntimeConsistent:true`, `isolationVerified:false`; persisten
los gaps de certificación aceptados solo para beta. Una lectura en el
navegador autenticado confirmó el nuevo texto de «Mi cuenta» y que las tres
preferencias guardadas siguen marcadas. No se ejecutó de nuevo el resumen ni
se modificó ningún movimiento. El seguimiento del hilo se actualizó para
comparar el **próximo disparo programado** con este nuevo deployment.

**Owner Codex:** observar la siguiente ventana programada 21:00–21:59 ART,
conciliar el evento redaccionado con operaciones/outbox, descartar otros
destinatarios y separar `nothing_relevant` de una entrega real. Mantener
`NOTIFICATIONS_ENABLED=false`, el canary y los datos QA; no tocar legacy.

### ACT-17 — ventana automática extraordinaria, sin repetición de entrega (13/10, 23:26 ART)

Para verificar el scheduler sin invocar manualmente el endpoint, se cambió
temporalmente el cron beta `/api/cron/daily-alerts` de `0 0 * * *` a
`40 2 * * *` (ventana de las 23:00–23:59 ART del 13/10). Se hizo push del
commit `d17dd1a4428260c3b4809453ef1f449ec05cb8a3` y despliegue **solo**
del proyecto beta, sin `--skip-domain`: `dpl_G4CJjV2acjKRUAXNa34k63xNF9pg`
quedó `READY` y como destino del alias canónico. La lectura del proyecto
confirmó `crons.deploymentId` igual al deployment vigente y schedule
`40 2 * * *`. El build remoto aprobó once checks H04d y el paquete privado
refrescado dio `postActivationRuntimeConsistent:true`,
`isolationVerified:false`, con los gaps de certificación beta ya aceptados.
`NOTIFICATIONS_ENABLED=false` y el cerco canary siguen intactos.

El resumen del 13/10 para el usuario/grupo QA ya se entregó a las 22:50 ART
mediante la prueba manual autorizada. La identidad diaria es determinista por
bot, usuario y fecha; por eso el disparo automático de esta noche debe
registrar `already_queued` y **no** enviar otro Telegram. La ejecución
automática y la deduplicación son los criterios de este corte; una entrega
nueva requiere una fecha elegible posterior. En Vercel Hobby el minuto del
cron no es exacto: la ventana es la hora configurada.

**Owner Codex:** a las 00:05 ART conciliar logs de request y evento
`beta_daily_summary_canary_cron` con operación/outbox, confirmar cero
destinatarios ajenos, restaurar el cron beta habitual de 21:00 ART mediante
otro despliegue con H04d y mantener seguimiento hasta una entrega automática
de fecha nueva. No ejecutar el endpoint a mano, no crear movimientos ni tocar
legacy.

### ACT-17 — ventana extraordinaria sin invocación observada (14/10, 00:05 ART)

La consulta read-only de logs del proyecto beta para 02:00–03:05 UTC no
mostró ningún request `/api/cron/daily-alerts` ni el evento
`beta_daily_summary_canary_cron`, aunque sí mostró los workers de outbox en
el deployment `dpl_G4CJjV2acjKRUAXNa34k63xNF9pg`. La lectura del registro
Vercel confirmó que `crons.deploymentId` y los hosts apuntaban a ese
deployment y que el schedule seguía siendo `40 2 * * *`. En `beta-hermes`
permanecieron exactamente las dos operaciones/outbox diarias QA ya conocidas,
ambas `sent`; ninguna operación diaria de otros usuarios. **No hay evidencia
de invocación programada ni de un segundo envío.**

El schedule temporal se registró a las 23:24 ART, ya dentro de la hora en
que Vercel Hobby podía ejecutar una tarea diaria con minuto no garantizado.
Es plausible que el instante elegido por el scheduler hubiera quedado antes
de ese registro, pero los recibos no prueban esa causa: este ensayo queda
**inconcluso**, no validado. El siguiente corte observará un cron registrado
antes de comenzar su ventana, sin ejecuciones manuales. **Owner Codex:**
restaurar `0 0 * * *` y reatestar/desplegar beta, después observar la
siguiente ventana de 21:00–21:59 ART con contenido elegible de fecha nueva.
Mantener `NOTIFICATIONS_ENABLED=false`, el canary QA y legacy intactos.

**Restauración beta verificada (00:11 ART):** commit
`129bcb1b274c4d6dc472babd2a511d0cab234d60` desplegado solo al
proyecto beta, sin `--skip-domain`. El deployment
`dpl_83wcUw35AgcXa37ffWARDpHZcSMW` quedó `READY` y en el alias canónico;
`crons.deploymentId` coincide y `/api/cron/daily-alerts` volvió a
`0 0 * * *`. El build remoto aprobó once checks H04d y el paquete privado
refrescado pasó con `postActivationRuntimeConsistent:true` e
`isolationVerified:false`, con los gaps beta preexistentes. No se invocó
manualmente el cron ni se creó ningún movimiento. El próximo disparo
automático normal, si Vercel lo ejecuta, corresponde a la ventana
21:00–21:59 ART del 14/10.

### ACT-17 — ensayo automático de mediodía preparado (14/10, 00:37 ART)

Esteban creó el gasto QA `Test` por ARS 2.000 en Supermercado, activo,
fechado 14/10 y asociado a su `Mi espacio` personal autorizado
(`b5b15f53-f964-4c12-99ca-88fbbee23c55`). La cuenta
`esteban_beta_qa` tiene ese grupo Telegram activo, opt-in de resumen diario
y todavía cero operaciones diarias para la nueva fecha Argentina. No se
creó ni editó ningún movimiento durante este corte.

Por pedido de Esteban se adelantó **temporalmente** el cron Vercel beta a
`40 15 * * *`, equivalente a 12:40 ART nominal; el equipo `eindi-acme` es
Hobby, por lo que su ventana efectiva es 12:00–12:59 ART. Se hizo push del
commit `679c4a56061d53af493925731cdfaed1eabe90fd` y deploy solo del
proyecto beta, sin `--skip-domain`. El deployment
`dpl_gt5Lctk1xdCmujVzPQuhj8SsTfjh` está `READY`, sirve el alias beta,
pasó once checks H04d remotos y coincide con `crons.deploymentId`; la
definición diaria apunta a su host y schedule `40 15 * * *`. El paquete
privado H04d actualizado pasó con `postActivationRuntimeConsistent:true`,
`isolationVerified:false` y los gaps beta aceptados; el switch global
permanece apagado.

El cron diario había tenido una ejecución previa a las 00:43 UTC del 14/10
bajo el horario anterior; Vercel Hobby limita la frecuencia a una vez por
día y no garantiza minuto exacto. Los recibos no establecen si reprogramar
el mismo cron dentro del día concederá otra ejecución. **Owner Codex:**
observar a las 13:10 ART logs, evento, operación y outbox sin invocación
manual, descartar destinatarios ajenos, restaurar `0 0 * * *` con H04d y
seguir la ventana normal si no hubo disparo. Legacy y datos QA intactos.

**Resultado de la ventana de mediodía (13:11 ART):** logs beta
15:00–16:10 UTC sin request `/api/cron/daily-alerts` ni evento redaccionado;
sí hubo barridas regulares `/api/cron/telegram-outbox` y
`/api/cron/push-outbox` HTTP 200 en el deployment QA vigente. El registro
Vercel todavía apuntaba a `dpl_gt5Lctk1xdCmujVzPQuhj8SsTfjh` con
`40 15 * * *`. `beta-hermes` mantuvo solo las dos operaciones/outbox
diarias QA del 13/10, ambas `sent`, y cero para el 14/10 u otros usuarios.
El ensayo no acredita disparo automático ni entrega. La coincidencia de dos
reprogramaciones sin segunda invocación en el mismo día UTC, después del
disparo automático a las 00:43 UTC, es consistente con el límite diario
Hobby; no hay recibo del scheduler que demuestre la causa exacta.

**Owner Codex:** restaurar `0 0 * * *` ahora, comprobar deployment/registro
y observar la ventana 21:00–21:59 ART del 14/10 (00:00–00:59 UTC del 15/10)
con el gasto QA `Test` aún elegible. No hacer un disparo manual ni fabricar
otro movimiento; mantener cerco canary, switch global apagado y legacy
intacto.

**Restauración verificada (13:16 ART):** el commit
`e0aef065d81a3ea23252ae04df309de9105736c8` se desplegó solo al
proyecto beta, sin `--skip-domain`. El deployment
`dpl_CQwmCoE24QQW19wYLuEcTi7WYc5k` está `READY` y sirve el alias beta;
`crons.deploymentId` coincide y `/api/cron/daily-alerts` registra
`0 0 * * *`. El build remoto aprobó once checks H04d y el paquete privado
refrescado pasó con `postActivationRuntimeConsistent:true`,
`isolationVerified:false` y los gaps beta preexistentes. La ventana normal
de 21:00–21:59 ART del 14/10 será el siguiente corte automático, ya en
el día UTC 15/10 y con el gasto QA `Test` del día Argentina 14/10 elegible.

### ACT-17 — ensayo automático de las 14:00 y alerta de almacenamiento (14/10, 13:48 ART)

Por pedido de Esteban, el cron diario beta se reprogramó temporalmente a
`0 17 * * *` (14:00 ART nominal). En Vercel Hobby la ejecución puede ocurrir
en cualquier momento de 14:00–14:59 ART. El commit
`f3fcda0e4b6c63df4bca5e0d13f0dba8c18f92c0` se publicó solo en el
proyecto beta y su deployment `dpl_AkTRXgvhQmSvAGn97qcvFhrzYD8f`
quedó `READY`, asociado al alias beta antes de comenzar la ventana.
`crons.deploymentId`, host y schedule coinciden con ese deployment. El build
remoto aprobó los once checks H04d y el paquete privado reatestado pasó con
`postActivationRuntimeConsistent:true`, `isolationVerified:false` y los gaps
beta aceptados. No se invocó el cron manualmente ni se creó un movimiento.

El email de Vercel recibido a la 01:18 ART informa que el equipo Hobby
`eindi-acme` consumió 75 % de los 10 GB incluidos de **Function Storage**.
Es una advertencia de capacidad del equipo, no un recibo de fallo del cron
ni evidencia de suspensión a ese nivel. El proyecto beta tiene al menos
100 deployments recientes visibles en la primera página de la API, por lo
que conviene medir el desglose por proyecto y reducir despliegues redundantes
antes de considerar retención o un cambio de plan. No se borraron
deployments ni se modificó la retención, que podría afectar rollback.

**Owner Codex:** después de las 14:59 ART conciliar logs del request
`/api/cron/daily-alerts`, evento `beta_daily_summary_canary_cron`, operación
y outbox `cron:daily` de la única cuenta/grupo QA autorizados; confirmar cero
destinatarios ajenos. Si no hay disparo, reportar el resultado observado sin
atribuir una causa no probada. Restaurar `0 0 * * *` (21:00 ART) solo en
beta con nuevo despliegue y H04d antes de esa ventana; continuar el
seguimiento de la entrega automática. Mantener `NOTIFICATIONS_ENABLED=false`,
datos QA y legacy intactos.

**Resultado automático (14/10, 14:40 ART):** el deployment beta vigente
registró un request `/api/cron/daily-alerts` y el evento redaccionado
`beta_daily_summary_canary_cron` con fecha Argentina `2026-10-14` y outcome
`queued`. En `beta-hermes` apareció exactamente una operación
`proactive.daily_summary` y una fila outbox `cron:daily` a las 17:40:44 UTC;
la operación quedó `committed` y la fila `sent` en un intento, con
`sent_at` e identificador de mensaje de Telegram. El `chat_id` de esa
fila coincide con el Telegram vinculado a `esteban_beta_qa`, el grupo
resultante es su `Mi espacio` personal aprobado, y el texto enviado incluye
Supermercado y ARS 2.000. La consulta agregada del corte mostró **cero
operaciones o destinatarios diarios ajenos**. No se ejecutó el cron a mano
ni se reenvió el mensaje. El usuario informó inicialmente que no le había
llegado; un recibo de proveedor acredita aceptación de Telegram, no prueba
por sí solo que el usuario lo haya visto en la interfaz. Si sigue ausente
del chat beta cerca de las 14:40, mantener esa discrepancia abierta sin
duplicar el envío.

**Owner Codex:** restaurar ahora `0 0 * * *` en beta, comprobar alias,
`crons.deploymentId` y H04d. Después registrar la restauración y cerrar
el corte de disparo automático, dejando la discrepancia de visibilidad
condicionada al chequeo de Esteban.

**Recibo de Esteban y restauración (14/10, 14:55 ART):** Esteban aportó
captura del chat del bot beta con el resumen del miércoles 14/10 y
Supermercado por ARS 2.000, visible a las 14:45 ART. Confirma recepción
del único envío automático; no hubo disparo ni reenvío manual. El commit
`01cef9792a239a4ef551b008f49674d25f9ee412` restauró el cron diario
`0 0 * * *` solo en el proyecto beta. El deployment
`dpl_BA5oRd3gGPHdyPNvk8EwTme991N1` está `READY` y sirve el alias
canónico; `crons.deploymentId` coincide y la definición diaria apunta a
su host. El build remoto aprobó los once checks H04d. El paquete privado
refrescado devolvió `postActivationRuntimeConsistent:true` e
`isolationVerified:false`, con los gaps beta preexistentes. El corte
ACT-17 de **invocación y entrega automática del resumen diario QA** queda
cerrado. Los demás avisos proactivos continúan apagados y requieren sus
propios cortes antes de activarse; no se tocó legacy ni se borraron datos QA.

### ACT-17 — recordatorios recurrentes: límite de grupo y entrega durable (14/10, 15:25 ART)

El siguiente corte se separó en dos subcortes de estabilización, documentados
en `docs/engineering/ACT-17-RECURRING-REMINDERS-BOUNDARY.md`. Primero, la
consulta de candidatos dejó de mezclar ejecuciones de grupos distintos del
mismo usuario: exige grupo Telegram activo y devuelve `groupId` explícito.
La regresión de dos grupos falló antes de la corrección y pasó después.
Commit `4241d48`.

Después, `/api/cron/recurring-reminders` dejó de enviar directo a Telegram:
encola una operación/outbox durable por usuario, grupo, tipo y día argentino.
El dispatcher vuelve a verificar switch global, opt-in, bot y chat privado
vinculados, grupo activo, membresía y estado/importe/nombre/fecha de las
ejecuciones antes de enviar. Repeticiones, concurrencia, texto distinto para
la misma identidad y resultados inciertos del proveedor no causan un segundo
envío. La revisión independiente detectó una carrera entre operación y
outbox, reproducida con prueba roja y corregida antes del despliegue; luego
se añadió la comprobación de datos financieros editados. Commit `c41081a`.

Verificación local final: 122 suites y 1.059 tests unitarios pasaron;
TypeScript y lint dirigido sin errores, `git diff --check` limpio. Ambos
commits están publicados en `codex/act05-currency-modes`. El despliegue fue
**solo al proyecto beta** `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`: release
`c41081a94b1218813c13cfc3db5e356867a0c1b3`, deployment
`dpl_6XJmY8NQe2YdV3ubYKZuwTBikJye` en estado `READY` y asociado al alias
canónico `https://hermes-finantial-tracker-z2.vercel.app`. El build aprobó
los once checks de aislamiento beta; `crons.deploymentId` coincide con el
deployment y conservó `0 0 * * *` para resumen diario y `0 11 * * *` para
recordatorios recurrentes. El paquete H04d privado actualizado pasó con
`postActivationRuntimeConsistent:true`, `isolationVerified:false`; persisten
los gaps conocidos de certificación independiente. `NOTIFICATIONS_ENABLED`
continúa **false**. Este corte no produjo avisos recurrentes ni movimientos
financieros QA; no modificó legacy ni eliminó datos QA.

**Owner Codex / próximo corte:** diseñar un canary de recordatorios
recurrentes limitado a usuario y grupo QA, con pruebas de no destinatarios
ajenos, y verificar una ejecución automática y outbox antes de ampliar el
alcance. Mantener envíos recurrentes apagados mientras no exista ese cerco;
reintegros pendientes y cron mensual siguen fuera de este corte. Para un
ensayo con entrega real se necesita una ejecución recurrente QA elegible y
consentimiento explícito, sin fabricar movimientos de usuario.

### ACT-17 — cerco canary de recurrentes preparado, todavía apagado (14/10, 15:37 ART)

El subcorte siguiente añadió `RECURRING_REMINDER_CANARY_{ENABLED,USER_ID,GROUP_ID}`
como excepción beta de un solo usuario/grupo mientras el switch global
permanece apagado. El cron filtra antes de encolar y el dispatcher repite
el control antes de Telegram; configuración parcial, mezcla con switch
global encendido o identidad de proyecto/base/bot ajena falla cerrada. El
build beta acepta únicamente el par QA aprobado si los bindings se
configuran. **Los tres bindings continúan ausentes en beta**: publicar este
código no activó recordatorios ni produjo un envío. La revisión independiente
no encontró defectos bloqueantes. Commit `ed30106019f4fd2b6af7f491170b1e1255834a41`
publicado en la misma rama.

Pasaron 123 suites / 1.072 tests unitarios, 116 tests del arnés, TypeScript,
lint dirigido y `git diff --check`. El despliegue beta
`dpl_J29ukXFKfdiLqiDAy8NpVa6KSSr9` quedó `READY` en el alias canónico;
`crons.deploymentId` y sus tres hosts corresponden a él, con resumen diario
en `0 0 * * *` y recurrentes en `0 11 * * *`. El build remoto aprobó doce
checks, incluido `recurring_reminder_canary_scope`. El paquete H04d privado
actualizado para esta release pasó con `postActivationRuntimeConsistent:true`
e `isolationVerified:false`; los gaps de certificación independiente siguen
abiertos. No se cambió `NOTIFICATIONS_ENABLED=false`, no se tocaron
movimientos QA ni legacy.

**Owner Codex / corte de activación pendiente:** verificar en `beta-hermes`
consentimiento `recurring`, grupo Telegram activo y una ejecución QA
recurrente realmente elegible; actualizar el contrato H04d para declarar
el canary recurrente, configurar solo los tres bindings exactos en el
proyecto beta, reatestar y observar la ventana automática con cero
destinatarios ajenos. Si falta la ejecución o el consentimiento, solicitar
validación de Esteban antes de enviar; no ampliar el switch global ni
fabricar un movimiento financiero.

**Preflight de activación (14/10, 15:40 ART):** en la sesión beta QA del
navegador, `Mi cuenta` muestra Telegram conectado y el consentimiento
`Pagos recurrentes` marcado. En `Recurrentes` del grupo activo `Mi espacio ·
propio`, octubre de 2026 muestra **0 activos, 0 pendientes** y el estado
"No tenés gastos recurrentes configurados". No existe allí una ejecución
QA elegible para probar entrega automática. El CLI de Turso no tiene sesión
autenticada; esta lectura de UI no sustituye una conciliación de base/outbox.
Los bindings del canary siguen ausentes y los envíos recurrentes apagados.
**Owner Esteban:** decidir/crear un recurrente de prueba en ese espacio, con
importe y fecha de vencimiento apropiados, o autorizar un fixture QA concreto.
**Owner Codex:** con esa validación, comprobar la ejecución en beta-hermes,
actualizar H04d, activar solo el canary exacto y observar el cron automático
sin ampliar destinatarios.

### ACT-17 — Netflix QA y límite web de recurrentes (14/10)

Esteban creó Netflix por ARS 3.000, vencimiento día 18, desde la web beta
con `Mi espacio` seleccionado. La pantalla mostró un activo y cero ejecuciones
pendientes. La prueba de cambio a `test` reveló que Netflix seguía visible:
la API creaba con el grupo activo de Telegram y listaba/contaba ejecuciones
de varios grupos, sin respetar el selector web. No hay evidencia suficiente
para afirmar todavía en qué `groupId` se almacenó esa fila ni para activar
un recordatorio.

El contrato de estabilización está en
`docs/engineering/ACT-17-RECURRING-WEB-GROUP-BOUNDARY.md`. Las rutas web de
recurrentes ahora toman el grupo validado por middleware, filtran lista,
estadísticas y ejecuciones, y exigen ese grupo para CRUD y confirmación/omisión
por ID. El selector de mes pasa su mes a las consultas. La regresión de grupo
falló antes de la corrección y pasó después; 124 suites / 1.076 tests
unitarios, TypeScript, lint sin errores y build local pasaron en Node 22.

**Owner Codex:** publicar el corte solo en beta y comprobar con la sesión QA
si Netflix aparece únicamente en `Mi espacio`; conciliar el `groupId` real
antes de mover o materializar nada. Una definición recurrente no crea por sí
sola una ejecución mensual; el cron de generación no está programado. El
canary de recordatorios, `NOTIFICATIONS_ENABLED` y envíos siguen apagados;
no se generaron cargos ni se modificó legacy. La activación se retoma en un
subcorte separado tras verificar consentimiento, ejecución pendiente elegible
y aislamiento del destinatario.

**Cierre del límite web:** commit `af25b9069f6648a28ec0890071c0e39de1485675`
publicado y desplegado solo al proyecto beta como
`dpl_8vUCm989Zgme5EoNqcFGszDi4N93` (`READY`, alias canónico). El build
remoto pasó doce checks de aislamiento, incluidos el switch global apagado y
el cerco recurrente sin bindings. `crons.deploymentId` y los tres hosts
coinciden con el deployment; horarios `0 0 * * *`, `0 11 * * *` y
`0 3 1 * *`. La atestación H04d privada actualizada pasó con
`postActivationRuntimeConsistent:true`, `isolationVerified:false` y los gaps
conocidos. En la sesión QA, Netflix ARS 3.000 aparece solo en `Mi espacio`;
al seleccionar `test` la lista pasa a cero, y después se restauró
`Mi espacio`. Con ello queda identificado el grupo de la definición sin
moverla. Octubre sigue mostrando cero ejecuciones pendientes.

**Owner Codex / materialización canary preparada:** el siguiente código
genera idempotentemente una ejecución `pending` para un recurrente mensual
no automático cuyo vencimiento esté a tres días, solo para el usuario y grupo
exactos del canary y con consentimiento recurrente; nunca crea transacciones.
La regresión del día 18 falló antes y pasó después. Los bindings del canary
siguen ausentes y no se ha enviado ningún recordatorio. Este subcorte no
invocó el cron a mano.

**Publicación del subcorte:** commit `288125a632506db0de7720640e8af4c5b0d15e37`
publicado únicamente a beta como `dpl_Cou5Uq2dom5VKyJ9iXmLgxLfVZBp`
(`READY`, alias canónico). `crons.deploymentId` y los tres hosts coinciden con
él; el recordatorio recurrente conserva `0 11 * * *` (ventana 08:00–08:59
ART en Vercel Hobby). Pasaron 125 suites / 1.081 tests unitarios, TypeScript,
lint sin errores, build local y los doce checks remotos. H04d privado se
refrescó y validó con `postActivationRuntimeConsistent:true` e
`isolationVerified:false`; no se presenta como certificación integral.
`NOTIFICATIONS_ENABLED=false` y los tres bindings recurrentes ausentes:
todavía no se materializó ni envió nada. En `Mi cuenta` QA, Telegram figura
conectado y `Pagos recurrentes` está marcado. Esteban confirmó el 14/10 que
`Mi espacio` ya era el grupo activo en Telegram, sin cambiarlo. El siguiente
corte consiste en declarar el canary exacto en H04d, activar solo sus tres
bindings beta, reatestar el deployment y observar el cron automático del
15/10 sin invocación manual ni cargos financieros.

### ACT-17 — activación recurrente limitada a QA (14/10, 18:00 ART)

Esteban confirmó que el bot beta ya tenía `Mi espacio` activo. La web beta
mostró Netflix ARS 3.000, día 18, solamente en ese espacio; en `Mi cuenta`
Telegram está vinculado y `Pagos recurrentes` está marcado. Antes del 15/10
hay cero ejecuciones pendientes, estado esperado: la materialización canary
se produce tres días antes del vencimiento, no al guardar la definición.

El validador H04d acepta ahora únicamente el `recurringReminderCanary` del
usuario/grupo QA aprobados y rechaza datos parciales o ajenos; 117 pruebas
del arnés, 125 suites / 1.081 tests unitarios, TypeScript y lint dirigido
pasaron. Commit `54d89dc268f87c0147aaef8bc61245faef0225a2` publicado.
Se agregaron **solo en el entorno Production del proyecto beta** los tres
bindings `RECURRING_REMINDER_CANARY_{ENABLED,USER_ID,GROUP_ID}` exactos. No se
cambió el switch global `NOTIFICATIONS_ENABLED=false` ni legacy. El
deployment beta `dpl_GZwcUMDoxWaJLiU22PW15EDMmy6U` pasó los doce checks
remotos y quedó READY con el alias; después se corrigió la leyenda de
preferencias para reflejar el piloto acotado (commit
`5583c47852bb3766a4898eb716b4e29da9869eea`, 125 suites / 1.081 tests,
TypeScript y lint dirigido). Su deployment final
`dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da` está READY en el alias canónico;
`crons.deploymentId` y los tres hosts coinciden con él, con recurrentes en
`0 11 * * *` (08:00–08:59 ART en Vercel Hobby). El build remoto volvió a
aprobar los doce checks, incluido el canary recurrente y el switch global
apagado. El paquete H04d privado actualizado para esta release pasó con
`postActivationRuntimeConsistent:true` e `isolationVerified:false`; persisten
los gaps de certificación independiente documentados.

El cron Vercel de recurrentes encola avisos; el Worker Cloudflare beta ya
activo cada cinco minutos despacha el outbox Telegram. La revisión de este
subcorte confirmó esa ruta preexistente y las revalidaciones de grupo,
consentimiento y ejecución pendiente en el dispatcher. No se invocó ningún
cron manualmente, no se fabricó ningún movimiento ni se envió aún un
recordatorio de Netflix. **Owner Codex:** observar el disparo automático del
15/10, la creación única de `pending`, operación/outbox `cron:recurring`,
entrega al único chat QA y cero destinatarios ajenos; registrar resultado o
fallo. El seguimiento del hilo quedó reactivado para después de la ventana
automática. Si Vercel no invoca o la entrega falla, diagnosticar sin reenviar
un estado incierto. **Owner Esteban:** informar si recibe el aviso en el bot
beta, sin cambiar el grupo Telegram hasta cerrar este corte.

### ACT-17 — regresión local de concurrencia, sin cambio de deployment (14/10)

Se agregó una prueba de integración con libSQL temporal que lanza dos
materializaciones del mismo Netflix QA mediante `Promise.all`: queda una sola
ejecución `pending` del 18/10 por ARS 3.000, sin transacción asociada ni filas
en `transactions`. También comprueba cero escrituras con canary apagado y
tras cambiar el grupo Telegram. Usa la restricción única de ejecución/fecha;
no impone una barrera de sincronización entre llamadas, por lo que no pretende
probar todas las carreras posibles. Revisión independiente: sin bloqueo.
Pasaron 117 pruebas del arnés, 126 suites / 1.083 tests Jest, TypeScript y
lint dirigido. Este corte solo modifica prueba y documentación: no invoca el
cron, no crea movimientos QA, no cambia bindings ni despliega. El deployment
beta operativo sigue siendo `dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`.

**Owner Codex:** observar la ventana recurrente automática del 15/10,
conciliar ejecución/outbox/despacho y destinatario único, y registrar éxito o
fallo antes de cualquier activación adicional. **Owner Esteban:** informar si
recibe el aviso en el bot beta; no necesita hacer otra acción ahora. Se
conservan los datos QA y `NOTIFICATIONS_ENABLED=false`; legacy intacto.

### ACT-17 — aislamiento de segundo miembro en el despacho (14/10)

Se amplió la integración local de recordatorios con otro miembro de `Mi
espacio`: dispone de chat y consentimiento propios, pero está fuera del
usuario exacto del canary. Su intención ya encolada termina `dead` antes de
llamar a Telegram; el chat ajeno recibe cero llamadas. La ruta positiva del
usuario QA y el rechazo por cambio de grupo siguen cubiertos. Pasaron 117
pruebas del arnés, 126 suites / 1.084 tests Jest, TypeScript y lint dirigido.
El corte solo añade una regresión y documentación: no cambia código de
producción, despliegue, bindings, cron, datos QA ni legacy. El deployment
operativo continúa siendo `dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`.

**Owner Codex:** mantener la observación automática del 15/10 y conciliar
exactamente un chat QA, o explicar cualquier fallo sin reenvío incierto.
**Owner Esteban:** avisar si llega el recordatorio beta; ninguna acción previa
es necesaria. `NOTIFICATIONS_ENABLED=false` permanece intacto.

### ACT-17 — recibo redactado de recurrentes preparado localmente (14/10)

La ruta del cron canary registra, solo tras completar correctamente, un
evento `beta_recurring_reminder_canary_cron` con fecha argentina y resultado
cerrado `queued`, `not_queued` o `nothing_relevant`. No registra IDs, chat,
grupo, importes ni contenido. `not_queued` no equivale automáticamente a
entrega previa; la conciliación durable continúa siendo necesaria. La prueba
dirigida cubre los tres resultados. **Este cambio no está desplegado** y no
debe esperarse ese evento en la ejecución automática del 15/10: allí se
revisarán request, operación/outbox y Worker del deployment ya atestado.
Pasaron 117 pruebas del arnés, 126 suites / 1.084 tests Jest, TypeScript,
lint dirigido y build local con Node 22.

**Owner Codex:** preservar el deployment de la prueba automática y decidir
después un pase beta separado con H04d. **Owner
Esteban:** ninguna acción nueva; reportar si recibe el recordatorio QA.

### ACT-17 — ensayo manual aislado de recurrente QA (14/10, 22:04 ART)

Por autorización expresa de Esteban se preparó en **beta-hermes**, y solo en
el usuario `esteban_beta_qa` / `Mi espacio` propio, la definición mensual
`qa-manual-recurring-20261014` («QA ensayo manual 14/10», ARS 1, día 17,
`auto_confirm=false`). Antes de ejecutarla se comprobó que no había otro
recurrente activo con vencimiento el día 17 ni ejecuciones pendientes del
usuario/grupo QA; Netflix ARS 3.000, día 18, permanecía activo e intacto.

Se pulsó **una sola vez** `Run` para `/api/cron/recurring-reminders` en el
dashboard de Vercel del deployment beta operativo
`dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`. Vercel respondió `Cron job queued`.
La conciliación en beta-hermes mostró una ejecución del ensayo para
`2026-10-17`, una operación `proactive.recurring_reminder` y exactamente una
fila `cron:recurring` de tipo `upcoming` para el 14/10. Usuario, grupo y chat
coincidieron con el QA aprobado; **cero destinatarios ajenos**. El Worker
despachó esa única fila: estado `sent`, un intento, acuse del proveedor y
`sent_at` presente, sin error. No se creó ninguna transacción financiera.

Tras la entrega se desactivó la definición QA y se marcó su ocurrencia
`skipped`, sin borrarlas, para preservar la evidencia y evitar avisos
posteriores del ensayo. Netflix sigue activo y sin ejecución anticipada. Este
resultado demuestra la cadena manual cron → materialización → outbox →
Telegram en beta; **no prueba que Vercel dispare automáticamente** la ventana
del 15/10. `NOTIFICATIONS_ENABLED=false`, el deployment, los horarios y
legacy no se modificaron.

**Owner Codex, abierto:** observar el cron recurrente automático del 15/10
(08:00–08:59 ART) para Netflix, conciliar request, única ejecución
`pending`, operación/outbox, entrega al chat QA y cero terceros; no invocarlo
manualmente ni reenviar un resultado incierto. Solo después decidir el pase
beta del recibo redactado `f329763` con atestación H04d. **Owner Esteban:**
avisar si ve el recordatorio automático en el bot beta; no necesita crear
otro recurrente.

### ACT-17 — siguiente corte preparado: reintegros pendientes (14/10)

La auditoría independiente del flujo encontró que la ruta diaria solo lee
reintegros antiguos en modo global y entonces llama directamente a Telegram;
el canary diario beta y la preferencia marcada no los activan. El contrato de
un cerco propio y una entrega durable quedó en
`ACT-17-REIMBURSEMENT-REMINDER-BOUNDARY.md`. **No se implementó ni activó
este nuevo canal en esta release**: hacerlo antes del ensayo automático de
Netflix mezclaría dos cambios de notificaciones en el mismo deployment.
`NOTIFICATIONS_ENABLED=false` permanece y no se tocaron reintegros reales.

**Owner Codex / siguiente subcorte local:** implementar y probar primero el
scope y outbox de reintegros sin bindings ni despliegue, con revisión
independiente y sin alterar el cron beta vigente. Tras observar Netflix,
decidir la promoción beta separada con gates/H04d. **Owner Esteban:** ninguna
acción requerida ahora.

**Primer subcorte local completado:** el scope propio de reintegros ya está
implementado y probado sin bindings. La ruta diaria solo conserva el envío
directo cuando ese scope es `global`; un canary beta válido permanece sin
lectura ni envío hasta que haya entrega durable. La regresión de ruta cubre
canary configurado, bindings ausentes y mezcla con switch global. Suite
completa final: 127 suites / 1.097 tests; arnés 117/117, TypeScript y lint
dirigido sin errores. La revisión independiente Luna no encontró
defecto de runtime y pidió cubrir la variante sin bindings, añadida después.
No se desplegó ni configuró el canary. **Owner Codex:** implementar el outbox
y la revalidación de reintegros como subcorte local separado, con nuevas
pruebas de entrega antes de cualquier publicación. La prueba automática de
Netflix del 15/10 sigue sobre el deployment operativo anterior.

**Segundo subcorte local completado (14/10):** la ruta diaria dejó de enviar
recordatorios de reintegro directamente; ahora encola una intención durable
por solicitud, pagador y fecha argentina. En modo canary consulta solo el
pagador QA configurado y verifica el grupo del gasto fuente. El dispatcher
vuelve a comprobar scope, consentimiento, chat privado, solicitud pendiente,
asignación, antigüedad, importe, gasto activo, grupo, ambas membresías y
snapshot; rechaza cambios y reintentos inciertos antes de Telegram. El
canary puede operar independientemente del resumen diario, y su recibo de
cron informa solo conteos redactados `queued`, `alreadyQueued`, `failed`.
La integración local cubre deduplicación concurrente, envío QA, revocaciones,
cambio de datos, caducidad, adulteración y fallo incierto del proveedor.
Revisión independiente Luna sin defecto crítico; sus dos pedidos (recibo
redactado y prueba de canary independiente) quedaron incorporados. Pasaron
117/117 del arnés, 128 suites / 1.112 tests Jest, TypeScript, lint dirigido
y `git diff --check`.

**Sin publicación ni activación:** no se modificaron bindings, deployment,
cron, datos financieros ni legacy; `NOTIFICATIONS_ENABLED=false` permanece.
**Owner Codex:** observar el disparo automático de Netflix del 15/10 en el
deployment beta operativo y conciliar un único envío QA/cero ajenos antes de
considerar este pase beta separado con gates/H04d. **Owner Esteban:** avisar
si recibe el recordatorio automático; no requiere otra acción previa.

### ACT-17 — conciliación del recordatorio Netflix del 15/10 (08:46 ART)

Consulta de solo lectura limitada a `beta-hermes` y al proyecto Vercel beta
`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`. El alias beta continúa en
`dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`, con el cron de recurrentes registrado
en `0 11 * * *` (ventana 08:00–08:59 ART). La definición activa Netflix de
`esteban_beta_qa` en `Mi espacio` propio es única, por ARS 3.000, día 18 y sin
autoconfirmación. Existe exactamente una ejecución `pending` para el 18/10 y
ninguna transacción materializada.

El 15/10 se creó a las 11:45:26 UTC una operación `cron:recurring` de tipo
`upcoming` ligada a esa única ejecución. Su única fila de outbox se despachó
al chat privado del mismo usuario a las 11:46:00 UTC (08:46 ART): `sent`, un
intento y acuse del proveedor. La conciliación no encontró operaciones
recurrentes del día para otros usuarios o grupos. No se invocó el endpoint ni
se reenvió nada durante esta observación; `NOTIFICATIONS_ENABLED=false`, los
datos QA y legacy permanecieron intactos.

**Corrección de procedencia:** la consulta inicial a `runtime` respondió 400
por retención, pero la fuente separada `requests` sí devolvió un único `GET
/api/cron/recurring-reminders` a las 11:45:24.087 UTC: HTTP 200,
`clientUserAgent=vercel-cron/1.0`, deployment
`dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`, request ID
`wmp8n-1792064724087-943e230da842`. La operación se creó dos segundos
después y el único outbox QA quedó `sent` a las 11:46. Esto acredita el
origen automático sin inferirlo solo por horario. El evento redactado
`beta_recurring_reminder_canary_cron` no existía aún en ese deployment, pero
no es condición para cerrar esta entrega. **Owner Codex:** conservar la
observación del siguiente ciclo solicitada por Esteban. **Owner Esteban:**
ninguna acción requerida.

### ACT-17 — aceptación de la entrega recurrente y límite del historial (15/10)

Esteban aportó `File (232).png`: el bot beta muestra el recordatorio de
Netflix ARS 3.000, vencimiento 18/10, recibido a las 08:46 ART. Coincide con
la operación y el acuse durable ya conciliados. Se reconsultó solo el proyecto
Vercel beta: `crons.deploymentId=dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`,
recurrentes `0 11 * * *`, scheduler habilitado y host del mismo deployment.
El historial `runtime` de las 08:46 ya no estaba disponible: Vercel Hobby
retiene una hora de esa fuente. **Eso no implica que el request fuera
ilegible**: `requests` sí devolvió el disparo del scheduler de las 08:45:24
ART, HTTP 200 y `vercel-cron/1.0` (detalle arriba). Request, operación beta,
único outbox QA y recibo visual cierran tanto procedencia como entrega del
cron → outbox → Telegram, sin duplicados ni cargos.

**Owner Codex, corte recurrente cerrado:** mantener la observación solicitada
para el siguiente ciclo automático y continuar por separado el canary de
reintegros, sin habilitar aún sus bindings ni el switch global. **Owner
Esteban:** ninguna acción adicional para Netflix. Legacy y datos QA siguen
intactos.

### ACT-17 — pase beta instrumentado, sin activar reintegros (15/10)

Se promovió exclusivamente el proyecto beta a
`dpl_2o2HF9NwHN4zykva22SU22zKHHFL` (release
`f3a04f00839d99f040f598d8bd6c857fde2f9e77`), READY y con el alias
`hermes-finantial-tracker-z2.vercel.app` apuntando al mismo deployment.
La configuración del proyecto confirma `crons.deploymentId` igual a ese ID;
resumen diario `0 0 * * *`, recurrentes `0 11 * * *` y tipo de cambio
`0 3 1 * *`. El build emitió `beta_build_isolation_attested` con `passed:true`
y sin checks fallidos. Previo al pase pasaron 117/117 del arnés, 128 suites /
1.112 tests, TypeScript, lint dirigido y build. El nuevo evento redactado
`beta_recurring_reminder_canary_cron` podrá observarse en una ventana
automática posterior, pero no se necesita para acreditar el request histórico
del 15/10, recuperado de `requests`. No se invocó ningún cron manualmente.

El inventario de bindings beta previo al despliegue no contenía ninguna
`REIMBURSEMENT_REMINDER_CANARY_*`; la consulta beta tampoco halló reintegros
pending elegibles del pagador QA en `Mi espacio`. Por ello el nuevo flujo
durable de recordatorios quedó **publicado pero apagado**, sin mensaje de
reintegro ni movimiento financiero creado. El runner H04d local sobre
recibos redaccionados del pase retornó `ok:true`,
`postActivationRuntimeConsistent:true`, `isolationVerified:false` y
`certificationState:not-certified`: no se eleva a certificación. Global
`NOTIFICATIONS_ENABLED=false`; legacy intacto.

**Owner Codex, siguiente observación:** verificar en la próxima ventana
automática de recurrentes el evento redactado del deployment vigente y cero
destinatarios no QA; un `nothing_relevant` sería esperable si no hay nueva
ejecución elegible. **Owner Codex, siguiente corte separado:** completar y
publicar el gate build/H04d para un futuro canary de reintegros, mantener
bindings ausentes, y solo después preparar un fixture QA y activar el canal
acotado con nueva atestación. **Owner Esteban:** ninguna acción ahora; se
pedirá validación solo si el fixture o la recepción final requieren su
intervención.

### ACT-17 — corrección del recibo y gate de reintegros publicado (15/10)

El request automático del recordatorio Netflix **sí existe** en el historial
Vercel `requests`: 15/10 11:45:24.087 UTC, GET a
`/api/cron/recurring-reminders`, HTTP 200, `vercel-cron/1.0`, ID
`wmp8n-1792064724087-943e230da842`, deployment anterior
`dpl_7MzoPtaMgYuS9tKxa5YC3uWNQ5Da`. La búsqueda en `runtime` de esa
misma ventana devuelve 400 por retención Hobby; la primera conclusión de
«sin recibo directo» confundió esas dos fuentes. Queda corregida arriba.
El corte Netflix queda cerrado también en procedencia; no se forzó un envío.

El gate de activación de reintegros (`66e76011d3a7d9a0e7ef8887f0a58f8f00c252c3`)
se promovió **solo en beta** a `dpl_DbkoF9Ep4gm5JLmjBw3nN2XiTLnU`, READY;
alias canónico y `crons.deploymentId` coinciden. Siguen `0 0 * * *` para
resumen, `0 11 * * *` para recurrentes y `0 3 1 * *` para cotización. El
build emitió `beta_build_isolation_attested` con `passed:true`, incluido
`reimbursement_reminder_canary_scope` y `failedChecks:[]`. La verificación
local previa pasó 128 suites / 1.112 tests, arnés, TypeScript, lint dirigido,
build y `git diff --check`. H04d revalidado con recibos redaccionados del
nuevo deployment: `ok:true`, `postActivationRuntimeConsistent:true`,
`isolationVerified:false`, `certificationState:not-certified`. No se añadieron
bindings `REIMBURSEMENT_REMINDER_CANARY_*`; no hubo envío de reintegros,
movimiento ni cambio en legacy.

**Preflight de siguiente corte, solo lectura en `beta-hermes`:** el grupo QA
`Mi espacio` propio del pagador aprobado contiene a `esteban_beta_qa` como
owner y `esteban_beta_qa2` como member. El pagador QA tiene consentimiento de
reintegros activo. Hay cinco solicitudes pending sin pagador y tres pagadas
a Sabri, pero **cero pending asignadas al pagador QA**; ninguna debe usarse
por reinterpretación. Un fixture nuevo por el flujo normal necesitaría
solicitante QA2, pagador QA1, grupo exacto, consentimiento y más de tres días
de antigüedad antes de un recordatorio. No se creó ni alteró un reintegro.

**Owner Codex:** seguimiento automático del 16/10 a las 09:20 ART, leyendo
`requests` y `runtime` para el deployment vigente y conciliando outbox;
`nothing_relevant` y ningún Telegram nuevo pueden ser correctos. Después,
preparar el fixture QA por el flujo normal y activar el canary acotado en un
corte separado con nueva atestación; no tocar las solicitudes existentes.
**Owner Esteban:** ninguna acción ahora; se le pedirá validación antes de una
entrega QA que requiera su cuenta o dispositivo.

### ACT-17 — reutilización de pruebas de reintegro (15/10)

Se revisaron los cortes ya realizados antes de proponer otro fixture:
ACT-06/R-DELIVERY quedó cerrado para gasto con reintegro originado por
Telegram y por web, entrega a Sabri, pago/callback y aviso al solicitante.
Además, el canary Web Push de ARS 1 en `test` probó una notificación durable
a QA2. Esas pruebas **no equivalen** a un recordatorio proactivo para una
solicitud aún `pending` con pagador QA1: los casos con Sabri están `paid` o
siguen dirigidos a Sabri; el caso `test` tiene pagador QA2 sin Telegram.

La conciliación actual de `beta-hermes` halló en `Mi espacio` de QA1 cinco
pendientes sin pagador y tres pagadas a Sabri; en `test`, una pendiente de
QA1 a QA2. Cero solicitudes pending dirigidas a QA1 en el grupo canary.
No se reasignó ni modificó ninguna solicitud previa. La revisión de la UI
detectó una restricción adicional: `HermesExpenseForm` ofrece «Requiere
reintegro» pero no envía `payerId`; el grupo QA `Mi espacio` no tiene
`partner_id`. Por ello, incluso desde la sesión Safari de QA2, un gasto nuevo
quedaría **sin pagador** y no sería elegible para este canary. Se retiró la
propuesta de crearlo así, antes de enviar el formulario; tampoco se cambió
el partner del grupo como atajo. **Owner Codex:** mantener el canary apagado,
conservar la observación del cron recurrente del 16/10 y proponer un corte
separado de selección explícita de pagador en la web beta, con validación de
membresía y regresiones, si Esteban quiere ese flujo. **Owner Esteban:**
decidir si desea esa mejora de producto; la creación y el pago del reintegro
existente ya se validaron y no deben repetirse por confusión con el
recordatorio.

### ACT-17 — fixture de recordatorio de reintegro en `test` (15/10)

Esteban autorizó que Codex complete el ensayo sin intervención suya. Contrato:
un gasto sintético de ARS 1 desde QA2 en `test`, solicitud pendiente a QA1,
sin alterar `Mi espacio`, solicitudes previas, legacy ni la fecha de creación.
Se verificó antes que QA1 pertenece a `test`, tiene Telegram vinculado y
consentimiento `reimbursements=1`. Por la UI beta, el partner de `test` pasó
temporalmente de QA2 a QA1; QA2 guardó el gasto con «Requiere reintegro»;
después se restauró el partner a QA2. La consulta a `beta-hermes` confirmó
solicitud `_UbIZ-RWblrBnknp6G3T5`, `pending`, ARS 1, solicitante QA2,
pagador QA1 y grupo `test`; el partner original quedó restaurado y la
solicitud previa QA1→QA2 no cambió. Se conservan los datos QA del piloto.

Las regresiones del gate de build y de H04d primero fallaron al reemplazar
el grupo autorizado de reintegros por `test` y pasaron tras cambiar solo ese
allowlist. Resumen diario y recurrentes siguen autorizados únicamente en
`Mi espacio` propio. **Owner Codex:** completar gates, publicación y
atestación solo beta, activar exclusivamente los tres bindings de canary de
reintegros con `NOTIFICATIONS_ENABLED=false`, y observar el primer cron
automático posterior a tres días estrictos de antigüedad. Conciliar request,
operación/outbox, entrega a QA1 y ausencia de otros destinatarios. No forzar
el cron ni modificar `created_at` para adelantar esta prueba.

### ACT-17 — activación cercada del recordatorio de reintegro (15/10)

El fixture QA `_UbIZ-RWblrBnknp6G3T5` fue verificado nuevamente en
`beta-hermes`: `pending`, ARS 1, QA2 solicitante, QA1 pagador y grupo `test`.
La configuración `partner_id` del grupo quedó restaurada a QA2; el pagador de
la solicitud persiste como QA1. No se alteró ninguna solicitud previa.

El gate `054d69182e965fb8df11d88ab3f78577152ba86d` pasó 102 pruebas de
scripts y 65 pruebas dirigidas de cron, scope y despacho. Se configuraron
**solo en el proyecto beta** los tres bindings
`REIMBURSEMENT_REMINDER_CANARY_{ENABLED,PAYER_ID,GROUP_ID}` con valores
`true`, QA1 y `test`; resumen diario y recurrentes conservan QA1 + `Mi
espacio`, y el switch global `NOTIFICATIONS_ENABLED=false` no cambió. El
candidate `dpl_AeuCY4ciF8NC5npuBK4QhrANyJcx` quedó READY; el build emitió
`beta_build_isolation_attested`, `passed:true`, trece checks y
`failedChecks:[]`. Después de la promoción, el alias beta canónico y
`crons.deploymentId` apuntan ambos a ese ID. Los schedules siguen
`0 0 * * *` (resumen diario y chequeo de reintegros), `0 11 * * *`
(recurrentes) y `0 3 1 * *` (cotización). Legacy no se modificó.

H04d revalidado con recibos redaccionados del deployment y alias actuales:
`ok:true`, `postActivationRuntimeConsistent:true`, `isolationVerified:false`,
`certificationState:not-certified`; no se presenta como certificación de
secretos. La consulta beta no encuentra todavía operaciones ni outbox
`cron:reimbursement:*`. La solicitud se creó el 15/10 a las 15:03 ART;
requiere más de tres días completos, por lo que la primera ventana diaria
automática prevista es **18/10 21:00–21:59 ART**, no el próximo cron de hoy.

**Owner Codex:** la automatización existente `act-17-cron-diario-beta`
permanece activa y fue actualizada para observar recurrentes el 16/10 y el
primer recordatorio elegible el 18/10, conciliando `requests`, `runtime`,
operación/outbox, un solo chat QA y cero destinatarios ajenos. Sin cron
manual, reenvío incierto, cambio de `created_at` ni más movimientos. Un
`nothing_relevant` antes de la elegibilidad es correcto. **Owner Esteban:**
ninguna acción para esta prueba; los datos QA se conservan hasta el cierre.

### ACT-17 — snapshot read-only para cierre de reintegro (15/10)

Se agregó `scripts/beta-reimbursement-reminder-snapshot.mjs` como control
reproducible de la base `beta-hermes`. Primero valida la cuenta y el ID/host
Turso beta; ejecuta SQL fijo `SELECT` y devuelve solo agregados, sin IDs de
chats, solicitudes, importes ni mensajes. Compara el fixture QA con
consentimiento, membresías y antigüedad estricta; cuenta todas las
operaciones/outbox de recordatorios, detecta alcance ajeno, chat incorrecto
y duplicado **por día argentino** sin confundir entregas de días distintos.
Seis pruebas locales cubren identidad, CLI de solo lectura, elegibilidad,
ausencia de fixture, destinatario ajeno y duplicación. El snapshot real beta
antes de tres días mostró `awaiting_eligibility`, solicitud pending activa,
dos miembros, consentimiento y chat vigentes, cero operaciones/outbox.

**Owner Codex:** usar este control junto al historial Vercel `requests` y
runtime al revisar la ventana del 18/10; un `sent` aislado no reemplaza la
prueba de invocación automática ni el recibo de Telegram. **Owner Esteban:**
ninguna acción. La activación y el seguimiento temporal siguen separados de
este corte de observabilidad; legacy no se consultó ni modificó.

### ACT-17 — límite de procedencia del cron Vercel (15/10)

El control read-only `scripts/beta-cron-log-snapshot.mjs` verifica el proyecto
beta, alias READY, `crons.deploymentId` y schedule antes de resumir registros
del cron diario o recurrente en una ventana UTC de una hora. Las cinco
pruebas locales cubren proyecto/deployment ajeno, ventana inválida o
incompleta, HTTP 200/5xx, salida malformada y redacción. Una lectura real
de una ventana sin cron devolvió cero registros, como se esperaba. La CLI
Vercel JSON no incluye `clientUserAgent`; por diseño el resultado HTTP 200
queda como `origin_unverified` y no se presenta como prueba de invocación
automática. La procedencia se confirma separadamente en Vercel `requests`
con `vercel-cron/1.0` y se concilia con runtime y Turso.

**Owner Codex:** aplicar ambos controles en las ventanas del 16/10 y 18/10;
no confundir ausencia de runtime por retención con ausencia de request.
**Owner Esteban:** ninguna acción. Este corte no cambia deployment, cron,
datos financieros ni legacy.

### ACT-16 — orientación para mes sin configuración (15/10)

El corte local [ACT-16-MONTH-SETUP-GUIDANCE.md](ACT-16-MONTH-SETUP-GUIDANCE.md)
distingue mes ausente de configuración incompleta. El dashboard nombra el
período y ofrece un enlace a Ajustes preservando `month`; `/resumen` y la
consulta natural de Telegram indican mes y grupo sin prometer valores
copiados. El registro web permanece pausado. Las pruebas dirigidas cubren
ambos canales y el cambio de año; no hubo escrituras financieras ni cambio
de schema, cron o flag.

Verificación local: harness 130/130, Jest 129 suites y 1117 pruebas,
typecheck y build aprobados; lint 0 errores/61 advertencias preexistentes.
El detector de interfaz no reportó hallazgos en la página cambiada. No se
realizó inspección visual de un mes faltante en beta ni se desplegó aún.

**Owner Codex:** completar gates, publicar solo en beta con H04d y observar
el próximo estado vacío QA sin borrar configuración existente. **Owner
Esteban:** decidir en un corte de producto separado si se ofrecen valores
del mes anterior para copiar; mientras tanto no hay rollover automático.
El seguimiento ACT-17 del 16/10 y 18/10 continúa bajo Codex sin cambios.

### ACT-16 — estado inicial de Ajustes sin rollover implícito (15/10)

El siguiente subcorte local mantiene el contrato anterior y mejora Ajustes:
la respuesta mensual `null` ya no se confunde visualmente con una
configuración guardada de ceros. El owner ve el orden de carga; Member ve
una indicación de pedir ayuda al owner. Al cambiar de mes, los datos de la
respuesta anterior quedan ocultos hasta cargar la nueva, evitando
mostrar o editar importes bajo el período equivocado. La prueba dirigida
reproduce el estado ausente y esa transición. No cambia API, persistencia,
cron, flags ni datos QA.

Verificación local: harness 130/130, Jest 129 suites y 1120 pruebas,
typecheck y build aprobados; lint 0 errores/61 advertencias preexistentes.
El detector de interfaz no reportó hallazgos. El primer typecheck coincidió
con la regeneración de `.next/types` durante el build; repetido en secuencia
con Node 22, aprobó. No hubo despliegue ni cambios de datos.

**Owner Codex:** integrar en la misma publicación
beta diferida de ACT-16 y comprobar el estado cuando surja un mes/grupo QA
sin ajustes, sin borrar datos para fabricarlo. **Owner Esteban:** se mantiene
solo la decisión de producto sobre proponer/copiar valores previos; no es
requisito para este aviso seguro. El deployment ACT-17 vigente se conserva
hasta sus ventanas de observación.

### ACT-08/H13 — deuda global ajena reproducida y contenida localmente (15/10)

En la rama aislada `codex/act08-splits`, una regresión reprodujo el hallazgo
H13: el cálculo global mostraba a A dos deudas ficticias de 100 cuando B
había pagado 100 por C y A solo pertenecía a la sesión. El cálculo ahora
agrega exclusivamente aristas de liquidación de sesión que involucran a A.
Pruebas dirigidas cubren además cuatro participantes, pago parcial y neteo
entre sesiones; no cambia ninguna escritura, schema, cron, flag ni dato QA.
El contrato y los límites están en
[ACT-08-SPLIT-SETTLEMENT-BOUNDARY.md](ACT-08-SPLIT-SETTLEMENT-BOUNDARY.md).

**Owner Codex:** completar gates, integrar este subcorte y después abordar
H14 en un corte de escritores con regresiones de API/DB real. Publicación
beta de H13 solo después de las ventanas ACT-17 del 16/10 y 18/10, con
H04d del deployment exacto. **Owner Esteban:** ninguna validación nueva para
el subcorte local; una política de edición/cancelación con pagos previos se
presentará como decisión explícita si la evidencia no fija una regla segura.
ACT-17 conserva su owner y automatización, sin cambio del deployment activo.

Verificación del subcorte H13: regresión roja antes del parche; después,
Jest 129 suites/1123 pruebas, harness 130/130, typecheck y build aprobados;
lint 0 errores/61 advertencias existentes. El primer build falló al cargar
Google Fonts (`next/font`) y el reintento sin cambios de código aprobó; no
se atribuye ese fallo transitorio a H13. `npm ci --ignore-scripts` en el
worktree aislado informó avisos del árbol completo; una auditoría de runtime
actualizada encontró **tres paquetes con avisos altos**: `next`, `sharp` y
`source-map-js` (sin críticos). No se cambió el lockfile ni se ejecutó
`npm audit fix`. **Owner Codex, corte ACT-03 separado antes del próximo
deploy:** verificar versiones, aplicabilidad y actualización compatible con
gates; no presentar el audit histórico de cero hallazgos como vigente.

### ACT-08/H14a — alta web de split conservativa y atómica (15/10)

**Corte local cerrado; owner Codex.** En `codex/act08-splits`, la regresión
con libSQL aislado fue roja ante cuatro fallos: sumas de pagos/cuotas
distintas al total, identidad ajena o repetida, porcentajes incompletos y
cabecera/pagador huérfanos cuando falla el último insert. El alta ahora
valida montos en centavos, suma de pagos y cuotas, porcentajes (si aplica),
identidad exclusiva/única y pertenencia a la sesión. Revalida actor y sesión
abierta dentro de una transacción que inserta las tres tablas. El formulario
web envía `100` al elegir porcentaje para su único participante actual.
No cambió Telegram ni datos beta/legacy.

Verificación: 130 suites/1129 pruebas y harness 130/130, typecheck y build
aprobados; lint 0 errores/61 advertencias preexistentes. Sin despliegue;
ACT-17 sigue atado al deployment vigente. **Owner Codex H14b:** definir y
probar edición/cancelación de splits con y sin pagos previos; el PATCH actual
permite modificar `total_amount` sin actualizar cuotas, por lo que ACT-08 no
está cerrado. **Owner Codex ACT-03:** resolver o justificar los tres avisos
altos runtime antes de promover este branch a beta, sin alterar cron durante
las ventanas observadas. **Owner Esteban:** ninguna acción necesaria ahora.

### ACT-03 — actualización compatible de runtime antes del beta (15/10)

El audit local de ejecución se llevó de 3 HIGH a 0 con Next 16.3.8,
Sharp 0.35.5 y source-map-js 1.2.2; contrato y límites en
[ACT-03-RUNTIME-DEPENDENCY-GATE.md](ACT-03-RUNTIME-DEPENDENCY-GATE.md).
Gates locales: harness 130/130, Jest 130 suites/1129 pruebas, typecheck,
lint 0 errores/61 advertencias y build aprobados. El audit del árbol
completo aún marca 36 avisos de dependencias de desarrollo; **owner Codex**
para triage separado, no se declara cero riesgo general. Next produjo
warnings de Edge Runtime nuevos en build, sin fallo: **owner Codex** para
smoke del deployment exacto cuando sea seguro publicar.

No se tocó beta, cron, `NOTIFICATIONS_ENABLED`, datos QA ni legacy. La
promoción sigue diferida por ACT-17: owner Codex mantiene observación
16/10 y 18/10 y luego atestación H04d del nuevo deployment. H14b permanece
con owner Codex y no se mezcla en este commit de dependencias.

### ACT-08/H14b — contención de edición/cancelación de splits (15/10)

La regresión libSQL reprodujo tres fallas del PATCH web: cambiaba el total
sin cuotas, cancelaba pese a un pago en la sesión y un cuerpo vacío terminaba
en 500. El endpoint ahora exige una sola operación. Un cambio de importe
recibe `409` hasta disponer de sustitución transaccional de pagadores/cuotas;
una cancelación se autoriza al owner dentro de transacción, solo con sesión
abierta y sin pagos de sesión. La repetición de una cancelación completada
es idempotente. No borra historia ni toca el escritor de pagos.

Prueba dirigida roja antes del parche y verde después; gates completos con
Next 16.3.8: harness 130/130, Jest 130 suites/1132 pruebas, typecheck,
lint 0 errores/61 advertencias y build aprobados. No se publicó beta ni
se modificaron cron, notificaciones, datos QA o legacy. **Owner Codex:**
queda la edición verdadera de cuotas y una política de rectificación con
pagos ya efectuados; no declarar H14 finalizado por esta contención.
**Owner Esteban:** ninguna validación por ahora. El deployment ACT-17 sigue
estable hasta sus ventanas; la integración posterior requiere H04d exacto.

### ACT-08/H14c — edición completa antes de pagos, solo API local (16/10)

**Owner Codex, corte local cerrado.** El PATCH web ahora acepta reemplazar
en una transacción el total, tipo de reparto, pagadores y cuotas completos.
El alta y la edición comparten el validador de sumas en centavos, identidades,
porcentajes y semántica de `equal`. Se revalida que el owner sea miembro
vigente, que todos los participantes pertenezcan a la sesión y que no haya
pagos antes de modificar. Una falla al insertar cuotas nuevas revierte
cabecera y distribuciones originales. El PATCH antiguo de solo total sigue
respondiendo `409`. La regresión con libSQL aislado fue roja antes de añadir
la edición y cubre reemplazo válido, suma/reparto/identidad inválidos,
miembro temporal, owner removido, sesión cerrada, pago previo y rollback.

Gates: harness 130/130, Jest 130 suites/1139 pruebas, lint 0 errores/61
advertencias y build aprobados. Typecheck primero coincidió con la
regeneración de `.next/types` del build paralelo y falló por archivos
temporales ausentes; repetido después del build, pasó sin cambio de código.
No hubo despliegue, cambio de cron, QA o legacy.

**Pendientes con owner Codex:** el formulario web aún no expone la edición
completa; diseñar una UI que muestre cuotas y pagadores sin prometer un
reparto falso. Para editar/cancelar después de pagos hace falta una política
de ajuste auditable, porque `split_payments` solo referencia la sesión y no
el gasto. ACT-08 no está cerrado. ACT-17 mantiene owner y deployment estable
hasta las ventanas 16/10 y 18/10; luego integración y H04d exacto.

### ACT-08/H14d — editor de reparto, solo rama local (16/10)

**Owner Codex, corte local cerrado.** La vista de sesión muestra «Editar
reparto» solo al dueño, en sesiones abiertas, gastos activos y sin pagos de
sesión. La nueva ruta server-side vuelve a comprobar esas condiciones y la
membresía; carga nombres de usuarios registrados/temporales y rechaza
identidades históricas que ya no son miembros, sin descartarlas a escondidas.
El editor reemplaza total, pagadores y participantes para cuotas iguales,
fijas o porcentuales. Usa importes argentinos en centavos, reparto igual
determinista y redondeo de porcentajes por restos mayores. Muestra pagado,
asignado y sus diferencias; desactiva guardar si no conservan el total. El
PATCH H14c mantiene la validación y transacción decisivas, incluida la
respuesta `409` si aparece un pago después de abrir el editor.

Gates locales: harness 130/130, Jest 131 suites/1142 pruebas, lint 0
errores/61 advertencias preexistentes y build Next/TypeScript aprobados.
No se desplegó, ni se tocaron cron, datos QA, beta activa o legacy. La guía
de diseño frontend se aplicó manteniendo tokens y patrón de tarjetas Hermes,
con etiquetas explícitas, contraste semántico y resumen financiero visible.

**Siguiente owner Codex:** el alta web aún no distribuye entre miembros:
expone tres modos, pero siempre envía una única identidad. Preparar H14e
con contrato y pruebas antes de alterar ese flujo. La política de
rectificación con pagos históricos continúa pendiente de diseño auditable;
no se habilita edición tras pagos. ACT-17 conserva deployment y owner hasta
verificar ventanas 16/10 y 18/10. Solo después corresponde integrar y
atestiguar H04d para la publicación beta. **Owner Esteban:** ninguna acción
por ahora.

### ACT-08/H14e — alta web distribuida, solo rama local (16/10)

**Owner Codex, corte local implementado.** La pantalla «Nuevo gasto» ahora
comprueba sesión abierta y membresía del actor en servidor; carga los nombres
vigentes de miembros registrados y temporales. Reutiliza el formulario de
distribución H14d para ingresar descripción, total, pagadores y participantes
en partes iguales, cuotas fijas o porcentajes. Los participantes reales están
seleccionados por defecto, pero ningún pagador ni importe se inventa. El
botón queda deshabilitado hasta que ambas sumas cierren en centavos; el POST
H14a repite validación de pertenencia y conservación bajo transacción. La
respuesta a un cambio concurrente pide recargar, sin reintento automático.
Pruebas de render SSR cubren nombres reales y bloqueo inicial del alta,
además del editor existente.

Gates locales: harness 130/130, Jest 132 suites/1144 pruebas, lint 0
errores/61 advertencias preexistentes y build Next/TypeScript aprobados.
No hubo despliegue, cambio de cron ni escritura beta/legacy.

**Owner Codex pendiente:** revisar en
beta después de las ventanas ACT-17 y H04d; diseñar rectificación auditable
cuando ya hay pagos atribuidos solo a la sesión. No se modifica la política
de pagos, el bot Telegram ni los avisos. **Owner Esteban:** ninguna acción
antes de un pase beta explícito.

### ACT-08/H14f — clave durable para el alta web, rama local (16/10)

**Owner Codex, implementación local.** El POST de gasto compartido exige un
UUID de operación por intención de alta y lo persiste en el índice único
existente de `splits.operation_id`. Una repetición del mismo actor, sesión y
distribución financiera devuelve el ID original con HTTP 200; otra carga
útil con la misma clave responde 409. La comparación incluye descripción,
total, tipo, pagadores, cuotas y porcentajes en centavos, sin depender del
orden de filas. El formulario genera la clave al primer envío y la retiene
tras una respuesta incierta; si se modifican datos después de esa respuesta,
detiene el reenvío y pide comprobar la sesión. Pestañas beta anteriores sin
clave recibirán 400 y deberán recargar. No hay nueva migración ni cambios
en Telegram, pagos, notificaciones o deployment.

Regresiones libSQL: repetición con orden diferente, replay tras cerrar la
sesión, colisión de payload/actor, ausencia de clave y unicidad aplicada por DB,
incluso con dos conexiones separadas compitiendo por la misma clave.
El intento de testear dos transacciones simultáneas sobre la **misma
conexión local** produjo `SQLITE_BUSY` y bloqueó la fixture; ese driver no
sirvió para exigir dos respuestas 200/201 en paralelo. El índice demuestra
una sola escritura efectiva en la carrera de dos conexiones; queda owner
Codex para observar el comportamiento de la respuesta HTTP perdedora en
beta antes de declarar cerrada la concurrencia operativa. La ruta permite que un cliente
reintente la misma clave si la respuesta fue 500/incierta.

Gates: harness 130/130, Jest 132 suites/1150 pruebas, lint 0 errores/61
advertencias preexistentes y build Next/TypeScript aprobados antes del último
caso de actor ajeno (que se ejecuta dirigido). No hubo publicación ni cambio
de datos/cron. **Pendiente con owner Codex:** integración beta tras ACT-17 y
H04d y observación del HTTP perdedor. **Owner Esteban:** ninguna acción ahora.

### ACT-08/H14g — reintento seguro de pago web, rama local (16/10)

**Owner Codex, implementado localmente; sin publicación.** El registro web
de pago compartido ahora exige UUID de operación por intención y persiste
la clave en el índice único existente de `split_payments`. Un replay del
mismo actor, acreedor, sesión e importe devuelve éxito sin segundo pago ni
segundo aviso. La clave reutilizada con datos distintos responde 409; un
actor que perdió acceso a la sesión no ve el pago al reintentar. El cliente
retiene clave y carga útil ante respuesta incierta, no reintenta solo y
explica que se compruebe el saldo. Si Telegram falla después del commit,
la API devuelve pago registrado con `notificationFailed: true`; no presenta
ese fallo como pago rechazado. El log registra solo el UUID de correlación.

Regresión primero en rojo (5 casos), luego dirigidas 18/18 incluyendo
unicidad libSQL de `split_payments.operation_id`. Puertas: harness 130/130,
Jest 132 suites/1157 pruebas, lint 0 errores/61 advertencias previas,
TypeScript y build aprobados. No se cambiaron esquema, cron, bot, datos QA,
beta activa ni legacy.

**Pendientes con owner Codex:** ACT-09 debe dar entrega durable al aviso
de pago fallido; el retry de pago no lo reenvía para evitar duplicados. El
otro writer `POST /api/splits/sessions/[id]/payments` y la autorización
financiera concurrente siguen fuera de H14g. Además, el formulario hoy
ofrece «Todas las sesiones» mientras el servidor atribuye el pago a la
primera; requiere un contrato propio H14h antes de liberar pagos del ACT-08.
Publicar solo tras observación ACT-17, H04d y pase beta. **Owner Esteban:**
ninguna acción ahora.
