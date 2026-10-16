# ADR-0021: A rollback is code only and targets a version tag

- **Status**: Accepted
- **Date**: 2026-10-15

## Context

Until now the only way back from a bad deploy was to re-run the old
`deploy.yml` run, which rebuilt the images (about six minutes) and needed
the CI build artifact, which expires after a day. Images were pushed to
GHCR under `:latest` alone, so nothing in GitHub recorded which digest
belonged to which version; the only record was one step back in
`.deploy/digests.json` on the EC2 host.

The remote deploy script already swaps containers in under a minute when
given two digests, and the CDN sync in CI never clears `_next/`, so an older
build still finds its static assets. The missing pieces were a durable name
for "the images of version X" and a workflow that rolls without rebuilding.

## Decision

**`rollback.yml` is a manual workflow that rolls the host to an older
version's existing images in about two minutes, runs no build, test, lint
or type check, and never pushes the Prisma schema.**

- **Images carry version tags.** `deploy.yml` tags every built image
  `sha-<deployed commit>` at build time and, in version-bump after the
  health check passed, retags the same digests `vX.Y.Z` via
  `docker buildx imagetools create`. Nothing is rebuilt or re-pushed. A
  `vX.Y.Z` tag in GHCR therefore exists only for a version that went live,
  and a deploy whose version bump was skipped (`version:skip`) is not a
  rollback target.
- **`latest` means live.** The forward deploy moves it at build time; the
  rollback moves it, in GHCR, after its health check passes. The live
  version is the `v*` tag that shares the digest of `latest`, found with one
  packages API call (`scripts/ci/rollback-resolve.sh`). "Previous" is the
  version tag just below it, so repeated rollbacks step back one version
  each time. When `latest` carries no version tag, a forward deploy was
  mid-flight, and "previous" is the newest `v*` tag: the last version that
  passed its health check.
- **The host gets the target's files.** Compose files, observability
  configs and the remote script come from the target's deployed commit, the
  `Deployed-Sha` trailer on its release commit
  (`scripts/ci/release-deployed-sha.sh`), not from the tag and not from
  main's tip. The workflow file, and so the list of secrets written to the
  remote env file, always comes from main; extra variables are harmless to
  an older image.
- **One host roll for both.** `roll-host.yml` is a `workflow_call` that
  the forward deploy and the rollback both use with `secrets: inherit`, so
  the env file and the roll steps cannot drift between them. The forward
  deploy now also sends the host the files of the commit it built rather
  than main's tip.
- **No schema push.** On MongoDB a push only makes collections and indexes
  match the schema; it never changes a document. Older code ignores fields
  it does not know, and an extra index costs nothing. Pushing the older
  schema would drop the newer version's indexes while the `Deployed-Sha`
  marker still named the newer version, so the next forward deploy's gate
  would see no change and skip the push: the exact silent miss ADR-0012 was
  written to end. See the 2026-10-15 amendment of ADR-0012.
- **A tripwire, not a gate.** The rollback diffs `prisma/schema.prisma`
  between the live and target deployed commits
  (`scripts/ci/schema-rollback-tripwire.sh`). Anything the target declares
  that the live version lacks, a removed or retyped field or a dropped
  index, is what the live version took away and the older code may need.
  That blocks the run with the diff in the summary; a `force` input
  overrides it and is recorded. Additions by the live version pass.
- **No automatic second rollback.** The remote script's health-failure
  reflex re-pulls the digests it found on the host, which in a rollback is
  the version being escaped. With `ROLLBACK_RUN=true` a failed health check
  exits non-zero and leaves the containers as they are, so the run is red
  rather than green with the bad version back.
- **Concurrency.** The rollback shares `cicd-main` with the forward deploy
  and cancels in progress: the operator has decided the older version wins.
- **No release commit, no tag.** A rollback leaves `package.json`,
  `CHANGELOG.md` and the git tags alone. The run summary records the
  operator, the live version before, the target, and the deployed commit.

## Considered options

- **Host-only undo** from `.deploy/digests.json`: works today without
  forward changes, but it is a one-step toggle (a second run re-deploys the
  bad version) and the only record of "previous" lives on the server.
- **Scrape digests from a past deploy run's logs**: fragile, and the logs
  expire too.
- **Push the target's schema and move the marker**: correct for the gate,
  but it writes a commit to main from the rollback, bringing the slowest
  and flakiest part of the forward deploy into the two-minute path.
- **Require a reviewer via a GitHub environment**: every rollback would wait
  for a second person, which on a team of one is an extra click and on a
  bad night is the step that gets forgotten. A wrong click deploys a
  version that passed its own health check, undone by another click.

## Consequences

- Versions deployed before this change carry no `v*` image tag and cannot
  be targets. The first rollback is possible after the first forward
  deploy that runs the new version-bump step.
- The forward deploy's `verify-deployment` job and its fixed 30-second
  sleep are gone; health is verified inside the shared roll with the
  retrying script, right after the remote script's own check.
- The `prisma/AGENTS.md` rule that a version must be readable by its
  predecessor (expand then contract) is what keeps a one-step rollback safe
  by construction. The tripwire catches the rule being broken.
- A rollback across a version that already wrote documents the older code
  cannot read is not fixed by any rollback. Fix forward, or run a data
  script.
- The resolve job needs the workflow token to list package versions
  (`packages: read`); the roll needs `packages: write` to move `latest`.
