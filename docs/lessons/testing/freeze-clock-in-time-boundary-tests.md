# Freeze the clock in time-boundary tests

`src/lib/utils/async-job-lifecycle.spec.ts` ("treats a job exactly at the
window boundary as live") built `startedAt` from one `Date.now()` read, and
`isStaleJob` read `Date.now()` again. When the clock advanced a millisecond
between the two reads — likely under the full, shuffled suite — the job landed
one millisecond past the window and the assertion flipped. The gate failed
intermittently (2026-09-13) while the file passed on its own; simulating a
1 ms tick between the reads reproduced the failure every time.

A test that asserts behavior exactly at a time boundary must freeze the clock:
`vi.useFakeTimers()` plus `vi.setSystemTime(...)` in `beforeEach`, and
`vi.useRealTimers()` in `afterEach` — the setup file doesn't restore timers,
and tests run in shuffled order. Tests with a wide margin (e.g. ±60 s) don't
need it, and functions that take `now` as an argument can be given a fixed
value instead.
