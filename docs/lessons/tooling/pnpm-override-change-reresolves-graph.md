# Changing a pnpm override re-resolves the whole graph

Editing an entry under `overrides:` in `pnpm-workspace.yaml` makes the next
`pnpm install` re-resolve dependencies, not just the overridden package:
loosening `vite: ~7.3.2` to `^7.3.2` (2026-09-11) left vite at 7.3.5 but
silently bumped the direct dependency zod 4.4.3 → 4.6.1 and deduped
`@types/node`. When the locked versions already satisfy the new override,
restore the lockfile and change only the override's spec lines in it (the
top-level `overrides:` entry, the importer `specifier:`, and the overridden
peer ranges), then prove it with `pnpm install --frozen-lockfile` — it must
report "Lockfile is up to date, resolution step is skipped".
