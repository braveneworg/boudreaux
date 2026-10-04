# A contract spec proves the constant, not its callers

`creditOrderBy` shipped (2026-10-03, #813) with a Docker-Mongo contract
spec proving the ordering it expresses, and a doc comment saying "every
read of `artistReleases` orders by this". Seven includes did; the artist
page's (`artist-repository.ts` `releaseGraphInclude`) did not, and after
any admin reorder the artist page and the release page named different
album artists. The spec was green throughout: it exercised the constant,
never the reads that were supposed to use it.

A convention each call site must remember is not a module. When a rule is
"every X does Y", give it a seam every X is built from (`orderedCredits(...)`
here) and a spec that scans for an X built any other way
(`credit-order.spec.ts`). Then prove at least one real read through the
repository on Docker Mongo, not only the fragment in isolation.
