# The factory guard has an opt-in for merges the user asked for

`.claude/hooks/factory-guard.sh` blocks `gh pr merge` and `git merge` so
agents never land work on `main` on their own. Its header documents one
opt-in: when the user has asked for the merge in so many words, prefix
that single command with `FACTORY_GUARD_USER_MERGE=1`.

```bash
FACTORY_GUARD_USER_MERGE=1 gh pr merge 931 --merge
FACTORY_GUARD_USER_MERGE=1 git merge origin/main
```

The guard reads the prefix off the command text, not the environment, so
the permission prompt and the transcript show the attestation on the
command it covers. Force pushes, pushes to `main` and `git branch -D` stay
blocked either way.

On 2026-11-08 the user asked to "merge #930 through #933". The first
`gh pr merge` was blocked, and the agent handed the merge back to the
user as a `!` command instead of reading the guard's header, which costs
the user a round trip per PR.

Rules:

- On a guard block, read the script's header before routing around it.
- Use the prefix only when the user's own words ask for that merge. A
  merge you decide is needed still goes to the user.
- `gh pr update-branch <n>` updates a PR branch with `main` on GitHub
  when it merges cleanly; a conflicted update needs the local
  `git merge` under the same opt-in.
