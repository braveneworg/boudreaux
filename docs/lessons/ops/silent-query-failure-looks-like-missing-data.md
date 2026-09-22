# A component that swallows its query error turns any outage into "no data"

The admin bio image manager rendered `status.data?.content?.images ?? []` and
never looked at `status.error`. When nginx 429'd the status read (see
`docs/lessons/nginx/spa-pages-need-burst-headroom.md`) the manager showed
"Image pool (0) — No images yet" for an artist with 36 images and three
chosen display images, while the public pages showed them. Nothing was red,
nothing was logged client-side, and the empty state read as truth.

The misdiagnosis cost more than the bug (2026-09-21). "The images the admin
chose vanish on the next visit" pattern-matched to a data-model fault, so the
first hours went into the display-order write path, regeneration keeping
custom rows, the save path rewriting image URLs, and five design decisions
about a strip redesign — all under the wrong theory. A read-only pass over
the wire schema and every code path that could clear `displayOrder` found
nothing, which should have been the signal. The user's Network tab settled
it in one screenshot: `bio-generation` → 429.

Rules:

- When the admin view and a public view disagree about the same rows, the
  first question is **which one is server rendered**. A server-rendered page
  that shows the data proves the data; the client-fetched page's transport
  is then the suspect, not the model. Check the Network tab (or `curl` the
  public read-only endpoint) before opening a repository file.
- A "no data" empty state must be unreachable while the query is in error.
  Components that render `data ?? []` must also branch on `error` and show a
  visible failure with a Retry — see `BioImageManager`'s `loadError` /
  `onRetry`. Grep for `?? []` next to a `useQuery` when reviewing a new list.
- When an exhaustive read-only search for a data-corrupting path finds
  nothing, stop searching the model and go verify the failure mode itself.
  Absence of a write bug is evidence about the diagnosis, not a reason to
  look harder.
- Decisions taken under a diagnosis are only as good as the diagnosis. When
  the cause changes, re-open every decision made before it — here a whole
  strip redesign was dropped once the 429 was confirmed.
