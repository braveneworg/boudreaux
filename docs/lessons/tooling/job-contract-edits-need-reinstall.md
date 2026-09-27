# Editing `packages/job-contract` needs a `pnpm install` in both consumers

`@fakefour/job-contract` is a `file:` dependency in the root and in
`bio-generator/`. pnpm COPIES a `file:` package into
`node_modules/.pnpm/@fakefour+job-contract@file+…` at install time — it is
not a symlink to `packages/job-contract`. So after adding an export or a
field to the package source, `tsc` and `vitest` in either consumer still see
the OLD copy: on 2026-09-26 the Lambda typecheck reported that `signingKey`
did not exist on the input schema minutes after it was added, and a new
`./signing` subpath export resolved only after a reinstall.

After any edit under `packages/job-contract/`, run `pnpm install --offline`
in the root AND in `bio-generator/` before trusting a typecheck or test run
(a relative import inside the package itself, e.g. its own spec, is not
affected and can pass while the consumers are stale). CI installs fresh, so
it never shows the problem — only local runs do.
