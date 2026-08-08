# Persistent mock implementations poison shuffled tests

`vitest.config.ts` sets `sequence.shuffle: { tests: true }` and
`clearMocks: true` — calls are cleared between tests but mock
IMPLEMENTATIONS persist, and tests run in a RANDOM order within each file.
A `mockRejectedValue`/`mockResolvedValue`/`mockImplementation` set inside
one test therefore leaks into whichever tests happen to run after it that
round, producing failures that appear and move around non-deterministically
(a rejection from test A surfacing in unrelated test B).

Inside a test body, always use the `…Once` variants
(`mockRejectedValueOnce`, `mockResolvedValueOnce`) or reset the mock at the
end of the test; reserve persistent implementations for `beforeEach`, where
every shuffle order receives them identically. When a failure message shows
an error string that only one OTHER test defines, suspect this leak first.
