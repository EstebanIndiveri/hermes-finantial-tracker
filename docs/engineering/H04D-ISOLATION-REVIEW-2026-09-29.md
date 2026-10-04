# H04d isolation evidence review — 2026-09-29

Status: **closed for the current beta pilot only by explicit owner acceptance on 29/09/2026; automated `isolationVerified=false` remains unchanged**. This is a redacted evidence index supporting a scoped human decision, not a legacy-production release certificate. No legacy configuration, data or deployment was changed by these checks.

## Authenticated provider identities

| Provider | Beta | Legacy | Evidence/provenance |
| --- | --- | --- | --- |
| Vercel project | `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF` (`hermes-finantial-tracker-z2`) | `prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt` (`hermes-finantial-tracker`) | `vercel project inspect` under `eindi-acme`, read-only, 29/09. |
| Vercel active deployment | `dpl_HNDia23nZzffCKety38UUUcPsHdY`, target `production` *inside beta project*; alias `hermes-finantial-tracker-z2.vercel.app` | `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`, target `production` inside legacy project; alias `hermes-finantial-tracker.vercel.app` | `vercel inspect` on each canonical alias after the final gated beta deploy, 29/09. The active deployments and aliases are distinct; the legacy deployment ID is unchanged. |
| Turso database | `beta-hermes`, ID `01a0c0bd-0601-7f27-b147-915d105b19f2`, host `beta-hermes-esteban-indiveri.aws-us-east-2.turso.io` | `hermes-acme`, ID `019e71ab-9501-7c05-a672-b41db7a2cb27`, host `hermes-acme-eindiveri.aws-ap-northeast-1.turso.io` | `turso db show` authenticated separately to the beta and legacy accounts, read-only, 29/09. No SQL or financial rows read. |
| Telegram bot | ID `8739389202`, `Hermes_beta_finantial_bot`, webhook `https://hermes-finantial-tracker-z2.vercel.app/api/telegram/webhook` | ID `8884948884`, `HermesFinanceAssistBot`, webhook `https://hermes-finantial-tracker.vercel.app/api/telegram/webhook` | Beta `getMe`/`getWebhookInfo` verified earlier on 29/09. Esteban executed both read-only Bot API calls on 29/09 with hidden legacy token and supplied only the JSON result. Codex did not inspect the legacy token. |

## Binding/runtime evidence and limits

- The beta project's `vercel env ls production` lists the required Telegram, Turso, session, Groq and OCR binding **names**, with `Encrypted` type and Production scope. This shows configuration presence, not their effective values or which deployment snapshot uses them.
- The six beta fingerprints and provenance receipt was captured on 26/09 and remains ignored/private in the original staging worktree. Its presence does not prove that every current deployment binding still matches it.
- `vercel env pull --id dpl_464YgY9UzBCuupqiKNHqug5pQHPb` rejected the READY deployment. The Production-level pull returned empty strings for encrypted values, so it cannot prove flags, modes or secret matches. The exact temporary export was removed immediately; it must not be cited as successful runtime verification.
- The beta outbox retry canary at 18:40 UTC reached the Vercel worker route from the beta-only Cloudflare scheduler and moved a retryable outbox row to `sent`. This is functional evidence that the worker path was enabled for that operation, but does not independently attest every runtime binding or secret.
- An intermediate **beta-only** deployment `dpl_5c6otmrKFuqcBh866wT1BtD8gZ9e` was created after setting `HERMES_BETA_ISOLATION_ASSERT=true` only in the beta project. Its build emitted exactly one allowlisted `beta_build_isolation_attested` event with `passed:true` and all eight initial fixed checks passed: beta app origin, DB host, Telegram identity, session cookie, three financial flags, AI/OCR live modes, notifications disabled, and required secrets present. No value or hash was printed. It was subsequently superseded by the fingerprint-attested beta deployment below.
- The six SHA-256 fingerprints from the private beta receipt were provisioned as one **sensitive, beta-Production-only** expected-digests binding, without printing their values. The final beta deployment `dpl_HNDia23nZzffCKety38UUUcPsHdY` was created from a clean local source commit `e019a2fa8120abf0b9c9d16b37c2fb559c060d8f`, reran the build gate and emitted `passed:true`, `beta_secret_fingerprints_match:true`, all nine fixed checks passed, and no failures. Thus the six actual build-time beta secrets match the 26/09 receipt; the event contains no secret values or hashes. The alias was verified to target this final deployment. The legacy alias still targets its prior deployment.
- Seven redacted provider/runtime receipts were copied into a private ignored `config/h04d-evidence.local/` directory, and their exact SHA-256 digests were recorded in `config/h04d-post-activation.local.json` (both mode-restricted). The hardened runner checked each file, digest and manifest and returned `ok:true`, `postActivationRuntimeConsistent:true`, `isolationVerified:false`. It did not authenticate providers itself; the command origins and operator-supplied legacy Telegram provenance above require human review. Full harness: 78/78; typecheck passed.
- Read-only HTTP probes after the deploy returned 200 for beta `/login` and 401 for unauthenticated beta `/api/cron/telegram-outbox`. They created no financial rows or Telegram updates.
- The pre-activation manifest verifier must remain unchanged; it explicitly requires flags off and provider stubs. The separate post-activation validator checks declaration consistency but deliberately returns `isolationVerified=false` pending a reviewed provider/runtime evidence package.

