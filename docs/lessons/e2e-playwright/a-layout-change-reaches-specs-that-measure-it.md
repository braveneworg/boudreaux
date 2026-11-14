# A layout change reaches every spec that measures the element

On 2026-10-17 (PR #895) the `/videos` toolbar gained a "(N videos)" count
to the right of the search, in the poster column. `videos.spec.ts` was
extended and run, and it passed. CI then failed shard 2 on
`computed-style.spec.ts`, which pins design decision #768: the videos
search is as wide as the poster column. The count had taken 70px of it.

The grep before pushing looked for the toolbar's `data-slot`, which no spec
uses. The computed-style spec finds the search by its accessible name,
`Search videos`, so the grep missed it.

It happened again on 2026-10-30 (PR #928): the release cover grid went
from four columns to three. The grep before pushing looked for the old
class names (`grid-cols-4`, `17.25rem`) and the old caption text, and the
caption tests in both grid specs were updated. CI then failed shard 3 on
the same file's layout loop, `covers ${columns} to a row at ${width}px`,
which reads the column count from `getComputedStyle(...).gridTemplateColumns`
and names the count in a template literal — no class name, no caption, no
locator string to match. Docker was down, so the specs were not run
locally either, which would have caught it in seconds.

Rules:

- Before pushing a change to an element's size or position, grep `e2e/`
  recursively for every locator the element answers to: its accessible
  name, its role and name, its test id and its `data-slot`. Run each
  matching spec, not only the one you edited.
- A grid or column change also needs a grep for the measurement words:
  `to a row`, `columns`, `gridTemplateColumns`, `toBeCloseTo`,
  `boundingBox`, `edgesOfAll`. A spec that measures layout names the
  number, not the class.
- When the spec file you edited for one reason has a layout loop further
  down, read the whole file. The caption test and the column test lived
  150 lines apart in the same file.
- If the Docker Mongo is down, start it before pushing a UI change that
  existing E2E specs cover; "not run locally, watch CI" is a note for a
  flake investigation, not a substitute for the run.
- `computed-style.spec.ts` pins shipped design decisions by number. A
  failure there means the change revisits that decision. Say so in the PR,
  and update the assertion to the new design rather than loosening it.

## A shared element is checked in its fullest state, and where nothing measures it

On 2026-11-14 (PR #950) the desktop menu gained a sixth top-level entry,
"Community". It was looked at signed out, at 1440px, where five entries fit
with room to spare, and the header specs passed on both servers. CI then
failed shard 1 on `admin-nav.spec.ts`, a spec about a different nav: its
click on "Notifications" was taken by the header's "Contact Us" link.

A signed-in visitor also has "My Collection". Six entries needed 990px of
the 976px the menu's insets leave, at every desktop width, so the row
wrapped and its second line hung below the header over the page. No spec
measured the menu's row count. The local run of `admin-nav.spec.ts` passed
with the row wrapped; where the wrapped link landed against the admin nav
differed by a few pixels between the two machines.

- Before adding to a shared element (the header, the footer, a toolbar),
  list the states that add to it too (signed in, admin, a long name, the
  narrowest width it shows at) and look at the fullest one. Signed out at a
  comfortable width is the emptiest.
- When an element can wrap or overflow and nothing measures it, add the
  measurement with the change: `desktop-header.spec.ts` now reads the first
  and last entries' tops in one frame, signed in, at 1280px and 1440px.
- A click that another element intercepts ("<a …> intercepts pointer
  events" in the call log) is an overlap. Read which element took it before
  suspecting the spec: here the call log named the header's link.
- A spec that fails only in CI on an overlap is not a flake. The layout was
  wrong on both machines and one of them got lucky.
