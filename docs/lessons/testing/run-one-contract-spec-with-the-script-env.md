# Run one contract spec with the script's env, never bare

`pnpm run test:db -- <file>` does not narrow the run. On 2026-10-19
(#908) it was meant to run `release-delete.contract.spec.ts` and ran
all 29 contract files: the file argument after `--` was not used as a
filter.

To run one contract file, write the script's env out on the command:

```bash
DATABASE_URL='mongodb://localhost:27018/boudreaux-contract?replicaSet=rs0' \
  VITEST_DB_SPECS=1 pnpm exec vitest run --project db-contract <file>
```

In the same session, an edit of that command left a copy without the
prefix (`pnpm exec vitest run --project db-contract <file>`), and it
ran. It reached no database. Without `VITEST_DB_SPECS=1`,
`vitest.config.ts` defines no `db-contract` project, and
`setupTests.db.ts` refuses any `DATABASE_URL` except
`localhost:27018`. Those guards are the last line of defence, not
the plan (hard constraint 1).

Rules:

- Every command that runs a contract spec carries the
  `DATABASE_URL=…localhost:27018…` prefix on the command line, where
  the approver sees it. For the whole suite, use `pnpm run test:db`.
- Do not narrow `pnpm run test:db` with `-- <file>`. Use the full
  command above.
- Before running an edited command line, re-read every command in it,
  not only the one you changed.
