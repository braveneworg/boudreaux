# The `complexity` lint rule caps functions at 10 repo-wide

`complexity` (`.oxlintrc.json`) caps functions at 10 repo-wide: when adding
branching (optional chains, ternaries, `&&`) to an already-busy component like
a page, extract it into a named helper up front instead of inlining it.

On 2026-11-13 the new `/community` page function reached 11: a `?user=`
filter, a not-found branch, a signed-in link, a seeded query and two
conditional sections, each a small branch. A page that reads search params
and renders two layouts is over the cap before it looks busy. Give the
param read, the breadcrumbs and each conditional block its own helper or
component when writing the page, not after lint says so.
