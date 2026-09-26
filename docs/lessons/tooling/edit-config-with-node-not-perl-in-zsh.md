# Edit code with a quoted-heredoc Node script, not `perl -pi` in a zsh string

A `perl -0pi -e "s|...|...|"` run from the Bash tool to insert Vitest alias
lines (2026-09-25) silently corrupted `vitest.config.ts`: inside the
double-quoted zsh string, `\$/` reached perl as `$/` (its input-record
separator, a newline) and `\\/` collapsed to `/`, so every `/^lucide-react$/`
regex literal was written as `/^lucide-react` followed by a NUL byte. Vitest
then failed at startup with "Unexpected flag t in regular expression literal",
and two follow-up Node edits also failed because their anchor strings no
longer matched the mangled file — three wasted full-suite runs before
`cat -A` showed the `^@`.

Rules:

- For any edit whose replacement contains `$`, `/`, `\`, backticks, or
  quotes, write a Node script fed through a **single-quoted heredoc**
  (`node - <<'EOF' … EOF`): the shell expands nothing, and the script can
  assert its anchor exists before writing.
- Keep `perl -pi` / `sed -i` for plain-word substitutions only (the 133
  `@vitest-environment` pragma swaps were fine).
- After any inline edit of a config file, run the tool that consumes it
  once (`pnpm exec vitest run <one spec>`) before starting timed or
  full-suite runs; a startup error at 0.2s means the file, not the tests.
- When a later edit reports "anchor not found" on a file you just changed,
  inspect the bytes (`sed -n 'N,Mp' file | cat -A`) instead of retrying with
  a different anchor.
