# Never `--amend` to recover from a rejected commit

`commit-msg` (commitlint) runs **after** `pre-commit`, so a header over the
50-character limit fails the commit while leaving the changes **staged**. The
recovery is simply to commit again with a shorter header.

What must never follow is an `--amend`. Chaining one as a fallback —

```bash
git commit -q -F - <<'EOF'
...
EOF
git commit -q --allow-empty-message --amend --no-edit 2>/dev/null   # never do this
```

— silently folds the staged changes into the **previous, unrelated** commit
when the first command fails. It looks like success: `git status` is clean and
the work is committed, just attached to the wrong commit with the wrong
message and a rewritten SHA. Hit on 2026-09-20: a release-link feature landed
inside a `style: clamp the short bio` commit, and the only clue was that
commit's SHA changing (`85aa5e4b` → `750ee090`).

Rules:

- One `git commit` per command. Never chain a second commit, `--amend`, or
  `reset` behind `;` or `||` as a fallback — read the failure and act on it.
- `--amend` only ever targets a commit you deliberately intend to rewrite, and
  only after confirming it is unpushed (`git log --oneline origin/<branch> -1`).
- Never pass `2>/dev/null` to a git command that writes history; it hides the
  very error that tells you the write was wrong.
- If it already happened: check whether the commit is pushed, then
  `git reset --soft <parent>`, `git reset` to unstage, and rebuild the commits
  cleanly. Splitting one file's changes across two commits is easiest by
  checking the file out at the earlier commit, re-applying the first change,
  committing, then restoring the finished version from a scratchpad copy.
