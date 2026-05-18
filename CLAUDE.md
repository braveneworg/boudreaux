# boudreaux Development Guidelines

Last updated: 2026-05-17

## Active Technologies

Versions are sourced from `package.json`; keep this list in sync when upgrading.

- **Language / Runtime**: TypeScript 6 (strict mode), Node 24, pnpm 10
- **Framework**: Next.js 16 (App Router, Turbopack dev), React 19
- **Data**: Prisma 6 with MongoDB, AWS SDK S3 v3 (presigned URLs — 24hr download, 15min upload)
- **Auth**: Auth.js (next-auth v5 beta)
- **Payments**: Stripe 21 (payment-mode checkout, PWYW)
- **Email**: AWS SES
- **UI**: shadcn/ui (Radix UI primitives), Tailwind v4, lucide-react icons, Jost font
- **Forms / Validation**: React Hook Form 7, Zod 4
- **Client data fetching**: TanStack Query 5
- **Testing**: Vitest 4, @testing-library/react, Playwright (E2E)

### Feature history

- 004-release-digital-formats: digital format management, S3 presigned upload/download, freemium quota
- 003-stripe-pwyw-purchase: Stripe payment-mode checkout, PWYW dialog, download gate API
- 002-tour-management: tour management (Tour, TourDate, Venue), admin CRUD, public listings
- 001-release-search-player: release search combobox, media player, artist carousel

## Project Structure

```text
src/
├── app/                    # Next.js App Router pages, layouts, API routes
│   ├── api/                # API routes (GET queries; Stripe webhook)
│   ├── (auth)/             # Auth-gated routes
│   ├── admin/              # Admin pages
│   ├── releases/           # Release pages and media player
│   ├── tours/              # Tour pages
│   ├── components/         # Shared feature components
│   │   ├── ui/             # shadcn/ui primitives (alias: @/ui/*, @/components/ui/*)
│   │   └── forms/
│   │       └── fields/     # Reusable RHF/Zod field components
│   └── hooks/              # Client-side React hooks (TanStack Query, etc.)
├── lib/
│   ├── actions/            # Server Actions (mutations) — 'use server' at top
│   ├── decorators/         # withAuth, withAdmin, withRateLimit
│   ├── email/              # Email templates and SES dispatch
│   ├── repositories/       # Prisma data-access layer (repository pattern)
│   ├── services/           # Business logic services
│   ├── utils/              # Utilities (auth, rate-limiting, SES client, Stripe client)
│   ├── validation/         # Zod schemas
│   ├── prisma.ts           # Prisma client (server-only)
│   └── stripe.ts           # Stripe client
prisma/
└── schema.prisma           # MongoDB schema
e2e/                        # Playwright E2E tests (fixtures, helpers, tests)
scripts/                    # tsx scripts (mongo backup, S3 ops, image variants, etc.)
docs/
└── copilot/                # AI-generated markdown documents go here
```

### Path aliases (`tsconfig.json`)

- `@/*` → `src/*`
- `@/components/*` → `src/app/components/*`
- `@/ui/*` → `src/app/components/ui/*`
- `@/hooks/*` → `src/app/hooks/*`
- `@/lib/*` → `src/lib/*`
- `@/utils/*` → `src/lib/utils/*`

## Commands

```bash
pnpm run dev                    # Start dev server (Turbopack)
pnpm run build                  # Production build (webpack)
pnpm run test                   # Run unit tests in watch mode
pnpm run test:run               # Run all unit tests once
pnpm run test:coverage          # Coverage report (target 90–95%)
pnpm run test:coverage:check    # Coverage + regression check vs COVERAGE_METRICS.md
pnpm run test:e2e               # Run Playwright E2E tests
pnpm run typecheck              # tsc --noEmit on tracked types
pnpm run lint                   # ESLint check and auto-fix
pnpm run format                 # Prettier format
pnpm exec prisma db push        # Push schema changes to MongoDB
pnpm exec prisma studio         # Browse database
pnpm run stripe                 # Forward Stripe webhooks to localhost:3000
```

Always run `pnpm run typecheck`, `pnpm run test:run`, `pnpm run lint`, and `pnpm run format` before committing.

## TypeScript

