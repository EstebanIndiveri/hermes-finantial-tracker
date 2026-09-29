# H04d isolation evidence review — 2026-09-29

Status: **open; `isolationVerified=false`**. This is a redacted evidence index, not a release certificate. No legacy configuration, data or deployment was changed by these checks.

## Authenticated provider identities

| Provider | Beta | Legacy | Evidence/provenance |
| --- | --- | --- | --- |
| Vercel project | `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF` (`hermes-finantial-tracker-z2`) | `prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt` (`hermes-finantial-tracker`) | `vercel project inspect` under `eindi-acme`, read-only, 29/09. |
| Vercel active deployment | `dpl_464YgY9UzBCuupqiKNHqug5pQHPb`, target `production` *inside beta project*; alias `hermes-finantial-tracker-z2.vercel.app` | `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx`, target `production` inside legacy project; alias `hermes-finantial-tracker.vercel.app` | `vercel inspect` on each canonical alias, read-only, 29/09. The active deployments and aliases are distinct. |
| Turso database | `beta-hermes`, ID `01a0c0bd-0601-7f27-b147-915d105b19f2`, host `beta-hermes-esteban-indiveri.aws-us-east-2.turso.io` | `hermes-acme`, ID `019e71ab-9501-7c05-a672-b41db7a2cb27`, host `hermes-acme-eindiveri.aws-ap-northeast-1.turso.io` | `turso db show` authenticated separately to the beta and legacy accounts, read-only, 29/09. No SQL or financial rows read. |
| Telegram bot | ID `8739389202`, `Hermes_beta_finantial_bot`, webhook `https://hermes-finantial-tracker-z2.vercel.app/api/telegram/webhook` | ID `8884948884`, `HermesFinanceAssistBot`, webhook `https://hermes-finantial-tracker.vercel.app/api/telegram/webhook` | Beta `getMe`/`getWebhookInfo` verified earlier on 29/09. Esteban executed both read-only Bot API calls on 29/09 with hidden legacy token and supplied only the JSON result. Codex did not inspect the legacy token. |

## Binding/runtime evidence and limits

- The beta project's `vercel env ls production` lists the required Telegram, Turso, session, Groq and OCR binding **names**, with `Encrypted` type and Production scope. This shows configuration presence, not their effective values or which deployment snapshot uses them.
- The six beta fingerprints and provenance receipt was captured on 26/09 and remains ignored/private in the original staging worktree. Its presence does not prove that every current deployment binding still matches it.
- `vercel env pull --id dpl_464YgY9UzBCuupqiKNHqug5pQHPb` rejected the READY deployment. The Production-level pull returned empty strings for encrypted values, so it cannot prove flags, modes or secret matches. The exact temporary export was removed immediately; it must not be cited as successful runtime verification.
- The beta outbox retry canary at 18:40 UTC reached the Vercel worker route from the beta-only Cloudflare scheduler and moved a retryable outbox row to `sent`. This is functional evidence that the worker path was enabled for that operation, but does not independently attest every runtime binding or secret.
- The pre-activation manifest verifier must remain unchanged; it explicitly requires flags off and provider stubs. The separate post-activation validator checks declaration consistency but deliberately returns `isolationVerified=false` pending a reviewed provider/runtime evidence package.

## Remaining closure gates

1. Prove the effective beta deployment runtime binds to the beta DB/bot and has the intended flags and AI/OCR modes, without emitting secret values. A gated beta-only build-time attestation has been implemented locally for a **new** deployment; prior deployment metadata cannot be retroactively reinterpreted. Its remote deployment and evidence capture are still pending.
2. Confirm the six beta secret receipt/provenance remains applicable to the new deployment, or renew a changed beta receipt without accessing legacy secret values.
3. Store reviewed redacted provider/runtime receipts with timestamps and digests, execute the post-activation consistency validator, and have Esteban review provenance and residual risks. Only then decide whether formal `isolationVerified=true` is justified.

No step above authorizes a legacy push, deploy, webhook change, DB migration or query of financial rows.
