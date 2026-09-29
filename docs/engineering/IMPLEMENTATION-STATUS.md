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

This register supersedes the earlier “Open parent gate” snapshot. Owners are
named so an open item cannot silently become unowned technical debt. “Codex” is
the technical executor in this worktree; “Esteban Indiveri” is the project,
provider, and release decision owner.

### H04d — beta rehearsal and isolation

| Gate | State / evidence | Owner | Remaining work and exact re-entry condition |
| --- | --- | --- | --- |
| H04d-BETA-WEB | Complete. Beta Production alias returns `/` → `/login` (307) and `/login` 200 after deployment `dpl_6JrckEZP5Wj8xHqVzFNqdM5gqQpx`. | Codex | None for basic web availability. This is not account or financial-flow QA. |
| H04d-BETA-QA-ACCOUNT | Complete for account bootstrap, 26/09/2026. The beta DB had zero users/groups/members and public registration requires an invitation; one `esteban_beta_qa` owner/personal group was initialized in beta only. Beta login and `/api/auth/me` returned 200. | Codex | Product follow-up: assign invitation/first-user bootstrap UX before onboarding additional beta users. |
| H04d-BETA-TELEGRAM-LINK | Complete. Esteban confirmed `esteban_beta_qa` is linked to `Hermes_beta_finantial_bot`; the deployed UI has the beta username in onboarding/account surfaces and not the legacy bot. | Codex | None. Production resources unchanged. |
| H04d-BETA-INBOX | Complete. The beta webhook points only to the beta URL; replay of the synthetic update created one completed claim (`attempt_count=1`). The user-authored expense also reached the beta financial handler and yielded the reconciled transaction below. | Codex | None for inbox/deduplication. |
| H04d-BETA-FINANCIAL-E2E | Individual-channel matrix complete, group fanout pending. Esteban verified compact consent buttons, natural/slash income, cancellation, text expense yes/no/unknown, financial voice and OCR “Solo gasto”; prior read-only reconciliation found one active Telegram income each for ARS 2,000/2,001, no ARS 100 cancellation write, expense flags 1/0/0 for ARS 5,011/5,012/5,013, one voice ARS 104 expense without reimbursement, and one later OCR ARS 23,971.15 “Solo gasto” confirmation without request. On 29/09, Esteban tested `Resumen` and bare `Supermercado`: the screenshot shows a summary and a specific clarification stating no movement was recorded. Read-only `beta-hermes` reconciliation found both `bot_messages` updates `224783908/909` and **zero Telegram transactions** for `esteban_beta_qa` in the 13:40–14:00 UTC test window. | Codex — group fanout implementation/evidence; Esteban — provide a second distinct Telegram-linked beta member for live QA. | The no-write query/ambiguity gate is closed. Group notification must be tested before claiming multi-member Telegram E2E: add/link a second beta member, confirm one synthetic reimbursement, and reconcile transaction/request/outbox recipients. Keep worker disabled until its own recovery gate passes. |
| H04d-BETA-OUTBOX | Enabled in beta Production on 28/09/2026 (`TELEGRAM_OUTBOX_ENABLED=true`); worker remains `false`. User-facing edit deliveries are each `sent` once, including reimbursement cases. Local group fanout tests now cover multiple eligible members, requester/non-linked exclusion and callback reuse; live multi-member delivery remains unverified. | Codex (code/test review and beta reconciliation); Esteban (second beta Telegram account/member setup). | Add/link a second distinct beta Telegram member, run one reimbursement canary, then verify one durable `send_message` per eligible recipient, no row for the requester, one transaction/request and the actual Telegram receipt. Inline dispatch covers the normal case; the scheduler cut separately certifies retry recovery. |
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

### Current closure snapshot — 29/09/2026

| Cut / gate | State | Owner and next evidence |
| --- | --- | --- |
| ACT-03 quality, CI and `main` protection | Closed. Ruleset `24135528` requires PR and passing strict `quality` check; no legacy release was made. | Codex monitors CI; Esteban alone approves a future release. |
| ACT-03 Drizzle toolchain | Accepted residual, **not fixed**; four moderate dev-only findings. | Esteban owns risk; Codex rechecks before the next schema generation/toolchain change or when a compatible upstream fix or material exposure change appears. |
| ACT-11/13/14 individual Telegram financial intake | Local gates and beta command/text/voice/OCR income/expense/consent matrix passed. `Resumen` and bare `Supermercado` passed a beta no-write canary (updates `224783908/909`, zero new transactions in the test window). This closes the individual-channel functional slice, not the multi-member pilot. | Codex keeps shared-draft regression tests and reconciles later provider errors. |
| ACT-10 summary currency clarity | Open UX/financial-verification follow-up: `formatResumen` computes and formats income/spend/saving in USD but displays only `$`; the screenshot does not independently certify those totals against the ledger. | Codex adds an explicit `USD` label and a group/month/currency reconciliation test in the next financial-presentation cut; Esteban validates the beta wording before release. This does not reopen the no-write canary. |
| H04d-BETA-FINANCIAL-E2E / GROUP-DELIVERY | **Open, required.** Local eligible-recipient and callback-replay test added. Beta's one linked member cannot demonstrate group fanout. | Esteban creates/links a second distinct beta Telegram member; Codex verifies one synthetic reimbursement, one transaction/request, one outbox row and Telegram receipt per eligible linked recipient, and no requester self-send. |
| H04d-BETA-WORKER | **Open.** Normal inline sends work with outbox enabled; retry recovery remains uncertified with the beta worker flag off. A disabled-by-default Cloudflare five-minute scheduler and local tests are prepared, not deployed. | Esteban selects provider/account and recovery SLO; Codex validates one controlled retry/duplicate invocation, deploys only to beta after that gate, measures free-tier CPU/latency and records rollback. |
| H04d-ISOLATION-CERT | **Open** with `isolationVerified=false`. Distinct Vercel IDs and fresh beta bot/webhook were verified; Turso comparison is historical and current worktree manifests are absent/stale for the live flags. | Codex refreshes beta deployment/alias/binding and manifest evidence, obtains current read-only provider metadata, reruns verifier; Esteban supplies or authorizes fresh legacy DB/bot metadata, or accepts an explicitly uncertified residual. No production data or secret values required. |

No open item above is ownerless. H04d remains open as an umbrella until its
group-delivery, retry-recovery and isolation gates have independent evidence.
The beta pilot may continue with the worker disabled; it must not be described
as fully certified or promoted to legacy `main`. The baseline audit's wider
ACT-01–ACT-18 roadmap also remains in force; completing H04d does not close
all financial-domain, IA/OCR evaluation, observability or release-phase work.
