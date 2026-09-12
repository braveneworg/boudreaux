# Stub env in `beforeEach`, never `beforeAll`

`setupTests.ts` runs `vi.unstubAllEnvs()` in a global `afterEach`, so a
`vi.stubEnv(...)` placed in `beforeAll` survives only the FIRST test of the
file. Everything after reads the real (or absent) variable and fails in a way
that looks unrelated: the Turnstile gate's real-instance spec (2026-09-12)
stubbed `AUTH_SECRET` in `beforeAll`, and its third case got a 403 from a
cookie signed with one secret and checked with another — the hook, the cookie
parsing, and better-auth were all fine. Stub per test in `beforeEach`; keep
`beforeAll` for one-time construction that does not read the env at call time.
