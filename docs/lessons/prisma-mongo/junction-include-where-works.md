# An include-level `where` on a junction list works

On Prisma 6 + MongoDB, a nested `where` on a junction-table include filters
the joined rows:

```ts
artistReleases: {
  where: { artist: { is: publicArtistWhere } },
  select: { artist: { select: { slug: true } } },
}
```

ADR-0006 and a comment in `artist-service.ts` said the opposite, and code was
written around it: filters ran in memory, which needs the gate fields in every
public projection and breaks offset paging when it drops parent rows. Nobody
had tested the claim. A probe on the Docker Mongo (2026-09-28) did, with
prefixed rows that were deleted afterwards.

| Shape                                                                  | Result |
| ---------------------------------------------------------------------- | ------ |
| `artistReleases: { where: { artist: { is: … } } }` (explicit junction) | works  |
| `headliners: { where: { artist: { is: … } } }` (optional relation)     | works  |
| `members` / `memberOf` with a `where` (self-relation junction)         | works  |
| `tourDates: { where: … }` holding a nested relation filter             | works  |
| `artists: { where: … }` on a direct one-to-many relation               | works  |
| `some: { artist: { is: { AND: [gate, nameMatch] } } }` in a `where`    | works  |

Tour shapes, probed with a tour that has no dates (the case behind error
17124, see `tour-repository.ts`):

| Shape                                                               | Result                             |
| ------------------------------------------------------------------- | ---------------------------------- |
| `OR: [{ tourDates: { none: {} } }, { tourDates: { some: … } }]`     | works, also in `count`             |
| The same under `AND` with a search `OR` holding its own `tourDates` | works                              |
| `headliners: { every: { OR: [artistId null, artistId unset] } }`    | works, true for a date with none   |
| `headliners: { none: { artistId: { not: null } } }`                 | WRONG: misses a row with no artist |
| `NOT: { tourDates: { every: { NOT: … } } }`                         | WRONG: drops tours it should keep  |

Rules:

- Filter joined rows in the query. Filter in memory only when the code must
  see the rows it drops, and say why in a comment.
- A claim that the stack "cannot" do something is a hypothesis until a probe
  has run. Probe it before designing around it, and record the result here.
- Prefer `every` with a "names nothing" clause over `none` with a negated
  field test. Re-probe any shape that uses `NOT` around a relation filter.
- An admin screen may read through a public route. Before filtering a public
  read, grep for its consumers: on 2026-09-28 three public routes turned out
  to feed admin edit screens, which need the unfiltered rows.
