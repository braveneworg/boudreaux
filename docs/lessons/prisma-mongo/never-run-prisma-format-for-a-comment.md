# Never run `prisma format` to fix a comment

`prisma format` re-aligns every column of every model whose longest
attribute changed since the file was last formatted, so a one-line comment
edit can come back as a 26-line diff over a model the change never touched.
That churn then sits in the commit, the PR diff and `git blame`.

This has now happened twice: once building the download gate (2026-10-01,
a `mode` field — the churn was reverted and the field added with an edit),
and again the same day fixing the `formatType` comment, where the
reformatted Playlist model went into the commit before the stat line
(`13 insertions, 13 deletions` for a one-word change) gave it away.

Rules:

- Edit `prisma/schema.prisma` with a plain text edit. Only run
  `prisma format` when the change is a new model or field whose alignment
  you want, and then read the diff stat before committing: it must touch
  only the model you changed.
- Prettier does not parse `.prisma`; do not pass the schema to it either.
- A schema diff stat larger than the change you made is churn. Restore the
  file from the parent commit and re-apply the edit.
