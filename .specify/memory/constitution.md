<!--
Boudreaux Constitution - Sync Report
=====================================
Version: 1.1.1 → 1.2.0 (MINOR - aligned constitution with CLAUDE.md
(2026-05-30): expanded/clarified standards to match the repo's current
practical guidance; no principle removed or incompatibly redefined)
Ratified: 2025-06-01 | Last Amended: 2026-06-02

CHANGES SUMMARY (1.2.0) - alignment with CLAUDE.md:
- I. TypeScript-First: `as const` over enums (with `const enum` fallback +
  per-file PascalCase enum naming; dropped centralized utils/enums.ts); added
  non-null-assertion (`!`) ban; "prefer specific types over `unknown` /
  `Record<string, unknown>`" (was "prefer `unknown`"); reuse existing types
- II. Next.js & React Architecture: added named-exports-only rule (with App
  Router default-export exceptions); pinned Server Actions to src/lib/actions
  and GET handlers to src/app/api
- IV. Security & Data Integrity: Zod schemas in src/lib/validation; gate with
  withAuth/withAdmin (+ withRateLimit, src/lib/decorators/with-auth.ts); secure
  defaults + least privilege; banned localStorage/sessionStorage
- V. Performance: memoize only where it measurably helps (not by default)
- VI. Code Quality: JSDoc only for genuinely complex functions (was "all
  functions"); "reuse before you create"; path-alias set spelled out
- VII. Accessibility & UX: shadcn/ui from @/components/ui, never new primitives;
  lucide-react icons + Jost font; no checkboxes in mobile-first UIs (use
  toggles/radio buttons)
- Coding Standards: no `@apply`; globalThis over window; ts-ignore needs inline
  reason; repository pattern (src/lib/repositories) for all Prisma access
- Testing & Quality: four-command commit gate
  (typecheck+test:run+lint+format); exclude interfaces from coverage +
  COVERAGE_METRICS.md baseline; .spec.ts(x); mock at service-layer boundary;
  one condition per test; vi.mock('server-only')
- Governance: CLAUDE.md added as primary runtime guidance reference

MODIFIED PRINCIPLES (1.2.0): I, II, IV, V, VI, VII
  (III. Test-Driven Development UNCHANGED - kept NON-NEGOTIABLE per maintainer
  decision; CLAUDE.md's "tests for every feature and bug fix" is a subset that
  strict TDD already satisfies)
ADDED SECTIONS (1.2.0): None (clauses added within existing sections)
REMOVED SECTIONS (1.2.0): None

TEMPLATE VERIFICATION (2026-06-02):
✅ .specify/templates/plan-template.md - Constitution Check gate is generic;
   aligned with all 7 principles
✅ .specify/templates/spec-template.md - Generic structure; no update needed
✅ .specify/templates/tasks-template.md - Already hardened to NON-NEGOTIABLE TDD
   in the prior turn; consistent with retained Principle III
⚠️ .github/copilot-instructions.md - NOT re-synced this pass; may need a
   parallel alignment to CLAUDE.md (out of scope for this request)

FOLLOW-UP TODOS (1.2.0): Consider aligning .github/copilot-instructions.md with
CLAUDE.md so it matches this constitution.

--- PRIOR SYNC REPORT (1.1.1) ---
Version: 1.1.0 → 1.1.1 (PATCH - clarifying refinements: added useDebugValue
and useInsertionEffect hook guidance, motion.dev as Framer Motion alternative,
explicit functional-programming preference, README.md maintenance mandate)
Ratified: 2025-06-01 | Last Amended: 2026-05-06

CHANGES SUMMARY (1.1.1):
- Core Principles > VI. Code Quality & Maintainability: added explicit
  preference for functional programming paradigms where appropriate
- Coding Standards > State & Rendering Best Practices: added useDebugValue
  and useInsertionEffect hook guidance
- Core Principles > V. Performance & Scalability: added motion.dev as an
  alternative to Framer Motion for advanced animation needs
- Governance > Compliance Review & Validation: added mandate to maintain a
  comprehensive README.md (setup, usage, contribution guidelines)

MODIFIED PRINCIPLES (1.1.1):
- V. Performance & Scalability: animation library guidance broadened
- VI. Code Quality & Maintainability: FP paradigm preference made explicit

ADDED SECTIONS (1.1.1): None (refinements within existing sections)
REMOVED SECTIONS (1.1.1): None

TEMPLATE VERIFICATION (2026-05-06):
✅ .specify/templates/plan-template.md - Constitution Check section generic;
   aligned with all 7 principles
✅ .specify/templates/spec-template.md - Generic structure supports all
   constitutional requirements; no update needed
✅ .specify/templates/tasks-template.md - Phase structure accommodates
   constitution-driven task types; no update needed
✅ .github/copilot-instructions.md - All 7 principles reflected
⚠️ No .specify/templates/commands/ directory exists - no action needed

FOLLOW-UP TODOS (1.1.1): None

--- PRIOR SYNC REPORT (1.1.0) ---
Version: 1.0.1 → 1.1.0 (MINOR - expanded coding standards, React hooks
guidance, debugging prohibitions, immutability mandate, tech stack refresh)
Ratified: 2025-06-01 | Last Amended: 2026-04-01

CHANGES SUMMARY:
- Coding Standards > "Debugging & User Interaction" subsection ADDED
- Coding Standards > "State & Rendering Best Practices" subsection ADDED
- Coding Standards > "Code Organization & Style" expanded with immutability rule
- Core Principles > Tech versions updated inline (TS 6, Next.js 16, React 19,
  Zod 4, Vitest 4, Prisma 6)
- Testing & Quality > "Quality Gates & Code Review" expanded with pre-commit
  hooks mandate

MODIFIED PRINCIPLES:
- I. TypeScript-First Development: Clarified TS 6.0+ and `as const` centralization
- II. Next.js & React Architecture: Updated to Next.js 16, React 19; added
  React hooks guidance (useTransition, useDeferredValue, useId)
- III. Test-Driven Development: Updated Vitest 4 reference
- IV. Security & Data Integrity: No material change
- V. Performance & Scalability: Added skeleton loaders and Suspense/lazy loading
  emphasis
- VI. Code Quality & Maintainability: Added immutability preference
- VII. Accessibility & User Experience: No material change

ADDED SECTIONS:
- Coding Standards > Debugging & User Interaction (new subsection)
- Coding Standards > State & Rendering Best Practices (new subsection)

REMOVED SECTIONS:
- None

TEMPLATE VERIFICATION (2026-04-01):
✅ .specify/templates/plan-template.md - Constitution Check section generic;
   aligned with all 7 principles
✅ .specify/templates/spec-template.md - Generic structure supports all
   constitutional requirements; no update needed
✅ .specify/templates/tasks-template.md - Phase structure accommodates
   constitution-driven task types; no update needed
✅ .github/copilot-instructions.md - All 7 principles reflected; console.log
   and alert prohibitions already present
⚠️ No .specify/templates/commands/ directory exists - no action needed

VALIDATION NOTES:
- No remaining [PLACEHOLDER] tokens
- All dates in ISO 8601 format
- All principles declarative and testable
- "should" used once in Governance for periodic review (acceptable -
  governance guidance, not mandate)
- Version line matches this report (1.1.0)

FOLLOW-UP TODOS:
- None

PREVIOUS SYNC REPORTS:
v1.0.1 (2026-03-07): Template validation pass, no content changes
v1.0.0 (2025-06-01): Initial constitution established with 7 principles
-->

# Boudreaux Constitution

A record label web application built with Next.js, React, and TypeScript.
This constitution establishes the core principles and standards that guide
development, ensuring code quality, maintainability, security, and user
experience.

## Core Principles

### I. TypeScript-First Development

TypeScript is mandatory for all new code. Strict mode MUST be enabled in
`tsconfig.json`. Use the TypeScript version specified in `package.json`
(currently 6.0+) and keep it updated to the latest stable release. Prefer
`as const` over enums for better type safety and performance; reach for a
`const enum` only when an enum is genuinely unavoidable, with one PascalCase
enum per file matching its name. Never use the `any` type and never use the
non-null assertion (`!`)—reaching for either means defining a narrower type
or handling nullability explicitly with optional chaining (`?.`) and nullish
coalescing (`??`). Prefer specific types over `unknown` / `Record<string,
unknown>`; use `unknown` with proper type guards only when no narrower type
is possible. Always specify explicit types for function parameters and
return values, and reuse existing types before adding new ones. Use
`interface` for object shapes and discriminated unions for variants. Type
safety is non-negotiable and catches errors at compile-time rather than
runtime.

### II. Next.js & React Architecture

Use Next.js 16+ with the App Router and Server Components by default. Add
`'use client'` only when interactivity is required (Stripe Elements,
dialogs, form inputs). Use `'use server'` at the top of Server Action
files and `'server-only'` in files that MUST NOT run on the client.
Prefer functional components with React Hooks over class components—never
create class components. Use named exports only—except
App Router files that require a default export (`page`, `layout`, `loading`,
`error`, `not-found`, `template`, `default`, `route`, `middleware`). Use
Server Actions (in `src/lib/actions/`, `'use server'` at the top) for all
data mutations; use API route handlers (in `src/app/api/`) for GET queries
only. Leverage React 19 hooks for optimal UX:
`useTransition` for non-urgent state updates, `useDeferredValue` for
deferred rendering, and `useId` for hydration-safe unique IDs. Use
Tanstack Query for client-side data fetching (not mutations) with built-in
caching and synchronization. Use React's built-in state management
(useState, useReducer, useContext) for component state; reserve external
libraries (Zustand, Redux) for architectural complexity that justifies them.

### III. Test-Driven Development (NON-NEGOTIABLE)

Adopt TDD as a core practice: write tests first, get user approval on
requirements, watch tests fail, then implement functionality. Use Vitest 4
for unit testing with jest-dom matchers; use Playwright for end-to-end
testing. Achieve 90-95%+ test coverage on all testable files (excluding
configuration, types, interfaces, and the Prisma schema) without regressing
the `COVERAGE_METRICS.md` baseline. Write test files in the same directory
as source code with a `.spec.ts(x)` extension. Keep tests
deterministic and independent of external factors (network, time). Remove
orphaned tests when code is deleted and orphaned code when tests are
removed. Never import `describe`, `it`, `expect`, or `vi` from
Vitest—they are globals.

### IV. Security & Data Integrity

Prioritize security in all aspects: validate all external input (user input,
API responses, Server Action args) using Zod 4 schemas defined in
`src/lib/validation/`; sanitize user input to prevent XSS, SQL injection,
and other attacks. Implement proper authentication (Auth.js) and
authorization (RBAC) on all sensitive operations; gate routes and Server
Actions with the `withAuth` / `withAdmin` decorators
(`src/lib/decorators/with-auth.ts`) and rate-limit with `withRateLimit`.
Store sensitive information and configuration in environment variables;
never hardcode secrets. Use a `.env` file for local development and ensure
secrets are securely stored in production. Regularly audit and update
dependencies for security vulnerabilities. Apply secure defaults always (CORS,
cookie flags, rate limits) and least privilege; use HTTPS and secure cookies
for authentication. Never use `localStorage` or `sessionStorage` for any
data. Ensure all API routes have explicit error handling and
return appropriate HTTP status codes. Include the MPL 2.0 license header
(from `HEADER.txt`) in all source files for proper attribution and
compliance.

### V. Performance & Scalability

Optimize for performance and scalability from the start. Use memoization
(`useMemo`, `useCallback`, `React.memo`) only where it measurably helps
prevent unnecessary re-renders—never by default. Implement code splitting and lazy loading (`React.lazy`,
`Suspense`) for components not needed immediately on page load. Use
Next.js `<Image>` component for image optimization. Leverage Tanstack
Query for data fetching with built-in caching, background updates, and
synchronization. Use Framer Motion (or `motion.dev` for advanced needs)
for smooth animations that enhance UX without compromising performance.
Implement skeleton loaders and
placeholders to improve perceived performance during data fetching.
Monitor performance using React DevTools and profiling tools.

### VI. Code Quality & Maintainability

Maintain a clean and organized codebase with clear separation of concerns.
Favor functional programming paradigms (pure functions, immutability,
composition) where appropriate. Follow the DRY principle to minimize code
duplication; reuse before you create—search for an existing component, type,
field, or util before adding one. Use absolute imports via path aliases
(`@/*`, `@/components/*`, `@/ui/*`, `@/hooks/*`, `@/lib/*`, `@/utils/*`)
instead of relative imports that traverse up (`../../../`). Avoid deeply nested code; refactor into smaller
functions and components. Write JSDoc comments only for genuinely
complex functions—avoid boilerplate JSDoc on every function or component. Use
descriptive variable and function names that convey intent. Prefer
immutability when updating state or props to prevent unintended side
effects and ensure predictable behavior. Format all code with Prettier and
lint with ESLint before committing; never disable linting without strong
justification. Conduct thorough code reviews for all PRs to maintain
quality and share knowledge. Organize the project structure with clear
directories for components, services, utilities, and tests.

### VII. Accessibility & User Experience

Accessibility is mandatory—ensure proper ARIA labels, semantic HTML
elements, keyboard navigation, and descriptive alt text for images. Use
semantic HTML (`<button>`, `<nav>`, `<header>`, `<main>`, `<footer>`) to
enhance structure and assistive technology compatibility. Never use
deprecated HTML elements or inline event handlers. Test accessibility
with tools like axe or Lighthouse. Ensure all form elements have
associated labels; use shadcn/ui components from `@/components/ui` with
react-hook-form for consistent, accessible forms—never create a new UI
primitive. Use icons from `lucide-react` and the Jost font for UI text.
Never use checkboxes in mobile-first UIs—use toggles or radio buttons
instead. Design components to be responsive and mobile-friendly, following
mobile-first principles. Prioritize user
experience through intuitive design, clear error messages, and smooth
interactions.

## Coding Standards

### Type Safety & Linting

- Enforce TypeScript strict mode in all configuration files
- Always define explicit types for function parameters, return values,
  and variables
- Never use the `any` type; prefer specific types over `unknown` /
  `Record<string, unknown>`, using `unknown` with type guards only when no
  narrower type is possible
- Avoid non-null assertions (`!`); handle nullability explicitly using
  optional chaining (`?.`) and nullish coalescing (`??`)
- Use interfaces or types to ensure all components are fully typed
- Use destructuring assignment for objects and arrays to improve
  readability
- Ensure all code passes ESLint and Prettier checks before committing
- Never use `ts-ignore`, `eslint-disable`, or `prettier-ignore` without an
  inline reason comment; no global ESLint/Prettier disables

### Code Organization & Style

- No inline styles and no `@apply`; use Tailwind CSS v4 utility classes
  exclusively
- Use the `cn()` helper for conditional class combinations
- Use `globalThis`, not `window`, for client globals (SSR safety)
- Use semicolons and commas consistently throughout the codebase
- Use async/await for asynchronous code; avoid callback-based patterns
- Use template literals for string interpolation
- Use arrow functions for functional components and callbacks
- Avoid magic numbers and strings; define constants with meaningful names
- Avoid global variables; use local state, context, or dependency injection
- Prefer immutability when updating state or props; avoid mutations to
  prevent unintended side effects

### API Design & Validation

- Follow RESTful conventions for API routes using plural nouns
  (`/api/users`, `/api/products`)
- Use appropriate HTTP methods: GET (retrieval), POST (creation),
  PUT/PATCH (updates), DELETE (deletion)
- Validate all request input using Zod schemas; reject invalid data with
  clear error messages
- Return appropriate HTTP status codes and descriptive error messages from
  API routes
- Implement explicit error handling in all API routes with try/catch blocks
- Document API routes including request/response formats, authentication
  requirements, and error codes
- Ensure all API routes have proper authentication and authorization checks

### Component & Function Design

- Components MUST be pure functions with no side effects or mutations of
  props/state
- Avoid side effects in render methods; use `useEffect` or event handlers
  instead
- Always return a value from functions, even if it's `void`
- Use `React.memo`, `useCallback`, and `useMemo` only where they measurably
  help prevent unnecessary re-renders—not by default
- Avoid inline functions and objects in JSX props; define them outside the
  component or use `useCallback`
- Use Fragment shorthand (`<>` `</>`) when no key or attributes are needed

### Data Fetching & State Management

- Use Prisma 6 as the exclusive ORM for database interactions; ensure type
  safety in all queries
- Access data through Server Components or API routes; never use Prisma
  Client in Client Components
- Route all Prisma access through the repository pattern in
  `src/lib/repositories/`; keep DB logic out of components and routes, and
  use transactions for multi-step operations
- Never use `localStorage` or `sessionStorage` for any data
- Use Server Actions for all mutations (POST, PUT, DELETE operations)
- Use Tanstack Query for client-side data fetching (not mutations) with
  automatic caching and synchronization
- Use Zod 4 for runtime schema validation of external data and user input
- Use react-hook-form with Zod for form handling and validation
- Store complex business logic in dedicated services; keep components
  focused on presentation
- Use environment variables for all configuration and sensitive information

### Accessibility & Semantics

- Always use semantic HTML elements to enhance accessibility and document
  structure
- Ensure all interactive elements have appropriate ARIA roles and labels
- Provide descriptive alt text for all images that accurately describes
  content and purpose
- Ensure all form elements have associated `<label>` elements with clear
  guidance
- Use tools like axe or Lighthouse to test and verify accessibility
  compliance
- Test keyboard navigation to ensure all interactive elements are
  accessible
- Never use deprecated HTML or deprecated APIs; follow modern web standards

### Debugging & User Interaction

- Never use `console.log` for debugging; use a proper logging library or
  debugging tools to keep the codebase clean and avoid debug statements in
  production code
- Never use `alert` or `prompt` for user interactions; use custom modals
  or shadcn/ui dialog components to provide a controlled and consistent
  user experience
- Never use inline event handlers (`onclick`, `onmouseover`) in HTML; use
  React's event handling system exclusively

### State & Rendering Best Practices

- Use `useEffect` to handle side effects (data fetching, subscriptions,
  manual DOM manipulation) with appropriate dependency arrays to control
  execution timing
- Use `useRef` to manage mutable values that persist across renders
  (DOM references, timers) without triggering re-renders
- Use `useReducer` for complex state logic involving multiple sub-values
  or when next state depends on previous state
- Use `useLayoutEffect` for side effects that MUST execute synchronously
  after DOM mutations (layout measurement, animations)
- Use `useTransition` to mark non-urgent state updates and keep the UI
  responsive during heavy renders
- Use `useDeferredValue` to defer rendering of non-critical updates,
  allowing higher-priority work to complete first
- Use `useId` to generate stable, hydration-safe unique IDs for form
  inputs and labels in SSR/CSR environments
- Use `useImperativeHandle` to expose controlled APIs from child
  components via refs while keeping internals encapsulated
- Use `useSyncExternalStore` to subscribe to external stores and ensure
  components stay in sync with external state changes
- Use `useDebugValue` in custom hooks to surface meaningful labels and
  state in React DevTools, easing debugging of hook behavior
- Use `useInsertionEffect` to inject styles or perform pre-DOM-mutation
  side effects (e.g., CSS-in-JS) so styles are applied before paint

## Testing & Quality

### Unit & Integration Testing

- Write unit tests using Vitest 4 with jest-dom matchers for all business
  logic and utilities
- Write component tests for all interactive and complex components
- Achieve 90-95%+ test coverage on all testable files (exclude config,
  types, interfaces, and the Prisma schema); never regress the
  `COVERAGE_METRICS.md` baseline
- Keep test files adjacent to source code with the `.spec.ts(x)` extension
- Use `describe` and `it` blocks for test organization
- Use `beforeEach` and `afterEach` for setup and teardown
- Mock external dependencies (Stripe, SES, Prisma) at the service-layer
  boundary; test behavior and output, not implementation details
- One condition per test—never `expect` inside a conditional; in server-only
  specs, `vi.mock('server-only', () => ({}))`
- Use async/await for testing asynchronous code
- Write deterministic tests that don't rely on network, time, or external
  factors
- Remove orphaned tests when code is deleted; remove orphaned code when
  tests are deleted

### End-to-End Testing

- Use Playwright for end-to-end testing of critical user flows
- Cover application functionality from the user's perspective
- Test edge cases and error scenarios
- Use page objects and fixtures to maintain test organization and reduce
  duplication
- Keep E2E tests focused on user interactions, not implementation details
- Ensure E2E tests are deterministic and can run in parallel when possible

### Component Design Principles

- Design components to be modular, reusable, and self-contained
- Design components with testability in mind; minimize side effects and
  dependencies
- Design components with accessibility requirements integrated from the
  start
- Implement responsive and mobile-first design; test across different
  screen sizes
- Design components with performance optimization; use memoization and
  lazy loading
- Implement error boundaries and graceful error handling in components
- Document genuinely complex components with JSDoc; rely on TypeScript types
  for the rest
- Design components for extensibility using composition, render props,
  or hooks

### Dependency Management

- Before adding a new dependency, check `package.json` to leverage
  existing libraries
- Evaluate whether functionality can be implemented with existing
  dependencies or custom code
- Assess trade-offs: bundle size, security, maintenance overhead, and
  community support
- Ensure new dependencies are well-maintained, widely-used, and have
  strong community support
- Verify compatibility with existing technology stack to avoid conflicts
- Ensure new dependencies are compatible with MPL 2.0 licensing
  requirements
- Keep all dependencies regularly updated and monitor for security
  vulnerabilities
- Document all new dependencies including purpose, usage, and
  configuration
- Aim to keep the dependency tree lean and manageable

### Quality Gates & Code Review

- Quality takes precedence over speed; deliver high-quality code even if
  it takes longer
- All PRs require code review before merging; use collaborative reviews
  with constructive feedback
- Code reviews MUST verify constitution compliance and adherence to coding
  standards
- Use GitHub Actions for automated testing (Vitest) and E2E testing
  (Playwright)
- Before committing, all four gates MUST pass:
  `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
- Use pre-commit hooks (Husky + lint-staged) to automate type checking,
  linting, and formatting before code reaches the repository
- Maintain descriptive, clear commit messages that explain changes and
  intent
- Use feature branches for development; merge to main only after tests
  pass and review approval

## Governance

### Constitution Authority & Compliance

This constitution supersedes all other project guidance and practices. It
establishes non-negotiable standards for code quality, security,
accessibility, and team operations. All team members MUST adhere to the
principles and standards outlined herein.

### Amendment Process

Amendments to the constitution MUST be:

1. Documented with clear rationale explaining the change
2. Tested for impact on existing code and workflows
3. Approved by the project lead and team consensus where practical
4. Accompanied by a migration plan if existing code doesn't comply
5. Applied consistently across the entire codebase

Changes fall into these categories:

- **MAJOR version**: Backward-incompatible removals or fundamentally
  different principle definitions
- **MINOR version**: New principles, sections, or materially expanded
  guidance
- **PATCH version**: Clarifications, wording improvements, typo fixes,
  non-semantic refinements

### Compliance Review & Validation

- All code contributions must be reviewed for constitution compliance
  during PR reviews
- Complicated or uncertain code MUST include clear justification
- Runtime development guidance—[CLAUDE.md](../../CLAUDE.md) (primary, for
  Claude Code) and [Copilot instructions](../../.github/copilot-instructions.md)—
  supplements this constitution but doesn't override it
- The constitution should be reviewed and updated periodically (at least
  quarterly) to reflect technology evolution, team practices, and project
  requirements
- When reviewing code, ensure it aligns with all seven core principles
  and the coding standards outlined herein
- Maintain a comprehensive `README.md` covering setup instructions, usage
  guidelines, and contribution guidelines; update it whenever changes
  affect onboarding, build, or contribution workflows

### Continuous Improvement

- Encourage team feedback on constitution effectiveness and relevance
- Foster open communication about constraints or barriers to compliance
- Use code review findings to identify gaps or ambiguities in the
  constitution
- Prioritize transparency and collaboration in all decisions affecting
  project governance

---

**Version**: 1.2.0 | **Ratified**: 2025-06-01 | **Last Amended**: 2026-06-02
