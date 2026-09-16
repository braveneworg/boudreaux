# Grep for a component's import before planning its deletion

The artists-index plan (2026-09-16) scheduled `artist-search-input.tsx`,
`artist-search-results.tsx`, `use-artist-nav-search-query.ts`, and
`/api/artists/search` for deletion because a grep for the URL
`/artists/search` found only the artists page and a service comment. The
home page (`home-content.tsx`) imports `ArtistSearchInput` and never mentions
the URL, so the "unreferenced" chain was the live home-page search box. The
typecheck caught it after the files were already `git rm`'d.

Before listing a file for deletion in a plan, grep for its **module path
and export names** (`artist-search-input`, `ArtistSearchInput`), not only the
route or URL it serves — a route's URL and a component's import are different
graphs. Do it during exploration, and record the consumers in the plan, so an
implementer never has to discover the premise is wrong mid-delete.
