# zsh ties the lowercase `path` variable to `PATH`

The Bash tool runs zsh, where `path` is an array tied to `PATH`. A loop
such as `for path in /artists /artists/e2e-artist; do …; done` replaces
`PATH` with one URL path, so every command in the loop body, `cat` and
`tr` included, fails with "command not found".

On 2026-10-18 (#900) a viewport sweep of the artist pages hit this, and the
loop printed empty results for each page.

Rules:

- Never name a shell variable `path`, `cdpath`, `fpath` or `manpath` in
  zsh. Use `pg`, `route` or `url` instead.
- When every command in a loop reports "command not found", suspect the
  loop variable before the tools.
