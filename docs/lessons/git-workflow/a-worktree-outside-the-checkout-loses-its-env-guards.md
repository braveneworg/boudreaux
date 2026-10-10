# A worktree outside the checkout loses its env guards

Two things protect the env files in a worktree, and both depend on where the
worktree is and what created it.

- **The `Read(.env)` and `Read(.env.*)` deny rules** in
  `.claude/settings.json` match a file only at or under the directory the
  session runs in. They do not match a `.env` in a parent directory or in a
  sibling folder.
- **`.worktreeinclude`** copies the env files only into a worktree the harness
  creates: `claude --worktree`, subagent isolation, and the `EnterWorktree`
  tool. A worktree made with `git worktree add` gets nothing.

On 2026-10-10 the factory skill created its job worktree with
`git worktree add` in a sibling folder, `../boudreaux-factory/<job-id>/`. The
agent's `cp` of the env files was denied, as the deny rules intend, so the
user copied them by hand. The first copy landed one level up, in
`boudreaux-factory/`, and sat there as loose secret files until it was moved.
Once the copy was in place, no rule guarded it: the sibling folder is outside
the session's directory, so only the instruction in `AGENTS.md` stood between
an agent and its contents.

The agent then recommended moving the worktrees under `.claude/worktrees/`
and said `.worktreeinclude` would copy the env files there. That was wrong
for `git worktree add`, and `AGENTS.md` already says so. The claim went to the
user before it was checked.

Both points were then probed with a throwaway worktree:

- `EnterWorktree` copied `.env` and `.env.local` in (checked by name).
- A write of a file named `.env.probe` with fake content was denied inside
  `.claude/worktrees/`, both from the worktree and from the main checkout.

Rules:

- Put every worktree under `.claude/worktrees/` in the main checkout. Never
  create one in a sibling or parent folder.
- Create it with `EnterWorktree`, then rename the branch to `<type>/<name>`.
  Use `git worktree add` only when the branch already exists, and then ask the
  user to copy the env files, giving the full source and destination paths.
- After creating a worktree, check by name that the env files arrived
  (`ls -a`). Never read them.
- To test whether a deny rule covers a path, write a file with fake content
  under a matching name there. A refused write proves the rule applies; a
  write that succeeds leaves only fake content to delete. Never test by
  reading a real env file.
- The deny rules stop the file tools and the shell's file commands (`cat`,
  `head`, `tail`, `sed`, `tee`, redirects). They do not stop a subprocess that
  opens the file itself, such as `node -e`. Hard constraint 2 still applies in
  every worktree.
- Before telling the user what a config file does, read what `AGENTS.md` says
  about it.
