# AuthToolbar Testing Quick Reference

## Running Tests

```bash
# Run all tests
npm test src/app/components/auth/auth-toolbar.spec.tsx

# Run with coverage
npm run test:coverage -- src/app/components/auth/auth-toolbar.spec.tsx

# Run in watch mode
npm test -- --watch src/app/components/auth/auth-toolbar.spec.tsx

# Run specific test
npm test -- -t "renders sign in and sign up links"
```

## Test Statistics

- **Total Tests**: 44
- **Coverage**: 100% (statements, branches, functions)
- **Execution Time**: ~386ms
- **Average per Test**: ~8.8ms

## Test Categories

| Category        | Tests | Purpose                   |
| --------------- | ----- | ------------------------- |
| Unauthenticated | 5     | Verify sign-in/up UI      |
| Authenticated   | 12    | Verify logged-in UI       |
| Loading         | 3     | Verify loading state      |
| Dev Logging     | 9     | Verify debug logs         |
| Production      | 3     | Verify prod behavior      |
| Edge Cases      | 9     | Verify error handling     |
| Stability       | 3     | Verify re-render behavior |

## Key Testing Patterns

### 1. Basic Rendering Test

```typescript
it('renders component when condition is met', () => {
  mockUseSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { id: '1' } },
  });

  render(<AuthToolbar />);

  expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
});
```

### 2. Negative Assertion Test

```typescript
it('does not render component when condition is not met', () => {
  mockUseSession.mockReturnValue({
    status: 'unauthenticated',
    data: null,
  });

  render(<AuthToolbar />);

  expect(screen.queryByTestId('signout-toolbar')).not.toBeInTheDocument();
});
```

### 3. Environment-Specific Test

```typescript
describe('in development', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('logs debug information', () => {
    render(<AuthToolbar />);
    expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session status:', expect.any(String));
  });
});
```

### 4. State Transition Test

```typescript
it('updates when state changes', () => {
  mockUseSession.mockReturnValue({
    status: 'loading',
    data: null,
  });

  const { rerender } = render(<AuthToolbar />);
  expect(screen.getByText('Loading')).toBeInTheDocument();

  mockUseSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { id: '1' } },
  });

  rerender(<AuthToolbar />);
  expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
});
```

### 5. Prop Passing Test

```typescript
it('passes className to child component', () => {
  mockUseSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { id: '1' } },
  });

  render(<AuthToolbar className="custom-class" />);

  const toolbar = screen.getByTestId('signout-toolbar');
  expect(toolbar).toHaveClass('custom-class');
});
```

## Common Assertions

```typescript
// Element is in document
expect(screen.getByTestId('element')).toBeInTheDocument();

// Element is NOT in document
expect(screen.queryByTestId('element')).not.toBeInTheDocument();

// Element has specific class
expect(element).toHaveClass('class-name');

// Element has multiple classes
expect(element).toHaveClass('class-1', 'class-2');

// Text content check
expect(screen.getByText('Loading')).toBeInTheDocument();

// Mock was called
expect(mockLog).toHaveBeenCalled();

// Mock was called with specific args
expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session status:', 'authenticated');

// Mock was NOT called
expect(mockLog).not.toHaveBeenCalled();
```

## Debugging Tips

### View Component Output

```typescript
const { debug } = render(<AuthToolbar />);
debug(); // Prints current DOM
```

### Check Mock Calls

```typescript
console.log(mockLog.mock.calls); // See all calls to mock
console.log(mockLog.mock.calls.length); // Number of calls
```

### Find Elements

```typescript
screen.debug(); // Print entire screen
screen.logTestingPlaygroundURL(); // Get testing playground URL
```

## Mock Setup Reference

### useSession Mock

```typescript
const mockUseSession = vi.fn();

// Unauthenticated
mockUseSession.mockReturnValue({
  status: 'unauthenticated',
  data: null,
});

// Authenticated
mockUseSession.mockReturnValue({
  status: 'authenticated',
  data: {
    user: {
      id: '1',
      email: 'test@example.com',
      username: 'testuser',
      role: 'user', // or 'admin'
    },
  },
});

// Loading
mockUseSession.mockReturnValue({
  status: 'loading',
  data: null,
});
```

### Environment Stub

```typescript
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development'); // or 'production'
});

afterEach(() => {
  vi.unstubAllEnvs();
});
```

### Mock Cleanup

```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Clear call history
  vi.unstubAllEnvs(); // Reset environment
});
```

## Edge Cases to Always Test

- [ ] Null/undefined values
- [ ] Empty strings
- [ ] Empty objects
- [ ] Missing required properties
- [ ] Multiple classNames
- [ ] State transitions
- [ ] Environment differences
- [ ] Role case sensitivity

## Coverage Goals

- **Statements**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Lines**: 100%

## Performance Targets

- **Per Test**: < 10ms
- **Total Suite**: < 500ms
- **CI Pipeline**: < 30s (including setup)

## When to Add New Tests

1. **New feature added**: Test all paths
2. **Bug discovered**: Add regression test
3. **Refactoring code**: Verify behavior unchanged
4. **Coverage drops**: Add tests for uncovered code
5. **Edge case found**: Document and test

## Test Naming Convention

Format: `"<action> <condition>"`

Examples:

- ✅ `"renders sign in link when unauthenticated"`
- ✅ `"does not log role for non-admin users"`
- ✅ `"handles empty className gracefully"`
- ❌ `"test 1"`
- ❌ `"it works"`

## CI/CD Integration

### Pre-commit

```bash
npm run test:changed
```

### Pre-push

```bash
npm run test:coverage
```

### Pull Request

```bash
npm run test:coverage -- --coverage.thresholds.lines=90
```

## Useful Vitest Commands

```bash
# Run tests matching pattern
vitest run -t "admin"

# Update snapshots
vitest run -u

# Run in UI mode
vitest --ui

# Run with coverage
vitest run --coverage

# Watch mode for specific file
vitest watch auth-toolbar
```

## Resources

- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Docs](https://vitest.dev/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
- [Testing Playground](https://testing-playground.com/)

## Quick Checklist for New Tests

- [ ] Test name is descriptive
- [ ] Uses proper beforeEach/afterEach
- [ ] Mocks are cleared
- [ ] Uses correct assertion type
- [ ] Tests one specific behavior
- [ ] Includes negative assertions where appropriate
- [ ] Handles edge cases
- [ ] Follows AAA pattern (Arrange, Act, Assert)
