# Parallel agents share one scratchpad

Subagents launched from one session get the same scratchpad directory. On
2026-11-05 four builders ran at once. One wrote its commit message to
`msg2.txt` and committed with `git commit -F msg2.txt`. Seconds later
another builder wrote its own `msg2.txt` (a `fix(tours)` message) over it.
The first commit had already been made, so its message was right. Had the
overwrite landed between the write and the commit, a forms change would
have shipped under a tours header, and the hooks would have passed it. Gate
logs collided the same way: two builders' `test.log` runs interleaved
(`1020 passed` above `1019 passed`), and only one of them was the branch's.

Rules:

- Prefix every scratchpad file with your task or branch (`card2-msg3.txt`,
  `card4-test.log`), or keep it under a folder of your own
  (`scratchpad/card4/`). Never use a bare `msg.txt`, `test.log`, `gate.log`
  or `final/`. Passing the commit message on stdin (`git commit -F -` with
  a heredoc) avoids the shared file altogether.
- Write the message file and commit in consecutive calls, then read the
  message back (`git log -1 --format=%B`) and compare it with what you
  meant before pushing.
- Treat a scratchpad file you did not just write as another agent's: never
  reuse or delete it. A gate log that shows two summaries, or counts that
  move between runs of the same tree, has another writer. Re-run with a
  private log path before trusting it.
