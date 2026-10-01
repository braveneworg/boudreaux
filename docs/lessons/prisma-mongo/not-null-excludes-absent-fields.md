# `{ not: null }` already excludes absent fields

On Prisma 6 + MongoDB, `where: { field: { not: null } }` on an optional
field matches only documents where the field is set to a value. It
excludes documents where the field is explicitly `null` and documents
where the field is absent.

On 2026-09-27 the repo said both things. The `alumniArtistWhere` comment
(removed with the roster rule by ADR-0016)
was right. The `publicArtistWhere` comment (#792) said `not: null` alone
matched absent fields, so it added a redundant `publishedOn: { isSet: true }`.
An audit then flagged the artists index as a probable leak on that claim.
A probe settled it.

Prove Mongo null semantics against the Docker Mongo; never argue from a
comment. The probe created three artists (`publishedOn` absent, explicit
`null`, and set) through Prisma under `env -i` with only the
`localhost:27018` URL, then deleted them:

| where                          | absent | null | set |
| ------------------------------ | ------ | ---- | --- |
| `publishedOn: { not: null }`   | no     | no   | yes |
| `publishedOn: { isSet: true }` | no     | yes  | yes |
| `isSet: true` AND `not: null`  | no     | no   | yes |
| `deactivatedAt: { not: null }` | no     | no   | yes |

The opposite direction is still a trap: `{ field: null }` matches only an
explicit `null`, not an absent field. "Not set" needs
`OR: [{ field: null }, { field: { isSet: false } }]`, the shape
`notDeletedOr` uses.
