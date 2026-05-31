# boudreaux Development Guidelines

Last updated: 2026-05-30

## How to work in this repo

- Default posture: Server Components, Server Actions for mutations, named exports, reuse before you create. Search for an existing component, type, field, or util before adding one.
- Gate before committing — all four must pass: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`. Write tests for every feature and bug fix.
- Two sections below are hard constraints, not guidance: [E2E database isolation](#e2e-database-isolation-mandatory) and [Secrets and `.env*`](#secrets-and-env-files). Read them before touching E2E, the DB, builds, dev servers, seed scripts, or anything that reads the environment. When in doubt there, stop and ask.
- Standard idioms are assumed — Opus already writes them, so they're not spelled out: modern TS (optional chaining, nullish coalescing, `async`/`await` + `try`/`catch`, array methods over loops, template literals), and Prettier/ESLint enforce style (semicolons, single quotes, trailing commas) via `pnpm run format` / `pnpm run lint`.

## Stack

Versions track `package.json` — update this block when they change.

- **Runtime**: TypeScript 6 (strict), Node 24, pnpm 11
- **Framework**: Next.js 16 (App Router, Turbopack dev, webpack build), React 19
- **Data**: Prisma 6 + MongoDB; AWS SDK S3 v3 (presigned URLs — 24h download, 15min upload)
- **Auth**: Auth.js (next-auth v5 beta) · **Payments**: Stripe 21 (payment-mode checkout, PWYW) · **Email**: AWS SES
- **UI**: shadcn/ui (Radix primitives), Tailwind v4, lucide-react, Jost font
- **Forms/Validation**: React Hook Form 7 + Zod 4 · **Client data**: TanStack Query 5
- **Testing**: Vitest 4, @testing-library/react, Playwright (E2E)

Shipped features: digital formats + S3 presigned up/download + freemium quota; Stripe PWYW checkout + download gate; tour management (Tour/TourDate/Venue) + admin CRUD; release search + media player.

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
docs/copilot/               # AI-generated markdown goes here
```

Path aliases: `@/*`→`src/*`, `@/components/*`→`src/app/components/*`, `@/ui/*`→`src/app/components/ui/*`, `@/hooks/*`→`src/app/hooks/*`, `@/lib/*`→`src/lib/*`, `@/utils/*`→`src/lib/utils/*`. Use aliases for all imports — never `../../` traversal.

## Commands

```bash
pnpm run dev                  # Dev server (Turbopack)
pnpm run build                # Production build (webpack)
pnpm run test:run             # Unit tests once (test = watch mode)
pnpm run test:coverage        # Coverage (target 90–95%)
pnpm run test:coverage:check  # Coverage + regression check vs COVERAGE_METRICS.md
pnpm run test:e2e             # Playwright E2E
pnpm run typecheck            # tsc on tracked types
pnpm run lint                 # ESLint check + auto-fix (--max-warnings 0)
pnpm run format               # Prettier write
pnpm exec prisma db push      # Push schema to MongoDB
pnpm exec prisma studio       # Browse DB
pnpm run stripe               # Forward Stripe webhooks to localhost:3000
```

## Architecture

- **Server vs client**: Server Components by default; add `'use client'` only for interactive components. Client Components must never call services, Prisma, or repositories directly — use Server Actions for mutations, fetch API route handlers for queries. Mark server-only modules with `'server-only'`.
- **Mutations** go in Server Actions (`src/lib/actions/`, `'use server'` at top). **Queries** go in API routes (`src/app/api/`).
- **Auth**: gate routes and actions with `withAuth` / `withAdmin` from `src/lib/decorators/with-auth.ts`; rate-limit with `withRateLimit`.
- **Data layer**: all Prisma access goes through the repository pattern in `src/lib/repositories/` — keep DB logic out of components and routes. Use transactions for multi-step ops; handle connection failures gracefully.
- **Validation**: validate all external input (user input, API responses, Server Action args) with Zod before use. Schemas live in `src/lib/validation/`.
- **Fetching**: TanStack Query on the client; explicit cache options on Server Component fetches (`{ cache: 'no-store' }` for fresh data).

## TypeScript

- No `any`, no non-null assertion (`!`). Reaching for either means: define a narrower type or handle the null explicitly. Prefer specific types over `unknown` / `Record<string, unknown>`.
- Explicit types on function params and return values. `interface` for object shapes; discriminated unions for variants. Reuse existing types before adding new ones.
- `as const` over enums (`const enum` if an enum is unavoidable).
- **Named exports only** — except App Router files that require a default export: `page`, `layout`, `loading`, `error`, `not-found`, `template`, `default`, `route`, `middleware`.
- No `ts-ignore` / `eslint-disable` without an inline reason comment. No deprecated syntax. JSDoc only for genuinely complex functions.

## Components, forms, styling

- Function components only — never class components. Keep them small; split large files. Destructure props with explicit types. Memoize (`memo`/`useCallback`/`useMemo`) only where it measurably helps. Use `globalThis`, not `window`, for client globals (SSR safety).
- **Forms**: React Hook Form + Zod via `zodResolver`. Check `src/app/components/forms/fields/` for an existing field before building one.
- **Styling**: mobile-first; Tailwind v4 utilities only — no `@apply`, no inline styles. Compose conditional classes with `cn()`. Never create a new UI primitive — use shadcn/ui from `@/components/ui`. Icons from `lucide-react`, UI text in Jost. Never use checkboxes in mobile-first UIs — use toggles or radio buttons. Semantic HTML, ARIA, and keyboard navigation are required, not optional.

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
- Target 90–95% coverage; exclude config, types, interfaces, and the Prisma schema. Don't regress the `COVERAGE_METRICS.md` baseline.

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
- Treat all `.env*` as production secrets (gitignored/"dev only" does not make them safe). Refuse pasted `.env` content and warn about the risk.
- Redact to `***` any env var matching `*_URL`, `*SECRET*`, `*TOKEN*`, `*KEY*`, `*PASSWORD*`, `*PASSWD*`, `*CREDENTIAL*`, `*DSN*`, `*CONNECTION*` before it could appear in output. If a task "needs" a secret value to proceed, ask for a placeholder instead.
- If a secret (even partial) appears in any output or input: stop, tell the user it's compromised and must be rotated, do not repeat it, do not run further commands touching it, and wait.

## Application security & conventions

- Never run E2E/builds/dev/seed/migrations in a process that could inherit `DATABASE_URL` from `.env*` (see E2E isolation above). Never use `localStorage` / `sessionStorage` for anything.
- Secure defaults always (CORS, cookie flags, rate limits); least privilege; validate and sanitize all external input. Keep dependencies patched.
- Add the MPL header from `HEADER.txt` to every new source file. Put AI-generated markdown in `docs/copilot/`; never author docs from files outside this repo. Never commit generated files or build artifacts.
- No global ESLint/Prettier disables; no new UI primitives without checking shadcn/ui first; no secrets committed. When editing a line, confirm nearby comments are still accurate.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
