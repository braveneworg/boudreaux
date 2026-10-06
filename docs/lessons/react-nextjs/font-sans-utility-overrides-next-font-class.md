# A `font-sans` utility silently overrides the `next/font` body class

`next/font/local` returns two classes. `className` sets `font-family` on the
element; `variable` only defines the CSS variable named in the loader options
(`--font-jost`). The layout applied `className` to `<body>`, so body text was
Jost — but `ContentContainer` wraps every page in `font-sans`, and Tailwind's
`--font-sans` is the system stack. Every `<p>` and `<h2>` on the site rendered
in `-apple-system, …` while `getComputedStyle(document.body).fontFamily` said
`jost`. Nothing errored, and the site had looked that way for months
(measured 2026-10-05 on `/about`: body `jost, "jost Fallback"`, the content
`<section>`, `<p>` and `<h2>` all `-apple-system, …`).

Rules:

- Measure the text, not the body. `getComputedStyle(el).fontFamily` on a
  `<p>` inside `#main-content` is the proof; the body's font proves nothing
  when a descendant sets a font utility. `e2e/tests/site-font.spec.ts` keeps
  that measurement in the suite.
- One mechanism, at the root. Put `jost.variable` on `<html>` and declare
  `--font-sans: var(--font-jost), ui-sans-serif, system-ui, sans-serif, …`
  in a plain `@theme`. Tailwind emits `--font-sans` on `:root` and
  `--default-font-family: var(--font-sans)`, which its preflight `html` rule
  reads, so every page inherits Jost and `font-sans` resolves to the same
  stack. `jost.className` on body and a hand-written `html { font-family }`
  base rule are then redundant — a second mechanism only masks the next
  cascade bug.
- Not `@theme inline`, and not the variable on `<body>`. With the variable
  below `:root`, the root default cannot see it; the first fix here used
  `@theme inline { --font-sans: var(--font-jost, …) }` to make `font-sans`
  work from body, which left the root default on the system stack (masked
  by the base rule) and discarded the fallback tail once Jost resolved —
  `var(--x, a, b)` is all-or-nothing, so emoji and non-Latin glyphs lost
  their declared fallbacks. The first-probe reviewer caught both.
- `src/app/globals-css.spec.ts` compiles `@import 'tailwindcss'` plus the
  real `@theme` block with `tailwindcss`'s `compile()` and asserts the root
  `--font-sans` leads with `var(--font-jost)`, keeps a generic family and
  the emoji faces, feeds `--default-font-family`, and that the base `html`
  rule sets no font; `src/app/layout.spec.tsx` mocks the loader with two
  distinct class names and asserts `<html>` carries `variable` and `<body>`
  does not carry `className`.

Also confirmed while measuring, against a static read that assumed a hash:
Next 16's `next/font/local` names the `@font-face` family by the JavaScript
identifier the loader result is assigned to (`const jost = localFont(…)` →
`font-family: jost, "jost Fallback"`), while the generated class name is
hashed (`jost_d39fdf2e-module__…__variable`). Match on the family `jost`
when probing `document.fonts`.
