# A sourceless gestured play() must be followed by pause()

Priming a media element inside a click (`load()` + `play()` with no source —
the Safari/Firefox autoplay-blessing pattern from PR #708) does NOT reject:
per spec the element flips `paused` to false, fires its ONLY `play` event
right then, and playback auto-resumes once video.js attaches the source. The
late-attaching video.js therefore never sees a `play` event, `handleTechPlay_`
never runs, and the UI is stranded not-started — poster overlay + big play
button covering a video that is audibly playing (prod bug in the /videos
modal, v4.299.0). Always `pause()` immediately after the priming `play()`:
the element hands off paused, the surface's deferred `play()` fires a real
`play` event, and the gesture blessings survive the pause (verified
empirically in Chromium with `--autoplay-policy=user-gesture-required`,
Firefox with `media.autoplay.blocking_policy=2`, and WebKit).

Two things masked it pre-merge. At the time, dev StrictMode's double-mount
burned the one-shot primed element: the fallback element was fresh and
paused, so dev behaved correctly and prod's single mount was the broken path.
The surface has since been changed to keep its player across that replay
(#841, see
[`one-shot-handoff-in-an-effect-is-not-strictmode-safe.md`](one-shot-handoff-in-an-effect-is-not-strictmode-safe.md)),
so dev now takes the same path as prod. And both the E2E spec and the
prod-standalone probe asserted media state (`paused`, `currentTime`) instead
of player UI state (`vjs-has-started`). When a playback bug is UI-vs-media
divergence, assert the UI class, not the media element.
