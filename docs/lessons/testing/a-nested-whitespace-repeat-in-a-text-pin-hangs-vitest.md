# A nested whitespace repeat in a text-pin regex hangs vitest

Workflow and script "pin" specs read a YAML or shell file as text and
assert on it with regexes. A pattern of the shape
`name:\n(\s+[^\n]*\n)*?\s+key: value` looks like "the input block for
`name`, somewhere below it `key: value`". It is also a classic
catastrophic-backtracking pattern: `\s+` matches newlines, so the group
and the outer `\s+` can split the same whitespace in exponentially many
ways, and when `key: value` is absent (or later than the engine first
tries) the match never returns.

On 2026-10-15 four such patterns in `scripts/ci/rollback-workflows.spec.ts`
made `vitest run` print `RUN` and nothing else, for minutes, with no
failure and no test name. The first runs were read as a stuck vitest, a
combined-run problem, and a process to kill. It was the spec.

Rules:

- Slice first, then match. Cut the block out with `indexOf` and a bounded
  `search` (the `jobBlock` / `stepBlock` / `inputBlock` helpers), then run
  a short anchored regex on the slice. Never let one regex both find a
  block and search inside it.
- In a text-pin regex, never nest a repeated group whose body can match
  whitespace inside a repeat that can also match whitespace. Use ` +` (a
  literal space) for indentation, `[^\n]*` for the rest of a line, and a
  single `\n` between lines.
- A vitest run that prints `RUN` and then nothing, with no test names,
  is a spec that does not finish evaluating, not a slow suite. Run the
  spec alone with `timeout 60`, and read the newest regexes before
  blaming the runner.
