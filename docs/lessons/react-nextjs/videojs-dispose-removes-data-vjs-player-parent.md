# video.js dispose() removes the data-vjs-player parent — never render it with React

With player-element ingest (a `data-vjs-player` parent), video.js adopts that
parent as the player root (`el_ = tag.parentNode`) and `player.dispose()`
removes it from the DOM. If React rendered that parent, the effect run after a
dispose — a StrictMode remount in dev, or a prod `src` change (e.g. a playlist
advancing between videos) — appends the new player into a detached node: the
player initializes, logs only `VIDEOJS: WARN: The element supplied is not
included in the DOM`, and renders nothing. Create the `data-vjs-player`
container inside the effect, fresh per run, under a React-owned host div
(`video-player-surface.tsx`), so dispose only removes video.js-owned DOM. Keep
fake players in specs DOM-faithful (dispose removes the ingest parent) or unit
tests can't see this class of bug. `media-player-controls.tsx` (audio) still
has the React-rendered pattern — the local-dev failure of
`player-volume-persistence.spec.ts` is this bug, not a spec problem.
