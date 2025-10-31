# Testing Quick Reference Guide

**Project:** Boudreaux
**Framework:** Vitest + React Testing Library
**Last Updated:** October 31, 2025

---

## Quick Commands

```bash
# Run all tests
npm run test:run

# Run tests in watch mode
npm run test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- message-spinner.spec.tsx

# Run tests matching pattern
npm run test -- --grep="should render"

# Update snapshots
npm run test -- -u
```

---

## Common Test Patterns

### Testing a Component

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from './my-component';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### Testing a Server Action

```typescript
import { myAction } from './my-action';
import { auth } from '@/auth';

vi.mock('@/auth');

describe('myAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should require authentication', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);

    const result = await myAction(formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain('authenticated');
  });

  it('should process valid request', async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: '1', email: 'test@example.com' },
    });

    const result = await myAction(validFormData);

    expect(result.success).toBe(true);
  });
});
```

### Testing a Form

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyForm } from './my-form';

describe('MyForm', () => {
  it('should validate required fields', async () => {
    const user = userEvent.setup();
    render(<MyForm />);

    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  it('should submit valid data', async () => {
    const user = userEvent.setup();
    const mockSubmit = vi.fn();
    render(<MyForm onSubmit={mockSubmit} />);

    await user.type(screen.getByLabelText(/name/i), 'John Doe');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'John Doe' })
      );
    });
  });
});
```

### Testing a Hook

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from './use-my-hook';

describe('useMyHook', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useMyHook());

    expect(result.current.value).toBe(initialValue);
  });

  it('should update state', () => {
    const { result } = renderHook(() => useMyHook());

    act(() => {
      result.current.setValue(newValue);
    });

    expect(result.current.value).toBe(newValue);
  });
});
```

---

## Testing Library Queries

### Priority Order (Use in this order)

1. **getByRole** - Most accessible

```typescript
screen.getByRole('button', { name: /submit/i });
screen.getByRole('textbox', { name: /email/i });
```

2. **getByLabelText** - For form inputs

```typescript
screen.getByLabelText(/email address/i);
```

3. **getByPlaceholderText** - For inputs with placeholders

```typescript
screen.getByPlaceholderText(/enter email/i);
```

4. **getByText** - For non-interactive elements

```typescript
screen.getByText(/welcome/i);
```

5. **getByTestId** - Last resort

```typescript
screen.getByTestId('custom-element');
```

### Query Variants

- **getBy\*** - Throws error if not found
- **queryBy\*** - Returns null if not found
- **findBy\*** - Returns promise (for async)

```typescript
// Synchronous - element must exist
const button = screen.getByRole('button');

// Element might not exist
const error = screen.queryByText(/error/i);
if (error) {
  // handle error
}

// Wait for element to appear
const message = await screen.findByText(/success/i);
```

---

## Common Assertions

```typescript
// Existence
expect(element).toBeInTheDocument();
expect(element).not.toBeInTheDocument();

// Visibility
expect(element).toBeVisible();
expect(element).not.toBeVisible();

// Text content
expect(element).toHaveTextContent('Hello');
expect(element).toHaveTextContent(/hello/i); // case insensitive

// Classes
expect(element).toHaveClass('active');
expect(element).toHaveClass('active', 'selected');

// Attributes
expect(element).toHaveAttribute('aria-label', 'Close');
expect(element).toHaveAttribute('disabled');

// Form values
expect(input).toHaveValue('test');
expect(checkbox).toBeChecked();

// Function calls
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenCalledTimes(2);
```

---

## Mocking Guide

### Mock a Module

```typescript
// Mock entire module
vi.mock('./my-module', () => ({
  myFunction: vi.fn(() => 'mocked value'),
}));

// Mock with factory
vi.mock('./my-module', async () => {
  const actual = await vi.importActual('./my-module');
  return {
    ...actual,
    myFunction: vi.fn(),
  };
});
```

### Mock Next.js Modules

```typescript
// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/test-path',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
  }),
  headers: () => new Headers(),
}));
```

### Mock Auth

```typescript
vi.mock('@/auth', () => ({
  auth: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
  })),
}));

// For unauthenticated
vi.mocked(auth).mockResolvedValueOnce(null);
```

### Mock Prisma

```typescript
vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Usage in test
vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
  id: '1',
  email: 'test@example.com',
});
```

---

## User Interactions

```typescript
import userEvent from '@testing-library/user-event';

// Always setup user at test start
const user = userEvent.setup();

// Click
await user.click(button);
await user.dblClick(button);

// Type
await user.type(input, 'Hello World');
await user.clear(input);

// Keyboard
await user.keyboard('{Enter}');
await user.keyboard('{Shift>}A{/Shift}'); // Shift+A

// Select
await user.selectOptions(select, 'option-value');

// Check/Uncheck
await user.click(checkbox); // toggle
```

