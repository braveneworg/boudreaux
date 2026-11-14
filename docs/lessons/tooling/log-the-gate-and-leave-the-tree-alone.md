# Log each gate step to a file, and do not edit while the gate runs

The four-command gate takes minutes, so it is tempting to run it in the
background with its output thrown away and keep working. Both halves of
that went wrong on 2026-11-13, building the community page.

**The output was discarded.** The gate ran as

```bash
pnpm run typecheck && pnpm run test:run > /dev/null 2>&1 \
  && pnpm run lint > /dev/null 2>&1 && pnpm run format > /dev/null 2>&1 && echo GATE-OK
```

It exited 1 and printed nothing that said which step had failed. The whole
unit suite was run again to find out, and passed: the failure was two
`detect-object-injection` warnings from lint, a ten-second step. The full
rerun cost about five minutes for nothing.

**The tree moved under it.** A later gate was started in the background, and
new spec files and a stand-in module were written while it ran. It passed.
What it had checked was a tree that existed for part of the run: the unit
step had collected its files before the new specs appeared, and lint and
format then ran over files the test step never saw. A pass like that proves
nothing about the commit it was meant to guard, and the gate had to be run
again on the finished tree.

Rules:

- Send each step's output to its own log and print the tails afterwards,
  so a failure names its step without a second run:

  ```bash
  L=<scratchpad>
  pnpm run typecheck > "$L/gate-typecheck.log" 2>&1 \
    && pnpm run test:run > "$L/gate-unit.log" 2>&1 \
    && pnpm run lint > "$L/gate-lint.log" 2>&1 \
    && pnpm run format > "$L/gate-format.log" 2>&1 && echo GATE-OK
  tail -3 "$L/gate-typecheck.log"
  grep -E '^ FAIL|Tests  |Test Files  ' "$L/gate-unit.log"
  tail -5 "$L/gate-lint.log"
  ```

  The logs go in the scratchpad, never in the tree: Tailwind scans the tree
  and lint reads it.

- Never write `> /dev/null` on a gate step. A step that fails must leave
  its reason somewhere.
- While a gate runs, edit nothing under the repository. Read, plan, or
  draft in the scratchpad. A gate result belongs to one tree; if the tree
  changed during the run, the result is void and the gate runs again.
- `lint` and `format` write to the tree (`--fix`, `--write`). A file read
  before the gate may have changed after it; read it again before an edit
  that depends on its text.
- See also [`pipefail-on-gate-commands.md`](pipefail-on-gate-commands.md):
  trimming a gate's output with a pipe hides its exit code.
