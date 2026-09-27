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

Shapes the probe confirmed:

- "Never set" is `OR: [{ field: null }, { field: { isSet: false } }]`.
- "Set" is `{ field: { not: null } }` alone.
- Several `OR` groups combine as members of one `AND`, each wrapped as
  `{ OR: [...] }`. A `where` has room for only one top-level `OR`.
- A relation filter beside them, `releases: { some: { releaseId } }` or
  `releases: { some: { release: listedReleaseWhere } }`, works in `findMany`
  and in `updateMany`.

Rules:

- Before committing a new gate, create one row per combination of absent,
  null and set for every nullable field it reads, and check each row lands
  where the rule says.
- Follow `e2e/AGENTS.md`: `env -i`, only `localhost:27018`, a URL guard at the
  top of the script, prefixed rows, and delete them in `finally`.
- Keep the probe script outside the tree. Import `@prisma/client` and the
  `where` module by absolute path from the worktree.