---

## Async Testing

```typescript
// Wait for element
const element = await screen.findByText(/loading/i);

// Wait for condition
await waitFor(() => {
  expect(mockFn).toHaveBeenCalled();
});

// Wait with options
await waitFor(
  () => {
    expect(element).toBeInTheDocument();
  },
  {
    timeout: 3000,
    interval: 100,
  }
);

// Wait for removal
await waitForElementToBeRemoved(() => screen.getByText(/loading/i));
```

---

## Debugging Tests

```typescript
// Print component tree
screen.debug();

// Print specific element
screen.debug(screen.getByRole('button'));

// Log DOM
console.log(prettyDOM(element));

// Check what's available
screen.logTestingPlaygroundURL();

// Pause test execution (in watch mode)
await screen.findByText(/pause/i);
test.only('debug this test', () => {
  // ...
});
```

---

## Coverage Tips

```typescript
// Test all branches
it('should handle condition A', () => {
  // Test when condition is true
});

it('should handle condition B', () => {
  // Test when condition is false
});

// Test error cases
it('should handle error', async () => {
  mockFn.mockRejectedValueOnce(Error('Test error'));
  // Assert error handling
});

// Test edge cases
it('should handle empty input', () => {
  // Test with empty data
});

it('should handle maximum input', () => {
  // Test with max values
});
```

---

## Common Mistakes to Avoid

### ❌ Don't Query Directly from Container

```typescript
// Bad
const { container } = render(<Component />);
const button = container.querySelector('button');

// Good
render(<Component />);
const button = screen.getByRole('button');
```

### ❌ Don't Use Multiple Assertions Without waitFor

```typescript
// Bad - first assertion might pass before second is ready
expect(element).toBeInTheDocument();
expect(element).toHaveTextContent('Updated');

// Good
await waitFor(() => {
  expect(element).toBeInTheDocument();
  expect(element).toHaveTextContent('Updated');
});
```

### ❌ Don't Forget to Clear Mocks

```typescript
// Bad - mocks persist between tests
describe('Test Suite', () => {
  it('test 1', () => {
    /* uses mock */
  });
  it('test 2', () => {
    /* mock still has data from test 1 */
  });
});

// Good
beforeEach(() => {
  vi.clearAllMocks();
});
```

### ❌ Don't Use act() for User Events

```typescript
// Bad - userEvent already handles act()
await act(async () => {
  await user.click(button);
});

// Good
await user.click(button);
```

### ❌ Don't Test Implementation Details

```typescript
// Bad - testing internal state
expect(component.state.count).toBe(1);

// Good - testing user-visible behavior
expect(screen.getByText('Count: 1')).toBeInTheDocument();
```

---

## Performance Tips

```typescript
// Use test.concurrent for independent tests
describe('Independent Tests', () => {
  test.concurrent('test 1', async () => {
    /* ... */
  });
  test.concurrent('test 2', async () => {
    /* ... */
  });
});

// Skip expensive setup when not needed
const setup = () => {
  // Only runs when called
  return {
    /* expensive setup */
  };
};

// Use test.skip for temporarily disabled tests
test.skip('not ready yet', () => {
  /* ... */
});

// Use test.only for focused testing
test.only('debug this', () => {
  /* ... */
});
```

---

## Accessibility Testing

```typescript
// Test ARIA attributes
expect(button).toHaveAttribute('aria-label', 'Close');
expect(input).toHaveAttribute('aria-required', 'true');
expect(dialog).toHaveAttribute('aria-modal', 'true');

// Test focus management
await user.click(openButton);
expect(dialog).toHaveFocus();

await user.keyboard('{Escape}');
expect(openButton).toHaveFocus();

// Test keyboard navigation
await user.keyboard('{Tab}');
expect(nextElement).toHaveFocus();

// Test screen reader text
expect(screen.getByText('Loading')).toHaveClass('sr-only');
```

---

## CI/CD Integration

### Running Tests in CI

```yaml
# GitHub Actions example
- name: Run tests
  run: npm run test:run

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

### Coverage Thresholds

```typescript
// vitest.config.ts
coverage: {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80,
}
```

---

## Resources

- [Vitest Docs](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [User Event API](https://testing-library.com/docs/user-event/intro)
- [Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**For more details, see:**

- [COMPREHENSIVE_TEST_REVIEW_AND_RECOMMENDATIONS.md](./COMPREHENSIVE_TEST_REVIEW_AND_RECOMMENDATIONS.md)