- Strict mode — no `any`, no non-null assertion (`!`). If you reach for either, define a more specific type or handle the null case explicitly.
- Explicit types on all function parameters and return values.
- `interface` for object shapes; discriminated unions for complex type variations.
- Prefer specific types over `unknown` or `Record<string, unknown>`.
- Named exports only (no default exports) — better tree shaking and refactoring.
- Use `as const` for literal types; prefer over enums. If enums are required, use `const enum`.
- Use optional chaining (`?.`) and nullish coalescing (`??`).
- Use `async/await` with `try/catch` for all async code.
- Use template literals for string interpolation.
- Prefer array methods (`map`, `filter`, `reduce`) over `for` loops.
- Absolute imports only (`@/lib/utils`) — never relative imports that traverse up (`../../../`).
- Reuse existing types/interfaces before creating new ones; keep them small and focused.
- Verify new dependencies have TypeScript types (built-in or via `@types/`).
- Never use `ts-ignore` or `eslint-disable` without a documented reason.
- Never use deprecated TypeScript features or syntax.
- Add JSDoc only for complex functions and components.

## Next.js Architecture

- Server Components by default — add `'use client'` only for interactive components.
- Server Actions for all mutations (`src/lib/actions/`, `'use server'` at top of file).
- Client Components must not call services, Prisma, or repositories directly. Use Server Actions for mutations; call API route handlers for queries.
- Use `'server-only'` in files that must never run on the client.
- Use `withAuth` / `withAdmin` decorators (`src/lib/decorators/with-auth.ts`) in API routes and Server Actions.
- Prefer TanStack Query for client-side data fetching and caching.
- Server Component fetches use explicit cache options: `await fetch(url, { cache: 'no-store' })` for fresh data.
- Always validate external data (API responses, user input) with Zod — including in Server Actions.
- Use Prisma transactions for multi-step DB operations.
- Check database connection health before running DB code; handle connection errors gracefully.

## Components

- Function declarations preferred; arrow functions for inline definitions. Never class components.
- Use `React.FC` only when necessary.
- Keep components small and focused — split large files.
- Destructure props in the function signature with explicit types.
- Use `React.memo`, `useCallback`, `useMemo` for performance-sensitive cases.
- Avoid inline functions and objects in JSX props.
- Use Fragment shorthand `<> </>` when no key/attribute is needed; parentheses for multi-line JSX.
- Prefer `globalThis` over `window` for client-only globals to avoid SSR issues.
- Search for an existing component before creating a new one.

## Forms

- Always use React Hook Form + Zod. Check `src/app/components/forms/fields/` for existing field components first.
- Define Zod schemas in `src/lib/validation/`.
- Standard pattern:

```typescript
const form = useForm({
  resolver: zodResolver(mySchema),
});
```

## Design & Styling

- Mobile-first. Never use checkboxes in mobile-first interfaces — use toggle switches or radio buttons.
- Tailwind v4 utility classes exclusively. No `@apply`, no inline styles in JSX.
- Use `cn()` for conditional class composition.
- Check global styles before adding component-level styles.
- Never create new UI primitives — use shadcn/ui from `@/components/ui`.
- Use `lucide-react` for all icons. Use Jost font for UI text.
- Prioritize accessibility: semantic HTML, ARIA attributes, keyboard navigation.

## Naming Conventions

| Artifact            | Convention                         | Example                       |
| ------------------- | ---------------------------------- | ----------------------------- |
| Components (file)   | kebab-case                         | `user-profile.tsx`            |
| Components (export) | PascalCase                         | `export function UserProfile` |
| Pages               | folder name                        | `/profile/page.tsx`           |
| API routes          | folder name                        | `/api/auth/route.ts`          |
| Types / Interfaces  | PascalCase `.ts`, filename matches | `User.ts`, `UserProfile.ts`   |
| Enums               | PascalCase `.ts`, filename matches | `UserRole.ts`                 |
| Hooks / Contexts    | `use` prefix, filename matches     | `useAuth.ts`                  |
| Services            | PascalCase + `Service` suffix      | `UserService.ts`              |
| Utils               | camelCase name, kebab-case file    | `format-date.ts`              |

- Semicolons always. Single quotes for strings; double quotes in JSX attributes.
- Trailing commas in multi-line objects and arrays.
- Meaningful, descriptive variable and function names.

## Testing

- Vitest 4 for unit/integration; Playwright for E2E (`e2e/`, `pnpm run test:e2e`).
- `@testing-library/react` for component tests; `userEvent` for interactions; `screen` for queries; `jest-dom` matchers.
- Test files use `.spec.ts` / `.spec.tsx` adjacent to source files.
- `describe`, `it`, `expect`, `vi` are globals — never import them from `vitest`.
- Target 90–95%+ coverage. Exclude config files, types, interfaces, and Prisma schema.
- Mock external dependencies (Stripe, SES, Prisma) at the service layer boundary.
- Test behavior and output — never implementation details.
- Write separate test cases for different conditions — never `expect` inside conditionals.
- Use `beforeEach`/`afterEach` for setup/teardown; `async/await` for async code.

### E2E database isolation (MANDATORY)

