# The suite must not reach the live CDN

`page.goto` resolves at the `load` event, and `load` waits for every image
the page started. An image request to a third-party host that never
answers therefore holds `goto` until its `navigationTimeout` fails the test.

On 2026-10-19 CI run 2601 (push to `main` at `e2e5afd2`, shard 3) failed
`home-spotlight-grid.spec.ts` "opens the modal artist first" this way. The
trace's network log showed `GET /` and every app chunk, stylesheet, font
and `/media/*` asset answered 200 in under 130 ms, and the screenshot
showed the home page fully rendered. Two image requests to
`https://cdn.fakefourrecords.com/media/...` never completed (status -1), so
`goto` hit its 30 s limit. The same commit passed all three shards on its
PR run and on the next PR's run. The app was not the cause; the harness
depended on the internet.

The suite reaches the CDN through the default banner and heading art (the
custom image loader) and through the seed's literal bio image URLs. A local
run of the new `cdn-fixture.spec.ts` without the route stalled the same way
on `inline_w640.webp`.

Rules:

- Import `test` and `expect` from `e2e/fixtures/base.fixture`. Its
  `context` override and every page fixture call `routeCdn(context)`
  (`e2e/helpers/cdn-mock.ts`), which answers `cdn.fakefourrecords.com` with
  a local PNG.
- Route the host at the context level, not the page level. A context route
  also covers pages opened later in that context, and a spec's own
  `page.route` still runs first and can `route.fallback()` to it.
- A context a spec creates with `browser.newContext` does not pass through
  the fixture. Call `await routeCdn(context)` before using it.
- A `goto` timeout whose trace shows the page rendered and only third-party
  requests at status -1 is this failure. Route the host; do not retry and do
  not raise the timeout.
