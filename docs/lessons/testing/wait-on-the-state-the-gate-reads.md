# Wait on the state the gate reads, not on a sibling that changes first

`playlist-save-dialog.spec.tsx` ("allows closing the dialog again once the save
settles") failed unit shard 1 in CI (2026-09-21, PR #758 — which touched
neither file) with `onOpenChange` called 0 times, while passing 25/25 locally.

The dialog holds Escape while a save is in flight, but it gates on its OWN
`isSaving`, a mirror of the form's state pushed up by a `useEffect`
(`onSavingChange`). The test waited for the Save button to re-enable — the
FORM's state — and pressed Escape at once. The mirror releases one passive-effect
flush later, so on a slow runner Escape landed inside that gap and was
swallowed. Nothing in the DOM shows the mirror, so no `waitFor` on markup can
see it release.

Rules:

- When state is mirrored into a parent by an effect, the parent lags the child
  by a flush. A test that acts on the parent's gate must not treat the child's
  DOM as the signal that the gate is open.
- If the gate has no observable signal, retry the ACTION until it is accepted
  (`waitFor(async () => { await user.keyboard('{Escape}'); expect(…) })`)
  instead of waiting on a proxy and acting once.
- A flake that won't reproduce under a stress loop can still be proven: widen
  the suspected window in the source temporarily (here, `setTimeout` around the
  releasing `onSavingChange(false)` only) and check the test fails with CI's
  exact message, then that the fix survives the widened window. Delay only the
  transition under suspicion — delaying both directions also delays the gate
  being set, and the test passes for the wrong reason.
