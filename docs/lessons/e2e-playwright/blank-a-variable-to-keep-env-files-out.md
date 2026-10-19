# Blank a variable to keep the env files out

Playwright starts the web server with `{ ...process.env, ...webServer.env }`,
and `next dev` / `next start` then load the worktree's copied `.env*`
through `@next/env`. `@next/env` fills a key only when
`typeof process.env[key] === 'undefined'`. Leaving a key out of
`webServer.env`, or setting it to `undefined` (the spawn drops it), still
lets the copied `.env` supply the live value. Only an empty string `''`
counts as defined, so Next.js leaves it alone.

During job #920 (2026-10-19) four `videos.spec.ts` play and
picture-in-picture tests failed locally and passed in CI. CI sets no
`CLOUDFRONT_*` variables, so `signStreamUrl` returns `null` and the player
falls back to `/e2e/video/e2e-video.mp4`. A local run took the CloudFront
signing keys from the copied `.env`, so each video got a signed URL on
`cdn.fakefourrecords.com`, which the CDN fixture answers with a PNG.

Rules:

- When CI lacks a variable that the env files may carry, blank it by name
  in `webServer.env` with `''` (`playwright.config.ts` does this for
  `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY_BASE64` and
  `CLOUDFRONT_DISTRIBUTION_ID`). Never omit it and never set it to
  `undefined`.
- Never read, print or grep an `.env*` file to find out what it holds.
  Blank the variable whether or not the file sets it.
- A spec that passes in CI and fails locally on behaviour an env variable
  switches points here first. Compare the web server's env with CI's job
  env by variable name.
