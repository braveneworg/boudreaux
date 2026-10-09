# A `toPass` reload loop must reset state the page persists

A `toPass` loop that reloads and then clicks a toggle is only idempotent when
the reload restores the defaults. The admin data-view filters persist to
sessionStorage and rehydrate after mount, so a reload brings the last pass's
toggle back. The next click flips it the other way.

On 2026-10-09 the main-branch CI run for #849 failed
`admin-videos-list.spec.ts` "the unpublished-only filter shows just the
draft". The trace's video API requests alternated between the filtered and
the unfiltered query first on every pass. The last pass rehydrated "Show
published" off, and the click turned it back on. TanStack Query kept the
draft-only list on screen while the unfiltered refetch ran, so the one-card
count passed on stale data. Ten seconds later every published card was back
and the "E2E Video Alpha" check failed. The PR run of the same commit had
passed.

Rules:

- Before each reload in a loop, clear what the page persists, e.g.
  `page.evaluate((key) => sessionStorage.removeItem(key), STORAGE_KEY)`.
  Import the key from the app module rather than copying the string.
- After a toggle click, assert the control's state (`aria-checked`) before
  counting results. A count can match a stale list that is still rendered
  while its replacement is in flight.
- When a toggle test fails with the control in the opposite state, suspect
  persisted state before suspecting a lost click.
