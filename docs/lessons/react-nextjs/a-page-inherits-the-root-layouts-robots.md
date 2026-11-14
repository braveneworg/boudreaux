# A page that sets no `robots` inherits the root layout's

Next.js merges metadata down the route tree. A page whose metadata object
has no `robots` key does not render "no robots tag": it renders whatever
the nearest layout above it set. In this app the root layout
(`src/app/layout.tsx`) sets

```ts
robots: { index: false, follow: false },
```

so every page that does not set its own `robots` is served with
`<meta name="robots" content="noindex, nofollow">`.

Stage 1 of community submissions (2026-11-11) wrote the rule "an unlisted
submission's page sends `noindex`; a listed public one may be indexed". The
page returned `robots: NOT_INDEXED` for the first case and no `robots` key
for the second, and a unit spec asserted exactly that on the returned
object. The design spec, the code comment and the handoff all then said a
listed submission "may be indexed". It may not: on the rendered page both
cases carry the same tag.

It was found on 2026-11-13 by the first E2E assertion that read the tag
from a rendered page: `meta[name="robots"][content*="noindex"]` was
expected to be absent on a listed submission and was present. The trace
showed the same tag on `/` and on `/community`.

Rules:

- A claim about what a page tells a search engine is a claim about the
  rendered `<head>`. Prove it there, with an E2E read of the tag or a
  `curl` of the page, not with a unit assertion on the object
  `generateMetadata` returns.
- "No `robots` key" means "inherit". To make one page indexable under a
  layout that is not, the page must say `robots: { index: true, follow: true }`
  itself. To learn what a page inherits, read every `layout.tsx` above it.
- An assertion that a page _has_ `noindex` proves nothing here: every page
  has it. Do not add one to an E2E spec as evidence of a page-level rule.
- The site is kept out of search engines on purpose: the owner confirmed
  on 2026-11-13 that the root layout's `noindex, nofollow` stays as it is.
  Do not change it, and do not raise it again as a finding.
