# A `file:` dependency is a store copy — reinstall after editing its source

Both the root app (`file:./packages/job-contract`) and `bio-generator`
(`file:../packages/job-contract`) depend on `@fakefour/job-contract` as a
`file:` dependency. pnpm materialises a `file:` dependency as a copy in its
store (`node_modules/.pnpm/@fakefour+job-contract@file+…`), not a symlink to
the source directory. Editing `packages/job-contract/src/*` therefore changes
nothing that either project's `tsc` or tests can see: on 2026-09-14 the new
`category` field made the web spec green while `bio-generator/src/types.spec.ts`
stayed red against the pre-edit copy, which read like a wrong implementation —
and later the same day the root `tsc` reported a freshly exported contract type
as "no exported member" for the same reason.

After any edit under `packages/job-contract`, run `pnpm install --offline` in
BOTH the root and `bio-generator` (the lockfile is unchanged, so it only
re-copies the package) before running either typecheck or test suite. The
web spec passing first is no evidence the root copy is fresh: it only means
nothing in the web app had imported the new export yet.
