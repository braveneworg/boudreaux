# A real 308 or 404 under a `loading.tsx` comes from the proxy

The root `src/app/loading.tsx` wraps every page in a Suspense boundary, and
`/releases` has its own. A page under them streams its shell — and a `200` —
before its body runs, so `permanentRedirect()` and `notFound()` there can
only redirect on the client and render the not-found UI under that `200`.
Even a page that calls `notFound()` synchronously, with no `await`, answered
`200` (measured on the dev server, #896). The existing
`/artists/[slug]/bio` redirect stub has the same `200`.

Round 1 of #896 moved the legacy `/releases/[releaseId]` URL to a route
handler, which does answer a real `308`/`404` — but a route handler's
`notFound()` is a blank 404 body, and the segment's themed `not-found.tsx`
never rendered. `NextResponse.rewrite()` from a route handler is a `500`
("not currently supported").

What works: the proxy (`src/proxy.ts`, Node runtime in Next 16) decides the
status before rendering. `NextResponse.redirect(absoluteUrl, 308)` gives the
308 (Next serves a same-origin location relative; a relative `Location`
header in a proxy response is an "Invalid URL" `500`).
`NextResponse.rewrite(request.nextUrl, { status: 404 })` to a page that
calls `notFound()` renders that segment's `not-found.tsx` with a real `404`.
Prisma and `server-only` modules import fine into the proxy.

Rules:

- When a page must answer a real status (redirect, 404) and sits under any
  `loading.tsx`, decide the status in the proxy, and add the path to its
  `matcher` ahead of the auth gates.
- Keep the proxy's work to one cheap check per request on that path only.
- The dev server does not reload `proxy.ts` edits reliably — restart it
  before probing a proxy change with `curl`.
- A local `pnpm run build` points `assetPrefix` at the real CDN, so its
  pages never hydrate in a browser. Build with `SKIP_CDN_ASSET_PREFIX=1`
  (and the Docker `DATABASE_URL`) for a local visual check.
