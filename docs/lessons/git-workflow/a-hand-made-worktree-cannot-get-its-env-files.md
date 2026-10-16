# A hand-made worktree cannot get its env files

`git worktree add` creates a worktree with no `.env*` files, and the agent
cannot copy them in afterwards: the `cp` is denied by the settings rules,
which is what they are for. Only `EnterWorktree` (and `claude --worktree`)
copies them, through `.worktreeinclude`.

On 2026-10-15 this happened again, one session after the lesson in
[`a-worktree-outside-the-checkout-loses-its-env-guards.md`](a-worktree-outside-the-checkout-loses-its-env-guards.md)
was written. The worktree was made with `git worktree add` under
`.claude/worktrees/`, the copy was denied, the session carried on with a
worktree whose hooks could not run, and the user had to stop the work to
say "use EnterWorktree". The branch that `git worktree add -b` created
stayed behind, because `git branch -D` is blocked too, so the user also
has to delete it by hand.

Rules:

- The only command that creates a worktree is `EnterWorktree`. Never
  `git worktree add` for new work, however small, and never as a fallback
  when the tool is "not loaded yet": load it with `ToolSearch` first.
- After `EnterWorktree`, rename the branch to `<type>/<name>` and check the
  env files arrived by name (`ls -a | grep '^\.env'`). Never read them.
- A denied `cp` of env files is not a prompt to ask the user to copy them.
  It is the signal that the worktree was made the wrong way: remove it with
  `git worktree remove`, tell the user which stray branch to delete, and
  create it again with `EnterWorktree`.
