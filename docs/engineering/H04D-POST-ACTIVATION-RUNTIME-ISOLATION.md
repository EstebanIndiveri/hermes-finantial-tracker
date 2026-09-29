# H04d post-activation runtime evidence

## Purpose and boundary

`scripts/staging-isolation-policy.mjs` remains the pre-activation migration-rehearsal gate. It requires the Telegram rollout flags off, AI/OCR stubs, synthetic-only data, and notifications off. Do not change that policy to accommodate beta traffic.

This separate contract describes the post-activation beta state: inbox, outbox, and worker enabled; live AI and OCR; proactive notifications disabled; and explicitly distinct Vercel, Turso, and Telegram identities for beta and legacy production. It is a local consistency check for a redacted evidence manifest, not a provider client and not a certification by itself.

## Input contract

Call `validatePostActivationIsolation(input, { now })` from `scripts/validate-post-activation-isolation.mjs`. Its manifest has only provider metadata and non-secret runtime declarations. Every beta and production provider entry must refer to a reviewed redacted receipt under `evidence/`, include a SHA-256 digest, and be no more than seven days old. The beta Vercel receipt also covers deployment target, release SHA, and the runtime flag/mode inventory.

Never put access tokens, API keys, cookies, database URLs containing credentials, or secret values in this manifest or its receipts. Store receipts through the repository's approved evidence handling; do not commit private receipts. A path and digest only prove which receipt was reviewed; the operator still has to confirm that the receipt came from the named authenticated CLI/API.

For the 29/09 review, private, Git-ignored receipts are under `config/h04d-evidence.local/` (mode `0700`, files `0600`) and the manifest is `config/h04d-post-activation.local.json` (`0600`). Run the hardened local wrapper with absolute paths:

```bash
node scripts/run-post-activation-isolation-local.mjs \
  --manifest /private/tmp/hermes-h04d-nlp-verification/config/h04d-post-activation.local.json \
  --evidence-root /private/tmp/hermes-h04d-nlp-verification/config/h04d-evidence.local
```

The wrapper validates each receipt's actual SHA-256 and JSON, rejects symlinks, traversal, missing/extra files and secret-like field names, then runs the policy. Its output intentionally still says `isolationVerified:false` until owner review; do not edit that field by hand.

## Interpretation

The validator fails on missing/stale evidence, unsupported sources, identity collisions, non-beta deployment identity, inactive beta flags, stub AI/OCR, or enabled proactive alerts. A passing result reports `postActivationRuntimeConsistent: true` but always `isolationVerified: false` and `certificationState: "not-certified"`.

Formal certification still requires human review of provider provenance, the current deployment's binding inventory (names and secret references, never values), proof the deployed beta runtime uses the declared beta bindings, and acceptance of residual risks. It must never promote local declarations alone to `isolationVerified: true`.

## Beta build-time binding assertion

`scripts/assert-beta-build-isolation.mjs` runs before the isolated Next build. It is silent outside an explicitly gated beta deployment (`HERMES_BETA_ISOLATION_ASSERT=true`). When gated, it fails the build unless the actual build environment selects the exact beta app origin, Turso host, bot token ID prefix and declared bot ID/username, beta session cookie, active inbox/outbox/worker flags, live AI/OCR, disabled proactive alerts, nonempty required beta secrets, and exact matches for the six secret fingerprints from the private beta receipt. The expected digest map is stored as the sensitive `HERMES_BETA_SECRET_FINGERPRINTS` binding **only in beta Production**. The only emitted event has fixed check names and pass/fail booleans; no value or digest is logged.

This attests the build environment of a **new** beta deployment, not a prior deployment or a direct readback from a running function. Vercel documents that environment variable changes apply to new deployments, not previous ones. The gate must be enabled only in the separate beta project's Production environment; a failed gated build must leave the existing beta deployment in service. Capture the deployment ID and the allowlisted build event as a redacted receipt, then check the live alias points to that deployment. Do not enable these variables in the legacy project.

## Current beta facts supplied to the work

The current beta deployment is Vercel `Production` target inside the separate beta project. The [29/09 review record](H04D-ISOLATION-REVIEW-2026-09-29.md) lists the authenticated project, DB, bot and deployment identities, the successful build assertion (including fingerprint match), aliases, and remaining interpretation limits. The private local receipts and manifest passed the hardened runner with `ok:true`, `postActivationRuntimeConsistent:true`, and `isolationVerified:false`. Owner review is still required for a formal certificate.

## Tests

Focused policy coverage lives in `scripts/__tests__/validate-post-activation-isolation.test.mjs` and `scripts/__tests__/run-post-activation-isolation-local.test.mjs`. It verifies consistency, freshness, collisions, active-beta settings, file/digest integrity, secret-field rejection, and the invariant that a local declaration cannot certify isolation.
