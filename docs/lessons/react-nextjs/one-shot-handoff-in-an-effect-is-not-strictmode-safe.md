# A one-shot handoff consumed in an effect is not StrictMode-safe

## What failed

On the dev server, picking a video from the `/videos` search opened the play
modal with the player paused: `.video-js` never got `vjs-has-started` and
`currentTime` stayed 0 (#841). The production build played. The search-pick
case had been left out of the E2E suite since #840, because a spec must pass
on both servers.

## Why

`usePrimedMediaHandoff` creates a media element inside the click and starts
it there. `takeMediaEl()` hands that element over once and returns `null`
ever after. `VideoPlayerSurface` called it inside the effect that builds the
video.js player.

React StrictMode is on by default in the App Router and acts only in
development. It replays the effects of a newly mounted component: effect,
cleanup, effect. So on the dev server:

1. The first run took the primed element and built a player on it.
2. The cleanup disposed that player. video.js `dispose()` removes the
   element's `src` and calls `load()`, which ends its playback.
3. The second run got `null`, created a fresh element, and fell back to a
   deferred `play()`.

The production build runs the effect once, so the primed element was adopted
and played. Any resource that can be taken only once is lost the same way
when an effect takes it: the replay's second run has nothing left to take.
Taking the element back after the cleanup would not have helped here, since
the dispose had already emptied it.

## Why the unit tests did not see it

- No case in `video-player-surface.spec.tsx` rendered inside `<StrictMode>`.
- The handoff cases passed `takeMediaEl={() => primed}`. That stub returns
  the element on every call. The real supplier returns it once. Under a
  replay the stub would have handed the same element to the second run, so
  even a StrictMode case would have passed.
- The fake player's `dispose()` removed the `data-vjs-player` parent but left
  the element's `src`, so a disposed element still looked usable.

## The card path and the search path

Not established. On 2026-10-10, before the fix, one dev-server run of
`videos.spec.ts` passed "one click plays a video under a strict autoplay
policy" (the card) and failed "picking a search suggestion plays the video
under a strict autoplay policy" on `vjs-has-started`. Both paths prime the
same way and both went through the replay, so both were on the fallback. Why
the fallback's deferred `play()` started playback from the card and not from
the search was not found. The one structural difference seen in the code is
that the search's dialog mounts already open, while a card's dialog is
mounted closed and then opened. That was not tested as a cause.

The fix does not depend on the answer: with the player kept across the
replay, neither path reaches the fallback.

## The fix

The effect's cleanup marks the player released and leaves the dispose to a
microtask. The replay's second run comes in the same synchronous pass, before
any microtask, finds the released player built from the same inputs, and
keeps it. A real unmount has no second run, so the microtask disposes the
player within the same task. A changed `src` disposes the old player at once
and builds a new one.

A timer or an animation frame would not do in place of the microtask: a
hidden tab fires no animation frames, and a source-primed element is audibly
playing while it waits.

## Rules

- An effect that consumes something only obtainable once (a primed media
  element, a transferred stream, a one-time token) must survive effect,
  cleanup, effect. Either the cleanup must not destroy what the first run
  built, or the resource must be given back intact. If the cleanup calls a
  library's teardown, read what that teardown does to the resource first.
- Test such a component inside `<StrictMode>`, as
  `media-player.spec.tsx` "keeps the player element attached under
  StrictMode double-mount" does.
- Give the test the real supplier, or a stub with the same one-shot
  contract. A stub more generous than the real thing hides the bug the test
  is for.
- Keep a fake's teardown as destructive as the real one. See
  [`videojs-dispose-removes-data-vjs-player-parent.md`](videojs-dispose-removes-data-vjs-player-parent.md).
- A playback bug seen only on the dev server is still a bug: it hides
  regressions in local testing and keeps the case out of the E2E suite.
- The audio handoff (`use-primed-audio-handoff.ts`,
  `create-player-initializer.tsx`) takes its element the same one-shot way.
  Whether it misbehaves on the dev server was not checked.
