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

## The same holds for an edit placed by line number

On 2026-11-13 a new field, `aboutText`, had to be added to nine spec
builders of a submission record. A script inserted it after each line a
`grep -n aboutHtml` had listed. Two of the eleven lines were not record
builders: one was a form payload and one a view object, which have an
`aboutHtml` and must not have an `aboutText`. Typecheck caught one and two
failing action specs the other.

- A `grep -n` hit names a line, not the object the line is in. Before a
  scripted insert, read what each hit belongs to (the enclosing `const` or
  call), or anchor the insert on the builder's own name.
- Run `tsc` and the touched specs straight after such a script, before any
  other edit, so its mistakes are not mixed with the next change's.
