# A session-gated page hydrates after the header has fetched the session

better-auth's `useSession` starts pending and fetches the session once a
component subscribes. The header subscribes as soon as it hydrates. A page
under a `loading.tsx` hydrates later, as its own Suspense boundary, once
its page chunk has loaded. When the session fetch lands first, the page's
hydrating render sees the resolved session. The server rendered the pending
branch, so React reports a mismatch (#418 in production) and throws the
server HTML away.

`ProfileForm` did this on `/profile`. The server rendered the skeleton, and
the hydrating client rendered the form. The builder of PR #933 saw it in
the dev-server log and left it unconfirmed. On 2026-11-08 it reproduced on
both servers:

- On a local production build it happened in 4 of 10 plain loads. With the
  form's chunk held for 1.5 s it happened in 10 of 10.
- On the dev server it happened in 4 of 5 loads with the chunk held.

The held chunk stands in for a slow phone. The header's mount gates
(`desktop-auth-menu.tsx`, `use-nav-menu-items.ts`) never covered page
consumers.

Rules:

- A component that renders in the server HTML and branches on `useSession`
  must render its pending branch until it has hydrated. Gate it on
  `useHydrated()` (`src/hooks/use-hydrated.ts`):
  `if (!isHydrated || status === 'loading' || !user) return <Skeleton />`.
  It needs no effect, and React re-renders once hydration ends.
- Unit-test it the way `profile-form.spec.tsx` "hydration safety" does.
  Render with `renderToString` while the session is loading, switch the
  mock to authenticated, `hydrateRoot`, and assert that
  `onRecoverableError` was never called.
- To reproduce in E2E, hold the chunk that carries the component. Dev chunk
  names are hashed, so find it by its content: `route.fetch()`, check the
  body for copy only that component renders, wait, then `route.fulfill`.
  `e2e/tests/profile/profile-hydration.spec.ts` does this.
- A hydration error that only the dev server log shows is still worth a
  production-build run before anyone drops it. The dev log only made it
  visible; the race was in production too.
