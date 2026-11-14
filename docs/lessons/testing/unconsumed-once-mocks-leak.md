# An unconsumed `mock…Once` value leaks into a later test

`vi.clearAllMocks()` / `mockClear()` reset calls and results but do NOT
drain queued one-shot values — only `mockReset()` does. So a
`mockRejectedValueOnce(...)` that the code under test never reaches (it
threw earlier on a different mock) stays queued and fires in whichever
shuffled test next calls that mock. Writing the "re-buffer after a failed
email" case for `chat-mention-service` (2026-09-13) queued an SES rejection
that the pre-fix code never consumed; three unrelated email-path tests then
failed with `SES down`.

Queue a one-shot value only on the exact call the flow will reach, in call
order (`mockResolvedValueOnce(1).mockRejectedValueOnce(err)` when the second
call is the one that must fail). If a test can legitimately leave a queue
unconsumed, `mockReset()` that mock in `afterEach`. When a failure message
names an error that only one OTHER test defines, suspect this leak first —
see also `persistent-mock-implementations-poison-shuffled-tests.md`.

It happened again on 2026-11-11, writing `submission-service.spec.ts`, in
two shapes at once. An `it.each` over four states set
`countAwaitingBefore.mockResolvedValue(0)` "in case" the state reached the
count; only one state could, and that one was not seeded to reach it, so the
persistent `0` answered a later test that expected `3`. A second test queued
`mockResolvedValueOnce(0)` for a draft, a state that never counts. Both were
set for a branch the case does not take.

- Before setting a mock in a test, name the line of the code under test that
  will consume it in that case. If no line does, the mock does not belong
  there.
- In an `it.each`, a mock every row sets must be one every row consumes. A
  row that differs gets its own test.
- After writing a spec, run it under a few seeds
  (`vitest run <file> --sequence.seed=17`), not only the default order.
