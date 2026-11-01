# Scope a lint rule in the config — never disable it inline

`src/AGENTS.md` forbids every inline suppression: no `oxlint-disable` (nor the
legacy `eslint-disable`), no `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`.
When a rule is genuinely inapplicable to a file, the file goes into a scoped
`overrides` block in `.oxlintrc.json`, with a comment saying why.

On 2026-10-04 (PR #819) the credit-order scan spec read the repositories'
own sources with `readdirSync` / `readFileSync` on computed paths, tripped
`security/detect-non-literal-fs-filename`, and shipped with two
`eslint-disable-next-line` comments. Lint passed — the rule only forbids
the warning, not the comment — so nothing caught it until a later re-read.

`.oxlintrc.json` already has the block for exactly this case: "Scoped
rule exceptions", the allowlist for `detect-non-literal-fs-filename`, where
every file doing real file I/O on server-computed paths is listed with a
one-line reason (`vitest.config.spec.ts`, `bio-generator/src/template.spec.ts`,
the upload route, …).

Rules:

- When a lint error tempts an inline disable, search `.oxlintrc.json` for
  the rule name first. If a scoped block exists, add the file there with a
  reason; if none exists and the rule truly cannot be satisfied, add one.
- Before committing, grep the staged diff for `oxlint-disable`,
  `eslint-disable` and `@ts-` suppressions:
  `git diff --cached | grep -nE '(ox|es)lint-disable|@ts-(ignore|expect-error|nocheck)'`.
