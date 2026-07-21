# LoadMoreTrigger: don't click the transient button — scroll to load

The admin data-view footer (`LoadMoreTrigger`) auto-loads the next page via an
IntersectionObserver on the SAME sentinel div that holds the "Load More"
`<Button>`, so `getByRole('button', { name: 'Load More' }).click()` RACES the
auto-load: Playwright scrolls the button into view → the observer fires
`fetchNextPage` → `isFetchingNextPage` swaps the button for the spinner → the
button detaches mid-click ("element was detached from the DOM") and, once
loading finishes ("All items loaded"), never returns → the click retries until
it times out and closes the browser. It only loses under parallel load
(`workers: '50%'` in CI vs `1` locally, so a single fast worker always wins) —
reproduce with `pnpm exec playwright test <spec> --workers=8 --repeat-each=6
--retries=0` (NOT `pnpm run test:e2e -- …`, which silently swallows the
flags). Fix: don't click the transient button — trigger the footer auto-load
by scrolling to the bottom in a `toPass` loop and assert the loaded result
(see `e2e/helpers/infinite-scroll.ts` `scrollToLoad`).
