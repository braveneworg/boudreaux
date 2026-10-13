# A failed local E2E run leaves files the repo-wide lint parses

`pnpm run lint` runs `eslint .` over the whole tree, and the pre-push hook
runs it again. Playwright writes its HTML report to `e2e/playwright-report/`
and failure traces to `e2e/test-results/` (`playwright.config.ts`). Both are
gitignored, but until 2026-10-12 neither was in the ESLint `ignores` list,
so the first failed local E2E run after a fresh worktree dropped minified
trace-viewer bundles into the tree and the next push failed with dozens of
"Parsing error" and `no-unused-expressions` reports from
`e2e/playwright-report/trace/`.

It surfaced on a deliberate red run: the new touch-screen spec in
`home-spotlight-grid.spec.ts` was run against the old source to prove it
could fail, which is what TDD asks for. The report that run wrote then
blocked the push, and the `tail -3` on the push output hid the reason, so
it took a second ten-minute push to read it.

Rules:

- Generated output directories go in the ESLint `ignores` list the moment
  a config names them. `e2e/playwright-report/**`, `e2e/test-results/**` and
  `blob-report/**` are there now; add any new reporter or `outputDir` path
  alongside them.
- Never `tail` the output of a command whose failure you would need to read.
  Save the whole log to the scratchpad and grep it.
- A `git status --short --ignored` lists what a run left behind when the
  tree looks clean; check it when a repo-wide tool fails on files you did
  not write.
