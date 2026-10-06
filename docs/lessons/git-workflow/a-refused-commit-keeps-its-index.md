# A refused commit keeps its index

When a hook refuses a commit (commitlint on a header one character too
long, a failing `vitest --changed`, a lint-staged error), the files you
staged for it stay staged. The next `git add … && git commit` for a
different change then carries them along.

On 2026-10-06 the `perf` commit for the artist graph's one-file include was
refused at 51 header characters. The next command staged three docs files
and committed: that docs commit silently contained the repository change
and its spec. It took a `git show --stat`, a `git reset --soft HEAD~1`, a
`git reset -- <files>` and two fresh commits to put the history right — safe
only because nothing had been pushed.

Rules:

- Treat a refused commit as "still staged". Before the next `git add`, run
  `git status --short` and unstage (`git reset -- <files>`) anything that
  belongs to the refused change, or fix and recommit that change first.
- Count a header mechanically before committing and keep a margin: the
  gitmoji counts as two characters, and a variation selector (`♻️`) makes
  the count differ from a naive one. Printing the count in the same
  command as the commit is not a gate — it happened again within the hour,
  three refusals in a row, each sweeping its files into the next commit.
  Gate the commit on the count: `test "$(count)" -le 50 && git commit …`,
  or commit only after reading the count in an earlier command.
- After every commit, read `git show --stat --format= HEAD | tail -1` and
  compare the file count with what you meant to commit. A count that is too
  high is this mistake.
