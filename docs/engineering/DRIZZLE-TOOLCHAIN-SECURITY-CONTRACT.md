# Drizzle toolchain security contract

## Current behavior

`drizzle-kit generate` uses `drizzle-kit@0.31.10`, which depends on the legacy
`@esbuild-kit/esm-loader` / `@esbuild-kit/core-utils` packages. The latter pins
`esbuild` to `~0.18.20`; npm audit reports four moderate findings through this
chain because esbuild versions through 0.24.2 are affected by GHSA-67mh-4wv8-2f99.
The esbuild maintainers mark `@esbuild-kit/core-utils` deprecated and merged into
tsx. Replacing drizzle-kit or its loader is outside this narrow spike.

## Assessment and disposition

The proposed narrow override is not supported by the package metadata: core-utils
declares `esbuild: ~0.18.20`, while the [maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) lists the first patched release as 0.25.0. The
maintainer metadata says the esbuild-kit packages were merged into tsx; it does not
document compatibility of this legacy loader with esbuild 0.25. A global override
does clear audit but also forces esbuild 0.25 across newer Vite consumers whose
peer range is `^0.27.0 || ^0.28.0`, producing npm peer dependency warnings. That
broader option is rejected as an unsafe compatibility tradeoff.

Accordingly, package edits were reverted. No isolated `npm ci`, audit-after-fix,
or generation comparison was run, because no maintainer-supported override was
identified to verify. This spike does not resolve the findings.

## Invariants and scope

- No production/staging provider URL, credentials, network DB access, or DB writes.
- No change to schema, migration runner, existing migration files, services, or env configuration.
- Generate only in a disposable copy and compare generated SQL with repository baseline.
- If generation fails, SQL drifts, or the package compatibility cannot be established,
  revert package changes and record the blocker here.

## Verification record

- Baseline audit on the checkout: four moderate advisories, all through
  `drizzle-kit@0.31.10` → `@esbuild-kit/esm-loader@2.6.5` →
  `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`; npm's suggested fix is a
  major downgrade of drizzle-kit to 0.18.1.
- Confirmed metadata with npm: drizzle-kit 0.31.10 directly requests esbuild
  `^0.25.4` but retains the deprecated esbuild-kit loader; core-utils requests
  `~0.18.20`; esbuild 0.25.12 is available and patched for the reported range.
- Node 22.23.2 / npm 10.9.9 were available through `npm exec` for metadata and
  lockfile investigation. The tentative global override yielded 0 vulnerabilities
  but emitted the Vite peer-range warning described above, then was reverted.
- `package.json` and `package-lock.json` are restored to their original content.
  SQL drift is unassessed because generation was not run.

## Follow-up bounded compatibility experiment (26/09/2026)

Checked current registry metadata: `drizzle-kit@0.31.11` still depends on
`@esbuild-kit/esm-loader`; upgrading within the supported 0.31 line does not
remove the legacy chain. In disposable copies of the committed tree, two
path-scoped npm override shapes were tested. The override under `drizzle-kit`
did not replace the transitive `esbuild@0.18.20` and left all four audit
findings. Overriding only the `esbuild` child of `@esbuild-kit/core-utils` also
left `0.18.20` in the lock/install tree, marked it invalid against `0.25.12`,
and caused `npm ls esbuild --all` to fail. Neither candidate is acceptable;
package files in the working repository were not changed.

The experiment closes this compatibility-investigation subtask as
**no-supported-fix-found**, not the vulnerability. Do not add either override
or force npm to resolve the invalid tree. Four moderate findings remain in
development-only migration tooling. Owner: Esteban Indiveri for accepting that
residual risk or waiting for a maintained upstream replacement; Codex will
reopen only when a supported `drizzle-kit` release removes the loader or npm
can resolve the scoped replacement without invalid packages, then prove clean
install, audit, disposable migration generation, and SQL equivalence.

## Temporary owner acceptance

Esteban Indiveri explicitly accepted the bounded residual temporarily on
28/09/2026 for beta development. This is not a claim that the advisories are
fixed. Do not downgrade `drizzle-kit`, force an invalid `esbuild` override, or
apply a global override. The finding is in the development-only schema-
generation chain, not a declared runtime dependency; Hermes' production
migration command uses the repository's manifest runner. The upstream advisory
concerns the esbuild development server's cross-origin response exposure when
that server is running, so practical exposure depends on a vulnerable local
tool/server being started and reachable from an untrusted browser origin.

While this residual is accepted: do not expose the esbuild development server;
do not run `drizzle-kit` in deployed runtime/build paths; retain the production
dependency audit gate. Re-open this as a maintenance chore before the next
schema-generation/toolchain change, or earlier if a supported Drizzle Kit
replacement is released or advisory/exposure changes materially. Owner: Esteban
Indiveri. Codex owns a bounded upstream recheck and compatibility experiment
when a supported candidate exists. If policy changes to require zero advisories, treat
schema-generation changes as blocked until a supported replacement passes
clean install, audit, disposable generation, SQL-equivalence comparison, and
migration harness; do not weaken or bypass the quality gate.
