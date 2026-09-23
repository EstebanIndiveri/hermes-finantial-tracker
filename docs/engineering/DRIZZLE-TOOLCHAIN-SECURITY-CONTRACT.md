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
