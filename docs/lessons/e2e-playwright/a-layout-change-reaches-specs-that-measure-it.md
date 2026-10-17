# A layout change reaches every spec that measures the element

On 2026-10-17 (PR #895) the `/videos` toolbar gained a "(N videos)" count
to the right of the search, in the poster column. `videos.spec.ts` was
extended and run, and it passed. CI then failed shard 2 on
`computed-style.spec.ts`, which pins design decision #768: the videos
search is as wide as the poster column. The count had taken 70px of it.

The grep before pushing looked for the toolbar's `data-slot`, which no spec
uses. The computed-style spec finds the search by its accessible name,
`Search videos`, so the grep missed it.

Rules:

- Before pushing a change to an element's size or position, grep `e2e/`
  recursively for every locator the element answers to: its accessible
  name, its role and name, its test id and its `data-slot`. Run each
  matching spec, not only the one you edited.
- `computed-style.spec.ts` pins shipped design decisions by number. A
  failure there means the change revisits that decision. Say so in the PR,
  and update the assertion to the new design rather than loosening it.
