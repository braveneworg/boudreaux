# Parallel agents share one scratchpad

Subagents launched from one session get the same scratchpad directory. On
2026-11-05 four builders ran at once. One wrote its commit message to
`scratchpad/msg2.txt` while another builder was about to commit from a file
of the same name, and a gate script wrote `test.log` beside another
builder's `test.log`. The gate's summary then showed two runs interleaved
(`1020 passed` above `1019 passed`), and only one of them was this branch's.
Nothing wrong was committed, but only because the message file was used
before it was overwritten.

Rules:

- In a session that runs agents in parallel, write scratch files only under
  a folder or prefix of your own (`scratchpad/card4/`, `card4-msg.txt`).
  Never use a generic name like `msg.txt`, `test.log` or `gate.log`.
- After committing from a message file, read the message back
  (`git log -1 --format=%B`) before pushing.
- A gate log that shows two summaries, or counts that move between two
  runs of the same tree, has another writer. Re-run with a private log
  path before trusting it.
