# Testing Strategy & Guidelines

This document outlines the testing strategy, best practices, and guidelines for maintaining high-quality tests in the Boudreaux project.

## Table of Contents

- [Testing Stack](#testing-stack)
- [Coverage Thresholds](#coverage-thresholds)
- [Test Organization](#test-organization)
- [Writing Effective Tests](#writing-effective-tests)
- [Mocking Guidelines](#mocking-guidelines)
- [Performance Best Practices](#performance-best-practices)
- [CI/CD Integration](#cicd-integration)
- [Running Tests](#running-tests)

## Testing Stack

| Tool                            | Purpose                              |
| ------------------------------- | ------------------------------------ |
| **Vitest**                      | Test runner with Jest-compatible API |
| **@testing-library/react**      | Component testing utilities          |
| **@testing-library/user-event** | User interaction simulation          |
| **@testing-library/jest-dom**   | Custom DOM matchers                  |
| **v8**                          | Native code coverage provider        |
| **Codecov**                     | Coverage reporting and PR comments   |

## Coverage Thresholds

The project enforces strict coverage thresholds configured in `vitest.config.ts`:

| Metric     | Threshold |
| ---------- | --------- |
| Lines      | 95%       |
| Statements | 95%       |
| Functions  | 95%       |
| Branches   | 90%       |

### Coverage Exclusions

The following are excluded from coverage requirements:

- Configuration files (`*.config.ts`, `*.config.mjs`)
- Type declarations (`*.d.ts`, `types/**`)
- Prisma schema and generated code
- Setup files and mocks
- Test utilities
- shadcn/ui primitives (Radix UI wrappers)
- Components requiring E2E testing (media players, complex uploaders)

## Test Organization

### File Structure

```
src/
├── app/
│   └── components/
│       └── forms/
│           ├── artist-form.tsx
│           └── artist-form.spec.tsx  # Co-located test file
├── lib/
│   └── utils/
│       ├── sanitization.ts
│       └── sanitization.spec.ts
└── test-utils/
    └── index.ts  # Shared test utilities
```

### Naming Conventions

- Test files: `*.spec.ts` or `*.spec.tsx`
- Test suites: Use `describe()` blocks matching the component/function name
- Test cases: Use descriptive `it()` statements starting with "should"

```typescript
describe('sanitizeHtml', () => {
  it('should escape HTML special characters', () => {
    // ...
  });

  it('should return empty string for null input', () => {
    // ...
  });
});
```

## Writing Effective Tests

### Test Structure (AAA Pattern)

```typescript
it('should update user profile on submit', async () => {
  // Arrange - Set up test data and render component
  const user = userEvent.setup();
  render(<ProfileForm userId="123" />);

  // Act - Perform the action being tested
  await user.type(screen.getByLabelText('Name'), 'John Doe');
  await user.click(screen.getByRole('button', { name: /save/i }));

  // Assert - Verify the expected outcome
  expect(await screen.findByText('Profile updated')).toBeInTheDocument();
});
```

### Query Priority

Use queries in this order of preference:

1. `getByRole` - Accessible queries (preferred)
2. `getByLabelText` - Form elements
3. `getByPlaceholderText` - Input placeholders
4. `getByText` - Text content
5. `getByTestId` - Last resort

### Assertions

```typescript
// ✅ Good - Specific assertions
expect(button).toBeDisabled();
expect(input).toHaveValue('test@example.com');
expect(heading).toHaveTextContent('Welcome');

// ❌ Avoid - Vague assertions
expect(button).toBeTruthy();
expect(wrapper.innerHTML).toContain('text');
```

### Async Testing

```typescript
// ✅ Good - Use findBy for async elements
const message = await screen.findByText('Success');

// ✅ Good - Use waitFor for assertions
await waitFor(() => {
  expect(mockFn).toHaveBeenCalledTimes(1);
});

// ❌ Avoid - Manual timeouts
await new Promise((resolve) => setTimeout(resolve, 1000));
```

## Mocking Guidelines

### Module Mocks

```typescript
// At the top of the test file, before imports
vi.mock('next-auth/react');
vi.mock('sonner');

// Mock with implementation
vi.mock('@/lib/actions/create-artist-action', () => ({
  createArtistAction: vi.fn(),
}));

// Mock with actual module + overrides
vi.mock('react-hook-form', async () => {
  const actual = await vi.importActual('react-hook-form');
  return {
    ...actual,
    useForm: vi.fn(),
  };
});
```

### Function Mocks

```typescript
// Create spy on existing function
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Create mock function
const mockCallback = vi.fn();
mockCallback.mockReturnValue('result');
mockCallback.mockResolvedValue({ data: 'async result' });

// Verify calls
expect(mockCallback).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockCallback).toHaveBeenCalledTimes(2);
```

### Server-Side Mocking

```typescript
// Mock server-only import
vi.mock('server-only', () => ({}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
```

### What NOT to Mock

- Pure utility functions (test them directly)
- React hooks from `react` (use real implementation)
- Testing-library utilities
- The component being tested

## Performance Best Practices

### Test Speed Optimization

```typescript
// 1. Use vi.fn() over vi.spyOn() when possible
const mockFn = vi.fn(); // ✅ Faster

// 2. Avoid unnecessary renders
const { rerender } = render(<Component prop="a" />);
rerender(<Component prop="b" />); // ✅ Reuse component

// 3. Use test.each for parameterized tests
it.each([
  ['input1', 'expected1'],
  ['input2', 'expected2'],
])('should transform %s to %s', (input, expected) => {
  expect(transform(input)).toBe(expected);
});

// 4. Run tests in parallel (default in Vitest)
// Tests are parallelized at file level automatically
```

### Configuration Optimizations

The project uses these performance optimizations in `vitest.config.ts`:

- **vmThreads pool** locally (3x faster than forks)
- **forks pool** in CI (better isolation)
- **75% max workers** locally to leave system responsive
- **CSS disabled** in test environment
- **Fail fast** (bail: 1) in CI for faster feedback

## CI/CD Integration

### GitHub Actions Workflow

The CI pipeline runs on every push and pull request:

1. **Tests with Coverage** - Runs all tests and generates coverage report
2. **Coverage Regression Check** - Fails if coverage drops below baseline
3. **Codecov Upload** - Uploads coverage for PR comments
4. **ESLint** - Enforces zero warnings
5. **TypeScript** - Type checking
6. **Build** - Verifies production build

### Pre-push Hook

Local pre-push hook runs:

```bash
npm run type-check && npm run lint -- --max-warnings 0 && npm test -- --run
```

### Coverage Reporting

- **Codecov** provides PR comments with coverage diff
- **GitHub Actions Summary** shows coverage metrics
- **COVERAGE_METRICS.md** tracks baseline coverage

## Running Tests

### Commands

```bash
# Run all tests once
npm test -- --run

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm run test:coverage

# Run with coverage and regression check
npm run test:coverage:check

# Run specific test file
npm test -- src/lib/utils/sanitization.spec.ts

# Run tests matching pattern
npm test -- --grep "sanitize"

# Run with UI
npm run test:ui
```

### Debugging Tests

```bash
# Run single test with verbose output
npm test -- --reporter=verbose src/path/to/test.spec.ts

# Run with specific seed for reproducibility
VITEST_SEED=12345 npm test -- --run

# Show config
npx vitest --show-config
```

## Future Improvements

### E2E Testing (Planned)

For complex interactive components that require E2E testing:

- Media players with Video.js integration
- Image/file uploaders with drag-and-drop
- Complex forms with react-hook-form
- Components requiring real browser APIs

We plan to implement Playwright E2E tests for these components.

### Testing Priorities

1. **Business Logic** - Actions, services, validation schemas (unit tests)
2. **User Interactions** - Forms, buttons, navigation (component tests)
3. **Integration Points** - API routes, database operations (integration tests)
4. **User Flows** - Full workflows (E2E tests)
