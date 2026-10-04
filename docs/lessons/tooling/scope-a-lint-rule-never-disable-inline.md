# Scope a lint rule in the config — never disable it inline

`src/AGENTS.md` forbids every inline suppression: no `eslint-disable`, no
`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`. When a rule is genuinely
inapplicable to a file, the file goes into a scoped block in
`eslint.config.mjs`, with a comment saying why.

On 2026-10-04 (PR #819) the credit-order scan spec read the repositories'
own sources with `readdirSync` / `readFileSync` on computed paths, tripped
`security/detect-non-literal-fs-filename`, and shipped with two
`eslint-disable-next-line` comments. Lint passed — the rule only forbids
the warning, not the comment — so nothing caught it until a later re-read.

`eslint.config.mjs` already has the block for exactly this case: "Scoped
rule exceptions", the allowlist for `detect-non-literal-fs-filename`, where
every file doing real file I/O on server-computed paths is listed with a
one-line reason (`vitest.config.spec.ts`, `bio-generator/src/template.spec.ts`,
the upload route, …).

Rules:

- When a lint error tempts an inline disable, search `eslint.config.mjs` for
  the rule name first. If a scoped block exists, add the file there with a
  reason; if none exists and the rule truly cannot be satisfied, add one.
- Before committing, grep the staged diff for `eslint-disable` and
  `@ts-` suppressions: `git diff --cached | grep -nE 'eslint-disable|@ts-(ignore|expect-error|nocheck)'`.
