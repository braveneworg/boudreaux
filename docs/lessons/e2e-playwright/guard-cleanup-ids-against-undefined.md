# Guard a cleanup's ids: an undefined filter matches every row

Prisma drops a filter whose value is `undefined`. `{ where: { tourId } }`
with `tourId` undefined is `{ where: {} }`, and `deleteMany` then removes
every row of the model.

`admin-venue-edit.spec.ts` assigned `tourId` at the end of its `beforeEach`
and ran this after each test:

```ts
await prisma.tourDate.deleteMany({ where: { tourId } });
```

When the setup failed before the assignment, in a worker that had not yet
run a test of the file, the cleanup deleted every tour date in the database,
the seeded ones included. On 2026-09-29, against the production build with 4
workers, the setup failed once and both `tour-detail.spec.ts` tests failed in
the same run: the seeded tour's page read "No tour dates announced yet."
A read-only probe on the Docker Mongo confirmed the filter: `count()`
returned 4 and `count({ where: { tourId: undefined } })` returned 4.

The same cleanup removed tours by the title prefix the whole file shares,
which takes the tours of the file's other tests in other workers (see
[`spec-cleanup-must-only-touch-its-own-rows.md`](spec-cleanup-must-only-touch-its-own-rows.md)).

Rules:

- Guard every id a cleanup filters by: `if (tourId) { … }`. Type the
  variable `string | undefined` so the compiler asks for the guard.
- Reset the ids at the top of `beforeEach`. In a worker that already ran a
  test, a failed setup otherwise leaves the previous test's ids in place.
- Remove rows by id, never by a prefix the file's other tests share.
- One spec failing and an unrelated spec failing in the same run, on data
  the second one only reads, points at the first one's cleanup.
- Make a text locator exact when a longer text on the page contains it.
  `getByText('Tour Dates')` also matches "No tour dates announced yet.",
  and the strict-mode error it raised hid the real failure, which was the
  missing dates.
