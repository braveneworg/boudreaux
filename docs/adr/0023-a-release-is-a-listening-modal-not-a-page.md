# ADR-0023: A release is a listening modal, not a page

- **Status**: Accepted
- **Date**: 2026-10-17

## Context

The home page spotlights, the `/releases` grid and the artist page's latest
release already play a release in the listening modal (`ReleasePlayDialog`)
in place. The release media player page, `/releases/[releaseId]`, was the
last place a release was a page of its own: the artists index card, the
searches, the collection, the generated bio links, the Stripe return URL
and the purchase email all sent the visitor there, away from what they were
browsing. The page also carried release notes and an "other releases by
this artist" carousel that nothing else showed.

## Decision

**A release is played in the listening modal wherever it is named. It has
no page; its permalink is the release deep link.**

- **The deep link is the permalink.**
  `/releases?artist=<slug>&release=<id>` lists the artist's releases with
  the listening modal open on that release. The page resolves the release
  on the server, and keeps it only when it is listed, credited to that
  artist (the `?artist=` filter's rule) and playable. Anything else shows
  the grid alone: no modal, no 404. Closing the modal replaces the URL with
  `/releases?artist=<slug>`, so back and refresh do not reopen it.
- **The modal is paused on arrival.** Nothing primes it, since a pasted link
  brings no gesture and browsers block audio without one. The visitor
  presses play. No effect primes it either: a one-shot handoff taken in an
  effect does not survive StrictMode
  (`docs/lessons/react-nextjs/one-shot-handoff-in-an-effect-is-not-strictmode-safe.md`).
- **The old URL redirects.** `/releases/<id>` is a 308 to the deep link on
  the album artist's releases. A release whose album artist is hidden
  (ADR-0015), or no listed release with that id, is a 404 that renders the
  themed "release not found" page. The proxy decides both before the page
  renders. Under the root and `/releases` loading boundaries, a page streams
  a `200` before a redirect or `notFound()` can set the status, and a route
  handler cannot render the themed page.
- **Every opener opens the modal in place.** These openers are the artists
  index card and the artist page's latest release, the home and `/releases`
  searches, a collection row and a bio's release link. A playable release
  opens on a plain left click, and its href, for modified clicks, is the
  deep link. A release with no MP3 track is plain text.
  - **The latest-release line carries its href only once hydrated**
    (amended 2026-10-18, #900). Before then the server markup is a
    link-styled button with no href, so a click before the JavaScript runs
    stays on the page, and one during hydration opens the modal. A click
    that followed the deep link landed on `/releases` with the modal paused,
    where the visitor expected it playing in place. Once hydrated, modified
    clicks still open the deep link.
- **Each release has its own accent.** It is a stable hash of the release id
  into the ten loud zine accents (`zineAccentForRelease`). The accent is the
  same on the server and the client, and the same from every opener this
  decision touches. The home spotlight row keeps yellow and its random draw,
  and the `/releases` grid keeps cyan.
- **The share row shares the deep link.** The home spotlight still shares
  the artist page.
- **The collection is the receipt.** The Stripe `return_url`, the purchase
  confirmation email (both copies) and the legacy
  `/api/releases/<id>/download` redirect lead to `/collection`. There, a
  purchase's listening modal downloads every format with no payment step.
  The free tier's cap-reached "Pay what you want" is a button that switches
  the download dialog to the paid path instead of linking to the page.
- **Bios link the deep link.** Generation writes it with the generated
  artist's slug. `pnpm run backfill:bio-release-links` rewrites stored
  `/releases/<id>` links in bio HTML and link-palette rows. It uses the
  album artist's slug, else the bio artist's.

## Alternatives rejected

- **Keep the page and add the modal beside it.** That leaves two ways to
  play a release, and every opener has to choose one.
- **Autoplay on arrival.** It fails in every browser that blocks audio
  without a gesture, and priming in an effect does not survive StrictMode.
- **Permalink without the artist** (`/releases?release=<id>`). The listening
  modal sits over a listing, and the artist's listing is the one a shared
  release belongs to. Without an artist, the modal would sit over the whole
  catalog.

## Consequences

- Release notes and the related-releases carousel are gone, with
  `GET /api/releases/[id]/related` and its service and repository reads.
- A bio link knows no stream URL before the release is fetched, so it opens
  the modal unprimed. Chrome starts it on its deferred `play()`, but Safari
  may open it paused.
- A release with a hidden album artist has no deep link on its own
  `/releases/<id>` URL. Its bio links fall back to the bio artist's slug.
- `revalidatePath` targets `/releases`. No path names a release page.
