# A text filter runs its value as a regular expression

On Prisma 6 + MongoDB, most text filters are sent to the database as a
`$regexMatch`, and Prisma does not escape the value. Whatever a visitor
types is a pattern.

It was found on 2026-11-13 by a contract case added after a security review
asked whether the community page's search escaped its term. A probe on the
Docker Mongo then tried every operator against five prefixed producers named
`a.c`, `abc`, `A.C`, `(x` and `plain`:

| Filter, written by hand                  | Matched             | Should match |
| ---------------------------------------- | ------------------- | ------------ |
| `equals: 'a.c'`, `mode: 'insensitive'`   | `A.C`, `a.c`, `abc` | `A.C`, `a.c` |
| `startsWith: 'a.'`, insensitive          | `A.C`, `a.c`, `abc` | `A.C`, `a.c` |
| `endsWith: '.c'`, insensitive            | `A.C`, `a.c`, `abc` | `A.C`, `a.c` |
| `in: ['a.c']`, insensitive               | `A.C`, `a.c`, `abc` | `A.C`, `a.c` |
| `contains: 'a.c'`, **case-sensitive**    | `a.c`, `abc`        | `a.c`        |
| `startsWith: 'a.'`, **case-sensitive**   | `a.c`, `abc`        | `a.c`        |
| `equals: 'a.c'`, case-sensitive          | `a.c`               | `a.c`        |
| any of the first six with a value of `(` | error 51111         | `(x`         |

So the rule is wider than "case-insensitive `contains`": `contains`,
`startsWith` and `endsWith` are patterns in either mode, and `equals` and
`in` become patterns the moment `mode: 'insensitive'` is added. Only a
case-sensitive `equals` or `in` compares text.

What that meant on the site, before the fix:

- every search box answered a `500` to anyone whose term began `(`, `[`,
  `*` or `\` (error 51111, "Invalid Regex in $regexMatch");
- a dot matched any character, so a duplicate check by name
  (`equals`, insensitive) could find a different record;
- a public form handed the database a pattern its sender controlled, and a
  pattern built to backtrack is a way to spend the database's CPU.

A unit spec with a mocked client cannot see any of this: it asserts the
`where` that was sent, and the `where` looks right.

The fix is the text helpers in
`src/lib/repositories/_internal/where-kit.ts`: `containsText`,
`startsWithText`, `equalsText` and `inTexts`. Each escapes every character a
regular expression reads as syntax and is case-insensitive. All twelve
repositories that wrote such a filter by hand now build it from them.

Rules:

- Never write `contains`, `startsWith`, `endsWith` or `mode: 'insensitive'`
  in a repository. Build the filter from the where kit's text helpers.
  `text-filter-seam.spec.ts` scans every repository and fails on one
  written by hand.
- A new text helper is proved in `where-kit.contract.spec.ts` with a value
  made of pattern syntax and a row that holds those characters.
- A new search is added to `text-search.contract.spec.ts`, which calls the
  real repository reads with `(`, `[`, `*`, `\`, `.*`, `a{2` and `(?<x`.
  With the escape removed, 34 of the 59 cases in those two files fail.
- A case-sensitive `startsWith` on a value the code built itself (a storage
  key prefix, a test's row prefix) is still a pattern. It is safe only
  while the value holds no pattern syntax; escape it too if that can change.
- When a search answers `500` for some inputs and not others, try `(`
  before reading the query: error 51111 is this.
