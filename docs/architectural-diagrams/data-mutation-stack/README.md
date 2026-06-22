<!--
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->

# Data Mutation Stack — Architecture Diagrams

This document explains how **data flows through boudreaux** along one vertical
slice: from a user filling in a React Hook Form, through the mutation/query
hooks, into Server Actions and API routes, down through Services and
Repositories, and back out as cache invalidation that refreshes the screen.

It focuses on five moving parts and how they cooperate:

- **React Hook Form (RHF) + Zod** — the form layer that collects and validates input.
- **`useMutation` hooks** — the client-side write path (create / publish / delete).
- **`useQuery` hooks** — the client-side read path (lists and detail views).
- **Server Actions** — the server entry point for mutations.
- **Services + Repositories** — business logic and database access behind every action and route.

Every diagram is rendered to a single **landscape, grayscale page** in
[`data-mutation-stack.pdf`](./data-mutation-stack.pdf). The Mermaid sources live
in [`diagrams/`](./diagrams), and [`build-pdf.js`](./build-pdf.js) regenerates the
output (see [Rebuilding the PDF](#rebuilding-the-pdf)).

These patterns are the conventions described in the project's
[`CLAUDE.md`](../../../CLAUDE.md) (see its **Architecture** and **Components,
forms, styling** sections); this document illustrates _why_ they are shaped the
way they are.

---

## Table of contents

1. [Frontend Architecture — Forms, Mutation & Query Hooks](#1-frontend-architecture--forms-mutation--query-hooks)
2. [Backend Architecture — Action / Service / Repository Layers](#2-backend-architecture--action--service--repository-layers)
3. [Sequence — Create via React Hook Form (Mutation)](#3-sequence--create-via-react-hook-form-mutation)
4. [Sequence — Admin Entity Action (Delete / Publish)](#4-sequence--admin-entity-action-delete--publish)
5. [User Workflow — Admin Content Management](#5-user-workflow--admin-content-management)
6. [Cross-cutting decisions & trade-offs](#cross-cutting-decisions--trade-offs)
7. [Rebuilding the PDF](#rebuilding-the-pdf)
8. [References](#references)

---

## 1. Frontend Architecture — Forms, Mutation & Query Hooks

**Source:** [`diagrams/01-frontend-architecture.mmd`](./diagrams/01-frontend-architecture.mmd)

### What it shows

The browser-facing layer is split in two. **Server Components** (the default in
the Next.js App Router) render pages and can fetch data directly on the server.
**Client Components** (marked `'use client'`) own all interactivity: the RHF
form, the reusable field components, and the two hook families that talk to the
server — `useMutation` hooks for writes and `useQuery`/`useInfiniteQuery` hooks
for reads.

The key idea is the **two outbound channels**:

- **Writes** go out through `useMutation` hooks, which call a **Server Action**.
- **Reads** go out through query hooks, which `fetch` an **API route handler** and validate the JSON with Zod.

When a mutation succeeds it **invalidates query keys**, and TanStack Query
automatically refetches anything that depended on those keys — so the list on
screen updates without manual wiring.

### How it fits

This is the client half of the request lifecycle. It deliberately keeps
components "dumb": they never touch Prisma, services, or repositories directly.
A component either renders a Server Action result or reads from a query hook.

```ts
// A query hook owns its key + queryFn and forwards the AbortSignal so the
// request is cancelled on unmount, invalidation, or a superseding refetch.
// src/app/hooks/use-featured-artist-query.ts
export const useFeaturedArtistQuery = (
  featuredArtistId: string,
  options: QueryOptionsOverride<FeaturedArtist | null> = {}
) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.featuredArtists.detail(featuredArtistId),
    queryFn: ({ signal }) => fetchFeaturedArtist(featuredArtistId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!featuredArtistId,
  });
  return { isPending, isError, error, data, refetch };
};
```

Query keys are centralised so invalidation is reliable and typo-proof:

```ts
// src/lib/query-keys.ts
featuredArtists: {
  all: ['featuredArtists'] as const,
  list: () => [...queryKeys.featuredArtists.all, 'list'] as const,
  detail: (id: string) => [...queryKeys.featuredArtists.all, 'detail', id] as const,
},
```

### The decision, and its trade-offs

**Why separate Server and Client Components?** Server Components ship zero
JavaScript for non-interactive UI, so pages are lighter and data can be read
close to the database. Interactivity is opted into only where needed.
_Benefit:_ smaller bundles, faster first paint. _Drawback:_ developers must be
deliberate about the boundary — a stray `'use client'` high in the tree pulls
everything below it onto the client.

**Why wrap every API call in a custom hook?** Each `useEntityQuery` hook locks
the `queryKey` and `queryFn` (and paging) while accepting a spread-last options
override for `enabled`/`staleTime`. _Benefit:_ call sites can't accidentally
diverge on keys, and cancellation via `AbortSignal` is automatic. _Drawback:_ a
little boilerplate per entity. The project judges the consistency worth it — see
the **Fetching** rules in [`CLAUDE.md`](../../../CLAUDE.md).

---

## 2. Backend Architecture — Action / Service / Repository Layers

**Source:** [`diagrams/02-backend-architecture.mmd`](./diagrams/02-backend-architecture.mmd)

### What it shows

Every server request passes through the same layered pipeline:

1. **Entry layer** — a **Server Action** (`'use server'`) for mutations, an
   **API route handler** for queries, or the shared **`runAdminEntityAction`**
   runner for single-id admin operations (delete / publish / restore).
2. **Cross-cutting guards** — an auth/role gate (`requireRole` / `withAdmin`),
   **Zod** validation of all external input, and side effects
   (`logSecurityEvent`, `revalidatePath`).
3. **Business logic** — a **Service** (a static class) that owns rules, caching,
   and error classification, returning a `ServiceResponse(T)`.
4. **Data access** — a **Repository** that is the _only_ place Prisma is
   touched, talking to MongoDB.

### How it fits

This is the server half of the lifecycle and the backbone the diagrams in
sections 3–4 walk through step by step. The strict layering means each concern
has exactly one home: validation in the action, rules in the service, queries in
the repository.

```ts
// Service: business rules + error classification, never raw Prisma calls.
// src/lib/services/featured-artists-service.ts
static async createFeaturedArtist(
  data: Prisma.FeaturedArtistCreateInput,
): Promise<ServiceResponse<FeaturedArtist>> {
  try {
    const artist = await FeaturedArtistRepository.create(data);
    return { success: true, data: artist };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return { success: false, error: 'Database unavailable' };
    }
    return { success: false, error: 'Failed to create artist' };
  }
}
```

```ts
// Repository: the single home for Prisma access for this model.
// src/lib/repositories/featured-artist-repository.ts
export class FeaturedArtistRepository {
  // ...returns raw Prisma results; business logic stays in the service.
}
```

The result types are intentionally small and named. Form-backed actions return
`FormState`; single-id admin actions return the plain success/error contract
named **`AdminActionResult`**.<sup>[1]</sup>

```ts
// The shared single-id runner centralises the admin-mutation contract.
// src/lib/actions/run-admin-entity-action.ts
export const runAdminEntityAction = async ({
  id,
  entityLabel,
  perform,
  event,
  metadataKey,
  revalidate,
  failureError,
}) => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }
  if (!isValidObjectId(id)) return { success: false, error: `Invalid ${entityLabel} ID` };
  try {
    const result = await perform(id);
    if (!result.success) return { success: false, error: result.error };
    logSecurityEvent({ event, userId: session.user.id, metadata: { [metadataKey]: id } });
    for (const path of revalidate) revalidatePath(path);
    return { success: true };
  } catch {
    return { success: false, error: failureError };
  }
};
```

> <sup>[1]</sup> The `AdminActionResult` name unifies a `{ success: boolean; error?: string }`
> shape that was previously duplicated across many actions
> ([PR #529](https://github.com/braveneworg/boudreaux/pull/529)). On `main`
> today the runner returns the structurally identical inline shape; the diagrams
> use the unified name.

### The decision, and its trade-offs

**Why the Service ⟷ Repository split?** Keeping Prisma in repositories means
business logic is testable with a mocked data layer, and a database swap or a
query tuning change touches one file. _Benefit:_ clear separation, easy mocking
(see the project's testing rules). _Drawback:_ more files and a little
indirection for trivial reads — accepted because the consistency pays off as the
schema grows. This is the classic
[Repository pattern](https://martinfowler.com/eaaCatalog/repository.html).

**Why a shared `runAdminEntityAction`?** Delete / publish / restore actions all
need the same five steps (admin gate → id validation → service call → audit log
→ revalidate). Centralising them makes each action file a thin, declarative
config and guarantees the audit log and revalidation are never forgotten.
_Benefit:_ one place to harden security-sensitive flows. _Drawback:_ the runner
must stay generic; anything bespoke still belongs in its own action.

---

## 3. Sequence — Create via React Hook Form (Mutation)

**Source:** [`diagrams/03-sequence-create-via-rhf.mmd`](./diagrams/03-sequence-create-via-rhf.mmd)

### What it shows

The full create path for a featured artist, end to end:

1. The user submits; RHF runs **client-side Zod validation** via `zodResolver`.
2. On success the form calls the **mutation hook**, which invokes the **Server Action**.
3. The action re-validates on the server (input is never trusted), calls the
   **Service**, which calls the **Repository** and Prisma.
4. The action logs an audit event, revalidates affected paths, and returns a
   `FormState`.
5. The form shows a toast, redirects, and the cache is invalidated so lists
   reflect the new record.

### How it fits

This is the canonical **write** path: _mutation hook → Server Action → service →
repository_. Validation happens **twice on purpose** — once on the client for
instant feedback, once on the server for safety.

```tsx
// Client form: validate, then call the mutation hook's async helper.
// src/app/components/forms/featured-artist-form.tsx
const isValid = await form.trigger(); // client Zod via zodResolver
if (!isValid) {
  toast.error('Validation failed…');
  return;
}

const values = form.getValues(); // read from RHF state, not the DOM
const result = await createFeaturedArtistAsync({ ...values, artistIds: derivedArtistIds });

if (result.success && result.data?.featuredArtistId) {
  toast.success(<ToastContent isEditMode={false} />);
  router.push('/admin?entity=featuredArtist');
} else if (!result.success) {
  toast.error(result.errors?.general?.[0] ?? 'Failed to create featured artist');
}
```

```ts
// Server Action: admin gate → server-side Zod (with coercion) → service.
// src/lib/actions/create-featured-artist-action.ts
const session = await requireRole('admin');
const { formState, parsed } = getActionState(payload, permittedFieldNames, serverSchema);
if (!parsed.success) {
  /* map Zod issues into formState.errors */ return formState;
}
const response = await FeaturedArtistsService.createFeaturedArtist(createData);
logSecurityEvent({ event: 'media.featured_artist.created', userId: session.user.id /* … */ });
revalidatePath('/'); // plus the admin paths
return formState;
```

### The decision, and its trade-offs

**Why validate on both client and server?** The client check (`form.trigger()`)
gives immediate, inline feedback; the server check is the real security boundary
because a request can arrive without the form. _Benefit:_ good UX _and_ safety.
_Drawback:_ the schema lives in two shapes — the client uses `z.number()` for
RHF compatibility while the server uses `z.coerce.number()` because `FormData`
values arrive as strings. The action documents exactly this.

**Why read `form.getValues()` instead of the DOM?** Custom components
(date pickers, async selects) don't render native named `<input>`s, so
`new FormData(formEl)` would miss them. Reading from RHF state captures every
field. _Drawback:_ the form is the source of truth, so field registration must
be correct — which RHF enforces through its typed API.

---

## 4. Sequence — Admin Entity Action (Delete / Publish)

**Source:** [`diagrams/04-sequence-admin-entity-action.mmd`](./diagrams/04-sequence-admin-entity-action.mmd)

### What it shows

The single-id admin path. A row action (e.g. **Delete**) calls a mutation hook,
which calls a **thin action** that simply forwards a config object to
**`runAdminEntityAction`**. The runner enforces the admin gate, validates the
ObjectId, calls the service's `perform`, writes an audit log, revalidates paths,
and returns an `AdminActionResult`. The hook's `onSuccess` then invalidates the
relevant query keys, and the list refetches through its API route.

### How it fits

This is the **write** path for state-changing-but-bodyless operations. Compared
with section 3, there is no form and no `FormState` — just an id in and a
success/error out. It shows how the mutation hook's `onSuccess` closes the loop
back to the query layer.

```ts
// The action is a thin, declarative config; all shared steps live in the runner.
// src/lib/actions/delete-featured-artist-action.ts
export const deleteFeaturedArtistAction = async (featuredArtistId: string) =>
  runAdminEntityAction({
    id: featuredArtistId,
    entityLabel: 'featured artist',
    perform: (id) => FeaturedArtistsService.hardDeleteFeaturedArtist(id),
    event: 'media.featured_artist.deleted',
    metadataKey: 'featuredArtistId',
    revalidate: ['/admin/featured-artists', '/'],
    failureError: 'Failed to delete featured artist',
  });
```

```ts
// The mutation hook invalidates on success, which triggers the refetch.
// src/app/hooks/mutations/use-featured-artist-mutations.ts
useMutation({
  mutationFn: ({ featuredArtistId }) => deleteFeaturedArtistAction(featuredArtistId),
  onSuccess: (result) =>
    result.success
      ? queryClient.invalidateQueries({ queryKey: queryKeys.featuredArtists.all })
      : undefined,
});
```

### The decision, and its trade-offs

**Why invalidate instead of manually editing the cache?** Invalidation lets
TanStack Query refetch the authoritative server state, so the UI can never drift
from the database. _Benefit:_ correctness with almost no code. _Drawback:_ an
extra round trip versus an optimistic local edit — a deliberate trade of a few
milliseconds for guaranteed freshness, consistent with the project's "lean on
TanStack Query caching" guidance.

**Why a guard before the mutation runs?** `runAdminEntityAction` rejects
unauthenticated callers and malformed ids _before_ any work, and every success
emits a `logSecurityEvent`. _Benefit:_ admin actions are uniformly auditable and
hard to misuse. _Drawback:_ the runner is intentionally rigid; unusual flows
opt out and implement their own action.

---

## 5. User Workflow — Admin Content Management

**Source:** [`diagrams/05-workflow-admin-content-management.mmd`](./diagrams/05-workflow-admin-content-management.mmd)

### What it shows

The admin's day-to-day loop at a glance: open `/admin`, see an entity list
(backed by a TanStack Query), then **create**, **edit**, or **publish/delete**.
Each path returns a result; failures raise a toast and stay on the list, while
successes invalidate queries and revalidate paths so the list refetches fresh
data. It also makes the **three write channels** explicit:

- **Create** → Server Action returning `FormState`.
- **Edit** → `PATCH` **API route** with a JSON body.
- **Publish / Delete** → Server Action returning `AdminActionResult`.

### How it fits

This is the highest-level view — it ties sections 1–4 together into the loop a
human actually experiences, and it honestly shows that **edit** is the one
mutation that goes through an API route rather than a Server Action.

### The decision, and its trade-offs

**Why is edit a `PATCH` route when other mutations are Server Actions?** The
convention in [`CLAUDE.md`](../../../CLAUDE.md) is _mutations → Server Actions,
queries → API routes_. Edit is the pragmatic exception: it sends a partial JSON
body and reuses the same `/api/featured-artists/[id]` resource the detail view
already reads. _Benefit:_ one REST resource for read + update, simple partial
updates. _Drawback:_ it diverges from the "mutations are actions" rule, so the
form carries two submit branches (action for create, `fetch` for edit). Calling
this out keeps the inconsistency visible rather than hidden.

**Why funnel every outcome back to the list?** A single "invalidate →
refetch → re-render" path means there is exactly one way the UI learns about
change, regardless of which channel performed it. _Benefit:_ predictable,
debuggable refresh behaviour. _Drawback:_ everything depends on correct query
keys — which is exactly why they are centralised in `query-keys.ts`.

---

## Cross-cutting decisions & trade-offs

- **One direction of dependency.** Components depend on hooks; hooks depend on
  actions/routes; actions depend on services; services depend on repositories;
  repositories depend on Prisma. Nothing points back up. This is what makes each
  layer independently testable and replaceable.
- **Validation at the boundary, always.** Zod runs on the client for feedback
  and again on the server for trust. External input is never used unvalidated.
- **Small, named result contracts.** `FormState`, `AdminActionResult`, and
  `ServiceResponse(T)` keep call sites readable and let the type system catch
  mismatches. Payload-bearing results (e.g. image arrays) keep their own types.
- **Security is structural, not optional.** `requireRole` / `withAdmin` gate
  every privileged path, and admin mutations emit audit events through the
  shared runner — so coverage doesn't depend on each author remembering.

---

## Rebuilding the PDF

The build has no npm dependencies; Mermaid loads from a CDN and headless Chrome
prints the result.

```bash
# 1. Generate the landscape, grayscale HTML from ./diagrams/*.mmd
node build-pdf.js                       # writes data-mutation-stack.html

# 2. Print it to PDF with headless Chrome (one diagram per landscape page)
"<path-to-chrome>" --headless=new --no-pdf-header-footer \
  --virtual-time-budget=20000 --run-all-compositor-stages-before-draw \
  --print-to-pdf="data-mutation-stack.pdf" "data-mutation-stack.html"
```

The page box is A4 landscape and the theme is pure black/white (Mermaid `base`
theme with grayscale `themeVariables`), so the output stays legible and
high-contrast. Diagrams are sized to fit a single page without shrinking text
below ~10px; if a future diagram can't stay legible on one page, split it rather
than scaling the text down.

---

## References

**Project**

- [`CLAUDE.md`](../../../CLAUDE.md) — the repo's binding architecture, forms, and testing rules.
- Broad system diagrams: [`../README.md`](../README.md) and [`../architecture-diagrams.pdf`](../architecture-diagrams.pdf).

**Frameworks & libraries**

- [Next.js — Server Actions & Mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Next.js — Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js — Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [TanStack Query — Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
- [TanStack Query — Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [React Hook Form](https://react-hook-form.com/) · [Resolvers (`zodResolver`)](https://github.com/react-hook-form/resolvers)
- [Zod](https://zod.dev/)
- [Prisma](https://www.prisma.io/docs) · [Repository pattern (Fowler)](https://martinfowler.com/eaaCatalog/repository.html)
- [MDN — `AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
