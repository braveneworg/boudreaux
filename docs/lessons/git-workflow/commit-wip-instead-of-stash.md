# Split commits with on-branch WIP, never the stash

The stash stack is repository-wide, not per-worktree: every worktree
shares `refs/stash`. On 2026-09-26, an agent splitting #769 into
atomic commits stashed half the change, then plan mode stopped it
mid-split. The work survived only as `stash@{0}` among ten parallel
worktrees, so any `git stash pop` elsewhere could have taken or
dropped it. Recovering it took the exact stash SHA.

When splitting work into commits, stage and commit the first slice.
Park the remainder as a `wip:` commit on the branch, then reset it
back out or `git commit --amend` it into the real slice. Never park
work in the stash. If a stash already holds work, address it by SHA
(`git stash apply <sha>`, never `pop`), and drop only the entry
whose SHA matches, after its content is committed.
