# A spec's rows must not outrank the seeded rows

Every worker reads one database. A row that a spec creates is visible to
every other spec for as long as it exists, so a row that sorts first in a
public listing changes what the other specs see on that page.

`hidden-artist-names.spec.ts` created a featured row with
`featuredOn: now - 60s`. The home page player leads with the newest
`featuredOn` (`FeaturedArtistRepository.findFeatured`). The seeded featured
row is dated at the moment of seeding, so the spec's row took the lead
whenever the file started more than a minute after the seed. That row has no
cover art and no release, so the player rendered without its Play button, and
`home-player-ssr.spec.ts` failed on `aria-label="Play"`.

On 2026-09-29 it failed in 5 of 5 runs of 35 specs against the dev server
with 4 workers, and in 0 of 4 runs against the production build, which
finishes the same specs in under a minute. Both specs passed on their own.

Rules:

- Give a row that a spec creates a sort value that files it after the seeded
  rows: a fixed date in the past for a newest-first listing, a name that
  sorts last for an A to Z one, a high `position`.
- Never derive that value from `Date.now()`. How it compares with the seed
  then depends on how long the run has been going, which differs between the
  dev server, the production build and CI.
- A spec that passes alone and fails only beside others is reading rows that
  another spec wrote. Look in the failing page's HTML or RSC payload for rows
  with another spec's stamp before looking at timing.
- Check both servers before pushing a spec that writes rows:
  the dev server (`pnpm exec playwright test <specs> --workers=4 --retries=0`)
  and the production build (`CI=true`, after `next build --webpack`).
