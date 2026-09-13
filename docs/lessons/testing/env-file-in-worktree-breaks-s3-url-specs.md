# A `.env` in the worktree makes env-derived S3 URL specs fail

`src/lib/actions/create-video-action.spec.ts` ("includes candidates namespaced
to the pre-generated id") builds its expected poster-candidate URLs from a
fixed bucket/region. When a `.env`/`.env.local` is present in the worktree
(e.g. symlinked from the main checkout to run a dev server), the action reads
the real bucket, the namespacing check rejects the fixture URLs, and the
`posterCandidates` field is dropped — the spec fails deterministically (seed 42) with no relation to the change under test. Fresh worktrees have no `.env`
and pass.

Before running the gate or the git hooks in a worktree, remove any env files
you added for a dev server. If a spec's expectation depends on an env-derived
value, stub that value per test in `beforeEach` (see
`stub-env-in-before-each-not-before-all.md`) instead of relying on the
variable being absent.
