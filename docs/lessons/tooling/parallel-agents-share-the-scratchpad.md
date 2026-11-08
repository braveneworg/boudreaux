# Parallel agents share the scratchpad: name files for your own work

Subagents launched by one session get the same scratchpad directory. On
2026-11-05 four builders ran in parallel, and one of them wrote its commit
message to `msg2.txt` and committed with `git commit -F msg2.txt`. Seconds
later another builder wrote its own `msg2.txt` (a `fix(tours)` message)
over it. The first commit had already been made, so its message was right;
had the overwrite landed between the write and the commit, a forms change
would have shipped under a tours header, and the hooks would have passed it.

Rules:

- Prefix every scratchpad file with your branch or card
  (`card2-msg3.txt`, `fix-form-failure-codes-e2e.log`), never a bare
  `msg.txt`, `commit.log` or `final/`.
- Write the message file and commit in consecutive calls, then read
  `git log -1 --format=%s` and compare it with the header you meant.
- Treat a scratchpad file you did not just write as another agent's: read
  it before reusing it, and never delete it.
