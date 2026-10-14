# A Radix hover menu closes across any gap between trigger and content

Radix `NavigationMenu` opens a drawer on pointer move over its trigger and
closes it 150ms after the pointer leaves both the trigger and the content.
That close delay is a literal in the root (`startCloseTimer` in
`@radix-ui/react-navigation-menu`), not a prop, and the drawer unmounts at
once when it fires: the exit animation is gated behind the
`group/navigation-menu` marker that `ui/navigation-menu.tsx` omits.

The desktop drawers hang `top-full mt-3` below their trigger, which is a 12px
strip that belongs to neither. A pointer that crosses it in more than 150ms
loses the drawer, and the press it was about to make lands on whatever the
drawer was covering. On `/releases` the drawer's Artists row sits over the
page's search button (both about 195px from the top at scroll zero), so
"clicking Artists" opened the release search list and never navigated. It
was reported on 2026-10-14 as a z-index or form-element problem; hit-testing
on the open drawer returned the link, and the header's stacking context is
above the page, so neither was it.

Rules:

- A hover-opened Radix drawer must have no dead strip between its trigger
  and its content. Keep the visual margin and bridge the hit area with a
  pseudo-element on the content (`before:absolute before:inset-x-0
before:-top-4 before:h-4`, as `desktop-menu-drawer.tsx` does). A
  pseudo-element is hit-tested as its element, so crossing it keeps the
  content's pointer-enter clearing the close timer. Make it a little taller
  than the margin when the content is rotated.
- Do not try to lengthen the delay: `delayDuration` and `skipDelayDuration`
  only shape the open, and the close delay has no prop.
- "A click on X does Y instead" where Y sits under X in an overlay is the
  overlay having closed before the press, until an event log says otherwise.
  Log `pointerdown`, `click` and a `MutationObserver` for the overlay's
  removal on the live page before touching z-index.
- `desktop-header.spec.ts` "keeps the Music drawer open while the pointer
  crosses the gap to Artists" parks the pointer in the strip for 400ms and
  asserts `aria-expanded` stays `true`. It fails on the unbridged drawer every
  time, which is the test to run when touching the drawer's positioning.
