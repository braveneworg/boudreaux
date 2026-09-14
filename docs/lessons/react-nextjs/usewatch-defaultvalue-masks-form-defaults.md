# `useWatch({ defaultValue })` masks the form's own defaults

React Hook Form's `useWatch({ control, name, defaultValue: '' })` returns the
`defaultValue` PLACEHOLDER — not the value from `useForm({ defaultValues })` —
until the field first changes. On 2026-09-14 the release-date auto-lookup hook
read `title`/`artist` that way, so on edit-open it saw two empty strings,
failed its gate, and never fired for a persisted row whose title and artist
were already loaded. Every mock-driven spec passed because the harness seeded
the values through `setValue`, which does trigger the watch.

Rules:

- Never pass `defaultValue` to `useWatch` for a field the form seeds through
  `defaultValues` (or `reset`). Omit it and coalesce the read instead:
  `useWatch({ control, name: 'title' }) ?? ''`.
- When a hook must see the loaded value on first render, add a spec that seeds
  the value through `useForm({ defaultValues })` — not `setValue` — and
  asserts the first-render behaviour.
- `resetField` is a no-op on a field nothing has registered; a hook spec that
  drives a controller-backed field must `form.register(name)` first to mirror
  the real `<Controller>`.
