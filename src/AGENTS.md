# src/ — Architecture & TypeScript

Deeper rules: [`src/app/AGENTS.md`](app/AGENTS.md) (UI, forms, styling),
[`src/lib/AGENTS.md`](lib/AGENTS.md) (server layer). Lessons: load
`docs/lessons/react-nextjs/` before UI/bundling work and
`docs/lessons/prisma-mongo/` before data work.

## Architecture

- Server Components by default; `'use client'` only for interactive
  components. Client Components never call services, Prisma, or repositories —
  Server Actions for mutations, API routes for queries. Mark server-only
  modules with `'server-only'`.
- Mutations → Server Actions (`src/lib/actions/`). Queries → API routes
  (`src/app/api/`), REST conventions: plural nouns (`/api/releases`), correct
  verbs (GET read, POST create, PUT/PATCH update, DELETE remove).
- Gate routes/actions with `withAuth` / `withAdmin`
  (`src/lib/decorators/with-auth.ts`); rate-limit with `withRateLimit`.
- Validate all external input (user input, API responses, Server Action args)
  with Zod (`src/lib/validation/`) before use.
- Every API route and Server Action handles errors with `try`/`catch` and
  returns appropriate HTTP status codes.

## Client data fetching

- TanStack Query with `fetch` to API routes, forwarding the `AbortSignal` for
  automatic cancellation. Stable keys from `src/lib/query-keys.ts`. Never call
  API routes directly from components — wrap each in a custom hook (e.g.
  `useArtistsQuery`) that forwards the signal and abstracts the query, with
  jsdocs explaining behavior and return value.
- `{ cache: 'no-store' }` only for never-cacheable requests (e.g. auth
  status); otherwise rely on TanStack Query caching/invalidation.
- Each `useEntityQuery` hook takes a trailing, spread-last options override
  (`QueryOptionsOverride` / `InfiniteQueryOptionsOverride` from
  `@/hooks/query-options`) so call sites tune `enabled`/`staleTime`/etc. while
  `queryKey`/`queryFn` (and infinite paging) stay locked.

## TypeScript

- No `any`, no non-null assertion (`!`) — define a narrower type or handle the
  null. Prefer specific types over `unknown` / `Record<string, unknown>`.
- Explicit types on function params and return values (always on exported
  components and hooks). `interface` for object shapes; discriminated unions
  for variants; `as const` over enums. Reuse existing types before adding new
  ones.
- Arrow functions over `function` (enforced by `prefer-arrow-functions`; App
  Router special files are exempted in config). Code needing `this` /
  `arguments` / `new` → use a `class` or restructure; never suppress.
- Named exports only — except App Router files that require a default export
  (`page`, `layout`, `loading`, `error`, `not-found`, `template`, `default`,
  `route`, `middleware`).
- Never suppress lint/type errors — no `eslint-disable`, no `@ts-ignore` /
  `@ts-expect-error` / `@ts-nocheck`. Fix the code, or — only when a rule is
  genuinely inapplicable — scope it in `eslint.config.mjs`.
- Prefer destructuring everywhere, including function parameters. Implicit
  return for single-expression bodies; no parens around single params.
- Imports use path aliases — never `../../` traversal except adjacent files:
  `@/*`→`src/*`, `@/components/*`→`src/app/components/*`,
  `@/ui/*`→`src/app/components/ui/*`, `@/hooks/*`→`src/hooks/*`,
  `@/lib/*`→`src/lib/*`, `@/utils/*`→`src/lib/utils/*`.

## Unit testing (Vitest)

- Spec files `.spec.ts(x)` adjacent to source. `describe`/`it`/`expect`/`vi`
  are globals — never import them from `vitest`. In server-only specs,
  `vi.mock('server-only', () => ({}))`.
- Mock external deps (Stripe, SES, Prisma) at the service-layer boundary. Test
  behavior and output, never implementation details. One condition per test —
  never `expect` inside a conditional.
- Deterministic and independent of network, time, and ordering. Remove
  orphaned tests when code is deleted, and orphaned code when tests are
  removed.
- Target 90–95% coverage (exclude config, types, interfaces, Prisma schema);
  don't regress the `COVERAGE_METRICS.md` baseline.

## Naming

| Artifact         | Convention                        | Example                                   |
| ---------------- | --------------------------------- | ----------------------------------------- |
| Component file   | kebab-case                        | `user-profile.tsx`                        |
| Component export | PascalCase                        | `export function UserProfile`             |
| Page / API route | folder name                       | `/profile/page.tsx`, `/api/auth/route.ts` |
| Type / Interface | PascalCase, filename matches      | `User.ts`, `UserProfile.ts`               |
| Enum             | PascalCase, filename matches      | `UserRole.ts`                             |
| Hook / Context   | `use` prefix, filename matches    | `useAuth.ts`                              |
| Service          | PascalCase + `Service`            | `UserService.ts`                          |
| Util             | camelCase export, kebab-case file | `format-date.ts`                          |
