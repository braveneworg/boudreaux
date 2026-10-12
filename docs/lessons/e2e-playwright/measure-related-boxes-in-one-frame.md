# Measure related boxes in one layout frame

A layout assertion that compares two elements' boxes must read both boxes
from the same layout frame. Sequential `locator.boundingBox()` calls are
separate round-trips, and the page can reflow between them.

On 2026-10-12 `admin-artist-links.spec.ts` "a contact description has its
own line under the label and URL" failed on `main` in shard 1 of run
38188524412: the row's remove button measured 105px below the URL input it
shares a grid line with — geometrically impossible in a settled layout. The
trace showed the four `boundingBox()` reads spanning ~110ms while the bio
section's `next/dynamic` rich-text editor chunk arrived and mounted above
the Links region, pushing everything below it down between the second and
fourth read. The spec had passed on the PR branch and on every earlier
`main` run; nothing in the merged PR touched the form.

Read every box the assertion relates in one `page.evaluate` over element
handles (`edgesOfAll` in that spec), so they come from a single frame. A
`toBeVisible()` wait per locator before the read still applies — it is the
visibility wait, not the atomic read, that handles elements not yet
rendered. Do not fix this by waiting for the lazy component: the next
async section above the measured one would reopen the race.
