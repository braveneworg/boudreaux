# CI Build Artifact & Cache Strategy

This document explains how the CI pipeline produces and reuses the Next.js build output to avoid redundant work in the deploy workflow while keeping images reproducible.

## Goals

- Run lint, type check, tests, and the Next.js build exactly once per commit (in `ci.yml`).
- Reuse that build output in `deploy.yml` without rebuilding or re-running validations.
- Minimize artifact size to speed up upload/download.
- Accelerate subsequent builds with deterministic caching.

## What We Package

Instead of tarring the entire `.next` directory, CI packages only the runtime pieces required by the Next.js standalone output:

```
.next/standalone
.next/static
```

These two directories are sufficient to run the standalone server (`server.js`) plus all static assets. They’re archived as `next-build.tar.gz` and uploaded as the `nextjs-build` artifact.

## Why Not the Entire .next?

Packaging the full `.next` tree increases artifact size and transfer time without adding runtime value (e.g., build traces, type manifests, intermediate cache layers). Smaller artifacts:

- Reduce network transfer time during deploy.
- Lower risk of hitting artifact storage limits.
- Speed up start of downstream jobs.

## Cross-Workflow Retrieval

`deploy.yml` is triggered via `workflow_run` after `ci.yml` succeeds. It:

1. Uses a guard (GitHub Script) to verify the `nextjs-build` artifact exists on the triggering CI run.
2. Downloads the artifact directly using the triggering run ID.
3. Re-uploads it inside the deploy workflow as `nextjs-build-deploy` so parallel jobs (`sync-cdn`, `build-images`) can fetch it independently.

## Docker Build Behavior

The `Dockerfile` checks (in order):

1. `next-build.tar.gz` present → extract and use.
2. Pre-existing `.next` directory → use as-is.
3. Otherwise → run a fresh `next build` (with a fallback Prisma generate only in this path).

This ensures:

- No rebuild occurs during deploy if CI produced the artifact.
- Reproducibility: the image matches what was tested.

## Prisma Client Generation

`prisma generate` is skipped when a prebuilt artifact is used (the generated client is already included in the standalone output). It only runs when a full build from source is required.

## Next.js Build Cache

CI uses `actions/cache` on `.next/cache` keyed by:

```
${{ runner.os }}-next-cache-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.[jt]s?(x)') }}
```

This hybrid key ensures invalidation when:

- Dependencies change (`package-lock.json`)
- Source files change (hash of JS/TS/JSX/TSX)

Restore keys allow partial reuse if only some parts changed (falls back to the OS prefix).

## Permissions & Artifact Guard

- `deploy.yml` grants `actions: read` so it can enumerate artifacts on the triggering run.
- Guard step logs the CI run URL and fails early with a clear message if `nextjs-build` is missing.

## Common Failure Modes & Remedies

| Symptom                              | Cause                                     | Fix                                                     |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| Deploy guard fails: missing artifact | Build job failed or artifact step removed | Check CI run logs; ensure build job uploads artifact    |
| Docker rebuilds Next.js              | `next-build.tar.gz` absent or renamed     | Confirm artifact name and packaging step in CI          |
| Larger-than-expected artifact        | Accidental inclusion of full `.next`      | Verify packaging step only tars `standalone` + `static` |
| Slow builds after dependency bump    | Cache miss (lockfile change)              | Expected; cache warms with next run                     |

## Potential Future Enhancements

- Add `NEXT_DISABLE_SOURCEMAPS=1` during CI build if source maps aren’t needed in production.
- Push build cache into a remote BuildKit cache (registry-based) for multi-runner acceleration.
- Add hash-based integrity check (store SHA256 of `next-build.tar.gz` and verify in deploy).
- Extend artifact retention if delayed manual deployments become common.

## Quick Reference

| File                           | Responsibility                                    |
| ------------------------------ | ------------------------------------------------- |
| `.github/workflows/ci.yml`     | Produce `next-build.tar.gz` and upload artifact   |
| `.github/workflows/deploy.yml` | Verify, download, re-upload, and consume artifact |
| `Dockerfile`                   | Consume prebuilt artifact or build fallback       |

## Contributor Tips

- If you modify build output structure (e.g., change Next output mode), update the packaging list.
- Keep the artifact name stable (`nextjs-build`) to avoid breaking the guard logic.
- Avoid adding dev-only traces or analysis tools into the packaged tarball.
- Run a deploy dry-run via `workflow_dispatch` if adjusting artifact logic.

---

Maintained automatically with CI optimization changes—update this file alongside any changes to build/package steps.
