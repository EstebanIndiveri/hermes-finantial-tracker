# H04d post-activation runtime evidence

## Purpose and boundary

`scripts/staging-isolation-policy.mjs` remains the pre-activation migration-rehearsal gate. It requires the Telegram rollout flags off, AI/OCR stubs, synthetic-only data, and notifications off. Do not change that policy to accommodate beta traffic.

This separate contract describes the post-activation beta state: inbox, outbox, and worker enabled; live AI and OCR; proactive notifications disabled; and explicitly distinct Vercel, Turso, and Telegram identities for beta and legacy production. It is a local consistency check for a redacted evidence manifest, not a provider client and not a certification by itself.

## Input contract

Call `validatePostActivationIsolation(input, { now })` from `scripts/validate-post-activation-isolation.mjs`. Its manifest has only provider metadata and non-secret runtime declarations. Every beta and production provider entry must refer to a reviewed redacted receipt under `evidence/`, include a SHA-256 digest, and be no more than seven days old. The beta Vercel receipt also covers deployment target, release SHA, and the runtime flag/mode inventory.

Never put access tokens, API keys, cookies, database URLs containing credentials, or secret values in this manifest or its receipts. Store receipts through the repository's approved evidence handling; do not commit private receipts. A path and digest only prove which receipt was reviewed; the operator still has to confirm that the receipt came from the named authenticated CLI/API.

## Interpretation

The validator fails on missing/stale evidence, unsupported sources, identity collisions, non-beta deployment identity, inactive beta flags, stub AI/OCR, or enabled proactive alerts. A passing result reports `postActivationRuntimeConsistent: true` but always `isolationVerified: false` and `certificationState: "not-certified"`.

Formal certification still requires human review of provider provenance, the current deployment's binding inventory (names and secret references, never values), proof the deployed beta runtime uses the declared beta bindings, and acceptance of residual risks. It must never promote local declarations alone to `isolationVerified: true`.

## Beta build-time binding assertion

`scripts/assert-beta-build-isolation.mjs` runs before the isolated Next build. It is silent outside an explicitly gated beta deployment (`HERMES_BETA_ISOLATION_ASSERT=true`). When gated, it fails the build unless the actual build environment selects the exact beta app origin, Turso host, bot token ID prefix and declared bot ID/username, beta session cookie, active inbox/outbox/worker flags, live AI/OCR, disabled proactive alerts, and nonempty required beta secrets. The only emitted event has fixed check names and pass/fail booleans; no value or digest is logged.

This attests the build environment of a **new** beta deployment, not a prior deployment and not the cryptographic non-reuse of every secret. Vercel documents that environment variable changes apply to new deployments, not previous ones. The gate must be enabled only in the separate beta project's Production environment; a failed gated build must leave the existing beta deployment in service. Capture the deployment ID and the allowlisted build event as a redacted receipt, then check the live alias points to that deployment. Do not enable this variable in the legacy project.

## Current beta facts supplied to the work

The deployment is Vercel `Production` target inside the separate beta project. The beta project, Turso database, and Telegram bot IDs are recorded in the implementation status. These facts are fixture inputs for tests only; this document does not say they have been refreshed from provider receipts by this validator. Before using the contract for certification, capture fresh receipts for beta and legacy metadata and have an owner review them.

## Tests

Focused policy coverage lives in `scripts/__tests__/validate-post-activation-isolation.test.mjs`. It verifies successful consistency evaluation, freshness and provenance references, provider collisions, active-beta settings, forbidden secret fields, and the invariant that this contract cannot certify isolation.
