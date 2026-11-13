# A spec that skips itself needs one run where it cannot

**What happened (2026-11-12).** The re-encode Lambda's 28 real-ffmpeg specs
are wrapped in `describe.runIf(hasMediaTools)`, so the suite still passes on a
machine without ffmpeg. The CI runner has no ffmpeg either. The first CI run
of PR #946 was green with `307 passed | 28 skipped`: the specs that prove a
playlist and a concat script are refused had run only on one laptop, and the
PR description counted them as verification. Nothing failed, so nothing
pointed at it; it was found by reading the job log.

**The rule.** A self-skipping spec is only a check where its condition is
forced to hold. Give it an environment variable that turns "the tool is
missing" from a skip into a failure, and set that variable in CI after
installing the tool.

**How to apply.**

- `REQUIRE_MEDIA_TOOLS=1` makes `submission-reencoder/src/integration.spec.ts`
  fail when ffmpeg or ffprobe is missing. `ci.yml` and
  `deploy-submission-reencoder.yml` set it, after
  `.github/actions/setup-media-tools` copies both binaries out of the image
  the Lambda's Dockerfile pins.
- After adding a `runIf` or `skipIf` spec, read the first CI log for its
  `skipped` count before calling the PR verified. A green check does not say
  how many tests ran.
- Report a number of passing tests only for the place they ran.
