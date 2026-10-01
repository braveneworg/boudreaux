# A contract spec seeds every row in `beforeAll`, never inside a test

Vitest runs this suite's tests in a shuffled order (`sequence.shuffle`, seed
42). A test that creates a row — or a nested `describe` whose `beforeAll`
does — can run before a sibling that counts the rows. The sibling then sees
one row too many and fails only on some seeds.

On 2026-10-01 (PR B of the where-kit) the same mistake was made three times
in one afternoon: `digital-format-where`, `chat-message-where` and
`featured-artist-where` each added rows for a later case inside a nested
`beforeAll` or inside the test itself, and each time the file-level "seeds
one row per storage" case failed with one extra row.

Rules:

- Seed every row the file needs in the one top-level `beforeAll`. A nested
  `describe` may narrow what it reads; it never writes.
- Give rows that belong to a different case a name the base queries cannot
  match (`${prefix}ban:` beside `${prefix}hiddenAt=`), or a different parent
  row, and scope the base finder to the rows it owns.
- A test that must observe one row queries that row by name; it does not
  filter the shared listing after the fact.
- Clean up by the broad prefix in `afterAll`, since the rows now come from
  more than one shape.
