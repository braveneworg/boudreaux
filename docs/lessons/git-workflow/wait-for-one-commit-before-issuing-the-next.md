# Wait for one commit to finish before issuing the next

"One `git commit` per command" is not enough when an agent can issue
several commands in one turn. Two commit commands sent together run one
after the other whatever the first one did, exactly as if they had been
chained with `;`.

On 2026-09-28 two commits for one PR were issued in the same turn. The
first staged an explicit file list and failed in `git add`: the list named
the old path of a file that `git mv` had already renamed
(`pathspec … did not match any files`), so `&&` skipped its `git commit`.
The second command ran `git add -A src` and committed all 32 files under a
message that described half of them. `git status` was clean and the hooks
were green. Only the log, which showed one commit where two were expected,
gave it away. Nothing had been pushed.

Rules:

- Issue a commit, read its result, then issue the next. Never send two
  history-writing commands in the same turn.
- After every commit, check `git log --oneline -2` and
  `git show --stat --format= HEAD | tail -1` against the commit you meant
  to make: the right message on the right number of files.
- After `git mv`, stage the new path, or use `git add -u <dir>` for the
  removal. The old path no longer exists to be added.
- Prefer an explicit file list over `git add -A` when splitting one change
  into several commits. `-A` takes whatever a failed earlier step left
  behind.
- To recover, confirm the commit is unpushed, then
  `git reset --soft <parent>`, `git reset` to unstage, and rebuild the
  commits one at a time. See
  [`never-amend-to-recover-a-rejected-commit.md`](never-amend-to-recover-a-rejected-commit.md).
