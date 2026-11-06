# A GitHub `${{ … }}` expression in a JS template literal is an interpolation

Workflow pin specs compare YAML text with an expected
`${{ secrets.NAME }}`. Written as a template literal so the name can vary —
`` `${{ secrets.${name} }}` `` — the leading `${` opens a JavaScript
interpolation whose body is the object literal `{ secrets.${name} }`. That
does not compile, or in looser shapes evaluates to `[object Object]`, and
the comparison can never match.

It came up writing `runtime-config-drift.spec.ts` (2026-11-05) and was
caught only on reading the inserted line back, before the first run.

Rules:

- Escape the dollar of a GitHub expression inside a template literal:
  `` `\${{ secrets.${name} }}` ``. Plain strings (`'${{ vars.X }}'`) need
  no escape.
- Give the expected form one helper (`fromSecret(name)`) and reuse it, so
  the escape is written once.
- Make sure the red run fails on the assertion's value, not on a
  TypeScript or parse error; see `watch-the-red-run-before-the-fix.md`.
