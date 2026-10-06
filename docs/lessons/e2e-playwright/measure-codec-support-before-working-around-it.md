# Measure codec support before working around it

Playwright's Chromium decodes H.264 in MP4, VP9/Opus in WebM, and MP3.
On 2026-10-05, `canPlayType` in the bundled Chromium answered
`'probably'` for `video/mp4; codecs="avc1.42E01E"`, `video/webm;
codecs="vp9, opus"` and `audio/mpeg`.

A smoke inventory had assumed that Chromium has no H.264, so video
playback would need a WebM fixture served through a change to
`buildCdnUrl`. A unit test and a `cdn-url.ts` change were written for it
before a one-line probe showed the existing `public/e2e/video/e2e-video.mp4`
plays. The change was reverted unmerged.

Rules:

- Before you build a codec or media workaround, run
  `document.createElement('video').canPlayType(...)` in the Playwright
  browser and play the file.
- The E2E MP4 is 2 s long. A flow that needs frames later in the file
  (the poster sampler reads 3–10 s) uploads
  `e2e/fixtures/media/poster-source.webm` instead (12 s, VP9/Opus).
