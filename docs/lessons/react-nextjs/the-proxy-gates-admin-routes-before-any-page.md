# The proxy gates `/admin` before any layout or page

`src/proxy.ts` answers `403 {"error":"Forbidden"}` for every request under
`/admin` whose session cookie caches a role other than `admin`. It runs
before the route tree, so nothing a layout, a page or the action gate allows
matters once it has refused.

On 2026-11-11 the approver section (`/admin/community`, ADR-0025) was built
for a new `manager` role. The action gate gained an `'approver'` access, the
pages asked for it, and every unit spec passed. Nobody had opened the proxy.
The first E2E run showed a manager reaching `/admin/community` and then,
two requests later, the bare `Forbidden` JSON on another admin route.

The gate is optimistic: it only refuses on a role the cookie cache holds,
and a cache miss falls through to the page. A session made straight in the
database (a stamped E2E user, a fresh sign-in) has no cache on its first
request, so that request passed. better-auth then wrote the cache, and from
the next request on the proxy saw `manager`. In production a manager would
have been refused at the one section they are allowed into, on everything
after their first page load.

Rules:

- A new role, or a new section a non-admin role may reach, is a change to
  three places: the action gate (`auth/action-gate.ts`), the proxy's
  `handleAdminAuthorization`, and the pages. Grep `src/proxy.ts` for the path
  prefix before calling an access change done.
- The proxy cannot be seen from a unit spec of a page or an action. Cover
  the role in `src/proxy.spec.ts` with `withCachedRole`, including a path
  that merely shares the prefix (`/admin/community-archive`).
- In E2E, a first request is not proof. A stamped user's first request has
  no cookie cache; make a second request to the section after any page load
  before trusting it. `community-submissions.spec.ts` returns to the queue
  after visiting other admin routes.
- Do not assert which of the two refusals a non-admin gets on an admin
  route. Before the cache is written it is the admin layout's error page;
  after, the proxy's 403. Assert either, with `locator.or()`.
- A layout does not render again on a client-side navigation between its
  pages, so a section a lesser role may enter must not share the admin
  layout. `src/app/(approver)/admin/community/` is its own route group, and
  each page there asks for its own access.