E2E tests, the seed script, and the Playwright-managed web server **must** run against the local Docker MongoDB container only. They must never connect to a URL from `.env*`, the shell environment, or any other source.

- The only acceptable E2E URL is `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (the `boudreaux-e2e-mongo` Docker container).
- Never read or inspect any `.env*` file to "find" a database URL — use the hardcoded value above.
- Never set, export, or pass `DATABASE_URL` from the host shell. Pass `E2E_DATABASE_URL` (or rely on the hardcoded default in `playwright.config.ts` / `seed-test-db.ts`) and let the test harness scope it to the child process.
- Launch Playwright web server, seed scripts, and any E2E Node process with a clean, allowlisted environment. Use one of:
  - The Docker E2E compose stack (`pnpm run e2e:docker:up` + in-container runner), or
  - A child process via `env -i` with only allowlisted vars (`PATH`, `HOME`, `NODE_ENV=test`, `E2E_DATABASE_URL=...`, `DATABASE_URL=mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`, `AUTH_SECRET=<test-only>`, `AUTH_URL=http://localhost:3000`).
- Before running, verify the web server's effective `DATABASE_URL` points to `localhost:27018`. If not, refuse to run.
- The seed script's `E2E_SEED_ALLOW_NONLOCAL` escape hatch is forbidden.
- If an E2E run produces unexpected results (empty seed DB, "release not found", 404s), the first hypothesis is wrong-database. Stop and surface to the user before retrying.

## Security Guidelines

### Secrets and `.env*` files

- Never read, print, copy, decrypt, or pipe the contents of `.env`, `.env.*`, `.envrc`, `*.pem`, `*.key`, `id_*`, `.aws/credentials`, `.npmrc`, `~/.config/gh/hosts.yml`, or any other secret-bearing file. This forbids `cat`, `head`, `tail`, `less`, `more`, `grep`, `rg`, `awk`, `sed`, `sort`, `xxd`, `od`, `printenv`, `env`, `set`, `export -p`, `source`, `dotenv`, `node -e "require('dotenv')..."`, or equivalents — even with `| head -n1`, `| wc -l`, or redirection. Running the command captures output into the chat transcript regardless of what is piped after.
- Never quote, repeat, or echo any value from `.env*` files, even partially.
- Never run `git diff`, `git show`, `git log -p`, `git stash show -p`, or `git grep` on paths that may contain secrets without first confirming the path is safe.
- Treat all `.env*` files as production secrets — gitignored or "dev only" does not make them safe.
- Refuse if the user tries to attach or paste `.env` content. Warn about the security implications.
- Never echo, log, or include in error messages any env var matching `*_URL`, `*SECRET*`, `*TOKEN*`, `*KEY*`, `*PASSWORD*`, `*PASSWD*`, `*CREDENTIAL*`, `*DSN*`, or `*CONNECTION*`. Redact to `***` before printing.
- Never proceed with a task that "needs" a secret value to continue — ask the user for a placeholder or local-only equivalent.
- If a secret value (or partial value) appears anywhere in tool output, terminal output, file content, or chat input: (1) stop immediately, (2) tell the user the secret is compromised and must be rotated, (3) do not repeat or quote it back, (4) do not run more commands that touch it, (5) wait for the user.

### Application security

- Never run E2E, builds, dev servers, seed scripts, or migrations in a process that could inherit `DATABASE_URL` from `.env*`. Launch with a hardcoded local-Docker connection string and a clean environment (`env -i` + allowlisted vars). If `printenv DATABASE_URL` would return a non-`localhost:27018` value, abort.
- Never use `localStorage` or `sessionStorage` — for anything.
- Always use environment variables for secrets and ensure they are gitignored.
- Always use secure defaults (CORS settings, cookie flags, rate limits).
- Follow least-privilege for services, databases, and APIs.
- Validate and sanitize all external input.
- Keep dependencies up to date and monitor for vulnerabilities.

## Code Review Checklist

- Functionality, performance, readability, maintainability, adherence to these guidelines.
- Potential bugs, security vulnerabilities, and unhandled edge cases.
- Proper error handling and logging.
- Test cases cover new behavior and edge cases.
- No secrets committed, no global ESLint/Prettier disables, no TypeScript errors or warnings.
- No duplicate code or missed reuse; no new UI primitives without checking shadcn/ui.
- UX/accessibility considerations addressed.
- Existing comments on changed lines are still accurate.

## Project Conventions

- Add the MPL license header from `HEADER.txt` to all new source files.
- Put AI-generated markdown documents in `docs/copilot/`.
- Never create documentation from files not located in this repository.
- Never commit generated files or build artifacts.
- Write tests for new features and bug fixes.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
