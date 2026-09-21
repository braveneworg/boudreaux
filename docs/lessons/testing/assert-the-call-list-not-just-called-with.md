# `toHaveBeenCalledWith` hides extra calls — assert the call list

`expect(onChange).toHaveBeenCalledWith(['noise-rock'])` passes if that call
happened **at any point**, among any number of others. It says nothing about
how many times the handler fired, or with what else.

Building `VocabularyMultiCombobox` (2026-09-20), the component had both its own
`onKeyDown` on `CommandInput` and cmdk's built-in Enter handling. Pressing
Enter therefore added TWO terms: the typed one from our handler, and whichever
suggestion cmdk had highlighted. The spec read

```ts
await user.type(input, 'Noise Rock{Enter}');
expect(onChange).toHaveBeenCalledWith(['noise-rock']); // green
```

and was green the whole time. The real calls were
`[[['noise-rock']], [['indie-rock']]]` — an admin pressing Enter would have
silently picked up a genre they never typed. It surfaced only because a
neighbouring test ("ignores Enter on an empty query") failed with an
`indie-rock` nobody had asked for.

Rules:

- For a callback whose CARDINALITY matters — a one-per-interaction handler, an
  idempotent mutation, an analytics event — assert
  `expect(fn.mock.calls).toEqual([[expected]])`, or pair
  `toHaveBeenCalledWith` with `toHaveBeenCalledTimes(1)`. Prefer the call-list
  form: it also pins the arguments of the calls you did not expect.
- Suspect a duplicate handler whenever a component adds its own key handling on
  top of a library that already handles that key (cmdk, Radix, react-select).
  Check what the library does with the key before adding a handler for it.
- When one test fails with a value only a DIFFERENT test supplies, do not
  assume the failing test is the wrong one. Print `fn.mock.calls` in the
  passing test first — see also
  [`fake-timers-never-reach-lru-cache.md`](fake-timers-never-reach-lru-cache.md),
  where the green test was the broken one.
