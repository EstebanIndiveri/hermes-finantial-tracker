# Implementation status — H04d staging rehearsal

Living cut ledger. Status reflects committed implementation and evidence, not
production readiness. Source of scope: [stabilization plan](../audit/PLAN-DE-ACCION.md),
[H04d runbook](PR-08-H04D-STAGING-REHEARSAL-RUNBOOK.md), and
[H04d.4 evidence contract and addendum](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md).

## Completed cuts

| Cut | Status and evidence |
| --- | --- |
| H04d.1 — isolated runtime controls | Complete at `1e1f912` (`feat(staging): enforce isolated runtime controls`). Runtime identity, auth/session, AI/OCR, notifications, and cron controls are covered by the [runtime isolation contract](PR-09-H04D1-RUNTIME-ISOLATION-CONTRACT.md). Flags remain off; this does not enable traffic. |
| H04d.2 — provider rehearsal | Complete at `0ab71de` (`docs(staging): record provider rehearsal evidence`). The [provider record](PR-10-H04D2-PROVIDER-EVIDENCE.md) documents beta Vercel/Turso/Telegram metadata, the empty beta webhook, and verified backup/restore metadata. It establishes distinct beta resources, not complete production isolation. |
| H04d.3 — local migration rehearsal | Complete at `80286a0`, with production-identity evidence corrected at `87a69c1`. The [local rehearsal record](PR-11-H04D3-LOCAL-MIGRATION-REHEARSAL.md) reports independent local A/B copies, canonical migration fingerprint, idempotent rerun, and clean before/after comparison. No remote DB was migrated. |
| H04d.4a — isolation evidence tooling | Complete at `1ee9515` (`feat(staging): harden isolation evidence`). Adds the local secret fingerprint helper and isolation policy checks; see the [evidence contract](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md). A local verifier result alone does not establish provider-verified isolation. |
| H04d.4b — beta secret evidence cut | Complete at `ff2bd6f` and recorded at `646d095`. Six beta secret fingerprints and provenance receipts are local/ignored; the beta Telegram token configuration helper is at `ff2bd6f`. The addendum records the beta project/DB/bot identities and confirms no DB data/schema, deployment, webhook, or production resource change. See the [H04d.4b addendum](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md#addendum-de-cierre-h04d4b--23092026). |

## Open parent gate and next cuts

H04d.4 is not closed. The local `config/staging-isolation.local.json` and
`config/production-reference.local.json` manifests and verifier still need
complete, verified provider metadata, especially the production Telegram bot
ID/username and webhook state. This is non-secret identity/configuration
metadata; production secrets need not be read or rotated. Keep production secret
fingerprints `null` when no authorized historical receipt exists. Load the
versioned production host denylist and include the six beta fingerprints and
their provenance as defined by the [contract](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md).

Proposed H04d.4c — local manifest gate: complete both ignored local manifests
from verified non-secret metadata and existing beta fingerprint receipts; run
`staging:verify-isolation` and record a passing local result, while preserving
`isolationVerified: false` / provider-verification-required until fresh
authenticated provider checks are reconciled. Recheck the production alias
inventory and beta webhook immediately before any remote activity. This cut
does not fetch sensitive values or authorize remote apply.

Subsequent remote rehearsal gates follow the [runbook](PR-08-H04D-STAGING-REHEARSAL-RUNBOOK.md):

1. Obtain explicit authorization and fresh authenticated metadata for beta and
   production identities, bindings, aliases, and webhook state. Keep production
   read-only; never point the production webhook at the beta bot or send one
   update to two writers.
2. Verify an approved staging backup and restore, checksums, retention/access,
   and synthetic or authorized anonymized data. Keep artifacts and evidence
   outside the repository.
3. Validate the local manifests and resource identities before connecting;
   capture read-only before evidence and an adoption plan. Adoption remains
   blocked until its backup, schema, forward-fix, fingerprint, reconciliation,
   and authorization blockers are explicitly cleared.
4. Review an additive forward-fix against the observed schema and rehearse it
   on independent disposable local copies. Require matching approved schema
   and manifest fingerprints, clean reconciliation, and an idempotent rerun.
5. Only after those gates and specific authorization, run the staged beta
   rehearsal with flags initially off; enable inbox, outbox, then worker in
   separate observed steps, using synthetic staging users/chats and reconciling
   after each step. Roll back operationally by disabling worker, outbox, inbox
   in that order; do not reverse schema/data or restore over an active DB.

ACT-03 (runtime, Jest, lint, and mandatory CI) is **in progress in a separate
workstream**; it is not claimed complete by this ledger. The isolated build
workaround at `e51f313` (`fix(build): pin isolated production build to webpack`)
is an independent quality gate: it addresses the Next.js/Turbopack build
failure, and does not close ACT-03 or any H04d isolation/rehearsal gate.

## Scope boundary for this cut

This documentation cut makes no production or beta DB data/schema changes and
no deployment, webhook, traffic, or provider configuration changes. No
production secret values are needed for the open identity gate. H04d remains a
preparation/rehearsal track; it is not a production release authorization.
