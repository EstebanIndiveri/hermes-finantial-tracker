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
| H04d-BETA-INBOX | Complete, inbox-only. Bot metadata verified as ID `8739389202` / `Hermes_beta_finantial_bot`; webhook now targets the beta URL, had zero pending updates before setup, and has no recorded provider error. A synthetic update posted twice returned 200 twice; Turso beta contains one completed claim with `attempt_count=1`. | Codex | No financial write was tested. Re-enter end-to-end QA after Esteban creates/uses a beta account and links the intended Telegram user. |
| H04d-BETA-OUTBOX | Not started; `TELEGRAM_OUTBOX_ENABLED=false`. | Esteban Indiveri (provide/operate a beta Telegram test account); Codex (deploy and verify) | Enable only after a real, authorized beta chat is linked, then verify one successful direct response and durable delivery record without using production users/data. |
| H04d-BETA-WORKER | Blocked; `TELEGRAM_OUTBOX_WORKER_ENABLED=false`, and deployment has zero cron schedules. | Esteban Indiveri (choose platform/scheduler and any paid plan); Codex (implement after choice) | Vercel Hobby only permits once-daily cron execution; the required every-minute expression is rejected. Unblock by explicitly choosing (a) Vercel Pro, (b) an authorized external scheduler, or (c) a once-daily degraded beta retry policy with accepted latency/capacity. Until then, do not enable the worker or claim retry recovery. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). |
| H04d-ISOLATION-CERT | Blocked/deferred; local manifests are consistent, but `isolationVerified=false`. Production fingerprints remain null intentionally; legacy resources were not accessed. | Esteban Indiveri (scope decision); Codex (read-only comparison only if authorized) | Either explicitly authorize read-only metadata comparison for legacy project/DB/bot identities (no secret values, rows, writes, webhook, or traffic), or accept the residual and leave the formal isolation certificate open. This does not block the beta inbox-only pilot. |

Beta runtime controls set for deployment `dpl_6JrckEZP5Wj8xHqVzFNqdM5gqQpx`:
`AI_MODE=stub`, `OCR_MODE=stub`, `NOTIFICATIONS_ENABLED=false`, beta session
cookie, inbox `true`, outbox/worker `false`. A new beta-only webhook secret was
generated and fingerprinted locally; the bot token was not rotated. Build
ignore was restored to `exit 0` after deployment. Vercel Hobby rejected the
minute cron, so `vercel.json` was omitted only from this deployment package and
restored in the worktree; the four schedules remain undeployed. No production
project, DB, token, webhook, or traffic was accessed or changed.

### ACT-03 — quality barrier (still open; plan priority 1)

| Gate | State / evidence | Owner | Remaining work and exact re-entry condition |
| --- | --- | --- | --- |
| ACT03-LOCAL | Complete for current local baseline: production dependency audit 0 findings; harness 52/52; Jest 88 suites / 735 tests; typecheck; lint 0 errors (67 warnings); Webpack build passed. CI workflow adds `npm audit --omit=dev --audit-level=moderate` at `626026a`. | Codex | No further local action unless remote CI reports a failure. |
| ACT03-REMOTE-CI | Complete on source SHA `c07641fe60786eaa5ad110eafcdf699d2f47de5d`; GitHub Actions run `36254678758` succeeded in 1m30s. `npm ci`, production audit, lint, typecheck, harness, Jest, and build all passed. | Codex | Reopen only if later code/workflow changes fail CI. This documentation-only register update has local `git diff --check`; its push will trigger the same workflow again. |
| ACT03-BRANCH-GATE | Blocked on repository-owner policy decision. GitHub branch-protection GET returned 404 for `main`; repository ruleset list is empty. | Esteban Indiveri (repo owner) | Decide the merge/deploy model first (direct-to-main legacy deployment vs PR). Then require the exact quality workflow before merge without preventing the approved legacy release path. Until changed, a green workflow is not a mandatory merge barrier. |
| ACT03-DRIZZLE | Compatibility investigation complete: latest `drizzle-kit@0.31.11` retains the deprecated loader; both scoped override shapes were rejected in disposable clean installs (one ineffective, one leaves invalid `esbuild@0.18.20` and fails `npm ls`). Four moderate advisories remain in dev-only tooling; see the [experiment record](DRIZZLE-TOOLCHAIN-SECURITY-CONTRACT.md#follow-up-bounded-compatibility-experiment-26092026). | Esteban Indiveri (risk acceptance/upstream choice); Codex (retest when upstream changes) | This is no longer an open investigation task. To reopen remediation, a supported release must remove the loader or a scoped override must yield a valid dependency tree; then require clean install, audit, disposable migration generation, SQL equivalence, and canonical migration harness. No forced downgrade/global override. |

No new feature cut should start until the owner actions above are either closed
or explicitly recorded as deferred with a chosen risk, owner, and re-entry
condition. Production legacy remains outside the deployment, data, and webhook
scope.
