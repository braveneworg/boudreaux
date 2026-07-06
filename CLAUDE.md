# boudreaux — Claude Code

Read from **[AGENTS.md](~/.config/agents/AGENTS.md)** before doing anything
since that file should govern how to work overall, interact, and manage sessions.

@AGENTS.md

# boudreaux — Agent & Contributor Guidelines

Last updated: 2026-07-01

This file is the **single source of truth** for how to work in this repository —
for humans and for every AI coding agent (Claude Code, Codex, Cursor, Copilot,
etc.). Tool-specific instruction files (e.g. `CLAUDE.md`) defer to this document;
read it in full before making changes. Two sections are hard constraints, not
guidance: [E2E database isolation](#e2e-database-isolation-mandatory) and
[Secrets and `.env*`](#secrets-and-env-files).

## How to work in this repo

- Default posture: Server Components, Server Actions for mutations, named exports. Reuse before you create — search for an existing component, type, field, or util before adding one.
- Quality over speed — correct, reviewed code even when slower. These guidelines are binding; when code can't comply, say so rather than silently working around them.
- TDD is non-negotiable: write the test first, watch it fail, then implement. Every feature and bug fix ships with tests.
- Gate before committing — all four must pass: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- Two sections are hard constraints, not guidance: [E2E database isolation](#e2e-database-isolation-mandatory) and [Secrets and `.env*`](#secrets-and-env-files). Read them before touching E2E, the DB, builds, dev servers, seed scripts, or anything that reads the environment. When in doubt there, stop and ask.
- Standard idioms are assumed: modern TS (optional chaining, nullish coalescing, `async`/`await` + `try`/`catch`, array methods over loops, template literals, immutable updates, named constants over magic values). Prettier/ESLint enforce style (semicolons, single quotes, trailing commas) via `pnpm run format` / `pnpm run lint`.

## Stack

Versions track `package.json` — update this block when they change.

- **Runtime**: TypeScript 6 (strict), Node 24, pnpm 11; use Node from `.nvmrc` (never a global install) and `pnpm exec` for CLI tools (`prisma`, `tsx`, etc.) for the correct version/environment.
- **Framework**: Next.js 16 (App Router, Turbopack dev, webpack build), React 19
- **Data**: Prisma 6 + MongoDB; AWS SDK S3 v3 (presigned URLs — 24h download, 15min upload)
- **Auth**: better-auth (magic-link + social OAuth, admin plugin) · **Payments**: Stripe 21 (payment-mode checkout, PWYW) · **Email**: AWS SES
- **UI**: shadcn/ui (Radix primitives), Tailwind v4, lucide-react, Jost font
- **Forms/Validation**: React Hook Form 7 + Zod 4 · **Client data**: TanStack Query 5
- **Testing**: Vitest 4, @testing-library/react, Playwright (E2E)

Shipped: digital formats + S3 presigned up/download + freemium quota; Stripe PWYW checkout + download gate; tour management (Tour/TourDate/Venue) + admin CRUD; release search + media player.

## Project structure

```text
src/
├── app/                    # App Router pages, layouts, API routes
│   ├── api/                # API routes — GET queries + Stripe webhook
│   ├── (auth)/  admin/  releases/  tours/
│   ├── components/         # Shared feature components
│   │   ├── ui/             # shadcn/ui primitives (@/ui/*, @/components/ui/*)
│   │   └── forms/fields/   # Reusable RHF/Zod field components
│   └── hooks/              # Client hooks (TanStack Query, etc.)
├── lib/
│   ├── actions/            # Server Actions (mutations) — 'use server' at top
│   ├── decorators/         # withAuth, withAdmin, withRateLimit
│   ├── email/  services/  utils/
│   ├── repositories/       # Prisma data-access layer (repository pattern)
│   ├── validation/         # Zod schemas
│   ├── prisma.ts  stripe.ts
prisma/schema.prisma        # MongoDB schema
e2e/                        # Playwright (fixtures, helpers, tests)
scripts/                    # tsx scripts (mongo backup, S3 ops, image variants)
docs/auto-generated/        # AI-generated markdown goes here
```

Path aliases: `@/*`→`src/*`, `@/components/*`→`src/app/components/*`, `@/ui/*`→`src/app/components/ui/*`, `@/hooks/*`→`src/app/hooks/*`, `@/lib/*`→`src/lib/*`, `@/utils/*`→`src/lib/utils/*`. Use aliases for all imports — never `../../` traversal except for adjacent files.

## Commands

```bash
pnpm run dev                  # Dev server (Turbopack)
pnpm run build                # Production build (webpack)
pnpm run test:run             # Unit tests once (test = watch mode)
pnpm run test:coverage        # Coverage (target 90–95%)
pnpm run test:coverage:check  # Coverage + regression check vs COVERAGE_METRICS.md
pnpm run test:e2e             # Playwright E2E
pnpm run e2e:docker:up        # Start isolated E2E Mongo (localhost:27018)
pnpm run e2e:docker:down      # Tear down E2E Mongo + volumes
pnpm run typecheck            # tsc on tracked types
pnpm run lint                 # ESLint check + auto-fix (--max-warnings 0)
pnpm run format               # Prettier write
pnpm run format:check         # Prettier check (no write)
pnpm exec prisma db push      # Push schema to MongoDB
pnpm exec prisma studio       # Browse DB
pnpm run seed                 # Seed dev DB (tsx prisma/seed.ts)
pnpm run stripe               # Forward Stripe webhooks to localhost:3000
```

## Architecture

- **Server vs client**: Server Components by default; add `'use client'` only for interactive components. Client Components never call services, Prisma, or repositories directly — use Server Actions for mutations, fetch API route handlers for queries. Mark server-only modules with `'server-only'`.
- **Mutations** → Server Actions (`src/lib/actions/`, `'use server'` at top). **Queries** → API routes (`src/app/api/`).
- **Auth**: gate routes and actions with `withAuth` / `withAdmin` from `src/lib/decorators/with-auth.ts`; rate-limit with `withRateLimit`.
- **Data layer**: all Prisma access goes through the repository pattern (`src/lib/repositories/`) — keep DB logic out of components and routes. Transactions for multi-step ops; handle connection failures gracefully. Business logic in services; components stay presentation-focused.
- **Validation**: validate all external input (user input, API responses, Server Action args) with Zod before use. Schemas in `src/lib/validation/`.
- **Fetching**: TanStack Query on the client, with `fetch` to API routes that forward the `AbortSignal` for automatic cancellation. Use stable keys from `src/lib/query-keys.ts`. Never call API routes directly from components — wrap each in a custom hook (e.g. `useArtistsQuery`) that forwards the signal and abstracts the query, with jsdocs explaining behavior and return value. Use `{ cache: 'no-store' }` only for never-cacheable requests (e.g. auth status); otherwise rely on TanStack Query caching/invalidation. Each `useEntityQuery` hook takes a trailing, spread-last options override (`QueryOptionsOverride` / `InfiniteQueryOptionsOverride` from `@/hooks/query-options`) so call sites tune `enabled`/`staleTime`/etc. while `queryKey`/`queryFn` (and infinite paging) stay locked.
- **Error handling**: every API route and Server Action handles errors with `try`/`catch` and returns appropriate HTTP status codes. REST conventions — plural nouns (`/api/releases`), correct verbs (GET read, POST create, PUT/PATCH update, DELETE remove).

## TypeScript

- No `any`, no non-null assertion (`!`) — instead define a narrower type or handle the null. Prefer specific types over `unknown` / `Record<string, unknown>`.
- Explicit types on function params and return values. `interface` for object shapes; discriminated unions for variants. Reuse existing types before adding new ones.
- `as const` over enums (`const enum` only if an enum is unavoidable).
- **Arrow functions over `function`** — declare functions and callbacks as arrow expressions (`const foo = () => …`), not `function` declarations or named function expressions. Enforced by `prefer-arrow-functions` (auto-fixed by `pnpm run lint`). Exempted in config: Next.js App Router special files (`page`/`layout`/`loading`/`error`/`global-error`/`not-found`/`template`/`default`/`route`/`middleware`/`instrumentation`/`manifest`/`sitemap`/`robots`/`opengraph-image`/`icon`). Where a `function` is genuinely required, refactor instead of suppressing: `new`-constructed things (incl. constructor mocks) → a `class`; code needing its own `this`/`arguments`/`new.target` → restructure to avoid it.
- **Named exports only** — except App Router files that require a default export: `page`, `layout`, `loading`, `error`, `not-found`, `template`, `default`, `route`, `middleware`.
- **Never suppress lint/type errors** — no `eslint-disable` (inline, block, or file-level) and no `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`, for any rule. A lint/type error means the code is wrong for the rule: fix the code (preferred), or — only when a rule is genuinely inapplicable to a context — scope it in `eslint.config.mjs` (e.g. a `files`-scoped setting). No deprecated syntax. JSDoc only for genuinely complex functions.
- **Prefer destructuring objects whenever possible,** including function parameters.

## Components, forms, styling

- Function components only — never class components. Keep them small; split large files. Destructure props with explicit types. Use `globalThis`, not `window`, for client globals (SSR safety).
- **State**: React built-ins (`useState` / `useReducer` / `useContext`). Reach for an external store (Zustand, Redux) only when architectural complexity justifies it — not by default.
- **React 19 concurrency** where it improves UX: `useTransition` for non-urgent updates, `useDeferredValue` for expensive derived renders, `useId` for hydration-safe IDs.
- **Forms**: React Hook Form + Zod via `zodResolver`. Check `src/app/components/forms/fields/` for an existing field before building one.
- **Styling**: mobile-first; Tailwind v4 utilities only — no `@apply`, no inline styles. Compose conditional classes with `cn()`. Never create a new UI primitive — use shadcn/ui from `@/components/ui`. Icons from `lucide-react`, UI text in Jost. Never use checkboxes in mobile-first UIs — use toggles or radio buttons. Semantic HTML, ARIA, and keyboard navigation are required.
- **Errors & debugging**: wrap risky subtrees in error boundaries; handle async failures gracefully. Never ship `console.log` — use the project logger. Never use `alert` / `prompt` — use shadcn/ui dialogs.
- Implicit return for single-expression function bodies (no curly braces); no parentheses around single params. Always include the return type on exported functions, especially components and hooks.

## Performance

- Code-split and lazy-load non-critical UI (`React.lazy` + `Suspense`, `next/dynamic`); show skeleton/Suspense fallbacks.
- Use `next/image` for images.
- Memoize (`memo` / `useCallback` / `useMemo`) only where profiling shows it helps — never by default.
- Lean on TanStack Query caching/background updates instead of hand-rolled client caches.

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

## Testing

- Vitest 4 (unit/integration) + Playwright (E2E in `e2e/`). Spec files are `.spec.ts(x)` adjacent to source.
- `describe`/`it`/`expect`/`vi` are globals — never import them from `vitest`. In server-only specs, `vi.mock('server-only', () => ({}))`.
- Mock external deps (Stripe, SES, Prisma) at the service-layer boundary. Test behavior and output, never implementation details. One condition per test — never `expect` inside a conditional.
- Keep tests deterministic and independent of network, time, and ordering. Remove orphaned tests when code is deleted, and orphaned code when tests are removed.
- Target 90–95% coverage; exclude config, types, interfaces, and the Prisma schema. Don't regress the `COVERAGE_METRICS.md` baseline.
- E2E: cover critical user flows and error paths; use fixtures and page objects to cut duplication; keep tests deterministic and parallel-safe.

### E2E database isolation (MANDATORY)

E2E tests, the seed script, and the Playwright web server **must** run only against the local Docker MongoDB container — never a URL from `.env*`, the shell, or any other source.

- The only acceptable URL is `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (container `boudreaux-e2e-mongo`). Never read `.env*` to "find" a DB URL — use this hardcoded value.
- Never set/export/pass `DATABASE_URL` from the host shell. Pass `E2E_DATABASE_URL` (or rely on the hardcoded default in `playwright.config.ts` / `seed-test-db.ts`) and let the harness scope it to the child process.
- Launch any E2E Node process (web server, seed) with a clean, allowlisted env via either the Docker stack (`pnpm run e2e:docker:up`) or `env -i` with only `PATH`, `HOME`, `NODE_ENV=test`, `E2E_DATABASE_URL`, `DATABASE_URL=mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`, `AUTH_SECRET=<test-only>`, `AUTH_URL=http://localhost:3000`.
- Before running, confirm the web server's effective `DATABASE_URL` points to `localhost:27018`; if not, refuse to run. The `E2E_SEED_ALLOW_NONLOCAL` escape hatch is forbidden.
- Unexpected results (empty seed, "release not found", 404s) → first hypothesis is wrong-database. Stop and surface to the user before retrying.

### Secrets and `.env*` files

- Never read, print, copy, decrypt, or pipe the contents of `.env`, `.env.*`, `.envrc`, `*.pem`, `*.key`, `id_*`, `.aws/credentials`, `.npmrc`, `~/.config/gh/hosts.yml`, or any secret-bearing file — not with `cat`/`head`/`tail`/`grep`/`rg`/`sed`/`awk`/`printenv`/`env`/`source`/`dotenv` or any equivalent, even piped through `head`/`wc` or redirected. Running the command captures the value into the transcript regardless of what follows the pipe.
- Never quote, echo, or log any value from a `.env*` file, even partially. Never run `git diff`/`show`/`log -p`/`grep` on paths that may contain secrets without first confirming the path is safe.
- Treat all `.env*` as production secrets (gitignored / "dev only" does not make them safe). Refuse pasted `.env` content and warn about the risk.
- Redact to `***` any env var matching `*_URL`, `*SECRET*`, `*TOKEN*`, `*KEY*`, `*PASSWORD*`, `*PASSWD*`, `*CREDENTIAL*`, `*DSN*`, `*CONNECTION*` before it could appear in output. If a task "needs" a secret value, ask for a placeholder instead.
- If a secret (even partial) appears in any output or input: stop, tell the user it's compromised and must be rotated, do not repeat it, do not run further commands touching it, and wait.

## Commits & git hooks

Conventional Commits, enforced by commitlint (`commitlint.config.mjs`, `commit-msg` hook): subject ≤50 chars, body/footer lines ≤72. Commit type drives automated version bump + `CHANGELOG.md` on deploy — pick it accurately.

- Format `type(scope): <gitmoji> subject` with a gitmoji signalling the change: `feat: ✨`, `fix: 🐛`, `refactor: ♻️`, `perf: ⚡`, `docs: 📝`, `test: ✅`, `chore: 🔧`, `style: 🎨`.
- Never add `Co-authored-by` / AI attribution lines. Never commit or push to `main` — always a feature branch. Don't bypass hooks with `--no-verify`.
- When working autonomously, make atomic commits as appropriate — split the work into multiple working commits.
- Husky (auto-run): **pre-commit** blocks `main`, scans staged changes with gitleaks, runs `lint-staged` (`tsc-files` + `eslint --fix` + `prettier`) and `vitest --changed`. **pre-push** blocks `main`, requires the branch up to date with `origin/main`, rejects WIP/`fixup!`/`squash!` commits, then runs `tsc --noEmit`, `lint`, `test:coverage:check`. **post-merge** reinstalls deps / regenerates Prisma when the lockfile or schema changed.

## Application security & conventions

- DB env safety: never run E2E/builds/dev/seed/migrations in a process that could inherit `DATABASE_URL` from `.env*` (see [E2E isolation](#e2e-database-isolation-mandatory)).
- Secure defaults always (CORS, cookie flags, rate limits); least privilege; validate and sanitize all external input. Store config and secrets in env vars — never hardcode them.
- Auth sessions use `httpOnly`, `secure`, `sameSite` cookies. Use `localStorage` / `sessionStorage` only for non-sensitive client state — never secrets or auth tokens.
- **Dependencies**: reuse an existing one before adding (check `package.json`); weigh bundle size, maintenance burden, and security; ensure MPL-2.0 compatibility; keep the tree lean and patched.
- Add the MPL header from `HEADER.txt` to every new source file. Put AI-generated markdown in `docs/auto-generated/`; never author docs from files outside this repo. Never commit generated files or build artifacts.
- When editing a line, confirm nearby comments are still accurate.

## Refactoring

- Refactor with confidence: tests, type safety, and code review catch mistakes. Make big changes when they improve the codebase.
- Update or remove tests to match the new structure — no orphaned tests or code.
- Keep the E2E tests passing, and add more to cover new flows or edge cases uncovered during refactoring.
