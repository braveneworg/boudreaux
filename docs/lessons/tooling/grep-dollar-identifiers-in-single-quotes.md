# A `$name` pattern in double quotes greps for nothing

`grep -rn "\$transaction" src` under zsh printed no matches and the session
concluded the repo had no interactive transactions. It has fifteen. Inside
double quotes zsh expanded `$transaction` to the empty string, so grep searched
for `""` — and `grep -rn "$transaction" ... | wc -l` printed `0` with no error.
The miss nearly shipped a client extension that left `prisma.$transaction(...)`
unwrapped.

Rules:

- Put any pattern containing `$` in single quotes: `grep -rn 'prisma\.\$transaction' src`.
- Treat a zero-match grep for an identifier you expect to exist as a failed
  command, not a finding. Re-run with a pattern you know matches (the file
  that uses it) before acting on "none".
- The same applies to `$extends`, `$queryRaw`, `$runCommandRaw`, `$allModels`,
  and every other Prisma client method.
