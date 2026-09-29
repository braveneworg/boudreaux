# A spec's cleanup must only touch the rows it created

`playwright.config.ts` sets `fullyParallel: true`, and CI runs with
`workers: '50%'`. So the tests of ONE file can run in several workers at once.
Each worker loads the file again, runs `beforeAll` before its first test of
the file, and runs `afterAll` when its own tests of the file finish.

Two specs written on 2026-09-27 and 2026-09-28 assumed one worker:

- `hidden-artist-names.spec.ts` seeded shared rows in `beforeAll`, after a
  cleanup that deleted every row with the spec's prefix. Worker B's cleanup
  deleted the rows worker A had just seeded. A module-level
  `const STAMP = Date.now()` was also different in each worker, so the tests
  of one file were looking for different rows.
- `admin-release-credit-confirmation.spec.ts` seeded per test but removed
  rows by prefix in `afterAll`, which deleted rows another worker's test was
  still reading.

Both passed locally (`workers: 1`) and on the PR's CI run. The first failed on
`main` after the merge, which skipped the production deploy. Running the two
files with `--workers=4` reproduced it at once: 5 of 13 tests failed.

Rules:

- Remove rows by the ids the worker created, or by a stamp unique to the
  worker. Never by a prefix that another worker's rows also match.
- Do not clean up in `beforeAll`. A leftover row from a crashed run is a
  smaller problem than deleting a running test's rows; the global setup
  reseeds the database.
- When the tests of a file share rows seeded in `beforeAll`, keep the file in
  one worker with `test.describe.configure({ mode: 'default' })`. Use
  `'serial'` only when a later test depends on an earlier one's result, since
  it skips the rest of the file after one failure.
- A module-level `Date.now()` is per worker, not per run. Add randomness to it
  when two workers can seed in the same millisecond.
- Before pushing a new spec, run it the way CI does:
  `pnpm exec playwright test <spec> --workers=4 --retries=0`, then again with
  `--repeat-each=4`. A local run with one worker proves nothing about
  parallel safety.
