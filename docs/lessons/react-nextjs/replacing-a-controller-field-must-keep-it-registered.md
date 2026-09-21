# Replacing a Controller-backed field must keep the field registered

`useWatch` + `setValue` looks like a complete substitute for a `<Controller>`:
you can read the value reactively and write it back. It is not. It never
**registers** the field, and RHF silently degrades for unregistered fields:

- `resetField(name, …)` is a **no-op**
- `dirtyFields[name]` is not tracked, so `getFieldState(name).isDirty` lies
- `reset()` restores the stale default, discarding the value

Swapping the artist form's genres `<TextField>` (a Controller) for the pill
editor (2026-09-21, PR #763) dropped that registration. `useApplyGeneratedBio`
returns the form to pristine after a generation with
`setValue(name, v, { shouldDirty: true })` then `resetField(name, { defaultValue: v })`
— the job already SAVED the content, so there is nothing for the admin to keep.
With genres unregistered the `setValue` still dirtied the form and the
`resetField` did nothing, so **Save never disabled** after generating a bio.
`admin-artist-bio-generation.spec.ts:109` caught it in CI; nothing local did.

Use `useController` for a custom control. It registers the field and gives you
`field.value` and `field.onChange`, so reset, dirty tracking and defaults all
keep working.

**Why every unit test missed it:** the spec harnesses call `form.register(name)`
by hand to "mirror the real `<Controller>`" (see
[`usewatch-defaultvalue-masks-form-defaults.md`](usewatch-defaultvalue-masks-form-defaults.md)).
That register was load-bearing — it simulated the very thing the change had
removed, so the harness stayed green while the app broke.

Rules:

- When you replace a registered control, the replacement registers the field.
  Grep for who registers a field name before and after the change; if the
  answer went from "a Controller" to "nobody", that is the bug.
- A hook spec may `register()` fields the component under test does NOT own
  (sibling editors the real form registers). It must NOT `register()` the field
  the hook under test is responsible for — that hides a missing registration.
  Say so in a comment, or the next person will "fix" the harness.
- `resetField` and `reset()` failing quietly is the signature. If a form stays
  dirty after adopting saved content, suspect registration before suspecting
  the adoption logic.
