# A `file:` dependency is a store copy — reinstall after editing its source

`bio-generator` depends on `@fakefour/job-contract` as
`file:../packages/job-contract`. pnpm materialises a `file:` dependency as a
copy in its store (`node_modules/.pnpm/@fakefour+job-contract@file+…`), not a
symlink to the source directory. Editing `packages/job-contract/src/*` therefore
changes nothing the Lambda's tests or `tsc` can see: on 2026-09-14 the new
`category` field made the web spec green while `bio-generator/src/types.spec.ts`
stayed red against the pre-edit copy, which read like a wrong implementation.

After any edit under `packages/job-contract`, run
`cd bio-generator && pnpm install --offline` (the lockfile is unchanged, so it
only re-copies the package) before running the Lambda's typecheck or tests.
The root app is unaffected — it resolves the package through
`transpilePackages` from the source tree.
