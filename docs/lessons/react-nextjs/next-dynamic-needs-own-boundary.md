# App Router `next/dynamic` only gets its own Suspense boundary with `ssr: false` or `loading`

The App Router implementation of `next/dynamic` (`shared/lib/lazy-dynamic/
loadable.js`) wraps its `React.lazy` in a Suspense boundary ONLY when
`ssr: false` or a `loading` component is passed:

```js
const hasSuspenseBoundary = !opts.ssr || !!opts.loading;
const Wrap = hasSuspenseBoundary ? React.Suspense : React.Fragment;
```

A bare `dynamic(() => import('./x'))` therefore suspends up to the nearest
ancestor boundary. On a page whose only ancestor boundary is the route's
`loading.tsx`, the first render of that lazy component — e.g. opening a popover
whose body is lazy — makes React hide the ENTIRE page (`display: none` on every
host node in the boundary, including hoisted `<link>`/`<script>`), show the route
skeleton, and re-reveal once the chunk lands. Layout effects are torn down and
re-run across that hide/reveal, so imperative widgets such as the video.js audio
player get disposed and re-created. Users report it as "the whole page
re-renders / flickers when I open the menu" (featured-player add-to-playlist
kebab, 2026-09-12).

Rules:

- Every `next/dynamic` call site passes `ssr: false` (when the component is
  never server-rendered — mount-gated or interaction-only) and/or a `loading`
  component. Prefer a `loading` fallback that reserves the real footprint so
  the container (popover, dialog, row) doesn't re-measure and jump.
- Unit tests can only catch this with the app-dir implementation: Vitest
  resolves the bare `next/dynamic` specifier to the pages-router module, which
  always supplies a boundary. Mock it to `next/dist/shared/lib/app-dynamic` and
  gate the lazy module's mock factory on a promise, then assert the surrounding
  `<Suspense>` fallback never appears while the chunk is in flight
  (`add-to-playlist-menu.suspense.spec.tsx`).
- Reproducing in an automation-driven Chrome tab: a background (hidden) tab
  never fires `requestAnimationFrame`, and React 19's streamed Suspense reveal
  waits on it, so the page looks server-rendered but never hydrates. Bring the
  tab to the foreground or shim rAF for the session; do not chase it as an app
  bug.
