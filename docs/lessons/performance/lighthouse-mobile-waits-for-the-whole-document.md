# Lighthouse mobile FCP/LCP wait for the whole document, so document bytes are the lever

On 2026-10-14 the production home page scored 65 on a mobile Lighthouse run
(FCP 4.6 s, LCP 7.3 s) although the LCP banner was preloaded from the
`<head>` and the observed TTFB was ~300 ms. The trace showed the preload
discovered 80% of the way through a 544 KiB (gzipped) document, and the
"load delay" phase of the LCP was 3.5 s.

Lighthouse scores a simulated timeline (Lantern), not the observed one. In
that model a request the parser discovers cannot start, and nothing can
paint, until the entire document has arrived at 1.6 Mbit/s with 150 ms
round trips. Every kilobyte of HTML therefore moves FCP and LCP by ~5 ms,
whatever the real browser streams. The 544 KiB came from:

- `experimental.inlineCss`: Next writes the single Tailwind + video.js sheet
  (232 KiB raw) into every document three times — the head `<style>` and
  two copies in the RSC payload (its docs call the duplication a known
  limitation). ~130 KiB gzipped per page, including `/about`.
- A release whose `coverArt` was a 191 KiB base64 JPEG. It rode in the
  `<img src>` and again in the dehydrated query state: ~380 KiB gzipped.
  `scripts/backfill-coverart-urls.ts` exists for exactly this; the admin
  paths already refuse anything but an HTTPS URL.

Two more first-paint costs hid behind "both treatments render and CSS
picks one":

- A `display: none` `<img>` is still fetched, at whatever priority its
  hints ask. The desktop banner strip (`hidden md:block`) cost phones five
  eager requests, one at high priority, and the `md:hidden` carousel cost
  desktops its full-width current slide. `BreakpointImage` (a `<picture>`
  whose first `<source>` serves a blank data URI on the hidden breakpoint)
  stops both.
- A CSS background is fetched at high priority as soon as its element is
  styled — in the viewport or 3000px below it — and cannot be told
  otherwise; the 77 KiB particle SVG behind the masthead and the footer
  competed with the LCP banner. As `<img>`s (`fetchpriority="low"` in the
  masthead, `loading="lazy"` in the footer) it yields, and only once both
  stop painting it as a background: the footer's rule alone still fetched
  it at high priority on first paint.

Rules:

- Before touching code, measure the document: `curl` the page and count
  the `<style>`, `__next_f.push` and `data:` bytes. Fix the biggest line
  item; the simulation makes HTML bytes worth more than any other asset.
- Treat a `data:image` in server HTML as a defect in the data. Run the
  cover-art backfill (`pnpm run backfill:coverart -- --execute`) rather
  than working around it in the page.
- Reproduce locally on the standalone build against the Docker Mongo
  (`e2e/AGENTS.md`), with `NEXT_PUBLIC_BANNER_INTERVAL` and the seeded
  `carousel-rotation-interval` setting raised to production's 6.5 s first:
  the seed pins the carousel to 3 s, and a rotation inside the trace makes
  Lighthouse attribute the LCP to a lazily loaded clone slide (LCP 4.9 s
  with "lcp-lazy-loaded" failing, on a page whose banner loaded in 300 ms).
  `pnpm dlx lighthouse@12 <url> --only-categories=performance --output=json`
  mirrors the DevTools default (mobile, simulated throttling); add
  `--preset=desktop` for the desktop pass.
- Read the LCP phase table before the opportunity list. "Load delay" is the
  document; "render delay" with an early observed paint is the pessimistic
  graph counting every byte that landed before the paint — neighbouring
  carousel slides, duplicate URLs for one asset (`/media/x.svg` versus the
  CDN-prefixed `x.svg` are two downloads), scripts.
- `legacy-javascript` and the other diagnostics carry no score weight; only
  FCP, Speed Index, LCP, TBT and CLS do. The 12 KiB of `Array.prototype.at`
  polyfills live in Next's own app-router chunk and are not ours to remove.
