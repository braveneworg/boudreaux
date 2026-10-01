# A gate's `where` needs a probe on Mongo, not only a mocked spec

A repository spec with a mocked Prisma client proves which `where` was sent.
It cannot prove what MongoDB matches, and on this stack the two differ
whenever a field may be absent: `{ field: null }` misses a document without
the field, and `{ field: { not: null } }` excludes it.

The credit-confirmation gate (ADR-0015, 2026-09-26) combines three such
fields. It was probed on the Docker Mongo (`localhost:27018`) with nine
prefixed rows credited on one published release, before it was committed:

| Row                                   | Awaiting confirmation | Stays hidden |
| ------------------------------------- | --------------------- | ------------ |
| `publishedOn` absent, active          | yes                   | no           |
| `publishedOn: null`, active           | yes                   | no           |
| unpublished alumnus                   | yes                   | no           |
| published, active                     | no                    | no           |
| `deletedOn` set                       | no                    | yes          |
| published and `deletedOn` set         | no                    | yes          |
| inactive, `deactivatedAt` absent      | no                    | yes          |
| inactive, `deactivatedAt: null`       | no                    | yes          |
| unpublished, credited on a draft only | no                    | no           |

ADR-0016 (2026-09-28) took the roster out of the rule: a public artist is
published and not deleted, and `isActive` and `deactivatedAt` are not read.
The three rows above that were hidden or awaiting because of the roster
change accordingly. The new gates were probed the same way, with ten prefixed
rows credited on one release:

| Row                                           | Public | Awaiting | Stays hidden |
| --------------------------------------------- | ------ | -------- | ------------ |
| published, active (`deletedOn` absent / null) | yes    | no       | no           |
| published, inactive, `deactivatedAt` absent   | yes    | no       | no           |
| published, inactive, `deactivatedAt: null`    | yes    | no       | no           |
| published, inactive, `deactivatedAt` set      | yes    | no       | no           |
| `publishedOn` absent, or `null`               | no     | yes      | no           |
| unpublished, inactive                         | no     | yes      | no           |
| published and `deletedOn` set                 | no     | no       | yes          |
| unpublished and `deletedOn` set               | no     | no       | yes          |

`{ artist: { is: publicArtistWhere } }` on the junction matched the same rows
as the rule applied to the artist directly.

The same decision removed `isActive` from the `Artist` model. A field
dropped from the schema stays in the stored documents, so that was probed
too: two documents inserted raw with `isActive: false` and `isActive: true`
were read through Prisma, matched `publicArtistWhere`, came back without the
field, and took an update. Prisma on MongoDB ignores a stored field the
schema does not name.

Shapes the first probe confirmed:

- "Never set" is `OR: [{ field: null }, { field: { isSet: false } }]`.
- "Set" is `{ field: { not: null } }` alone.
- Several `OR` groups combine as members of one `AND`, each wrapped as
  `{ OR: [...] }`. A `where` has room for only one top-level `OR`.
- A relation filter beside them, `releases: { some: { releaseId } }` or
  `releases: { some: { release: listedReleaseWhere } }`, works in `findMany`
  and in `updateMany`.

Rules (updated 2026-10-01 — the probe is now a committed spec, not a script):

- Spell every null-safe clause with the kit in
  `src/lib/repositories/_internal/where-kit.ts` (`isUnset`, `isPresent`,
  `allOf`) inside a fragment module (`release-where`, `artist-where`,
  `digital-format-where`, …). A repository method composes fragments; it
  never writes `isSet` or a bare `{ field: null }` by hand.
- Every fragment module has a `*.contract.spec.ts` beside it that seeds one
  row per absent/null/set combination of each field it reads and asserts the
  result set of each fragment on the Docker Mongo. `pnpm run test:db` runs
  them (the `db-contract` vitest project, CI job `Database Contract Specs`);
  the unit shards never see them. A new gate is not committed until its
  contract case passes there.
- Repository specs assert fragment identity (`toEqual(releaseWhere.listed)`),
  not the `isSet` literal — the fragment's shape is the contract spec's job.
- `pnpm run test:db` scopes `DATABASE_URL` to `localhost:27018`
  (`boudreaux-contract`) and `setupTests.db.ts` refuses any other URL; rows
  are prefixed with `__contract:<uuid>:` and deleted in `afterAll`. Follow
  `e2e/AGENTS.md` for the Docker Mongo itself.
