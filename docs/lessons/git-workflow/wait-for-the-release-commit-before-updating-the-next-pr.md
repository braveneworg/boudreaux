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

## "Nothing in progress" is not "deployed"

Right after `gh pr merge`, GitHub has not created the merge commit's runs
yet, so a check for runs that are not `completed` finds none and passes at
once. On 2026-10-05 a merge chain slept 30 seconds, saw no run in
progress, and reported #833 settled while its CI had not started; its
worktree was removed before the deploy ran, against the rule to remove a
worktree only once merged and deployed.

Wait for the run of the merge commit itself:

```bash
sha=$(gh pr view <n> --json mergeCommit --jq .mergeCommit.oid)
until gh run list --limit 20 --json name,headSha,status \
  --jq ".[] | select(.name == \"CI/CD - Build, Publish, Deploy\" and .headSha == \"$sha\") | .status" \
  | grep -q completed; do sleep 30; done
```

Then read that run's `conclusion` before calling the merge deployed.

List the recent runs unfiltered and match the workflow and commit in
`jq`. The same day, `gh run list --branch main --workflow "CI/CD - Build,
Publish, Deploy"` returned runs from August while the unfiltered list
showed #834's runs finished and green, so a loop on the filtered list
waited 40 minutes for a run that had already passed. The `head_sha`
query on the runs API returned nothing for the same commit.
