# commitlint's 50-char cap covers the full header

commitlint's 50-char cap applies to the FULL header — `type(scope): ` prefix,
gitmoji (counts as 2 chars), and subject all included, so `refactor(hooks): ♻️ `
alone eats 20 — count the whole header line, and drop the scope when the
subject won't fit.

Knowing the rule wasn't enough: on 2026-09-23 three headers in one session
failed at 51–54 characters, each estimated by eye. Count mechanically before
every commit. This matches commitlint's count (symbol emoji = 2, the invisible
variation selector = 0):

```bash
python3 -c "import sys,unicodedata;h=sys.argv[1];print(sum(2 if unicodedata.category(c)=='So' else 0 if c=='️' or unicodedata.category(c)=='Mn' else 1 for c in h))" "feat(ui): ✨ subject"
```

Counting is only half of it: on 2026-09-26 the counter printed `51` for
`refactor(job-contract): ♻️ share one httpUrl schema` and the commit went
out anyway, and commitlint rejected it. Treat any count over 50 as a stop.
Shorten the header (a shorter scope, e.g. `contract`, usually fixes it)
and count again before running `git commit`.
