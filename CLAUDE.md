# boudreaux Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-23

## Active Technologies

- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Stripe 20, Prisma 5 (MongoDB), Auth.js, AWS SES, shadcn/ui, Zod, React Hook Form (001-release-search-player)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Prisma 5 (MongoDB), Auth.js, shadcn/ui, Zod, React Hook Form (002-tour-management)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Stripe 20 (payment mode), Prisma 5 (MongoDB), Auth.js, AWS SES, shadcn/ui, Zod, React Hook Form (003-stripe-pwyw-purchase)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Prisma 5 (MongoDB), AWS SDK S3 v3 (presigned URLs), Auth.js, shadcn/ui (Accordion), Zod, React Hook Form (004-release-digital-formats)
- MongoDB via Prisma (003-stripe-pwyw-purchase, 004-release-digital-formats)
- AWS S3 (presigned URLs for upload/download, 24hr expiration for downloads, 15min for uploads) (004-release-digital-formats)

## Project Structure

```text
src/
├── app/               # Next.js App Router pages, layouts, and API routes
│   ├── api/           # API routes (GET queries; Stripe webhook)
│   ├── components/    # Shared feature components
│   ├── (auth)/        # Auth-gated routes
│   ├── admin/         # Admin pages
│   └── releases/      # Release pages and media player
├── lib/
│   ├── actions/       # Server Actions (mutations) — 'use server' at top
│   ├── email/         # Email templates and SES dispatch
│   ├── repositories/  # Prisma data-access layer
│   ├── services/      # Business logic services
│   ├── utils/         # Utilities (auth, rate-limiting, SES client, Stripe client)
│   └── validation/    # Zod schemas
prisma/
└── schema.prisma      # MongoDB schema
docs/
└── copilot/           # AI-generated markdown documents go here
```

## Commands

```bash
pnpm run dev              # Start development server
pnpm run build            # Production build
pnpm run test             # Run tests in watch mode
pnpm run test:run         # Run all tests once
pnpm run test:coverage    # Coverage report (target 90–95%)
pnpm run lint             # ESLint check and auto-fix
pnpm run format           # Prettier format
pnpm exec prisma db push  # Push schema changes to MongoDB
pnpm exec prisma studio   # Browse database
stripe listen --forward-to http://localhost:3000/api/stripe/webhook  # Local webhook forwarding
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

## Next.js Architecture

- Server Components by default — add `'use client'` only for interactive components (Stripe Elements, dialogs, etc.).
- Server Actions for all mutations (in `lib/actions/`). Add `'use server'` directive at top of file.
- Never call services, prisma client or repositories directly from Client Components. User server actions for mutations but do not access prisma directly. Use api route handlers to call services or repositories. Call api route handlers for queries from Client components.

````typescript
- Always use `'server-only'` package in files meant exclusively for server-side execution to prevent accidental client-side imports.
- Use decorators for auth checks (e.g., `withAuth`, `withAdmin`) in Server Actions.
- Prefer tanstack/react-query for client-side data fetching and caching in interactive components.
- Data fetching in Server Components uses `fetch` with explicit cache options:

```typescript
const res = await fetch(url, { cache: 'no-store' }); // for fresh data
````

- Always validate external data (API responses, user input) with Zod.
- Use Prisma transactions for multi-step DB operations.
- Check database connection health before running DB code; handle connection errors gracefully.

## Components

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
- Define Zod schemas in `lib/validation/`.
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
- Use Roboto font for UI text.
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

- Vitest for all unit and integration tests.
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

## Never Do

- Never use `any` in TypeScript.
- Never use the non-null assertion operator (`!`).
- Never use default exports (prefer named exports).
- Never use relative imports that traverse directories (`../../../`).
- Never create class components.
- Never create new UI primitives — use shadcn/ui.
- Never use inline styles in JSX.
- Never use checkboxes in mobile-first interfaces — use toggles or radio buttons.
- Never use `localStorage` or `sessionStorage`.
- Never mix Server/Client Component patterns incorrectly.
- Never skip Zod validation in Server Actions.
- Never use Prisma Client in Client Components.
- Never expose secrets or sensitive information in the codebase.
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

## Recent Changes

- 004-release-digital-formats: Added digital format management (ReleaseDigitalFormat, UserDownloadQuota, DownloadEvent models), S3 presigned URL upload/download (24hr download expiration, 15min upload), freemium 5-download quota with unique release tracking, soft delete with 90-day grace period, admin accordion UI with checkmark indicators, download authorization API with purchase/quota checks, format-specific file validation (MP3/AAC 100MB, FLAC 250MB, WAV 500MB)
- 003-stripe-pwyw-purchase: Added Stripe payment-mode checkout, PWYW purchase dialog, download gate API, purchase/download tracking models, SES purchase confirmation email
- 002-tour-management: Added tour management (Tour, TourDate, Venue models), admin CRUD, public tour listings
- 001-release-search-player: Added release search combobox, release media player page, artist carousel, breadcrumb navigation

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
