# boudreaux Development Guidelines

Last updated: 2026-04-25

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

Always run `pnpm run test:run`, `pnpm run lint`, and `pnpm run format` before committing.

## TypeScript

- Strict mode — no `any` types, ever. Use specific types, generics, or `Record<string, unknown>`.
- Explicit types on all function parameters and return values.
- `interface` for object shapes.
- Named exports only — no default exports unless there is a compelling reason.
  - Named exports enable better tree shaking, IDE autocompletion, and explicit refactoring.
- Never use the non-null assertion operator (`!`).
- Use `as const` for literal types; prefer over enums. If enums are needed, use `const enum`.
- Use optional chaining (`?.`) and nullish coalescing (`??`).
- Use `async/await` with `try/catch` for all async code.
- Use template literals for string interpolation.
- Prefer array methods (`map`, `filter`, `reduce`) over `for` loops.
- Add JSDoc comments for complex functions and components.
- Never ignore TypeScript errors or warnings.
- Always use absolute imports (`@/lib/utils`) — never relative imports that traverse up (`../../../lib/utils`).
- Always verify that any new dependencies have TypeScript types available (either built-in or via `@types/`).
- Always check for existing types/interfaces before creating new ones. Reuse over recreate.
- Always keep types/interfaces small and focused — break large files into smaller ones.
- Always use discriminated unions for complex type variations.
- Always prefer specific types over `unknown` or `Record<string, unknown>`. If a function accepts an object, define an interface for it rather than using `Record<string, unknown>`.
- Always type check with `pnpm run typecheck` before committing, in addition to running tests and linters.
- Never use deprecated TypeScript features or syntax.
- Never use `ts-ignore` or `eslint-disable` to bypass type errors without a documented reason.
- Never use `any` or the non-null assertion operator (`!`) — if you find yourself needing them, it's a sign that you should define a more specific type or handle the null case explicitly.
- Never use conditional expects in tests — all test cases should be deterministic and have the same assertions regardless of conditions.

## Next.js Architecture

- Server Components by default — add `'use client'` only for interactive components (Stripe Elements, dialogs, etc.).
- Server Actions for all mutations (in `src/lib/actions/`). Add `'use server'` directive at top of file.
- Never call services, the Prisma client, or repositories directly from Client Components. Use Server Actions for mutations; for queries, call API route handlers from Client Components.
- Always use the `'server-only'` package in files meant exclusively for server-side execution to prevent accidental client-side imports.
- Use decorators for auth checks (`withAuth`, `withAdmin` from `src/lib/decorators/with-auth.ts`) in API route handlers and Server Actions.
- Prefer TanStack Query for client-side data fetching and caching in interactive components.
- Data fetching in Server Components uses `fetch` with explicit cache options:

```typescript
const res = await fetch(url, { cache: 'no-store' }); // for fresh data
```

- Always validate external data (API responses, user input) with Zod.
- Use Prisma transactions for multi-step DB operations.
- Check database connection health before running DB code; handle connection errors gracefully.

## Components

- Prefer globalThis to window for client-only globals to avoid SSR issues.
- Prefer function declarations; use `React.FC` only when necessary.
- Prefer arrow functions for inline component definitions.
- Never create class components.
- Keep components small and focused — break large files into smaller ones.
- Use props destructuring.
- Use `React.memo` for performance optimization of pure components.
- Use `useCallback` and `useMemo` for memoizing functions and values.
- Avoid inline functions and objects in JSX props.
- Use Fragment shorthand `<> </>` when no key or attribute is needed.
- Always use parentheses for multi-line JSX.
- Before creating a new component, search the codebase for an existing one. Reuse over recreate.
- Check global styles before adding component-level styles.

## Forms

- Always use React Hook Form + Zod for all forms.
- Check `src/app/components/forms/fields/` for existing field components before building new ones.
- Define Zod schemas in `src/lib/validation/`.
- Standard pattern:

```typescript
const form = useForm({
  resolver: zodResolver(mySchema),
});
```

- Never skip Zod validation in Server Actions.

## Design & Styling

- Mobile-first on all UI decisions. Never use checkboxes in mobile-first interfaces — use toggle switches or radio buttons for better touch usability.
- Use Tailwind v4 utility classes exclusively. Avoid custom CSS unless absolutely necessary.
- Use canonical Tailwind v4 classes — no `@apply`, no inline styles in JSX.
- Use `cn()` helper for conditional class composition.
- Follow shadcn/ui design patterns and variants. Never create new UI primitives — use shadcn/ui.
- Use shadcn/ui components from `@/components/ui` whenever possible.
- Use `lucide-react` for all icons.
- Use Jost font for UI text.
- Keep UI consistent with existing components.
- Prioritize accessibility: semantic HTML, ARIA attributes, keyboard navigation support.
- Use responsive design principles throughout.

## Naming Conventions

