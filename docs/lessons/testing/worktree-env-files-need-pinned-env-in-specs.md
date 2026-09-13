# Worktrees carry real env files — pin env-derived values in specs

Every worktree gets copies of the main checkout's `.env*` files (root
`AGENTS.md`), and Vitest runs there see their values. A spec that only passes
while a variable is absent fails in every worktree: the poster-candidate case
in `src/lib/actions/create-video-action.spec.ts` built `my-bucket` S3 URLs,
the real `AWS_S3_BUCKET_NAME` made `extractS3KeyFromUrl` reject them, and the
candidates were silently dropped — the only failure across 14,451 tests with
env files present (2026-09-13). CI has no env files, so it never catches this.

Never delete a worktree's env files to get the gate green. When an
expectation depends on an env-derived value, pin it per test with
`vi.stubEnv` in `beforeEach` (see `stub-env-in-before-each-not-before-all.md`),
and run new env-reading specs in a worktree that has its env files.
