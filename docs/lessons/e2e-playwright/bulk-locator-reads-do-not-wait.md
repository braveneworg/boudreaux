# Bulk locator reads do not wait

`locator.allTextContents()`, `allInnerTexts()`, `all()` and `count()` return
immediately with whatever matches _now_ — zero elements is a valid answer,
not a wait. A spec that calls one straight after `page.goto` passes on a fast
machine and returns `[]` on a loaded CI runner where the nav had not rendered
yet. On 2026-10-04 `admin-nav.spec.ts` "places Videos immediately after
Releases" failed exactly so on a docs-only PR (run 37177247759): the failure
snapshot showed every link present, the trace network log showed only 200s,
and the local dev-server run passed 15/15.

Read the state through an auto-retrying expectation first —
`await expect(links).toHaveText([...])`, `toHaveCount(n)` — and only then
take a bulk read if the assertion needs the raw array. Before blaming CI,
download the run's `playwright-results-*` artifact: the `error-context.md`
snapshot and `trace.zip`'s `*.network` say whether the page was still
loading or something returned 4xx.
