# The `complexity` lint rule caps functions at 10 repo-wide

`complexity` (`.oxlintrc.json`) caps functions at 10 repo-wide: when adding
branching (optional chains, ternaries, `&&`) to an already-busy component like
a page, extract it into a named helper up front instead of inlining it.
