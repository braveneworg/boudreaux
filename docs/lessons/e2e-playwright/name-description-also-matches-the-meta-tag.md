# `[name="description"]` also matches the page's meta tag

Every page renders `<meta name="description" content="…">` in its head.
A form field called `description` renders `name="description"` too, so
`page.locator('[name="description"]')` resolves to two elements and the
first action on it fails with a strict-mode violation.

On 2026-11-08 the featured-artist "clears the display name and
description" E2E failed this way on its first run, before it reached
the assertion it was written to prove. `[name="displayName"]` beside it
worked, because no meta tag shares that name.

Rules:

- Locate a form field by its label, as in
  `getByRole('textbox', { name: 'Description (Optional)' })`, or by tag
  and name, as in `textarea[name="description"]` (the tour specs). Never
  by a bare `[name=…]` for a name the document head may also use
  (`description`, `keywords`, `author`, `viewport`, `theme-color`).
- A strict-mode violation on a locator that "obviously" names one field
  means something outside the form shares the selector. Read the
  resolved elements Playwright lists before changing the page.
