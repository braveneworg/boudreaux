# Prefix every file in a shared scratchpad with your task

Parallel builders launched from one orchestrator session share that
session's scratchpad directory. On 2026-11-05 two builders each wrote their
commit message to `msg2.txt` there and committed with `git commit -F`; one
file overwrote the other between a write and its commit. The same applies to
the gate logs everyone names `lint.log`, `test.log`, `tc.log`.

Rules:

- When other agents may share the scratchpad, prefix every file you write
  there with your task (`card1-msg2.txt`, `card1-test.log`), or pass commit
  messages on stdin (`git commit -F -` with a heredoc) so no file is shared.
- After committing from a file, read the message back
  (`git log -1 --format=%B`) before the next commit.
- Never trust a log you did not just write: re-run the gate rather than
  reading a `test.log` another builder may have replaced.