## Owner decision and residual limits

1. The gated build-time attestation for the **current** beta deployment passed, including all six secret fingerprints, and the beta alias was checked. This proves the environment snapshot used to build the active beta deployment matches the documented beta identities and original six-secret receipt. It is not a readback of secrets from the running function, nor proof about any old deployment URL.
2. Receipts, digests and the post-activation consistency run are complete locally. Esteban explicitly accepted the remaining build-snapshot-versus-running-function limitation on 29/09 **for the current beta pilot only**. The validator deliberately continues to output `isolationVerified:false`; the human scope decision must not be encoded as a machine verification result.

This scoped closure does not certify retired deployment URLs or authorize a push, legacy release or promotion. Any active beta deployment/binding/identity change requires fresh evidence. Before a future production promotion, Codex must review access to old deployment URLs and rerun the assertion on the candidate; Esteban must separately authorize that release.

No step above authorizes a legacy push, deploy, webhook change, DB migration or query of financial rows.

## Addendum — beta deployment 30/09/2026

The 29/09 scoped certificate above is historical: its named deployment was
superseded. The active beta alias now resolves to
`dpl_5jxNMY8Z3iMDToef7N57QKdjTTyV`, built from the clean local source SHA
`bd0269bec6c91125852b6225a32f2f8e827adac0` in the separate beta Vercel
project (`prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`). Its Vercel target is named
`production` **within that beta project only**. Read-only inspection still
found the legacy alias on `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`.

The new build emitted one redacted `beta_build_isolation_attested` event with
`passed:true`, `beta_secret_fingerprints_match:true`, the nine expected checks
and no failed checks. The beta Production binding-name inventory included the
assertion and expected-fingerprint controls; no secret value was read into this
document. Fresh beta Vercel/runtime receipts and digests were put in the
private, ignored evidence package. The post-activation runner returned
`ok:true`, `postActivationRuntimeConsistent:true`,
`providerMetadataComparison:"distinct-identities-declared"`, and correctly
`isolationVerified:false`. Provider identity receipts from 29/09 remain within
the contract's seven-day freshness window. Beta `/login` returned HTTP 200;
an unauthenticated beta worker request returned HTTP 401. These probes did
not create financial rows or Telegram updates.

**Historical decision request (resolved below):** the 29/09 owner acceptance explicitly covered
the then-current deployment and required revalidation after a deployment
change. Codex has completed technical reattestation for the new active beta
deployment; Esteban owns acceptance or rejection of the same documented
build-snapshot-versus-running-function residual for this deployment. Until
then, label the new deployment technically consistent but **not yet renewed
as a scoped human isolation certificate**. Neither the old nor a future beta
certificate authorizes legacy changes or a production release.

## Owner decision — 02/10/2026: bounded beta-pilot policy

Esteban explicitly accepted the same documented residual for the 30/09 beta
deployment and, going forward, as a **beta-pilot-only policy**. The residual is
the absence of a direct readback of every running-function secret and of a
certificate for retired deployment URLs. The technical gate for the active
30/09 deployment had already passed and its distinct beta provider identities
were recorded above. This human acceptance renews its **scoped pilot** status;
it does not change the automated `isolationVerified:false` result.

For each later beta deployment, Codex must rerun the build-time fail-closed
identity/secret-fingerprint assertion and the post-activation alias, provider
identity and receipt checks against that **exact deployment**. A code-only
change with unchanged identities, bindings and controls can use this standing
acceptance once those checks pass. If the Vercel project, Turso DB, Telegram
bot or webhook, a required binding or secret fingerprint changes, any check
fails or evidence is stale/incomplete, the prior acceptance does **not** cover
the new deployment: stop, label H04d open and obtain Esteban's fresh decision.
The policy does not certify retired URLs, authorize a legacy write/deploy or
substitute for a separate production-release approval.

## Addendum — beta deployment 02/10/2026

