# Two filters on one relation share one join, and the last one wins

On Prisma 6 + MongoDB, every relation filter in a `where` becomes its own
`$lookup`, and two filters on the same relation get the same `as` alias. The
second `$lookup` replaces the array the first one wrote. When the two filters
join to different depths, the shallower join can be the one left, and the
deeper filter then reads a nested array that is not there:

```
Error code 17124: The argument to $size must be an array, but was of type: null
```

It surfaced on 2026-10-16 building the home search (#890). The where was

```ts
AND: [
  // credit: joins ArtistRelease → Release → ReleaseDigitalFormat → files
  { releases: { some: { release: { ...releaseWhere.listed, digitalFormats: { some: … } } } } },
  // token: joins ArtistRelease → Release only
  { OR: [{ firstName: contains }, { releases: { some: { release: { title: contains } } } }] },
]
```

The logged pipeline (`log: [{ emit: 'event', level: 'query' }]`) held two
`$lookup` stages, both `as: "ArtistToArtistRelease"`; the second had no
`ReleaseToReleaseDigitalFormat` inside it, and the credit's `$size` on that
array failed for every artist with a release. The unit spec with a mocked
client passed; only the Docker Mongo contract spec saw it. The same query
without a search token worked, because then only one filter read `releases`.

Probed on the Docker Mongo (`boudreaux-contract`, prefixed rows, deleted
afterwards):

| Shape                                                         | Result      |
| ------------------------------------------------------------- | ----------- |
| deep `releases` filter, then a shallow one (in `OR` or not)   | error 17124 |
| either filter with `release: { is: … }` instead of `release:` | error 17124 |
| shallow `releases` filter first, then the deep one            | works       |
| two `videoArtists` filters that join to the same depth        | works       |

The tour search's error 17124 (two `tourDates.some` filters under one `OR`,
`tours/tour-repository.ts`) is likely the same join collision.

Rules:

- When two filters in one `where` read the same relation, make the one that
  joins deepest the last one, and say why in a comment, or collapse them into
  one filter on the relation. `buildHomeSearchWhere` in
  `artist-repository.ts` puts the token `OR`s first and the credit last.
- A `where` that combines a relation filter with a search over the same
  relation needs a Docker Mongo case with a search term. A case without one
  joins the relation once and cannot fail this way.
- When Mongo reports a `$size` on `null`, log the pipeline and look for two
  `$lookup` stages with the same `as` before changing the filter's meaning.
