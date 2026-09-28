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
| H04d.4h–4i — beta deployment | Complete, 26/09/2026: deployment `dpl_EtQ1id5dBHk5U8HGvbtohzTBZbJq` was READY in the isolated beta project; Hobby rejected the minute cron, so that deployment had no schedules. A later activation deployment is recorded below. |
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
| H04d-BETA-FINANCIAL-E2E | Partial, updated 28/09/2026. Esteban verified full-width consent buttons, natural and slash income, cancellation, financial voice, and OCR “Solo gasto”. Read-only beta reconciliation found one active Telegram income each for ARS 2,000/2,001 (`ingresos`), each with one sent outbox edit; no reimbursement requests. ARS 100 cancellation created no transaction. Expense canaries ARS 5,011 (one reimbursement request), 5,012 (no request), and 5,013 (no request) reconcile to flags 1/0/0 and one sent outbox item each. Voice ARS 104 is one active `supermercado` expense, flag 0, no reimbursement request, one sent reply. OCR ARS 23,971.15 now has two earlier intentional duplicate imports (27/09, no operation identity), one durable confirmed reimbursement case, and one later confirmed “Solo gasto” canary with flag 0, no request, one sent reply. | Codex — maintain reconciliation/close remaining matrix; Esteban — optional group-recipient canary after adding a second beta member. | Voice and OCR no-reimbursement gates are complete. Group notification is untested because the beta QA group currently has one Telegram-linked member; add/link a second beta tester before that optional group-recipient canary. Keep worker/cron off; legacy untouched. |
| H04d-BETA-OUTBOX | Enabled in beta Production on 28/09/2026 (`TELEGRAM_OUTBOX_ENABLED=true`); worker remains `false`. User-facing edit deliveries are each `sent` once, including reimbursement cases. | Codex (configuration/reconciliation); Esteban (beta group setup). | Group-recipient notification is not yet proven: the tested group has one linked member (the requester), so there is no other recipient. Add/link a second beta member, run one reimbursement canary, then verify one durable `send_message` per eligible member and reconcile transaction/request/delivery. No worker or scheduler is needed for inline dispatch. |
| H04d-BETA-WORKER | Scheduler decision open; `TELEGRAM_OUTBOX_WORKER_ENABLED=false`, and beta deployment has zero cron schedules. | Esteban Indiveri (choose latency/platform); Codex (implement and verify after choice) | The worker drains due durable outbound deliveries and purges up to 100 expired terminal rows; each invocation claims at most 5 deliveries (45-second default budget). Normal response delivery is attempted inline by the webhook when outbox is enabled, so one-minute polling is not required for ordinary replies. Vercel Hobby rejects schedules more frequent than daily. Recommendation: keep disabled during account/link QA; then use an isolated Cloudflare Worker safety poll at `*/5 * * * *` if its Free CPU limit is verified, or Vercel Pro only if sub-5-minute recovery is a product SLA. A daily Hobby sweep is not acceptable for retry liveness. See the [scheduler/FinOps assessment](H04D-WORKER-SCHEDULER-FINOPS.md). |
| H04d-ISOLATION-CERT | Blocked/deferred; local manifests are consistent, but `isolationVerified=false`. On 26/09/2026 Codex read only the legacy Vercel cron list: three schedules were present and no outbox worker. Legacy DB rows/secrets and Telegram metadata remain intentionally uninspected. | Esteban Indiveri (scope decision); Codex (only the specifically authorized metadata checks) | This cron finding does not certify full isolation. Either explicitly authorize a bounded read-only comparison of remaining legacy project/DB/bot identities (no secret values, rows, writes, webhook, or traffic), or accept the residual and leave the formal certificate open. This does not block the beta inbox-only pilot. |

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

### ACT-11 / ACT-13 / ACT-14 — unified Telegram intake (active functional cut)

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

H04d-BETA-FINANCIAL-E2E and ACT-11/13/14 remain open under Codex until these
gates pass. H04d worker/scheduler and formal isolation certification are
separate owned items; neither blocks the next local implementation cut.

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
| Codex | Follow-up fix on `codex/h04d-natural-language-e2e`, commit `b84862a`: long reimbursement consent actions use separate rows; income phrases route through the shared draft and group-scoped `ingresos` category. Harness 53/53, Jest 89 suites / 767 tests, typecheck and Webpack build pass; lint 0 errors / 67 existing warnings. Deployed only to beta as `dpl_BemZAe4afAHepUfdREzoiYffb9pP` (READY, SHA `b84862a`), `/login` HTTP 200. Temporary Hobby cron omission config was removed; canonical `vercel.json` is unchanged. No push, migration, webhook change, or legacy resource change. Current beta canaries have been reconciled read-only. | Voice ARS 104 and OCR “Solo gasto” canaries are closed; continue with query/ambiguity/callback replay/provider-error acceptance matrix. Keep worker/cron off. |
| Esteban Indiveri | Beta test operator; income formats, button layout, cancellation, voice ARS 104, and OCR “Solo gasto” verified. | No immediate manual action for those two canaries. Add/link a second beta Telegram member only if group delivery is to be certified; otherwise explicitly defer that optional test. |

