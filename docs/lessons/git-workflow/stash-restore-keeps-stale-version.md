# A manifest carried across a fast-forward keeps the stale release version

Uncommitted `package.json` edits carried across a fast-forward (stash → ff →
`git stash apply`, or a saved manifest snapshot copied back in) restore the
PRE-release `"version"` line: both 2026-09-10 dependency worktrees sat at
4.315.0 on a 4.316.0 base, and committing them would have rolled the release
version back. Before committing a manifest that crossed a rebase or
fast-forward, run `git diff -U0 -- package.json | grep '"version"'` — it must
print nothing.
