# ADR-0012: Deploy pushes the Prisma schema when it changes

- **Status**: Accepted
- **Date**: 2026-09-26

## Context

No workflow ever applied `prisma/schema.prisma` to production. CI, the
Dockerfile and `postinstall` run only `prisma generate`. MongoDB is
schemaless, so new optional fields worked without a push, and the gap stayed
invisible. An `@@index`, `@@unique` or new indexed collection, though,
deployed without its index. The fix was a manual `prisma db push` after
merge, flagged by hand after every schema PR (#704, #749, #772), and easy to
forget (#751).

The deploy runs on `workflow_run` after CI. The commit it ships is
`workflow_run.head_sha`. Main's tip can already be newer, and version-bump's
release commit and `v*` tag land on that newer tip. So "the latest tag" is
not "the last deployed commit". If PR B merges while PR A deploys, A's tag
sits on a tree that already has B's schema. A tag-to-head diff for B's
deploy would then see no change and skip B's indexes.

The runtime image is a Next standalone build with no Prisma CLI, so the
push cannot run on the EC2 host.

## Decision

**A `schema-push` job in `deploy.yml` runs `prisma db push --skip-generate`
from the GitHub runner, before the container roll, and only when the schema
differs from the last deployed commit.**

- **Marker.** version-bump's release commit gets a second paragraph,
  `Deployed-Sha: <workflow_run.head_sha>`. A release commit exists only
  after the health check passed, so the trailer names a commit that is
  really live.
- **Gate.** `scripts/ci/schema-push-gate.sh` finds the newest commit on
  `origin/main` that github-actions[bot] authored with a
  `chore(release): v…` subject and a `Deployed-Sha` trailer. It compares
  `prisma/schema.prisma` at that SHA with the head being deployed. That is a
  tree comparison, not a commit range, so merge order and rollbacks don't
  matter.
  - No marker anywhere means **skip**. That is the state before the first
    release that writes one. The pending manual push is done by hand once.
  - A marker that is not a commit in the clone means **push**. An extra push
    is idempotent, and a missed index is silent.
  - A newest release commit without a trailer (a hand-made release) falls
    back to the newest one that has a trailer. That diff is wider, never
    narrower.
- **Order.** `schema-push` needs the image and asset jobs, so a failed build
  never touches the database. `deploy` needs `schema-push`, so new code
  never runs against a stale index set, and a failed push stops the deploy
  before any host change.
- **No `--accept-data-loss`.** A destructive change makes Prisma exit
  non-zero in a non-interactive run. The deploy stops, and a human applies
  that change by hand.
- **Secret scope.** `DATABASE_URL` is set only on the push step, and the job
  has `contents: read` only.

## Consequences

- Schema PRs no longer need a manual post-merge push. The runbook
  (`docs/instructions/official-setup-instructions.md` §8) says so.
- The production database must accept connections from GitHub-hosted
  runners, whose IPs change. If the Atlas access list is IP-restricted, the
  first gated push fails the deploy safely, before the roll.
- `db push` makes indexes match the schema, so an index that exists only in
  production can be dropped on the next push. Prod indexes must match the schema
  before this goes live.
- A deploy whose version bump is skipped (`version:skip`, or no PR) writes
  no marker. The next deploy diffs against an older marker, which can only
  add a push, never lose one.
- Re-running an old deploy (a rollback) pushes the older schema when it
  differs, so indexes follow the code that is running.
- Until the first marked release, deploys skip the push. Any schema change
  merged before then needs the manual push once.
