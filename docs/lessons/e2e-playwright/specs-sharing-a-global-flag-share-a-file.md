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

## The same holds for one seeded row two tests edit

`admin-video-artist-review.spec.ts` has two tests on the one seeded review
video. The first saves `E2E Review Lead feat. Zora Quill Brandt` onto it and
restores the row in `afterEach`. The second expects the row to hold only the
seeded lead. In two workers, the second sometimes loaded the page between
the first test's save and its restore, saw an unmatched featured artist, and
showed the new-artist block. It failed in 2 of 2 runs of the video specs
with their neighbours on 2026-10-05 (4 workers, dev server). It passed when
the file ran alone, because the second test then finished before the first
one saved. A probe that put the first test's saved string on the row failed
the second test every time.

A row that more than one test of a file writes is a value of its own. Set
`test.describe.configure({ mode: 'default' })` on that describe.

## The same holds for a flag on a shared seeded user

A flag on one user's row is global to every spec that signs in as that
user. `admin-chat.spec.ts` disabled chat for the first row of the
moderation table, which was always the seeded `testuser`, for the
length of three serial tests. `chat-drawer.spec.ts`,
`chat-drawer-touch.spec.ts` and `admin-chat-user-detail.spec.ts` sign in
as `testuser` too. Whenever one of them opened the drawer inside that
window, it found "You have been reported for abuse" where the composer
should be, and timed out on `getByLabel('Chat message')`. On 2026-11-08
it failed `chat-drawer.spec.ts` on a local production build with
`--repeat-each=3`. In CI, `admin-chat` and `admin-chat-user-detail` share
shard 1, so the race was already live there.

Here the readers don't need to share the flag, so moving them into one
file is the wrong fix. The writer needs its own row. The moderation spec
now creates a user for its run with `createStampedUser`
(`e2e/helpers/stamped-user.ts`), finds that user's switch by its
accessible name (`Disable chat for <handle>`), and deletes the user's
rows by id in `afterAll`.

- A spec that changes a user's state (chat access, a ban, a quota, a
  profile field) uses a stamped user, never a seeded one that other
  files sign in as.
- `.first()` on a list of users is a choice made by sort order. Find the
  row by the name of the user the test created.
- Merge specs into one file only when they all need the same value.
  When only the writer needs it, give the writer its own row.
