<!--
Boudreaux Constitution - Sync Report
=====================================
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
(currently 6.0+) and keep it updated to the latest stable release. Use
`as const` assertions instead of enums for better type safety and
performance; maintain a centralized `utils/enums.ts` file for shared enum
definitions. Never use the `any` type; prefer `unknown` with proper type
guards if necessary. Always specify explicit types for function parameters,
return values, and variable declarations. Use `interface` for object shapes
and `type` for unions and intersections. Type safety is non-negotiable and
catches errors at compile-time rather than runtime.

### II. Next.js & React Architecture

Use Next.js 16+ with the App Router and Server Components by default. Add
`'use client'` only when interactivity is required (Stripe Elements,
dialogs, form inputs). Use `'use server'` at the top of Server Action
files and `'server-only'` in files that MUST NOT run on the client.
Prefer functional components with React Hooks over class components—never
create class components. Use Server Actions for all data mutations; use
API routes for GET queries only. Leverage React 19 hooks for optimal UX:
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
configuration, types, and Prisma schema). Write test files in the same
directory as source code with a `.spec.ts` extension. Keep tests
deterministic and independent of external factors (network, time). Remove
orphaned tests when code is deleted and orphaned code when tests are
removed. Never import `describe`, `it`, `expect`, or `vi` from
Vitest—they are globals.

### IV. Security & Data Integrity

Prioritize security in all aspects: validate all input data using Zod 4
schemas in API routes and Server Actions; sanitize user input to prevent
XSS, SQL injection, and other attacks. Implement proper authentication
(Auth.js) and authorization (RBAC) mechanisms on all sensitive operations.
Store sensitive information and configuration in environment variables;
never hardcode secrets. Use a `.env` file for local development and ensure
secrets are securely stored in production. Regularly audit and update
dependencies for security vulnerabilities. Use HTTPS and secure cookies
for authentication. Ensure all API routes have explicit error handling and
return appropriate HTTP status codes. Include the MPL 2.0 license header
(from `HEADER.txt`) in all source files for proper attribution and
compliance.

### V. Performance & Scalability

Optimize for performance and scalability from the start. Use memoization
techniques (`useMemo`, `useCallback`, `React.memo`) to prevent unnecessary
re-renders. Implement code splitting and lazy loading (`React.lazy`,
`Suspense`) for components not needed immediately on page load. Use
Next.js `<Image>` component for image optimization. Leverage Tanstack
Query for data fetching with built-in caching, background updates, and
synchronization. Use Framer Motion for smooth animations that enhance UX
without compromising performance. Implement skeleton loaders and
placeholders to improve perceived performance during data fetching.
Monitor performance using React DevTools and profiling tools.

### VI. Code Quality & Maintainability

Maintain a clean and organized codebase with clear separation of concerns.
Follow the DRY principle to minimize code duplication. Use absolute imports
from the project root (`@/lib/utils`) instead of relative imports that
traverse up (`../../../`). Avoid deeply nested code; refactor into smaller
functions and components. Write JSDoc comments for all functions and
components explaining purpose, parameters, and return values. Use
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
associated labels; use shadcn/ui components with react-hook-form for
consistent, accessible forms. Design components to be responsive and
mobile-friendly, following mobile-first principles. Prioritize user
experience through intuitive design, clear error messages, and smooth
interactions.

## Coding Standards

### Type Safety & Linting

- Enforce TypeScript strict mode in all configuration files
- Always define explicit types for function parameters, return values,
  and variables
- Never use the `any` type; use `unknown` with proper type guards if
  necessary
- Avoid non-null assertions (`!`); handle nullability explicitly using
  optional chaining (`?.`) and nullish coalescing (`??`)
- Use interfaces or types to ensure all components are fully typed
- Use destructuring assignment for objects and arrays to improve
  readability
- Ensure all code passes ESLint and Prettier checks before committing
- Never use `eslint-disable` or `prettier-ignore` comments without strong
  justification

### Code Organization & Style

- No inline styles; use Tailwind CSS v4 utility classes exclusively
- Use the `cn()` helper for conditional class combinations
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
- Use `React.memo` for performance optimization of pure components
- Implement `useCallback` and `useMemo` to memoize functions and values
  and prevent unnecessary re-renders
- Avoid inline functions and objects in JSX props; define them outside the
  component or use `useCallback`
- Use Fragment shorthand (`<>` `</>`) when no key or attributes are needed

### Data Fetching & State Management

- Use Prisma 6 as the exclusive ORM for database interactions; ensure type
  safety in all queries
- Access data through Server Components or API routes; never use Prisma
  Client in Client Components
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

## Testing & Quality

### Unit & Integration Testing

- Write unit tests using Vitest 4 with jest-dom matchers for all business
  logic and utilities
- Write component tests for all interactive and complex components
- Achieve 90-95%+ test coverage on all testable files (exclude config,
  types, Prisma schema)
- Keep test files adjacent to source code with `.spec.ts` extension
- Use `describe` and `it` blocks for test organization
- Use `beforeEach` and `afterEach` for setup and teardown
- Mock external dependencies; test behavior and output, not
  implementation details
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
- Document components clearly with JSDoc and type annotations
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
- Run `pnpm run lint` and `pnpm run format` before committing code
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
- Runtime development guidance (e.g.,
  [Copilot instructions](./.github/copilot-instructions.md)) supplements
  this constitution but doesn't override it
- The constitution should be reviewed and updated periodically (at least
  quarterly) to reflect technology evolution, team practices, and project
  requirements
- When reviewing code, ensure it aligns with all seven core principles
  and the coding standards outlined herein

### Continuous Improvement

- Encourage team feedback on constitution effectiveness and relevance
- Foster open communication about constraints or barriers to compliance
- Use code review findings to identify gaps or ambiguities in the
  constitution
- Prioritize transparency and collaboration in all decisions affecting
  project governance

---

**Version**: 1.1.0 | **Ratified**: 2025-06-01 | **Last Amended**: 2026-04-01
