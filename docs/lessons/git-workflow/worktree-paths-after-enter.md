# Worktree paths after EnterWorktree

After `EnterWorktree`, every Read/Edit/Write must target the worktree path —
reusing an absolute path captured before the switch silently edits the MAIN
checkout (tests run from the worktree never see it; the worktree branch stays
empty while the main checkout goes dirty; `wc -l`/`--list` disagree with the
Read/Edit view). Never run `git restore`/`git checkout` in the main checkout
while it holds the user's uncommitted WIP.
