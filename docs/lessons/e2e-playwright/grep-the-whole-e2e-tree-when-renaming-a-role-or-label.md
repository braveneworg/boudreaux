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
