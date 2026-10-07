# Watch the red run before the fix

Writing a spec and its implementation in the same batch of edits skips the
one observation TDD is for: that the spec fails without the change. On
2026-10-06 the unmount guard for `usePrimedAudioHandoff` was written as
"spec case + `useEffect` cleanup" in one turn; the first run was green, and
nothing had shown that the two new cases could fail. They might have passed
against the old hook (a `pause` spy that another case had already tripped,
a `paused` flag happy-dom never flips) and the guard would have shipped
unproven. Checking out the previous file and re-running showed the red:
`stops an unclaimed primed element when the owner unmounts` failed with
`expected "pause" to be called at least once`.

Rules:

- One edit, one run: write the spec, run it, read the failure, then write
  the implementation and run again. Never put the spec and the code in the
  same batch of edits, however obvious the fix.
- The failure must be the assertion, not an import error. A spec that
  fails because the module does not exist proves only that the file is
  missing; keep going until the real assertion is the thing that fails.
- If a green run arrives without a red one, reproduce the red after the
  fact (`git checkout HEAD -- <file>`, run, restore) before committing. A
  test that has never failed is a test whose ability to fail is unknown
  (see `fake-timers-never-reach-lru-cache.md`).