| Artifact            | Convention                         | Example                       |
| ------------------- | ---------------------------------- | ----------------------------- |
| Components (file)   | kebab-case                         | `user-profile.tsx`            |
| Components (export) | PascalCase                         | `export function UserProfile` |
| Pages               | folder name                        | `/profile/page.tsx`           |
| API routes          | folder name                        | `/api/auth/route.ts`          |
| Types               | PascalCase `.ts`, filename matches | `User.ts`                     |
| Interfaces          | PascalCase `.ts`, filename matches | `UserProfile.ts`              |
| Enums               | PascalCase `.ts`, filename matches | `UserRole.ts`                 |
| Hooks               | `use` prefix, filename matches     | `useAuth.ts`                  |
| Contexts            | `use` prefix, filename matches     | `useAuthContext.ts`           |
| Services            | PascalCase + `Service` suffix      | `UserService.ts`              |
| Utils               | camelCase name, kebab-case file    | `format-date.ts`              |

- Always use semicolons.
- Always use single quotes for strings (double quotes in JSX attributes).
- Always use trailing commas in multi-line objects and arrays.
- Use meaningful, descriptive variable and function names.
- Keep functions small and focused.

## Testing

- Vitest 4 for all unit and integration tests; Playwright for E2E (`e2e/` directory, `pnpm run test:e2e`).
- `@testing-library/react` for component tests.
- Test files use `.spec.ts` / `.spec.tsx` suffix, placed adjacent to source files.
- Use `describe`/`it` blocks for organization.
- Target 90–95%+ coverage on all testable files.
- Exclude configuration files, types, interfaces, and Prisma schema files from coverage.
- `describe`, `it`, `expect`, and `vi` are globally available — do **not** import them:

```typescript
// ✗ Never do this
import { describe, it, expect, vi } from 'vitest';
```

- Use `userEvent` from `@testing-library/user-event` to simulate user interactions.
- Use `screen` from `@testing-library/react` to query DOM elements.
- Use `jest-dom` matchers (`toBeInTheDocument`, `toHaveClass`, `toHaveTextContent`).
- Use `beforeEach`/`afterEach` for setup/teardown.
- Mock external dependencies (Stripe, SES, Prisma) at the service layer boundary, not the DB layer.
- Mock behavior — never implementation details.
- Test behavior and output — never implementation details.
- Write separate test cases for different conditions — never use `expect` inside conditionals.
- Use descriptive test names.
- Use `async/await` for async test code.
- Use mock functions for testing callbacks and event handlers.
- Use spies to track function calls and assert on them.
- Don't write brittle or hard-to-maintain tests.
- Don't rely solely on coverage metrics — focus on meaningful tests.

### E2E database isolation (MANDATORY)

E2E tests, the seed script, and the Playwright-managed web server **must** run against the local Docker MongoDB container only. They must never connect to any database URL stored in `.env`, `.env.local`, `.env.test`, `.env.production`, `.env.development`, the shell environment, or any other source outside the hardcoded local-Docker URL.

- The only acceptable E2E database URL is `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (provided by the `boudreaux-e2e-mongo` Docker container on port 27018).
- Never read, print, grep, cat, source, or otherwise inspect any `.env*` file to "check" or "find" a database URL. If you need to know the E2E URL, use the hardcoded value above.
- Never set, export, or pass `DATABASE_URL` from the host shell when running E2E. Pass `E2E_DATABASE_URL` (or rely on the hardcoded default in `playwright.config.ts` / `seed-test-db.ts`) and let the test harness scope it to the child process.
- Always launch the Playwright web server, seed scripts, and any E2E-related Node process with a clean, allowlisted environment. Do not let Next.js, Prisma, or `dotenv` auto-load `.env*` into an E2E run. Use one of:
  - The repo's Docker E2E compose stack (`pnpm run e2e:docker:up` + the in-container test runner), or
  - A child process launched with `env -i` plus only the explicitly allowlisted vars (`PATH`, `HOME`, `NODE_ENV=test`, `E2E_DATABASE_URL=...`, `DATABASE_URL=mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`, `AUTH_SECRET=<test-only>`, `AUTH_URL=http://localhost:3000`, etc.).
- Before running any E2E suite, verify that the resolved `DATABASE_URL` for the web server process points to `localhost:27018`. If it does not, refuse to run.
- The seed script's `E2E_SEED_ALLOW_NONLOCAL` escape hatch is forbidden — never set it under any circumstance.
- If an E2E run produces unexpected results (empty seed DB, "release not found", 404s), the first hypothesis is "the server is connected to the wrong database". Stop, verify the server's effective `DATABASE_URL`, and surface the issue to the user before retrying.
- Never run E2E (or any production build that boots a server) from a process that has `DATABASE_URL` set in its environment to a non-local value. If `printenv DATABASE_URL` would return a non-`localhost:27018` value, the run is unsafe — abort.

## Code Review Checklist

When reviewing code, verify:

- Functionality, performance, readability, maintainability, and adherence to these guidelines.
- Potential bugs, security vulnerabilities, and unhandled edge cases.
- Code structure, naming conventions, and modularity improvements.
- No secrets or sensitive information committed to the repository.
- Proper error handling and logging mechanisms.
- Performance optimizations where necessary.
- Test cases cover new behavior and edge cases.
- Documentation is present for complex logic.
- UX/accessibility considerations are addressed.
- No ESLint rules disabled without clear justification.

