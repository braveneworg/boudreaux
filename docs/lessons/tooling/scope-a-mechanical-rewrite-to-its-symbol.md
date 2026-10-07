# Scope a mechanical rewrite to the symbol it targets

Removing the `adminId` parameter from `ArtistService.createArtist`
(2026-10-06) left a dozen spec calls with a stray `'admin-1'` argument. A
`perl -0pi` pass that matched the shape of the argument —
`},\n 'admin-1'\n );` — stripped it everywhere that shape occurred, which
included every multi-line `updateArtist(…, 'admin-1')` call and two
`toHaveBeenCalledWith(…, 'admin-1')` expectations whose third argument was
still required. Typecheck then reported the losses five at a time, over
four rounds, each fixed by hand.

Rules:

- A pattern-based rewrite names the symbol it targets, not the shape of
  its arguments: anchor the match on `createArtist(` (or run it only on
  the lines a `grep -n 'createArtist('` lists), never on `'admin-1'`
  alone.
- Before running it, count the matches with `grep -c` on the same pattern
  and compare with the number of call sites you meant to change. A count
  that is too high is the warning.
- After it, run `tsc` and `grep` for the removed argument in the file: the
  compiler finds the calls the rewrite broke, the grep finds the ones it
  missed. Both, before the first test run.
- Under a dozen sites, the Edit tool per site (or `replace_all` on one
  exact string) is faster than a regex and cannot over-match.
