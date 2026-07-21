# Don't re-prefix worktree paths after entering one

After a terminal enters a worktree, do not prefix commands with the worktree's
relative path again; use the active directory or an absolute path so validation
targets exist.