## Always Do

- Always add the MPL license header from `HEADER.txt` to all new source files.
- Always use absolute imports (`@/lib/utils`), never relative imports that traverse up.
- Always run tests, lint, and format before committing.
- Always write tests for new features and bug fixes.
- Always check for existing components before creating new ones.
- Always check global styles before adding component-level styles.
- Always use Zod for runtime validation of all external data.
- Always use the `zod` version from `package.json` (no version drift).
- Always use `'use client'` at the top of Client Component files.
- Always use `'use server'` at the top of Server Action files.
- Always use `'server-only'` in files that must never run on the client.
- Always write accessibility-friendly code (semantic HTML, ARIA, keyboard navigation).
- Always use `cn()` for conditional class composition.
- Always put AI-generated markdown documents in `docs/copilot/`.
- Always check database connection health before executing DB queries.
- Always use meaningful commit messages that describe the changes made.
- Always review comments on any changed lines to ensure they are still accurate and relevant.
- Always verify that any new dependencies are necessary and do not duplicate existing functionality.

## Never Do

- Never use `any` in TypeScript.
- Never use the non-null assertion operator (`!`).
- Never use default exports (prefer named exports).
- Never use relative imports that traverse directories (`../../../`).
- Never create class components.
- Never create new UI primitives — use shadcn/ui.
- Never use inline styles in JSX.
- Never use checkboxes in mobile-first interfaces — use toggles or radio buttons.
- Never read any secrets or sensitive information from the codebase, logs, or .env files. If secrets are leaked, treat them as compromised and suggest to rotate immediately.
- Never quote, repeat, or echo back any value from .env files, even partially.
- Never allow me to attach the .env file as context or upload it as a file. If I ask for it, refuse and warn about the security implications.
- Never allow me to paste any value from .env files into this conversation. If I do, treat it as a secret leak and suggest to rotate immediately.
- Never run any command that reads, prints, copies, decrypts, or pipes the contents of `.env`, `.env.*`, `.envrc`, `*.pem`, `*.key`, `id_*`, `.aws/credentials`, `.npmrc`, `~/.config/gh/hosts.yml`, or any other secret-bearing file. This explicitly forbids `cat`, `head`, `tail`, `less`, `more`, `grep`, `rg`, `awk`, `sed`, `sort`, `xxd`, `od`, `printenv`, `env`, `set`, `export -p`, `source`, `dotenv`, `node -e "require('dotenv')..."`, or any equivalent on those files — even with `| head -n1`, `| wc -l`, redirection, or other "filtering" tricks. The act of running the command captures output into the chat transcript regardless of what is piped after it.
- Never run `git diff`, `git show`, `git log -p`, `git stash show -p`, or `git grep` on paths that may contain secrets without first confirming the path is not a secret-bearing file.
- Never assume a secret-bearing file is safe to read because it is gitignored, locally scoped, or "dev only". Treat all `.env*` files as production secrets.
- Never run any E2E test, build, dev server, seed script, or migration in a process that could inherit `DATABASE_URL` (or any other connection string) from `.env*`. Always launch with an explicit, hardcoded local-Docker connection string and a clean environment (e.g., `env -i` plus only the required allowlisted vars). If the runtime cannot guarantee `.env*` is ignored, refuse to run.
- Never echo, log, or include in error messages any environment variable whose name matches `*_URL`, `*SECRET*`, `*TOKEN*`, `*KEY*`, `*PASSWORD*`, `*PASSWD*`, `*CREDENTIAL*`, `*DSN*`, or `*CONNECTION*`. Redact to `***` before printing.
- Never proceed with a task that "needs" a secret value to continue. Stop and ask the user to provide a placeholder or a local-only equivalent.
- If a secret value (or partial value) ever appears in tool output, terminal output, file content, or chat input, immediately: (1) stop the current task, (2) tell the user the secret is now compromised and must be rotated, (3) do not repeat or quote the value back, (4) do not attempt to "clean up" by running more commands that touch the secret, and (5) wait for the user before continuing.
- Never use `localStorage` or `sessionStorage`.
- Never mix Server/Client Component patterns incorrectly.
- Never skip Zod validation in Server Actions.
- Never use Prisma Client in Client Components.
- Never expose secrets or sensitive information in the codebase or logs or .env files.
- Never disable ESLint or Prettier rules globally or with `eslint-disable` without a documented reason.
- Never import `describe`, `it`, `expect`, or `vi` from Vitest — they are globals.
- Never use `expect` inside conditional statements in tests.
- Never write large files with multiple components or functions — break them down.
- Never ignore TypeScript errors or warnings.
- Never use deprecated APIs or packages.
- Never commit generated files or build artifacts.
- Never mock implementation details in tests — mock behavior.
- Never create documentation from files not located in this repository.
- Never attempt to write DB-interacting code without first verifying the database connection is healthy.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
