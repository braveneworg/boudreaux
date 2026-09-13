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
