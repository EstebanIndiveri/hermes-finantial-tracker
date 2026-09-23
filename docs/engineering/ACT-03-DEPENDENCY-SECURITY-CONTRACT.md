# ACT-03 Dependency Security Contract

## Baseline

On the supplied lockfile, `npm audit --json` reports 10 findings: 1 critical, 3 high, and 6 moderate. The critical finding is the direct runtime dependency `next@16.3.2`. High findings affect `xlsx@0.18.5` (no automatic fix), `sharp`, and `js-yaml`. Moderate findings affect `qs`, `hono`, and the `drizzle-kit`/`@esbuild-kit`/`esbuild` chain; npm offers only a breaking downgrade of `drizzle-kit` to `0.18.1` for that chain.

## Desired result

Update only compatible package and lockfile selections for Next.js, sharp, js-yaml, qs, and hono. Use Node 22 and npm 10, retain the existing dependency families and avoid force installs. Keep `xlsx` unchanged, do not downgrade Drizzle Kit, and make no application feature or source-code changes.

## Invariants and scope

- Files in scope: `package.json`, `package-lock.json`, and this contract.
- No `--force`, no dependency replacement, and no major-version downgrade.
- Do not touch providers, deployments, staging configuration, or external services.
- Verify installation with `npm ci` in this worktree's local `node_modules`; report the read-only post-update `npm audit` summary and remaining advisories.
- Do not run the full test suite or build as part of this bounded dependency update.

## Version selection

Choose patched versions from primary package maintainer release/advisory information available at execution time. The [September 22, 2026 Next.js security update](https://nextjs.org/blog/nextjs-security-update-september-22-2026) recommends 16.3.6. Its critical advisory concerns the Node.js `ImageResponse` implementation under specific conditions; an audit finding alone does not establish that Hermes exposes the affected code path.

## Result

Using Node 22.23.2 and npm 10.9.8, the compatible lockfile update resolved the Next.js, sharp, js-yaml, qs, and hono findings. Installed versions are `next@16.3.6`, `sharp@0.35.4`, `js-yaml@4.3.2` and `3.15.2`, `qs@6.16.0`, and `hono@4.13.8`. `drizzle-kit` remains at `0.31.10`; `xlsx` remains at `0.18.5`.

After `npm ci`, `npm audit --json` reports 5 findings: 0 critical, 1 high, and 4 moderate. The remaining high finding is `xlsx` (no automatic fix). The moderate findings are the `drizzle-kit`/`@esbuild-kit`/`esbuild` chain; npm's only offered fix is the breaking downgrade of `drizzle-kit` to `0.18.1`, which is outside this scope.
