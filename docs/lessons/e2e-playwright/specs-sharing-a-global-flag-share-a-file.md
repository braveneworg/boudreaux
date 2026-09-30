# Specs that depend on one global flag belong in one file

`test.describe.serial` orders the tests of its own block. It does nothing
about another file, which runs in another worker at the same time.

`signups-pause.spec.ts` flipped the `signups-paused` site setting, one row
for the whole database, and was serial "so no parallel contamination". While
it held signups paused, `signup.spec.ts` ran in another worker. Its submit
button was disabled, or its sign-up was refused with "Signups are temporarily
paused." On 2026-09-29 `signup.spec.ts` "redirects to the success page after
a valid sign-up request" failed this way in 2 of 5 runs of the whole suite
against the production build with 4 workers. The failure screenshot showed
the paused message.

A spec can keep its own rows apart from another spec's rows. It cannot keep
a flag apart: there is one value, and every reader sees it.

Rules:

- Put every test that writes a global flag and every test that depends on
  its value in ONE file, and set `test.describe.configure({ mode: 'default' })`
  at the top of the file so the whole file runs in order in one worker.
- Global here means one value for the whole database or server: a site
  setting, a feature switch, a rate-limit counter, a singleton row.
- Restore the flag in `afterEach`, as the pause tests do, so a failure does
  not leave it set for the rest of the run.
- When a spec fails with a message that belongs to another feature, search
  the specs for the one that turns that feature on.

## The same holds for a value written whole

A field that is written as a whole set is one value too. Choosing a display
image sends the artist's complete list of display images
(`setArtistDisplayImagesAction`). Two tests of `admin-bio-palettes.spec.ts`
each chose an image for the one seeded palette artist, in two workers
(`fullyParallel` spreads the tests of one file). The second write carried a
list without the first test's image, and the first test lost its image on
reload. It failed once in 5 runs on each server.

Giving each test its own image row did not help, because the rows were never
the shared thing: the list was. Keep tests that write the same whole value in
one worker with `test.describe.configure({ mode: 'default' })`, or give each
its own parent row.
