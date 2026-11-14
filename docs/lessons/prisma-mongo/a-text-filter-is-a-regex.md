# A case-insensitive `contains` runs the term as a regular expression

On Prisma 6 + MongoDB, `{ field: { contains: term, mode: 'insensitive' } }`
is sent to the database as a `$regexMatch`, and Prisma does not escape the
term. Whatever a visitor types is a pattern.

It was found on 2026-11-13 by a contract case added after a security review
asked whether the community page's search escaped its term. Four cases, on
the Docker Mongo, against eleven prefixed rows of which one was titled
`meta .*(x`:

| Term   | Expected            | Got, unescaped                              |
| ------ | ------------------- | ------------------------------------------- |
| `.*`   | the one row         | all eleven rows                             |
| `(`    | the one row         | error 51111, "Invalid Regex in $regexMatch" |
| `.*(x` | the one row         | error 51111, the same message               |
| `\`    | no rows, no failure | the case failed; its message was not kept   |

So a search box that passes its term straight through:

- answers a `500` to anyone who types `(`, `[`, `\` or `*` first;
- matches on pattern syntax nobody meant (`a.c` finds "abc");
- hands the database a pattern its sender controls, and a pattern built to
  backtrack is a way to spend the database's CPU from a public form.

A unit spec with a mocked client cannot see any of this: it asserts the
`where` that was sent, and the `where` looks right.

The fix is `containsText(term)` in
`src/lib/repositories/_internal/where-kit.ts`, which escapes every
character a regular expression reads as syntax and returns the
`{ contains, mode: 'insensitive' }` pair. With it the four cases above
return the one row, the one row, the one row and nothing.

Rules:

- A term a visitor typed never goes into `contains`, `startsWith` or
  `endsWith` with `mode: 'insensitive'` as it is. Build the filter with
  `containsText`, or escape the term the same way for the other two.
- Every fragment that searches by a typed term has a contract case with a
  term made of pattern syntax (`.*`, `(`, a lone `\`) and a row that holds
  those characters. The expected result is that row and nothing else.
- When a search answers `500` for some inputs and not others, try `(`
  before reading the query: error 51111 is this.

On the day this was written, the fix covered the submission search only.
The other searches still build their filter by hand
(`grep -rn "mode: 'insensitive'" src/lib`): releases, videos, artists,
tours, playlists and the username lookups. Each needs the same change and
its own contract case.
