---
name: hermes-safe-change
description: Implement or review Hermes Finance bug fixes, refactors, migrations, and financial or Telegram changes while preserving legacy production, user data, authorization, and cross-channel behavior. Do not use for documentation-only edits unrelated to application behavior.
---

# Hermes safe change

Read `/AGENTS.md` completely. For any cross-module, financial, Telegram, database, auth or deployment-related change, also read the relevant findings and phase in `docs/audit/VALIDACION-LEGACY-Y-EJECUCION.md` and `docs/audit/DIAGNOSTICO-2026-09-16.md`.

## Frame the change

Record a compact task contract before editing:

- starting SHA and worktree;
- observed behavior and evidence;
- expected behavior with concrete examples;
- financial, access, idempotency and compatibility invariants;
- affected entry points and consumers;
- permitted files and explicit exclusions;
- targeted checks and broader release gate.

Classify the change:

- **Legacy hotfix:** minimal compatible patch, no unrelated refactor or model/schema switch.
- **Stabilization:** tests, tooling, observability or safety without changing product policy.
- **Compatible refactor:** preserve public behavior while moving one end-to-end slice into shared contracts.
- **Migration:** require expand/migrate/compare/activate/retire plan plus restore and rollback evidence.
- **Feature:** start only after its dependency gates in the action plan are satisfied or the user explicitly reprioritizes them.

## Establish evidence

Check git state and runtime. Reproduce the defect or capture current behavior before changing implementation. For a bug, add a regression test that fails for the intended reason. For a refactor, add characterization or contract tests at the boundary most likely to regress.

Do not run Playwright until `BASE_URL` is verified as non-production. Never use production DB, bot, chats, secrets, webhooks or notification destinations for tests.

## Implement the smallest coherent slice

Prefer one path that reaches the shared domain and persistence boundary over edits scattered across handlers. Keep external adapters replaceable. Revalidate authorization and mutable financial state in the writer, not only in request parsing or proposal creation.

When changing an operation, inspect equivalent paths where applicable:

- web route/form;
- Telegram command and natural language;
- audio transcription;
- OCR proposal and callbacks;
- recurring execution;
- summaries, budgets, balances, alerts and exports.

Uncertainty must produce an explicit clarification or safe failure. Never repair a test by weakening the assertion unless the approved contract changed.

## Review and verify

Run targeted checks first, then the relevant integration and repository gates. Compare with the recorded baseline and report new versus pre-existing failures.

For financial, authorization, migration or concurrency changes, request an independent review focused on adversarial IDs, wrong group/user, duplicate delivery, timeout after commit, concurrent writes and rollback compatibility. Treat findings as hypotheses to verify, not mandatory edits.

Before handoff, inspect the complete diff for scope creep, secrets, production identifiers, migration destructiveness and documentation drift. Return an evidence packet with changed files, behavior, commands/results, residual risks, rollout/rollback needs and external actions not taken.
