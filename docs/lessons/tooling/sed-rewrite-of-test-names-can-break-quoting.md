# A sed rewrite of a test name can break its quoting

Renaming an `it('…')` title with `sed` swaps in raw text, and nothing checks
that the new text is valid inside the old quotes. Renaming a zine-toggle test
to "fills the selected item with the page's zine accent" (2026-09-23) put an
apostrophe inside a single-quoted string. The spec file stopped parsing, and
vitest reported the whole file as one failed suite, not the test you expected
to fail. A parse error then passes for "red" in a TDD loop.

Rules:

- When the new text contains `'`, switch the string to double quotes (or
  edit with the Edit tool rather than `sed`).
- In a TDD loop, make sure the red run fails on the **named test**, not
  `FAIL … spec.tsx [ …spec.tsx ]` with no test name. A bare file-level failure
  means it didn't parse or import, not that your assertion failed.