**Closure gate:** beta matrix passes across command/text/voice/receipt and
expense/income/query; ambiguity writes nothing; explicit income never offers
or persists a reimbursement; callback replay creates at most one transaction
and request; provider errors are recoverable; outbox is reconciled; and the
beta DB/webhook identities still match the isolated manifest. Voice ARS 104
and OCR “Solo gasto” are now evidenced and closed; the remaining matrix and
optional group-recipient evidence still prevent full closure. Until then,
ACT-11/13/14 and H04d-BETA-FINANCIAL-E2E stay open. Keep the beta worker and
cron disabled. This is not authorization to promote to `main` or production.

**Beta test handoff (28/09/2026, updated):** the isolated beta alias is
[`hermes-finantial-tracker-z2.vercel.app`](https://hermes-finantial-tracker-z2.vercel.app).
Deployment `dpl_BemZAe4afAHepUfdREzoiYffb9pP` (SHA `b84862a`) is Ready and its
`/login` route responds 200. It is a Production-target deployment inside the
separate beta Vercel project, not the legacy production project. The beta
bot's existing webhook was not changed and no test Telegram update was sent by
Codex. No migration, legacy DB, bot, webhook, secret value, environment
configuration or production deployment was changed. Voice-financial and
OCR-no canaries have since passed and were reconciled; remaining work is the
query/ambiguity/replay/provider-error acceptance matrix and a second linked
beta member only if group-recipient delivery is in scope. Codex owns technical
verification; Esteban owns the scope decision for the optional group test.

### ACT-03 — quality barrier (still open; plan priority 1)

| Gate | State / evidence | Owner | Remaining work and exact re-entry condition |
| --- | --- | --- | --- |
| ACT03-LOCAL | Complete for current local baseline: production dependency audit 0 findings; harness 52/52; Jest 88 suites / 735 tests; typecheck; lint 0 errors (67 warnings); Webpack build passed. CI workflow adds `npm audit --omit=dev --audit-level=moderate` at `626026a`. | Codex | No further local action unless remote CI reports a failure. |
| ACT03-REMOTE-CI | Complete on source SHA `c07641fe60786eaa5ad110eafcdf699d2f47de5d`; GitHub Actions run `36254678758` succeeded in 1m30s. `npm ci`, production audit, lint, typecheck, harness, Jest, and build all passed. | Codex | Reopen only if later code/workflow changes fail CI. This documentation-only register update has local `git diff --check`; its push will trigger the same workflow again. |
| ACT03-BRANCH-GATE | Open; policy resolved by Esteban: keep `main` as immutable legacy deployment line; beta work remains isolated; future promotion requires PR, green CI and explicit release authorization. Technical enforcement is still absent (last check: no protection/ruleset). | Esteban Indiveri (repo owner/admin); Codex (configure only after specific settings authorization) | Apply required CI/PR branch rules on `main` without pushing or promoting current beta work. Until configured, the agreed policy is not technically enforced. |
| ACT03-DRIZZLE | Compatibility investigation complete; four moderate findings remain in the dev-only `drizzle-kit`/esbuild chain. Upstream `drizzle-kit@0.31.11` still includes the deprecated loader; two scoped overrides were rejected as ineffective/invalid. Recommended disposition: temporary, explicit residual-risk acceptance for beta development; this is pending Esteban's decision and does not mean the advisories are fixed. See the [experiment and recommendation](DRIZZLE-TOOLCHAIN-SECURITY-CONTRACT.md#recommended-disposition-owner-decision-pending). | Esteban Indiveri (accept/reject residual); Codex (retest when upstream changes) | No compatible fix is currently established. Do not force downgrade/global override. Reopen when supported upstream removes the loader or valid scoped resolution is possible; then require clean install, audit, disposable migration generation, SQL equivalence, and canonical migration harness. |

No new feature cut should start until the owner actions above are either closed
or explicitly recorded as deferred with a chosen risk, owner, and re-entry
condition. Production legacy remains outside the deployment, data, and webhook
scope.

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

No open item in the authoritative register is unowned. The remaining owners
and re-entry conditions are: Codex + Esteban for voice-financial and OCR-no
canaries; Esteban to add/link a second beta member and Codex to verify group
delivery; Esteban to decide worker/scheduler SLO and Codex to implement only
after that choice; Esteban to choose whether to defer or authorize the bounded
metadata-only isolation comparison, with Codex performing only authorized
read-only checks; and Esteban (repo admin) to authorize the `main` branch rules,
with Codex configuring them only after explicit settings authorization. The
Drizzle tooling findings remain owned by Esteban for risk/upstream choice and
Codex for re-test if a compatible upstream/toolchain becomes available.
