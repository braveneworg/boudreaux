# A timestamp is not a unique name

`Date.now()` is the same in every worker that reaches the line in the same
millisecond. With `fullyParallel` and several workers, the tests of one file
start together, so two of them name their rows alike.

`admin-venue-edit.spec.ts` and `admin-tour-date-artist-pills.spec.ts` both
created a venue named `E2E Venue ${Date.now()}` before each test. The test
then picked its venue by name in a combobox and took the first match. On
2026-09-29 a trace showed the search returning two venues with the same name,
`E2E Venue 1790731552541`. The test took the other test's venue, and that
test deleted it when it ended. The edit dialog then got a 404 and showed
empty fields; in another run the update answered "An unknown error
occurred". It failed in 2 of 9 runs of the whole suite against the dev
server, with a different test of the file each time.

Rules:

- Name a row with `randomUUID().slice(0, 8)`, as `admin-bio-palettes.spec.ts`
  does, when more than one test uses the same prefix.
- A timestamp is safe only behind a prefix that one test alone uses, such as
  the playlist specs' `Player Add ${testInfo.retry}-${Date.now()}`.
- `.first()` on a match by name hides a duplicate. When a test reads a row it
  did not create, look at how many rows the search returned.
- A failure that moves from test to test within one file, with a different
  symptom each time, points at what the tests share: here, the name.