Direct beta-only CLI deployment `dpl_BeEyrGrvnJb8yMrZSb2QWk7LrPxk` was
created from clean local source `e724b448353fe24fbdecca3a0a80632d14c3ef8d`
in project `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`. The build emitted the single
redacted `beta_build_isolation_attested` event with `passed:true`, all nine
expected checks and matching six-secret fingerprints. The beta alias resolves
to this READY deployment; the legacy alias remains on
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. Beta `/login` returned 200 and an
unauthenticated outbox-worker request returned 401. No financial rows or bot
updates were generated by those probes.

The private ignored evidence package in the prior local worktree was updated
with redacted Vercel/runtime receipts bound to this exact deployment, fresh
SHA-256 digests and timestamps. Other beta/legacy provider identity receipts
from 29/09 remain within the seven-day policy window. The hardened local
runner returned `ok:true`, `postActivationRuntimeConsistent:true`,
`providerMetadataComparison:"distinct-identities-declared"` and, by design,
`isolationVerified:false`; it did not read running-function secret values or
retired deployment URLs. Under the owner's 02/10 standing **beta-pilot-only**
acceptance, the scoped H04d gate is closed for this exact deployment. It
reopens on the next deployment for fresh technical evidence, or immediately
upon binding/provider drift or a failed/stale check. No legacy release follows
from this result.

## Addendum — beta deployment 03/10/2026, currency schema compatible

After applying only migration `0090-currency-modes` to `beta-hermes` and
reconciling unchanged historical financial rows, direct CLI deployment
`dpl_ALk22n7VekTntM9eoWYgVwfUdRcJ` from clean local source
`ca82e2f8545a5de8657e6b472f167903a888ee70` became READY in the same
separate beta project. The beta alias resolves to it; the legacy alias still
resolves to `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. No Git push or legacy
deployment occurred. The build emitted one redacted assertion with
`passed:true`, matching six beta-secret fingerprints and ten checks, including
the new `ars_mode_disabled` check. The beta Production binding inventory has
no `ACT05_ARS_MODE_ENABLED` entry, so the new currency option remains off.

Private beta Vercel/runtime receipts and digests were refreshed for this
exact deployment; the 29/09 provider identity receipts are still inside the
seven-day contract. The hardened local runner returned `ok:true`,
`postActivationRuntimeConsistent:true`, and the intentional
`isolationVerified:false`. Under Esteban's 02/10 bounded beta-pilot policy,
the scoped H04d technical gate is closed for this unchanged beta provider
configuration. No HTTP probe or manual financial QA is claimed in this
addendum. Activating `ACT05_ARS_MODE_ENABLED` would change a beta binding and
requires a fresh owner decision, a new deployment and reattestation; it is
not implied by this closure.

## Addendum — beta currency activation 03/10/2026

With Esteban's explicit authorization, the non-secret
`ACT05_ARS_MODE_ENABLED=true` binding was added only to the beta project's
Production environment. Direct CLI deployment
`dpl_H7PhfyxS8E68T1WVStoWjsv2Lmad` from clean local source
`62e06877790f79b65f8ceee170f45e807151e967` is READY and the beta alias
points to it. The legacy alias remains on
`dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`. The new build assertion emitted
`passed:true`, matching six beta-secret fingerprints and ten checks,
including an explicit `ars_mode_enabled` check. The post-deploy read-only
Turso inventory still showed only two USD/ARS months and 16 USD/ARS movements;
no ARS/ARS row had been created by activation.

The private beta Vercel/runtime receipts, timestamps and digests now refer
to this exact deployment. The seven-receipt runner returned `ok:true`,
`postActivationRuntimeConsistent:true`, and intentionally
`isolationVerified:false`. This is **technical consistency, not a fresh
scoped human certificate**: activation changed a beta binding, which the
02/10 standing policy reserves for a fresh owner decision. Esteban owns
ratifying or rejecting the same build-snapshot-versus-running-function and
retired-URL residual for this deployment. Functional ARS/ARS acceptance is a
separate manual gate. Nothing here authorizes legacy changes or a release.

### Owner decision — 03/10/2026, current beta currency deployment

After reviewing the residual again, Esteban explicitly accepted it **only
for the beta pilot on `dpl_H7PhfyxS8E68T1WVStoWjsv2Lmad`**. The residual is
unchanged: the verified build environment and redacted provider receipts do
not directly attest every running function's bindings, and URLs of retired
deployments have not been certified. The technical gate above passed for the
exact active beta alias. H04d is therefore closed **at the scoped human pilot
level** for this deployment; the machine output remains
`isolationVerified:false` and `certificationState:"not-certified"`. This
decision does not cover a future deployment, provider/binding drift, legacy
promotion or production release. Codex owns freshness and reattestation on
the next beta change; Esteban retains any new residual/release decision.
