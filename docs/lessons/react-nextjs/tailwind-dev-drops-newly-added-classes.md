# Turbopack dev drops newly-added Tailwind classes from the generated CSS

Tailwind v4 under `next dev --turbopack` generates its utility CSS from a scan
of the source files. On an **incremental** rebuild the scan can miss a utility
that no file used before, or silently drop one it emitted earlier. The class
stays in the HTML; only the rule is missing, so nothing errors — the element
just renders with the utility doing nothing.

Seen twice while building the artists-index card (2026-09-20):

- `line-clamp-4` (first use in the repo — every other call site used 1/2/3):
  `getComputedStyle(el).webkitLineClamp` read `none` and `display` stayed
  `block`, while `.line-clamp-3` was present in the sheet.
- `lg:w-3/4` on `artists-content.tsx`: after editing an **unrelated** file
  (`artist-list-card.tsx`), `.lg\:w-3\/4` vanished from the sheet entirely
  (`css.indexOf('lg\\:w-3\\/4') === -1`), so the card column silently went
  back to full width. It had rendered correctly minutes earlier.

Both came back on a clean rebuild — `rm -rf .next`, restart, hard reload — so
neither was a code bug. A production `next build` scans fresh and is unaffected.

Rules:

- Never conclude a Tailwind class "doesn't work" from the dev server. Before
  changing the code, `rm -rf .next`, restart `next dev`, and **hard reload**
  (`cmd+shift+r`) — the dev CSS chunk keeps a stable URL
  (`[root-of-the-server]__*.css`), so a normal reload serves the browser's
  cached copy even after the server regenerates it.
- Verify a layout change by reading the served stylesheet, not the DOM:
  `curl -s "$(curl -s <page> | grep -o '/_next/static/chunks/[^"]*\.css' | head -1)"`
  piped through `grep` for the escaped class (`lg\\:w-3\\/4`). The class being
  in `element.className` proves nothing.
- Cross-check the computed style (`getComputedStyle`), not just the markup,
  whenever a utility is new to the repo.
