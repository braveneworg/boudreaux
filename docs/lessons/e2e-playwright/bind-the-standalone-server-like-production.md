# Bind the standalone E2E server like production

The E2E harness bound `node .next/standalone/server.js` with
`HOSTNAME=127.0.0.1`. Production does not: its container leaves
`HOSTNAME` at the container's name. On 2026-10-17 (PR #899, CI shard 3)
the proxy's `NextResponse.rewrite(request.nextUrl, { status: 404 })` for
`/releases/<id>` hung on that server. The server logged
`Failed to proxy http://localhost:3000/releases/<id> Error: socket hang up`
and both themed-404 tests timed out. The dev server passed them.

`NextURL` (`next/dist/server/web/next-url.js`) renames a `127.x.x.x`,
`[::1]` or `localhost` host to `localhost`, so the proxy's
`request.nextUrl` reads `http://localhost:3000/...`. The router
relativises `x-middleware-rewrite` against its own origin, which it builds
from the bind hostname (`resolve-routes.js`, `getRelativeURL`):
`http://127.0.0.1:3000`. The two origins differ, so the router treats the
same-URL rewrite as external and `proxyRequest`s to itself in a loop.
Bound to `0.0.0.0` or a named host, the origins agree and the rewrite
renders in place with a 404. A local standalone probe returned 404 for
`0.0.0.0` and for the machine's own hostname, and hung for `127.0.0.1`.

- Keep `webServer.env.HOSTNAME` at `0.0.0.0` in `playwright.config.ts`.
  The base URL stays `http://127.0.0.1:<port>` for the macOS IPv6
  reason in that file's comment; only the bind address changes.
- A proxy rewrite that passes on `next dev` and hangs only in CI points
  at the bind hostname. Reproduce on a local standalone build first
  (`reproduce-on-a-local-production-build.md`), then curl the URL against
  the server bound each way.
