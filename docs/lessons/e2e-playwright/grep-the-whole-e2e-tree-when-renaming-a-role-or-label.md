# Grep the whole `e2e/` tree when a role or label changes

Renaming an accessible name (a `role=group` label, a button label, a heading)
breaks every E2E locator that used it — and specs live in subdirectories, not
only `e2e/tests/*.spec.ts`. When the bio image palette became the image manager
(2026-09-17, PR #749), `grep "Discovered images" e2e/tests/*.ts` found and
fixed `admin-bio-palettes.spec.ts` but missed
`e2e/tests/admin/bio-media-palettes.spec.ts`, which failed shard 1 in CI while
the unit suite and the other two shards stayed green.

Before pushing a UI change that renames or removes anything an E2E locator can
target, grep recursively (`grep -rn "<old name>" e2e/`) for the old label, the
old component file name, and every button label the component rendered, then
run each matching spec's neighbors locally (see
`run-neighboring-specs-before-push.md`). A locator that resolves to 0 elements
is the CI symptom; the cause is always a rename that a non-recursive grep
never saw.

## Adding an accessible name breaks locators too

The mirror case costs a shard just as easily, and no grep for an _old_ string
will find it: giving an element a new accessible name can make an existing
loose locator match **two** elements and trip Playwright's strict mode.

On the artist-card rework (2026-09-20, PR #755) the card's images became a
link labelled `"<display name> artist page"`. That is a second link carrying
the artist's name, so `getByRole('link', { name: /Tokensmith/ })` — which had
resolved to the name link alone for months — started resolving to two and
failed shard 2. The same push also left
`toContainText('3 releases · Latest: …')` behind after the card stopped
printing a release count.

So, additionally:

- After adding an `aria-label`, `alt`, or any new visible text that repeats a
  value specs already query (a name, a title), grep `e2e/` for that value and
  make every matching locator unambiguous — `{ exact: true }`, or scope it to
  a container.
- Grep for the **rendered strings you changed**, not just the ones you
  removed: a card's text content is asserted verbatim by `toContainText`.
- Run the specs, don't reason about them. `pnpm exec playwright test
<file> --project=chromium` on each touched spec takes under a minute and
  catches both classes before CI does.
