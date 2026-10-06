# A client-reachable module must not import a `server-only` one

`src/lib/utils/sanitize-bio-html.ts` imports `server-only`. On 2026-10-06
the new `artist-links.ts` imported its `sanitizeBioText` for the stored
form of a link label, and `artist-links-schema.ts` imported `toContactHref`
from `artist-links.ts` for a form rule. The schema is reached from the
client: `shared-schema.ts` → `featured-artist-schema.ts` →
`use-active-featured-artists-query.ts` → `home-content.tsx`. The dev server
then refused to compile at all:

```
Error: You're importing a module that depends on "server-only". This API
is only available in Server Components in the App Router, but you are
using it in the Pages Router.
```

Nothing before the dev server saw it. `pnpm run typecheck` passed (a
`server-only` import is a plain side-effect import), every unit spec
passed (Vitest mocks nothing about it and runs in Node), and the repo-wide
lint passed. The first E2E run timed out waiting for the web server, with
the real error buried in the `[WebServer]` lines of the log.

Rules:

- A module that a form, a Zod schema, a hook or a component imports is
  client-reachable, whatever directory it sits in. It may import only
  client-safe utilities; the server half of a feature (anything touching
  `sanitize-html`, Prisma, the file system, secrets) goes in a sibling
  module that itself imports `server-only`, and only services and actions
  import that one. `artist-links.ts` (client-safe) beside
  `sanitize-artist-links.ts` (server) is the shape.
- Before adding an import from `src/lib/utils/` or `src/lib/validation/`,
  grep the target for `server-only` and for packages that need Node; if it
  has either, the import belongs in the server module.
- Run the dev server (or the E2E suite, which starts one) before pushing a
  change that adds an import to a shared utility or schema. Typecheck, unit
  specs and lint cannot see this failure.
- When an E2E run reports only a web-server timeout
  (`Timed out waiting … from config.webServer`), read the `[WebServer]`
  lines above it: the server failed to compile, and the first `⨯` block
  names the module.
