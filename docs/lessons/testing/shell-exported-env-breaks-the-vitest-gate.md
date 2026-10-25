# A shell that exports `.env` values breaks the vitest gate

The unit specs assume the process starts without the app's environment:
`setupTests.ts` snapshots `process.env` as pristine and several specs
stub only the variable they test (`CDN_DOMAIN`, `SHOW_DEV_LOGS`). In a
shell that has exported the `.env` values (direnv, a profile that sources
them, a harness that sets `NODE_ENV=development`), those assumptions fail
and look like regressions:

- `s3-key-utils`, `release-service` and `logger` specs fail because
  `S3_BUCKET`, `AWS_REGION` and `SHOW_DEV_LOGS` are already set.
- `next/image` specs reject `example.com` and the logger spec reads
  `development`, because `NODE_ENV` is not `test`.
- `vitest run --changed HEAD` (the pre-commit hook) fails at collection
  with `Invalid PostCSS Plugin found at: plugins[0]`: `postcss.config.mjs`
  returns the string plugin whenever `NODE_ENV !== 'test'`, and the module
  graph walk loads `globals.css` through it.

On 2026-10-25 the Next.js 16.4.3 security bump showed 23 failing tests in
a fresh worktree. Reinstalling 16.4.0 reproduced all 23, so none belonged
to the upgrade; unsetting the exported variables made the suite green.

Rules:

- Before blaming a change for a failing gate in a worktree, run the same
  specs against the base version. Identical failures are the environment.
- Give the gate and the hooks the environment they expect, in the same
  command, without `--no-verify`:
  `unset SHOW_DEV_LOGS CDN_DOMAIN S3_BUCKET AWS_S3_BUCKET_NAME AWS_REGION E2E_MODE NEXT_PUBLIC_E2E_MODE LOG_LEVEL LOG_DEBUG_MODULES; NODE_ENV=test git push …`
- Never print the exported values to find out which are set; test for
  presence only (`${VAR:+set}`).
