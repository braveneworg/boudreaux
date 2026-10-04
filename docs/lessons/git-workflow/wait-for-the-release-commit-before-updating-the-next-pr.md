# Wait for the release commit before updating the next PR

The main ruleset requires a PR to be up to date with `main`, and the
release workflow pushes a `chore(release): vX.Y.Z [skip ci]` commit to
`main` after every merge. Merging PR A therefore moves `main` twice: once
for the squash and once, a minute or two later, for the release commit.

Updating PR B right after PR A's squash lands puts B one commit behind
again as soon as the release commit arrives, and `gh pr merge` refuses it
with "the head branch is not up to date with the base branch". On
2026-10-03 this cost three update-push-CI cycles for a docs-only PR.

Before merging `origin/main` into the next branch:

```bash
gh run list --branch main --limit 2 --json status,name \
  --jq '.[] | "\(.name): \(.status)"'
```

Wait until no `CI/CD - Build, Publish, Deploy` run is `in_progress`, then
`git fetch origin main`, confirm `origin/main` tip is the `chore(release)`
commit, and only then merge it in and push. One cycle instead of three.
