# Delete remote branches from a worktree, not the main checkout

The pre-push hook refuses every push made while `main` is checked out, and
`git push origin --delete <branch>` is a push. Run from the main checkout,
the hook stops it with "You are on the 'main' branch".

On 2026-10-09 the cleanup after #849 and #850 hit this. Running the same
command from a feature worktree passed the hook and deleted both branches.

Rules:

- Delete merged remote branches from any feature worktree, never from the
  main checkout.
- Do not reach for `--no-verify` or the GitHub API to get around the hook.
