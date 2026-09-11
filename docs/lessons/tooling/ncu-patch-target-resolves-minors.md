# `ncu -t patch` does not keep installs at patch level

`npm-check-updates -t patch` only picks the new floor it writes into each
range — the `^` stays. `pnpm install` then resolves the newest version inside
that caret, so a "patch" run (2026-09-10) moved next 16.2 → 16.3, react
19.2 → 19.3 and better-auth 1.6 → 1.7. Judge the upgrade from the
`pnpm install` summary (or the lockfile importers), never ncu's table. And a
package overridden in `pnpm-workspace.yaml` (e.g. `vite: ~7.3.2`) ignores the
package.json bump entirely — the lockfile importer records the override as its
specifier, so revert the manifest line rather than leave it claiming a version
that isn't installed.
