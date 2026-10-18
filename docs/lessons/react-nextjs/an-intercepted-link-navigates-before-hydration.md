# An intercepted link navigates before hydration

A link whose plain click is intercepted to open a modal is still a real
`<a href>` in the server markup. Until the client bundle has hydrated it,
nothing calls `preventDefault()`, so a click follows the href.

## What failed

The latest-release title on `/artists` and `/artists/<slug>` opens the
release's listening modal in place, playing track 1 from the click (#897,
ADR-0023). Its href was the release deep link,
`/releases?artist=<slug>&release=<id>`, kept for modified clicks. Visitors
reported that the click took them to `/releases`, where the modal opened
paused (#900). A deep link opens it paused by design.

On 2026-10-18 a Playwright probe held every `/_next/static/chunks/**`
script and clicked the title. On both the dev server and a local
production build, the click landed on the deep link and the modal sat
paused (`currentTime` 0). A click after hydration played in place.

## Why the specs did not see it

Every spec waited for `aria-haspopup="dialog"`, which appears only once
hydrated, before it clicked. That wait is right for the hydrated
behaviour, but it hides the window a real visitor clicks in on a slow
phone. None of the specs asserted that audio played either.

## The fix

Before hydration the title renders as a `<button type="button">` with no
href and the same click handler. A click before the JavaScript runs does
nothing, and React replays a click made during hydration to the handler.
Once `useHydrated()` is true, the title is the `next/link` with the deep
link, so modified clicks still open it in a new tab. jsx-a11y rejects an
`<a>` with an `onClick` and no href (`anchor-is-valid`, `preferButton`),
and the repo never suppresses lint, so the pre-hydration element is a
button.

A button box is atomic. Even with `display: inline` it stays one box, so a
long title jumps to its own line and the hydration swap reflows it. The
button is `display: contents` instead, and its text is an inline `<span>`
carrying the link's classes and `cursor-pointer`. Measured in Chromium, the
span wraps into the same line boxes as the link. The cost is that a
`display: contents` button cannot take keyboard focus, the same as the
href-less `<a>` it stands in for, and only until hydration.

## Rules

- For a link whose plain click is intercepted, decide what a click before
  hydration should do. A server-rendered href is followed.
- Cover that window in E2E: hold the client chunks with `page.route`,
  filtering on `resourceType() === 'script'`, and assert on the server
  markup. Do not hold stylesheets: the dev server serves CSS from the same
  `/_next/static/chunks/` path, and a pending stylesheet stops the HTML
  parser at the next inline script, so the page never renders.
- A spec that waits for a hydration marker before clicking proves the
  hydrated path only. Say so in the spec, and add the unhydrated case.
- When a click should start playback, assert playback (`currentTime > 0`
  under `blockAutoplayWithoutGesture`), not only that a player rendered.
- `bio-release-link.tsx` and the collection row (`collection-list.tsx`)
  still server-render the deep link as their href, so they still follow it
  before hydration.
