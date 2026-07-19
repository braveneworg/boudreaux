<!-- This Source Code Form is subject to the terms of the Mozilla Public
 License, v. 2.0. If a copy of the MPL was not distributed with this
 file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# boudreaux — Mutation Hook Sequence Diagrams

UML **system sequence diagrams** for every TanStack Query _mutation_ hook in
[`src/hooks/mutations/`](../../../src/hooks/mutations/) — the write-side
companion to the read-side [query-hook-sequences](../query-hook-sequences/).
Each traces the full integration on a write: the calling component → the hook
(`useMutation`) → `mutationFn` → the Server Action (`'use server'`) → its
`requireRole('admin')` guard → the service / repository layer → Prisma ·
MongoDB → server-cache revalidation (`revalidatePath` / in-memory
`simple-cache`) → the result → `onSuccess` →
`queryClient.invalidateQueries(...)` → and back to the component, **including
every error and alternate path**.

All 22 diagrams are rendered to a single landscape, grayscale PDF:
[mutation-hook-sequences.pdf](mutation-hook-sequences.pdf). The Mermaid source
for each diagram lives in [diagrams/](diagrams/). Project conventions referenced
throughout come from [CLAUDE.md](../../../CLAUDE.md).

> **Accessibility:** diagrams are grayscale, high-contrast, and avoid text
> smaller than ~10px so they stay legible in black-and-white print.

---

## How to read these diagrams

The system follows the posture [CLAUDE.md](../../../CLAUDE.md) mandates:
**mutations go through Server Actions (`src/lib/actions/`, `'use server'`), the
repository layer (`src/lib/repositories/`) wraps all Prisma access, and services
(`src/lib/services/`) hold business logic.** The mutation hooks are the
client-side wrapper that the [revamp](../../../CLAUDE.md) standardized so admin
edits invalidate cached data and appear immediately across the site.

Three boundaries recur in every diagram:

- **Client vs. server** — the hook and component run in the browser; the Server
  Action, service, repository, and Prisma run on the server.
- **The `mutationFn`** — wraps the existing Server Action unchanged and returns
  its result. For form actions that is the `FormState`
  ([src/lib/types/form-state.ts](../../../src/lib/types/form-state.ts)); the
  hook never reshapes it, so call sites keep rendering field-level errors.
- **The `onSuccess` invalidation gate** — `onSuccess` checks `result.success`
  and, only then, calls
  `queryClient.invalidateQueries({ queryKey: queryKeys.<entity>.all })`
  ([src/lib/query-keys.ts](../../../src/lib/query-keys.ts)). A validation
  failure resolves with `success:false`, so `onSuccess` still fires but the
  guard skips invalidation.

### Two result contracts you will see

| Contract                 | Hooks                                                                                                                       | On auth failure                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **`FormState`**          | create/update release · artist · tour · tour-date · venue · featured artist · upsert banner                                 | `requireRole` **throws** → `mutationFn` rejects → `onError` (no invalidation) |
| **`{ success, error }`** | delete tour/tour-date/banner · headliner set-time/remove/reorder · publish featured artists · cover-art · rotation interval | auth caught **internally** → resolves `{ success:false }` → `onSuccess` no-op |

Both contracts expose `result.success`, so the same `onSuccess` guard governs
invalidation either way.

### What each mutation invalidates

| Domain                                  | Client query keys invalidated | Server-side revalidation                                                                              |
| --------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Releases (create/update/cover)          | `releases.all`, `artists.all` | `revalidatePath('/releases','/releases/{id}','/artists/[slug]')` + `ReleaseService.invalidateCache()` |
| Artists (create/update)                 | `artists.all`, `releases.all` | `revalidatePath('/admin/artists','/artists/{slug}','/releases')` + `ReleaseService.invalidateCache()` |
| Tours (create/update/delete)            | `tours.all`                   | `revalidatePath('/admin/tours','/tours','/tours/{tourId}')`                                           |
| Tour dates & headliners                 | `tours.all`                   | `revalidatePath('/admin/tours','/tours','/tours/[tourId]')`                                           |
| Venues (create/update)                  | `venues.all`, `tours.all`     | `revalidatePath('/admin/tours…','/tours','/tours/[tourId]')`                                          |
| Featured artists (create/cover/publish) | `featuredArtists.all`         | `cache.deleteByPrefix('featured-artists:')` + `revalidatePath('/')`                                   |
| Banners (upsert/delete/rotation)        | `banners.all`                 | `revalidatePath('/','/admin/notifications')` + service-cache invalidation                             |

---

## Regenerating

```bash
node docs/auto-generated/mutation-hook-sequences/build.mjs
```

The script writes `diagrams/*.mmd`, assembles an HTML page (Mermaid from CDN),
and prints the landscape PDF with headless Chromium via Playwright (already
installed for E2E — no new dependencies). It fails loudly if any diagram does
not produce an SVG, so a Mermaid syntax error never silently ships a blank page.
